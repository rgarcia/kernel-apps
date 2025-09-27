import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';

export type BrowserHoverInput = {
  element: string;
  ref: string;
};

export async function hoverOnPage(page: Page, input: BrowserHoverInput) {
  const locator = page.locator(`aria-ref=${input.ref}`);
  await locator.hover();
  return { ok: true };
}

export const browser_hover_tool: OpenAIFunctionTool = {
  type: 'function',
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
  strict: false,
};

export function makeBrowserHoverExecutor(page: Page) {
  return async (input: BrowserHoverInput) => hoverOnPage(page, input);
}


