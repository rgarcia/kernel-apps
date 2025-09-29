import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import type { Page } from 'patchright';
import type { SecretStore } from '../secret_store';

export type ToolContext = {
  page: Page;
  secrets?: SecretStore;
};

export type JsonSchema = {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: any;
};

export type ToolDescriptor<TArgs = any, TResult = any> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (ctx: ToolContext, args: TArgs) => Promise<TResult>;
  bind: (ctx: ToolContext) => (args: TArgs) => Promise<TResult>;
  asOpenAIFunction: () => OpenAIFunctionTool;
};

export function defineTool<TArgs, TResult>(cfg: {
  name: string;
  description: string;
  parameters: JsonSchema;
  run: (ctx: ToolContext, args: TArgs) => Promise<TResult>;
}): ToolDescriptor<TArgs, TResult> {
  const asOpenAIFunction = (): OpenAIFunctionTool => ({
    type: 'function',
    name: cfg.name,
    description: cfg.description,
    parameters: cfg.parameters,
    strict: false,
  });

  const bind = (ctx: ToolContext) => {
    return async (args: TArgs) => {
      return await cfg.run(ctx, args);
    };
  };

  return {
    name: cfg.name,
    description: cfg.description,
    parameters: cfg.parameters,
    run: cfg.run,
    bind,
    asOpenAIFunction,
  };
}

export type Toolkit = {
  list: () => string[];
  get: (name: string) => ToolDescriptor<any, any> | undefined;
  asOpenAITools: () => Record<string, OpenAIFunctionTool>;
}

export function createToolkit(ctx: ToolContext, tools: Array<ToolDescriptor<any, any>>): Toolkit {
  const byName = new Map<string, ToolDescriptor<any, any>>();
  for (const t of tools) byName.set(t.name, t);

  const asOpenAITools = (): Record<string, OpenAIFunctionTool> => {
    const map: Record<string, OpenAIFunctionTool> = {};
    for (const tool of tools) {
      map[tool.name] = tool.asOpenAIFunction();
    }
    return map;
  };

  return {
    list: () => Array.from(byName.keys()),
    get: (name: string) => byName.get(name),
    asOpenAITools,
  };
}


