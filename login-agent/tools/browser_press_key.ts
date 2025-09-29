import { defineTool, type ToolContext } from './toolkit';

export type BrowserPressKeyInput = {
  key: string;
};

async function pressKeyWithCtx(ctx: ToolContext, input: BrowserPressKeyInput) {
  await ctx.page.keyboard.press(input.key);
  return { ok: true, key: input.key };
}

export const browserPressKey = defineTool<BrowserPressKeyInput, any>({
  name: 'browser_press_key',
  description: 'Press a key on the keyboard',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Name of the key to press or a character to generate, such as `ArrowLeft` or `a`' },
    },
    required: ['key'],
  },
  run: pressKeyWithCtx,
});

