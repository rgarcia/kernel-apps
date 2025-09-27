import type { FunctionTool as OpenAIFunctionTool } from 'openai/resources/responses/responses';
import prompts from 'prompts';
import type { SecretStore } from '../secret_store';

export type HumanInputToolInput = {
  message: string;
  kind?: 'text' | 'password' | 'confirm' | 'number' | 'select' | 'multiselect';
  choices?: string[];
  initial?: string | number | boolean | string[];
  hint?: string;
  secret?: string;
};

export async function promptHuman(input: HumanInputToolInput, secrets: SecretStore) {
  const { message, kind = 'text', choices, initial, hint, secret } = input;

  const question: any = {
    name: 'value',
    type: kind,
    message,
    initial,
    hint,
  };

  if ((kind === 'select' || kind === 'multiselect') && Array.isArray(choices)) {
    question.choices = choices.map((c) => ({ title: String(c), value: String(c) }));
  }

  try {
    const result = await prompts(question, {
      onCancel: () => {
        throw new Error('User cancelled input');
      },
    });
    const value = result?.value;
    if (secret && (kind === 'text' || kind === 'password' || kind === 'number')) {
      if (typeof value !== 'string' && typeof value !== 'number') {
        return { ok: false, error: 'Secret value must be string or number' };
      }
      secrets.setSecret(secret, String(value));
      return { ok: true, stored: true };
    }
    return { ok: true, value };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export const human_input_tool: OpenAIFunctionTool = {
  type: 'function',
  name: 'human_input',
  description: 'Prompt the human operator for input. Useful for secrets or decisions.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Prompt message to show the user' },
      kind: { type: 'string', enum: ['text', 'password', 'confirm', 'number', 'select', 'multiselect'], description: 'Type of prompt. Defaults to text.' },
      choices: { type: 'array', items: { type: 'string' }, description: 'Choices for select/multiselect prompts' },
      initial: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }], description: 'Initial value for the prompt' },
      hint: { type: 'string', description: 'Short help text displayed with the prompt' },
      secret: {
        type: 'string', description: 'For text/password/number kinds, provide a secret identifier, e.g. USERNAME or OTP_CODE. The human-entered value will be stored in a way that can be referenced later in other other tools like browser_fill_form or browser_type.'
      },
    },
    required: ['message'],
  },
  strict: false,
};

export function makeHumanInputExecutor(secrets: SecretStore) {
  return async (input: HumanInputToolInput) => promptHuman(input, secrets);
}


