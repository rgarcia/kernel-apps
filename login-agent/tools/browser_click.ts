import { defineTool, type ToolContext } from './toolkit';

export type BrowserClickInput = {
  element: string;
  ref: string;
  doubleClick?: boolean;
  button?: 'left' | 'right' | 'middle';
  modifiers?: Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'>;
};

type PlaywrightModifier = 'Alt' | 'Control' | 'Meta' | 'Shift';

function mapModifiers(mods: BrowserClickInput['modifiers']): PlaywrightModifier[] | undefined {
  if (!mods || mods.length === 0) return undefined;
  const isMac = process.platform === 'darwin';
  return mods
    .map(m => (m === 'ControlOrMeta' ? (isMac ? 'Meta' : 'Control') : m))
    .filter((m): m is PlaywrightModifier => m === 'Alt' || m === 'Control' || m === 'Meta' || m === 'Shift');
}

async function clickOnPageWithCtx(ctx: ToolContext, input: BrowserClickInput) {
  const locator = ctx.page.locator(`aria-ref=${input.ref}`);
  const options: { button?: 'left' | 'right' | 'middle'; modifiers?: PlaywrightModifier[] } = {
    button: input.button,
    modifiers: mapModifiers(input.modifiers),
  };

  if (input.doubleClick) {
    await locator.dblclick(options as any);
    return { ok: true, action: 'dblclick', ref: input.ref, options };
  }

  await locator.click(options as any);
  return { ok: true, action: 'click', ref: input.ref, options };
}

export const browserClick = defineTool<BrowserClickInput, any>({
  name: 'browser_click',
  description: 'Perform click on a web page',
  parameters: {
    type: 'object',
    properties: {
      element: { type: 'string', description: 'Human-readable element description used to obtain permission to interact with the element' },
      ref: { type: 'string', description: 'Exact target element reference from the page snapshot' },
      doubleClick: { type: 'boolean', description: 'Whether to perform a double click instead of a single click' },
      button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Button to click, defaults to left' },
      modifiers: { type: 'array', items: { type: 'string', enum: ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'] }, description: 'Modifier keys to press' },
    },
    required: ['element', 'ref'],
  },
  run: clickOnPageWithCtx,
});
