import { defineTool, type ToolContext } from './toolkit';

export type BrowserNavigateInput = {
  url: string;
};

async function navigateWithCtx(ctx: ToolContext, input: BrowserNavigateInput) {
  await ctx.page.goto(input.url);
  return { ok: true, url: input.url };
}

export const browserNavigate = defineTool<BrowserNavigateInput, any>({
  name: 'browser_navigate',
  description: 'Navigate to a URL',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
    },
    required: ['url'],
  },
  run: navigateWithCtx,
});


