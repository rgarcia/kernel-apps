// @ts-nocheck
import { Kernel, type KernelContext } from '@onkernel/sdk';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createContext, Script } from 'node:vm';
import * as playwright from 'playwright';
import { ModuleKind, ModuleResolutionKind, ScriptTarget, transpileModule } from 'typescript';

const kernel = new Kernel({ timeout: 5000 });

const app = kernel.app('ts-basic');

/**
 * Execute arbitrary TypeScript code (with a playwright `page` available in scope) against a remote Kernel browser session.
 * Args:
 *   ctx: Kernel invocation context
 *   payload: { sessionId: string; code: string }
 * Returns:
 *   { result: unknown } - whatever the executed function returns
 * CLI:
 *   export KERNEL_API_KEY=<your_api_key>
 *   kernel deploy index.ts
 *   kernel invoke ts-basic execute-code -p '{"sessionId":"<session-id>","code":"await page.goto(\\"https://example.com\\"); return await page.title();"}'
 */
interface ExecuteCodeInput {
  sessionId: string;
  code: string;
}

interface ExecuteCodeOutput { result: unknown; }

export async function runExecuteCode(sessionId: string, code: string): Promise<unknown> {
  if (!sessionId) throw new Error('sessionId is required');
  if (!code || typeof code !== 'string') throw new Error('code is required and must be a string');

  const kernelBrowser = await kernel.browsers.retrieve(sessionId);
  const browser = await playwright.chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  const tsSource = [
    'export default async function __user_execute(page: any) {',
    code,
    '\n}',
  ].join('\n');

  const transpiled = transpileModule(tsSource, {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2019,
      esModuleInterop: true,
      moduleResolution: ModuleResolutionKind.Classic,
      isolatedModules: true,
      skipLibCheck: true,
      noEmitOnError: false,
    },
    reportDiagnostics: true,
  });

  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    const formatted = transpiled.diagnostics
      .map((d: any) => (d.messageText && (d as any).messageText.messageText) ? `${d.code}: ${(d as any).messageText.messageText}` : `${d.code}: ${String((d as any).messageText)}`)
      .join('\n');
    throw new Error(`TypeScript transpile error(s):\n${formatted}`);
  }

  const jsCode: string = transpiled.outputText;

  const require = createRequire(import.meta.url);
  const sandbox: any = {
    page,
    console,
    module: { exports: {} },
    exports: {},
    require,
    process,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
  };

  const vmContext = createContext(sandbox);
  const script = new Script(jsCode, { filename: 'execute_code.user.ts' });
  script.runInContext(vmContext, { timeout: 60_000 });

  const fn = (sandbox.module?.exports as any)?.default
    || (sandbox.exports as any)?.default
    || (sandbox.module?.exports as any);
  if (typeof fn !== 'function') {
    throw new Error('Executed module did not export a callable function');
  }
  return await fn(page);
}

app.action<ExecuteCodeInput, ExecuteCodeOutput>(
  'execute-code',
  async (ctx: KernelContext, payload?: ExecuteCodeInput): Promise<ExecuteCodeOutput> => {
    const result = await runExecuteCode(payload?.sessionId as string, payload?.code as string);
    return { result };
  },
);

// ESM-friendly main check: if run via `tsx index.ts <sessionId> <code>`
try {
  const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
  if (isMain) {
    const [, , sessionIdArg, ...codeParts] = process.argv;
    if (!sessionIdArg) {
      console.error('Usage: tsx index.ts <sessionId> <code>');
      process.exit(1);
    }
    const codeArg = codeParts.join(' ').trim();
    if (!codeArg) {
      console.error('Missing <code> argument');
      process.exit(1);
    }

    runExecuteCode(sessionIdArg, codeArg)
      .then((res) => {
        // Print JSON for easy piping
        console.log(JSON.stringify({ ok: true, result: res }, null, 2));
        process.exit(0);
      })
      .catch((err) => {
        console.error(JSON.stringify({ ok: false, error: String(err?.stack || err?.message || err) }, null, 2));
        process.exit(1);
      });
  }
} catch {
  // ignore if pathToFileURL or import.meta not available
}

