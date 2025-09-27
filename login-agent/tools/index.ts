import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';
import type { SecretStore } from '../secret_store';

import { browser_click_tool, makeBrowserClickExecutor, type BrowserClickInput } from './browser_click';
import { browser_drag_tool, makeBrowserDragExecutor, type BrowserDragInput } from './browser_drag';
import { browser_evaluate_tool, makeBrowserEvaluateExecutor, type BrowserEvaluateInput } from './browser_evaluate';
import { browser_fill_form_tool, makeBrowserFillFormExecutor, type BrowserFillFormInput } from './browser_fill_form';
import { browser_handle_dialog_tool, makeBrowserHandleDialogExecutor, type BrowserHandleDialogInput } from './browser_handle_dialog';
import { browser_hover_tool, makeBrowserHoverExecutor, type BrowserHoverInput } from './browser_hover';
import { browser_navigate_tool, makeBrowserNavigateExecutor, type BrowserNavigateInput } from './browser_navigate';
import { browser_press_key_tool, makeBrowserPressKeyExecutor, type BrowserPressKeyInput } from './browser_press_key';
import { browser_select_option_tool, makeBrowserSelectOptionExecutor, type BrowserSelectOptionInput } from './browser_select_option';
import { browser_snapshot_tool, makeBrowserSnapshotExecutor } from './browser_snapshot';
import { browser_type_tool, makeBrowserTypeExecutor, type BrowserTypeInput } from './browser_type';
import { browser_wait_for_tool, makeBrowserWaitForExecutor, type BrowserWaitForInput } from './browser_wait_for';
import { human_input_tool, makeHumanInputExecutor } from './human_input';

export type {
  BrowserClickInput, BrowserDragInput, BrowserEvaluateInput, BrowserFillFormInput, BrowserHandleDialogInput, BrowserHoverInput, BrowserNavigateInput, BrowserPressKeyInput,
  BrowserSelectOptionInput, BrowserTypeInput, BrowserWaitForInput
};

export type OpenAIToolDefinitionAndExecutor = {
  definition: OpenAIFunctionTool;
  executor: (args: any) => Promise<any>;
};

export function createOpenAITools(page: Page, secrets: SecretStore): Record<string, OpenAIToolDefinitionAndExecutor> {
  return {
    browser_click: { definition: browser_click_tool, executor: makeBrowserClickExecutor(page) },
    browser_fill_form: { definition: browser_fill_form_tool, executor: makeBrowserFillFormExecutor(page, secrets) },
    browser_snapshot: { definition: browser_snapshot_tool, executor: makeBrowserSnapshotExecutor(page) },
    browser_navigate: { definition: browser_navigate_tool, executor: makeBrowserNavigateExecutor(page) },
    browser_wait_for: { definition: browser_wait_for_tool, executor: makeBrowserWaitForExecutor(page) },
    browser_evaluate: { definition: browser_evaluate_tool, executor: makeBrowserEvaluateExecutor(page) },
    browser_type: { definition: browser_type_tool, executor: makeBrowserTypeExecutor(page, secrets) },
    browser_press_key: { definition: browser_press_key_tool, executor: makeBrowserPressKeyExecutor(page) },
    browser_select_option: { definition: browser_select_option_tool, executor: makeBrowserSelectOptionExecutor(page) },
    browser_hover: { definition: browser_hover_tool, executor: makeBrowserHoverExecutor(page) },
    browser_drag: { definition: browser_drag_tool, executor: makeBrowserDragExecutor(page) },
    browser_handle_dialog: { definition: browser_handle_dialog_tool, executor: makeBrowserHandleDialogExecutor(page) },
    human_input: { definition: human_input_tool, executor: makeHumanInputExecutor(secrets) },
  };
}

