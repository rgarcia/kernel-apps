import { defineTool, type ToolContext } from './toolkit';

export type BrowserSelectOptionInput = {
  element: string;
  ref: string;
  label?: string;
  value?: string;
};

async function selectWithCtx(ctx: ToolContext, input: BrowserSelectOptionInput) {
  const locator = ctx.page.locator(`aria-ref=${input.ref}`);
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

export const browserSelectOption = defineTool<BrowserSelectOptionInput, any>({
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
  run: selectWithCtx,
});



