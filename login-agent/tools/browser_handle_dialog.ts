import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';

export type BrowserHandleDialogInput = {
  accept: boolean;
  promptText?: string;
};

export async function handleDialogOnPage(page: Page, input: BrowserHandleDialogInput) {
  // Attach a one-time listener to handle the next dialog
  const listener = async (dialog: any) => {
    try {
      if (input.accept) await dialog.accept(input.promptText);
      else await dialog.dismiss();
    } catch { }
  };
  page.once('dialog', listener);
  return { ok: true };
}

export const browser_handle_dialog_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'browser_handle_dialog',
  description: 'Accept or dismiss the next dialog, with optional prompt text',
  parameters: {
    type: 'object',
    properties: {
      accept: { type: 'boolean', description: 'Whether to accept the dialog.' },
      promptText: { type: 'string', description: 'The text of the prompt in case of a prompt dialog.' },
    },
    required: ['accept'],
  },
  strict: false,
};

export function makeBrowserHandleDialogExecutor(page: Page) {
  return async (input: BrowserHandleDialogInput) => handleDialogOnPage(page, input);
}


