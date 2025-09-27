import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';

export type BrowserNavigateInput = {
  url: string;
};

export async function navigatePage(page: Page, input: BrowserNavigateInput) {
  await page.goto(input.url);
  return { ok: true, url: input.url };
}

export const browser_navigate_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'browser_navigate',
  description: 'Navigate to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
    },
    required: ['url'],
  },
  strict: false,
};

export function makeBrowserNavigateExecutor(page: Page) {
  return async (input: BrowserNavigateInput) => navigatePage(page, input);
}


