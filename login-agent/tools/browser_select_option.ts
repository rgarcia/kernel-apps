import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';

export type BrowserSelectOptionInput = {
  element: string;
  ref: string;
  label?: string;
  value?: string;
};

export async function selectOptionOnPage(page: Page, input: BrowserSelectOptionInput) {
  const locator = page.locator(`aria-ref=${input.ref}`);
  if (input.label) {
    await locator.selectOption({ label: input.label });
    return { ok: true, by: 'label', label: input.label };
  }
  if (input.value) {
    await locator.selectOption({ value: input.value });
    return { ok: true, by: 'value', value: input.value };
  }
  throw new Error('Either label or value must be provided');
}

export const browser_select_option_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'browser_select_option',
  description: 'Select an option in a dropdown',
  parameters: {
    type: 'object',
    properties: {
      element: { type: 'string', description: 'Human-readable element description' },
      ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
      label: { type: 'string', description: 'Option label to select' },
      value: { type: 'string', description: 'Option value to select' },
    },
    required: ['element', 'ref'],
  },
  strict: false,
};

export function makeBrowserSelectOptionExecutor(page: Page) {
  return async (input: BrowserSelectOptionInput) => selectOptionOnPage(page, input);
}


