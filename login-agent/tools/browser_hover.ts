import { defineTool, type ToolContext } from './toolkit';

export type BrowserHoverInput = {
  element: string;
  ref: string;
};

async function hoverWithCtx(ctx: ToolContext, input: BrowserHoverInput) {
  const locator = ctx.page.locator(`aria-ref=${input.ref}`);
  await locator.hover();
  return { ok: true };
}

export const browserHover = defineTool<BrowserHoverInput, any>({
  name: 'browser_hover',
  description: 'Hover over an element to reveal menus or tooltips',
  parameters: {
    type: 'object',
    properties: {
      element: { type: 'string', description: 'Human-readable element description' },
      ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
    },
    required: ['element', 'ref'],
  },
  run: hoverWithCtx,
});


