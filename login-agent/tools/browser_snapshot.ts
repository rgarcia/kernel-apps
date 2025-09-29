import { defineTool, type ToolContext } from './toolkit';

async function snapshotWithCtx(ctx: ToolContext) {
  const snapshot = await (ctx.page as any)._snapshotForAI?.();
  return { ok: true, snapshot };
}

export const browserSnapshot = defineTool<{}, any>({
  name: 'browser_snapshot',
  description: 'Capture accessibility snapshot of the current page (AI-readable)',
  parameters: { type: 'object', properties: {} },
  run: snapshotWithCtx as any,
});
