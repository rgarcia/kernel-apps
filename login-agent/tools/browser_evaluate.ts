import { defineTool, type ToolContext } from './toolkit';

export type BrowserEvaluateInput = {
  function: string;
  element?: string;
  ref?: string;
};

async function evaluateWithCtx(ctx: ToolContext, input: BrowserEvaluateInput) {
  // If both ref and element are provided, evaluate on the element; otherwise on page
  if (input.ref && input.element) {
    const locator = ctx.page.locator(`aria-ref=${input.ref}`);
    const result = await locator.evaluate((node, fnSrc: string) => {
      const fn = (0, eval)(`(${fnSrc})`);
      return typeof fn === 'function' ? fn(node) : undefined;
    }, input.function);
    return { ok: true, result };
  }
  const result = await ctx.page.evaluate((fnSrc: string) => {
    const fn = (0, eval)(`(${fnSrc})`);
    return typeof fn === 'function' ? fn() : undefined;
  }, input.function);
  return { ok: true, result };
}

export const browserEvaluate = defineTool<BrowserEvaluateInput, any>({
  name: 'browser_evaluate',
  description: 'Evaluate JavaScript expression on page or element',
  parameters: {
    type: 'object',
    properties: {
      function: {
        type: 'string', description: '() => { /* code */ } or (element) => { /* code */ } when element is provided'
      },
      element: { type: 'string', description: 'Human-readable element description used to obtain permission to interact with the element' },
      ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
    },
    required: ['function'],
  },
  run: evaluateWithCtx,
});


