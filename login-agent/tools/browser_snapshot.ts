import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';

export async function snapshotPage(page: Page) {
  const snapshot = await (page as any)._snapshotForAI?.();
  return { ok: true, snapshot };
}

export const browser_snapshot_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'browser_snapshot',
  description: 'Capture accessibility snapshot of the current page (AI-readable)',
  parameters: { type: 'object', properties: {} },
  strict: false,
};

export function makeBrowserSnapshotExecutor(page: Page) {
  return async () => snapshotPage(page);
}


