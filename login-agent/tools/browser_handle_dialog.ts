import { defineTool, type ToolContext } from './toolkit';

export type BrowserHandleDialogInput = {
  accept: boolean;
  promptText?: string;
};

async function handleDialogWithCtx(ctx: ToolContext, input: BrowserHandleDialogInput) {
  // Attach a one-time listener to handle the next dialog
  const listener = async (dialog: any) => {
    try {
      if (input.accept) await dialog.accept(input.promptText);
      else await dialog.dismiss();
    } catch { }
  };
  ctx.page.once('dialog', listener);
  return { ok: true };
}

export const browserHandleDialog = defineTool<BrowserHandleDialogInput, any>({
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
  run: handleDialogWithCtx,
});
