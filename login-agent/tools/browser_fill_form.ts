import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';
import { resolveSecretMaybe, type SecretStore } from '../secret_store';

export type BrowserFillFormInput = {
  fields: Array<{
    name: string;
    type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';
    ref: string;
    value: string;
  }>;
};

export function createFillFormOnPage(secrets: SecretStore) {
  return async function fillFormOnPage(page: Page, input: BrowserFillFormInput): Promise<{ ok: boolean }> {
    const fields = input.fields.map(f => {
      if (f.type === 'textbox') {
        const resolved = resolveSecretMaybe(f.value, secrets);
        return { ...f, value: resolved };
      }
      return f;
    });
    for (const field of fields) {
      const locator = page.locator(`aria-ref=${field.ref}`);
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
  };
}

export const browser_fill_form_tool: OpenAIFunctionTool = {
  type: 'function',
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
  strict: false,
};

export function makeBrowserFillFormExecutor(page: Page, secrets: SecretStore) {
  const fillFormOnPage = createFillFormOnPage(secrets);
  return async (input: BrowserFillFormInput) => fillFormOnPage(page, input);
}


