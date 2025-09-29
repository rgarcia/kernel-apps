import { promises as fs } from 'node:fs';
import OpenAI from 'openai';

export type ImageScoreRecord = {
  path: string;
  score: number;
  reasoning?: string;
  raw?: string;
};

export type WebJudgeOptions = {
  model?: string;
  scoreThreshold?: number; // 1-5
  maxImages?: number;
};

export type WebJudgeResult = {
  status: 'success' | 'failure';
  thoughts: string; // evaluator thoughts
  keyPoints: string; // formatted bullet list string
  imageScores: ImageScoreRecord[]; // one per provided image
  usedImages: string[]; // subset used in final judgement
};

const DEFAULT_MODEL = 'gpt-5';
const DEFAULT_THRESHOLD = 4; // keep informative frames
const DEFAULT_MAX_IMAGES = 50;

async function fileToBase64(path: string): Promise<string> {
  const buf = await fs.readFile(path);
  return buf.toString('base64');
}

export async function identifyKeyPoints(task: string, client?: OpenAI, model: string = DEFAULT_MODEL): Promise<string> {
  const openai = client ?? new OpenAI();
  const system = [
    'You are an expert tasked with analyzing a given task to identify the key points explicitly stated in the task description.',
    '',
    'Objective: Carefully analyze the task description and extract the critical elements explicitly mentioned in the task for achieving its goal.',
    '',
    'Instructions:',
    '1. Read the task description carefully.',
    '2. Identify and extract key points directly stated in the task description.',
    '   - A key point is a critical element, condition, or step explicitly mentioned in the task description.',
    '   - Do not infer or add any unstated elements.',
    '   - Words such as "best," "highest," "cheapest," "latest," "most recent," "lowest," "closest," "highest-rated," "largest," and "newest" must go through a sort function (e.g., the key point should be "Use sort by highest").',
    '',
    'Respond with:',
    '- Key Points: A numbered list of the explicit key points for completing this task, one per line, without explanations or additional details.'
  ].join('\n');

  const user = `Task: ${task}`;

  const resp = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const text = Array.isArray(resp.output)
    ? resp.output.map(x => (x.type === 'message' ? x.content.map(c => (c.type === 'output_text' ? c.text : '')).join('\n') : '')).join('\n')
    : '';
  const out = text.trim();
  try {
    console.log('WebJudge: Key Point Identification output:\n' + out);
  } catch { }
  return out;
}

export async function judgeImage(
  task: string,
  imagePath: string,
  keyPoints: string,
  client?: OpenAI,
  model: string = DEFAULT_MODEL,
): Promise<string> {
  const openai = client ?? new OpenAI();

  const system = [
    'You are an expert evaluator tasked with determining whether an image contains information about the necessary steps to complete a login task.',
    '',
    'Objective: Analyze the provided image and decide if it shows essential steps or evidence required for completing the task. Use your reasoning to explain your decision before assigning a score.',
    '',
    'Instructions:',
    '1. Provide a detailed description of the image, including its contents, visible elements, text (if any), and any notable features.',
    '2. Carefully examine the image and evaluate whether it contains necessary steps or evidence crucial to task completion:',
    '   - Identify key points that could be relevant to task completion, such as actions, progress indicators, login forms, credential fields, or success indicators.',
    '   - Does the image show actions, progress indicators, or critical information directly related to completing the login task?',
    '   - Is this information indispensable for understanding or ensuring task success?',
    '   - If the image contains partial but relevant information, consider its usefulness rather than dismissing it outright.',
    '3. Provide your response in the following format:',
    '   - Reasoning: Explain your observations. Mention specific elements in the image.',
    '   - Score: Assign a score using the following scale:',
    '     - 1: The image does not contain any necessary steps or relevant information.',
    '     - 2: Minimal or ambiguous information, unlikely to be essential.',
    '     - 3: Some relevant steps or hints but lacks clarity or completeness.',
    '     - 4: Important steps or evidence that are highly relevant but not fully comprehensive.',
    '     - 5: Clearly displays necessary steps or evidence crucial for completing the task.',
  ].join('\n');

  const base64 = await fileToBase64(imagePath);
  const userText = [
    `Task: ${task}`,
    '',
    `Key Points for Task Completion:`,
    keyPoints,
    '',
    'The snapshot of the web page is shown in the image.',
  ].join('\n');

  const resp = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userText },
          { type: 'input_image', image_url: `data:image/png;base64,${base64}`, detail: 'high' },
        ],
      },
    ],
  });

  const text = Array.isArray(resp.output)
    ? resp.output.map(x => (x.type === 'message' ? x.content.map(c => (c.type === 'output_text' ? c.text : '')).join('\n') : '')).join('\n')
    : '';
  const out = text.trim();
  try {
    console.log(`WebJudge: Key Screenshot Identification (single image) raw output for ${imagePath}:\n` + out);
  } catch { }
  return out;
}

function extractScoreAndReasoning(raw: string): { score: number; reasoning?: string } {
  const scoreMatch = raw.match(/Score\s*[:\-]\s*(\d)/i);
  const reasoningMatch = raw.match(/Reasoning\s*[:\-]\s*([\s\S]*?)(?:\n\s*Score|$)/i);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
  const reasoning = reasoningMatch ? reasoningMatch[1].trim() : undefined;
  return { score: Number.isFinite(score) ? score : 0, reasoning };
}

export async function webJudgeLoginEval(
  task: string,
  actions: string[],
  imagePaths: string[],
  options?: WebJudgeOptions,
  client?: OpenAI,
): Promise<WebJudgeResult> {
  const model = options?.model ?? DEFAULT_MODEL;
  const threshold = options?.scoreThreshold ?? DEFAULT_THRESHOLD;
  const maxImages = options?.maxImages ?? DEFAULT_MAX_IMAGES;
  const openai = client ?? new OpenAI();

  const keyPointsRaw = await identifyKeyPoints(task, openai, model);
  const keyPoints = keyPointsRaw.replace(/\n\n/g, '\n').trim();

  const limited = imagePaths.slice(0, maxImages);
  const perImage = await Promise.all(
    limited.map(async (p) => {
      const raw = await judgeImage(task, p, keyPoints, openai, model);
      const { score, reasoning } = extractScoreAndReasoning(raw);
      const rec: ImageScoreRecord = { path: p, score, reasoning, raw };
      return rec;
    })
  );

  try {
    console.log('WebJudge: Image score records (expanded):\n' + JSON.stringify(perImage, null, 2));
  } catch { }

  const selected = perImage.filter(r => r.score >= threshold);

  const system = [
    'You are an expert in evaluating the performance of a website login agent.',
    'Given the user\'s task, the agent\'s action history, key points for task completion, and a subset of key screenshots, determine whether the agent completed the task and achieved all requirements.',
    '',
    'Format your response into two lines exactly:',
    'Thoughts: <your reasoning based on the evidence>',
    'Status: "success" or "failure"',
  ].join('\n');

  const thoughtsText = selected.map(s => s.reasoning).filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join('\n');
  const userText = [
    `User Task: ${task}`,
    '',
    'Key Points:',
    keyPoints,
    '',
    'Action History:',
    actions.map((a, i) => `${i + 1}. ${a}`).join('\n'),
    thoughtsText ? '\nKey Screenshot Notes:\n' + thoughtsText : '',
  ].join('\n');

  const imageContents = await Promise.all(
    selected.map(async s => ({
      type: 'input_image' as const,
      image_url: `data:image/png;base64,${await fileToBase64(s.path)}`,
      detail: 'high' as const,
    }))
  );

  const resp = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: [{ type: 'input_text', text: userText }, ...imageContents] },
    ],
  });

  const out = Array.isArray(resp.output)
    ? resp.output.map(x => (x.type === 'message' ? x.content.map(c => (c.type === 'output_text' ? c.text : '')).join('\n') : '')).join('\n')
    : '';
  try {
    console.log('WebJudge: Outcome Judgement raw output:\n' + out);
  } catch { }

  const thoughtsMatch = out.match(/Thoughts\s*:\s*([\s\S]*?)\n\s*Status/i);
  const statusMatch = out.match(/Status\s*:\s*["']?\s*(success|failure)\s*["']?/i);
  const thoughts = thoughtsMatch ? thoughtsMatch[1].trim() : out.trim();
  const status = (statusMatch ? statusMatch[1].toLowerCase() : 'failure') as 'success' | 'failure';

  return {
    status,
    thoughts,
    keyPoints,
    imageScores: perImage,
    usedImages: selected.map(s => s.path),
  };
}

