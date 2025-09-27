import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';
import { resolveSecretMaybe, type SecretStore } from '../secret_store';

export type BrowserTypeInput = {
  element: string;
  ref: string;
  text: string;
  submit?: boolean;
  slowly?: boolean;
};

export function createTypeOnPage(secrets: SecretStore) {
  return async function typeOnPage(page: Page, input: BrowserTypeInput): Promise<{ ok: boolean }> {
    const locator = page.locator(`aria-ref=${input.ref}`);
    const text = resolveSecretMaybe(input.text, secrets);
    if (input.slowly) {
      await locator.click({ force: true });
      await page.keyboard.type(text);
    } else {
      await locator.fill(text);
    }
    if (input.submit) {
      await locator.press('Enter');
    }
    return { ok: true };
  };
}

export const browser_type_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'browser_type',
  description: 'Type text into editable element',
  parameters: {
    type: 'object',
    properties: {
      element: { type: 'string', description: 'Human-readable element description' },
      ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
      text: { type: 'string', description: 'Text to type into the element. May be a secret variable like `$PASSWORD`.' },
      submit: { type: 'boolean', description: 'Whether to submit entered text (press Enter after)' },
      slowly: { type: 'boolean', description: 'Whether to type one character at a time.' },
    },
    required: ['element', 'ref', 'text'],
  },
  strict: false,
};

export function makeBrowserTypeExecutor(page: Page, secrets: SecretStore) {
  const typeOnPage = createTypeOnPage(secrets);
  return async (input: BrowserTypeInput) => typeOnPage(page, input);
}


