import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';

export type BrowserPressKeyInput = {
  key: string;
};

export async function pressKeyOnPage(page: Page, input: BrowserPressKeyInput) {
  await page.keyboard.press(input.key);
  return { ok: true, key: input.key };
}

export const browser_press_key_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'browser_press_key',
  description: 'Press a key on the keyboard',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Name of the key to press or a character to generate, such as `ArrowLeft` or `a`' },
    },
    required: ['key'],
  },
  strict: false,
};

export function makeBrowserPressKeyExecutor(page: Page) {
  return async (input: BrowserPressKeyInput) => pressKeyOnPage(page, input);
}


