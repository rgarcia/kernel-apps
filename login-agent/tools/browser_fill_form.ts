import { resolveSecretMaybe } from '../secret_store';
import { defineTool, type ToolContext } from './toolkit';

export type BrowserFillFormInput = {
  fields: Array<{
    name: string;
    type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
    ref: string;
    value: string;
  }>;
};

async function fillFormWithCtx(ctx: ToolContext, input: BrowserFillFormInput) {
  const secrets = ctx.secrets!;
  const fields = input.fields.map(f => {
    if (f.type === 'textbox') {
      const resolved = resolveSecretMaybe(f.value, secrets);
      return { ...f, value: resolved };
    }
    return f;
  });
  for (const field of fields) {
    const locator = ctx.page.locator(`aria-ref=${field.ref}`);
    if (field.type === 'textbox' || field.type === 'slider') {
      await locator.fill(field.value);
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      const shouldCheck = field.value === 'true';
      await locator.setChecked(shouldCheck);
    } else if (field.type === 'combobox') {
      await locator.selectOption({ label: field.value });
    }
  }
  return { ok: true };
}

export const browserFillForm = defineTool<BrowserFillFormInput, any>({
  name: 'browser_fill_form',
  description: 'Fill multiple form fields',
  parameters: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Human-readable field name' },
            type: { type: 'string', enum: ['textbox', 'checkbox', 'radio', 'combobox', 'slider'], description: 'Type of the field' },
            ref: { type: 'string', description: 'Exact target field reference from the page snapshot' },
            value: { type: 'string', description: 'Value to fill. For textboxes may be a secret like `$USERNAME`. For checkboxes and radios, use `true` or `false`. For comboboxes, provide visible option text.' },
          },
          required: ['name', 'type', 'ref', 'value'],
        },
        description: 'Fields to fill in',
      },
    },
    required: ['fields'],
  },
  run: fillFormWithCtx,
});

