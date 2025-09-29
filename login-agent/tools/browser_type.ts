import { resolveSecretMaybe } from '../secret_store';
import { defineTool, type ToolContext } from './toolkit';

export type BrowserTypeInput = {
  element: string;
  ref: string;
  text: string;
  submit?: boolean;
  slowly?: boolean;
};

async function typeWithCtx(ctx: ToolContext, input: BrowserTypeInput) {
  const locator = ctx.page.locator(`aria-ref=${input.ref}`);
  const text = resolveSecretMaybe(input.text, ctx.secrets!);
  if (input.slowly) {
    await locator.click({ force: true });
    await ctx.page.keyboard.type(text);
  } else {
    await locator.fill(text);
  }
  if (input.submit) {
    await locator.press('Enter');
  }
  return { ok: true };
}

export const browserType = defineTool<BrowserTypeInput, any>({
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
  run: typeWithCtx,
});
