import { defineTool, type ToolContext } from './toolkit';

export type BrowserDragInput = {
  element: string;
  ref: string;
  targetElement?: string;
  targetRef?: string;
};

async function dragWithCtx(ctx: ToolContext, input: BrowserDragInput) {
  const source = ctx.page.locator(`aria-ref=${input.ref}`);
  if (input.targetRef) {
    const target = ctx.page.locator(`aria-ref=${input.targetRef}`);
    await source.dragTo(target);
    return { ok: true, mode: 'element-to-element' };
  }
  // If no target provided, perform a small drag gesture to itself to trigger DnD
  const box = await source.boundingBox();
  if (!box) throw new Error('Source element not visible');
  await ctx.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await ctx.page.mouse.down();
  await ctx.page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10);
  await ctx.page.mouse.up();
  return { ok: true, mode: 'self-drag' };
}

export const browserDrag = defineTool<BrowserDragInput, any>({
  name: 'browser_drag',
  description: 'Drag and drop between elements or perform a drag gesture',
  parameters: {
    type: 'object',
    properties: {
      element: { type: 'string', description: 'Human-readable element description' },
      ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
      targetElement: { type: 'string', description: 'Description of drop target element' },
      targetRef: { type: 'string', description: 'Exact drop target reference from the page snapshot' },
    },
    required: ['element', 'ref'],
  },
  run: dragWithCtx,
});


