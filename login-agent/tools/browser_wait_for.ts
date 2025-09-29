import { defineTool, type ToolContext } from './toolkit';

export type BrowserWaitForInput = {
  time?: number;
  text?: string;
  textGone?: string;
};

async function waitForWithCtx(ctx: ToolContext, input: BrowserWaitForInput) {
  const { time, text, textGone } = input;
  if (!time && !text && !textGone)
    throw new Error('Either time, text or textGone must be provided');

  if (time) {
    await new Promise(f => setTimeout(f, Math.min(30000, time * 1000)));
  }

  if (textGone) {
    await ctx.page.getByText(textGone).first().waitFor({ state: 'hidden' });
  }

  if (text) {
    await ctx.page.getByText(text).first().waitFor({ state: 'visible' });
  }

  return { ok: true, waitedFor: text || textGone || time };
}

export const browserWaitFor = defineTool<BrowserWaitForInput, any>({
  name: 'browser_wait_for',
  description: 'Wait for text to appear or disappear or a specified time to pass',
  parameters: {
    type: 'object',
    properties: {
      time: { type: 'number', description: 'The time to wait in seconds' },
      text: { type: 'string', description: 'The text to wait for' },
      textGone: { type: 'string', description: 'The text to wait for to disappear' },
    },
  },
  run: waitForWithCtx,
});

