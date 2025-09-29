import { createId } from '@paralleldrive/cuid2';
import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming, ResponseFunctionToolCall, ResponseInput, ResponseInputItem } from 'openai/resources/responses/responses';
import type { Reasoning } from 'openai/resources/shared';
import { BrowserContext, chromium } from 'patchright';
import { webJudgeLoginEval, type WebJudgeResult } from './evals';
import { InMemorySecretStore } from './secret_store';
import { defaultTools } from './tools';
import { createToolkit, ToolContext, type Toolkit } from './tools/toolkit';
import { formatTimestamp, printFormattedOutput, substituteEnvInSecrets, writeJson } from './utils';


type SuccessDetector =
  | { kind: 'urlIncludes'; value: string }
  | { kind: 'domSelectorVisible'; selector: string };

type AgentPolicy = {
  maxSteps?: number;
  perActionTimeoutMs?: number;
  coolDownMsAfterNav?: number;
  retryOnFail?: number;
};

type AgentTelemetry = {
  directory?: string;
};

type ProviderOptions = {
  store?: boolean;
  reasoning?: Reasoning | null;
};

type LoginAgentInput = {
  ctx: ToolContext;
  model: string;
  providerOptions?: ProviderOptions;
  targetUrl: string;
  secretVars: string[];
  tools: Toolkit;
  policies?: AgentPolicy;
  success?: SuccessDetector[];
  telemetry?: AgentTelemetry;
  taskId?: string;
};

type TaskResult = {
  ok: boolean;
  stepsTaken: number;
  finalUrl: string;
  matchedDetectors: string[];
  failureReason?: string;
  trajectoryPath?: string;
  actions?: string[]; // one string per step with tool calls
  screenshots?: string[]; // one image path per step
  webjudge?: WebJudgeResult;
};


type TaskConfig = {
  id: string;
  targetUrl: string;
  secrets: Record<string, string>;
  success?: SuccessDetector[];
};


async function logInAgent(options: LoginAgentInput): Promise<TaskResult> {
  const runId = createId();
  console.log(`Run ID: ${runId}`);
  const { ctx, model, providerOptions, targetUrl, secretVars, tools, policies, success, telemetry, taskId } = options;

  await ctx.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  const snapshot = await (ctx.page as any)._snapshotForAI?.();

  const system = [
    'You are a careful, deterministic web automation agent operating a real browser.',
    'You can only act by calling tools. Do not fabricate results; rely on tool outputs.',
    'Prefer batching multiple related actions into a single step by emitting multiple tool calls if helpful (e.g., fill a form and then click submit).',
    'Use the snapshot tool to refresh your understanding whenever the page changes or before continuing after navigation.',
    'Always think about the next best action. If the objective is achieved, stop.',
  ].join(' ');

  const prompt = [
    `Objective: Log in to the website at ${targetUrl}.`,
    '',
    'Available secret variables:',
    JSON.stringify(secretVars, null, 2),
    '',
    'Use $SECRET_VAR to reference a secret in these tools:',
    '- browser_fill_form: textbox fields only',
    '- browser_type: text input',
    'Example: "$USERNAME" or "$PASSWORD".',
    '',
    'Current page snapshot (AI-readable accessibility tree):',
    typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot, null, 2),
    '',
    'Rules:',
    '- Use the available tools to interact with the page.',
    '- Prefer precise element refs from the snapshot.',
    '- If you can, issue multiple tool calls in the same step to speed up progress (e.g., fill form fields, then click submit).',
    '- Call browser_snapshot to request an updated snapshot after actions that change the DOM, before continuing.',
    '- Stop once you believe the objective is achieved.',
  ].join('\n');

  // Telemetry setup
  const startTime = new Date();
  const ts = formatTimestamp(startTime);
  const telemetryDir = telemetry?.directory;
  let ioFilePath: string | undefined;
  if (telemetryDir) {
    await fs.mkdir(telemetryDir, { recursive: true }).catch(() => { });
    ioFilePath = path.join(telemetryDir, `logInAgent-io-${ts}.json`);
  }

  let stepsTaken = 0;
  let totalLlmWaitMs = 0;
  const stepActions: string[] = [];
  const stepScreenshots: string[] = [];

  // OpenAI Responses client
  const openai = new OpenAI();

  const conversation = await openai.conversations.create({});

  // Build initial input list
  let input: ResponseInput = [
    { role: 'user', content: prompt },
  ];

  while (true) {
    const currentStepNumber = stepsTaken + 1;
    const currentStepStartMs = performance.now();

    // Prepare request body
    const body: ResponseCreateParamsNonStreaming = {
      model,
      tools: Object.values(tools.asOpenAITools()),
      input,
      instructions: system,
      parallel_tool_calls: true,
      store: providerOptions?.store ?? true,
      reasoning: providerOptions?.reasoning ?? null,
      prompt_cache_key: taskId,
      conversation: conversation.id,
      metadata: { runId },
    };

    // Telemetry: write request
    if (telemetryDir) {
      const requestPath = path.join(telemetryDir, `loginAgent-${ts}-step-${currentStepNumber}-request.json`);
      await writeJson(requestPath, body);
    }

    // Call OpenAI Responses
    const response = await openai.responses.create(body);

    // Telemetry: write response
    if (telemetryDir) {
      const responsePath = path.join(telemetryDir, `loginAgent-${ts}-step-${currentStepNumber}-response.json`);
      await writeJson(responsePath, response);
    }

    const finishedAtMs = performance.now();
    const durationMs = Math.max(0, finishedAtMs - currentStepStartMs);
    totalLlmWaitMs += durationMs;

    // Inspect output items for tool calls
    const output = Array.isArray(response.output) ? response.output : [];
    const toolCalls: ResponseFunctionToolCall[] = output.filter((it) => it.type === 'function_call');

    stepsTaken += 1;
    console.log('--- Step finished ---');
    console.log(`step: ${currentStepNumber}, llm_s: ${(durationMs / 1000).toFixed(2)}`);
    printFormattedOutput(output);
    if (toolCalls.length === 0) {
      console.log('no tool calls, assuming complete');
      break;
    }

    // prepare input for next completion
    input = [];
    const invokedToolNames: string[] = [];
    // Collect action string for this step (join multiple tool calls)
    const stepActionItems: string[] = toolCalls.map((fc) => `${fc.name}(${fc.arguments})`);
    stepActions.push(stepActionItems.join('; '));
    for (const call of toolCalls) {
      const name = call.name;
      const argsText = call.arguments;
      let args: any = {};
      try {
        args = JSON.parse(argsText);
      } catch (err: any) {
        const fnOutput: ResponseInputItem.FunctionCallOutput = {
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify({
            ok: false,
            error: `Failed to parse arguments: ${err?.message ?? String(err)}`,
          }),
        };
        input.push(fnOutput);
        continue;
      }

      const exec = tools.get(name)?.bind(ctx);
      let toolResult: any;
      try {
        if (typeof exec !== 'function') throw new Error(`Tool executor not found: ${name}`);
        toolResult = await exec(args);
        invokedToolNames.push(name);
      } catch (err: any) {
        toolResult = { ok: false, error: err?.message ?? String(err) };
      }

      const fnOutput: ResponseInputItem.FunctionCallOutput = {
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(toolResult ?? {}),
      };
      input.push(fnOutput);
    }

    if (policies?.coolDownMsAfterNav && invokedToolNames.includes('browser_navigate')) {
      await ctx.page.waitForTimeout(policies.coolDownMsAfterNav);
    }

    // Take a screenshot at the end of the step and persist path
    if (telemetryDir) {
      const screenshotPath = path.join(telemetryDir, `loginAgent-${ts}-step-${currentStepNumber}.png`);
      try {
        await ctx.page.screenshot({ path: screenshotPath, fullPage: true });
        stepScreenshots.push(screenshotPath);
      } catch (err) {
        console.warn('failed to capture screenshot:', err);
        stepScreenshots.push('');
      }
    }
  }

  console.log(`total_llm_ms: ${Math.round(totalLlmWaitMs)}, total_llm_s: ${(totalLlmWaitMs / 1000).toFixed(2)}`);

  const finalUrl = ctx.page.url();
  const detectorResults: Array<{ id: string; ok: boolean }> = [];
  for (const detector of success ?? []) {
    if (detector.kind === 'urlIncludes') {
      const ok = finalUrl.includes(detector.value);
      detectorResults.push({ id: `urlIncludes:${detector.value}`, ok });
      continue;
    }
    if (detector.kind === 'domSelectorVisible') {
      let ok = false;
      try {
        ok = await ctx.page.locator(detector.selector).first().isVisible();
      } catch {
        ok = false;
      }
      detectorResults.push({ id: `domSelectorVisible:${detector.selector}`, ok });
      continue;
    }
  }

  const matchedDetectors = detectorResults.filter(r => r.ok).map(r => r.id);
  const allMatched = detectorResults.length === 0 ? false : detectorResults.every(r => r.ok);
  const failureReason = detectorResults.length === 0
    ? 'No success detectors configured.'
    : (allMatched ? undefined : `Failed detectors: ${detectorResults.filter(r => !r.ok).map(r => r.id).join(', ')}`);

  let result: TaskResult = {
    ok: allMatched,
    stepsTaken,
    finalUrl,
    matchedDetectors,
    failureReason,
    actions: stepActions,
    screenshots: stepScreenshots,
  };

  // Always run WebJudge evaluator with hardcoded parameters
  try {
    const webjudgeTask = `Log in to ${targetUrl} using the browser tools provided.`;
    const wj = await webJudgeLoginEval(
      webjudgeTask,
      stepActions,
      stepScreenshots.filter(Boolean),
      { model: 'gpt-5', scoreThreshold: 4, maxImages: 50 },
    );
    result.webjudge = wj;
    result.ok = wj.status === 'success';
    result.failureReason = result.ok ? undefined : 'WebJudge evaluation returned failure';
  } catch (err: any) {
    // If WebJudge fails, keep detector-based result but record failure reason
    result.webjudge = undefined;
    result.failureReason = `WebJudge error: ${err?.message ?? String(err)}`;
  }

  // Write IO JSON
  if (ioFilePath) {
    const ioInput = {
      id: taskId,
      model,
      targetUrl,
      secretVars,
      policies,
      success,
    };
    await writeJson(ioFilePath, { input: ioInput, output: result });
  }
  return result;
}

async function run(context: BrowserContext) {
  const page = await context.newPage();
  const secrets = new InMemorySecretStore();
  const toolkit = createToolkit({ page, secrets }, defaultTools);

  const argv = process.argv.slice(2);
  const taskPath = argv[0];
  if (!taskPath) {
    throw new Error('Usage: tsx index.ts <path-to-task.json>');
  }
  const resolvedTaskPath = path.resolve(process.cwd(), taskPath);
  const raw = await fs.readFile(resolvedTaskPath, 'utf8');
  const config: TaskConfig = JSON.parse(raw);

  if (!config || typeof config !== 'object') {
    throw new Error('Task JSON is invalid or empty');
  }
  if (!config.id || typeof config.id !== 'string' || config.id.trim() === '') {
    throw new Error('Task JSON must include a non-empty "id" string');
  }
  if (!config.targetUrl) {
    throw new Error('Task JSON must include "targetUrl"');
  }
  if (!config.secrets || typeof config.secrets !== 'object') {
    throw new Error('Task JSON must include a "secrets" object');
  }

  const substitutedSecrets = substituteEnvInSecrets(config.secrets);
  // Seed secret store with what's provided
  for (const [k, v] of Object.entries(substitutedSecrets)) {
    secrets.setSecret(k, v);
  }

  // defaults
  const defaultModel = 'gpt-5';
  const defaultPolicies: AgentPolicy = { maxSteps: 30, coolDownMsAfterNav: 1000 };
  const defaultTelemetry: AgentTelemetry = { directory: './telemetry' };
  const model = defaultModel;
  const policies = defaultPolicies;
  const telemetry = defaultTelemetry;
  const providerOptions: ProviderOptions = {
    reasoning: {
      effort: 'medium',
      summary: 'auto',
    },
    store: true,
  };

  const agentResult = await logInAgent({
    ctx: { page, secrets },
    model,
    providerOptions,
    targetUrl: config.targetUrl,
    secretVars: Object.keys(substitutedSecrets),
    tools: toolkit,
    policies,
    telemetry,
    success: config.success,
    taskId: config.id,
  });
  console.log('agent result:', JSON.stringify(agentResult, null, 2));

  await page.waitForTimeout(10000);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await run(context);
  await browser.close();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});

