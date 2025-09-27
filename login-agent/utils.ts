import { promises as fs } from 'node:fs';
import { ResponseFunctionToolCall, ResponseOutputItem, ResponseOutputMessage, ResponseReasoningItem } from 'openai/resources/responses/responses.mjs';

export function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

export async function writeJson(filePath: string, record: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), { encoding: 'utf8' });
}

export function substituteEnvInSecrets(secrets: Record<string, string>): Record<string, string> {
  const env = process.env as Record<string, string>;
  const variablePattern = /\$([A-Z_][A-Z0-9_]*)/g;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value !== 'string') {
      out[key] = String(value);
      continue;
    }
    let substituted = value;
    let match: RegExpExecArray | null;
    variablePattern.lastIndex = 0;
    while ((match = variablePattern.exec(value)) !== null) {
      const varName = match[1];
      const varValue = env[varName];
      if (varValue == null) {
        throw new Error(`Environment variable ${varName} is not set (referenced in secrets for key "${key}")`);
      }
      substituted = substituted.replaceAll(`$${varName}`, varValue);
    }
    out[key] = substituted;
  }
  return out;
}

function truncateText(s: string, max: number = 150): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function printFormattedOutput(items: ResponseOutputItem[]) {
  const lines: string[] = [];

  // reasoning summaries
  const reasoningItems: ResponseReasoningItem[] = items.filter((it: ResponseOutputItem) => it.type === 'reasoning');
  for (const r of reasoningItems) {
    const summaryItems = r.summary;
    if (summaryItems.length === 0) continue;
    lines.push('- reasoning');
    for (const s of summaryItems) {
      // just show a truncated lines
      const parts = s.text.split(/\r?\n/);
      if (parts.length === 0) continue;
      const first = truncateText(parts[0]);
      lines.push(`  - ${first}`);
      for (let i = 1; i < parts.length; i++) {
        const cont = parts[i].trimEnd();
        if (!cont) continue;
        lines.push(`    ${truncateText(cont)}`);
      }
    }
  }

  // tool calls
  const functionCallItems: ResponseFunctionToolCall[] = items.filter((it: ResponseOutputItem) => it.type === 'function_call');
  for (const fc of functionCallItems) {
    lines.push(`- ${fc.name}(${fc.arguments})`);
  }

  // assistant/user messages
  const messageItems: ResponseOutputMessage[] = items.filter((it: ResponseOutputItem) => it.type === 'message');
  for (const m of messageItems) {
    for (const s of m.content) {
      switch (s.type) {
        case 'output_text':
          lines.push(`- message output: ${s.text}`);
          break;
        case 'refusal':
          lines.push(`- message refusal: ${s.refusal}`);
          break;
      }
    }
  }

  console.log('output:');
  for (const line of lines) console.log(line);
}


