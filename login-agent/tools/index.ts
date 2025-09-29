
import { browserClick } from './browser_click';
import { browserDrag } from './browser_drag';
import { browserEvaluate } from './browser_evaluate';
import { browserFillForm } from './browser_fill_form';
import { browserHandleDialog } from './browser_handle_dialog';
import { browserHover } from './browser_hover';
import { browserNavigate } from './browser_navigate';
import { browserPressKey } from './browser_press_key';
import { browserSelectOption } from './browser_select_option';
import { browserSnapshot } from './browser_snapshot';
import { browserType } from './browser_type';
import { browserWaitFor } from './browser_wait_for';
import { humanInput } from './human_input';

export const defaultTools: Array<ToolDescriptor<any, any>> = [
  browserClick,
  browserDrag,
  browserEvaluate,
  browserFillForm,
  browserHandleDialog,
  browserHover,
  browserNavigate,
  browserPressKey,
  browserSelectOption,
  browserSnapshot,
  browserType,
  browserWaitFor,
  humanInput,
]

import { ToolDescriptor } from './toolkit';

export type { BrowserClickInput } from './browser_click';
export type { BrowserDragInput } from './browser_drag';
export type { BrowserEvaluateInput } from './browser_evaluate';
export type { BrowserFillFormInput } from './browser_fill_form';
export type { BrowserHandleDialogInput } from './browser_handle_dialog';
export type { BrowserHoverInput } from './browser_hover';
export type { BrowserNavigateInput } from './browser_navigate';
export type { BrowserPressKeyInput } from './browser_press_key';
export type { BrowserSelectOptionInput } from './browser_select_option';
export type { BrowserTypeInput } from './browser_type';
export type { BrowserWaitForInput } from './browser_wait_for';

