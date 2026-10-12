import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Matches Pidgely API keys (`pdg_<prefix>_<secret>`). */
const API_KEY_PATTERN = /pdg_[A-Za-z0-9]+_[A-Za-z0-9]+/g;

/** Removes the configured API key, and anything shaped like one, from text sent to the model. */
export function redact(text: string, apiKey: string): string {
  let out = text;
  if (apiKey.length >= 8) out = out.split(apiKey).join('[redacted]');
  return out.replace(API_KEY_PATTERN, 'pdg_[redacted]');
}

export function textResult(text: string, apiKey: string, isError = false): CallToolResult {
  const result: CallToolResult = { content: [{ type: 'text', text: redact(text, apiKey) }] };
  if (isError) result.isError = true;
  return result;
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
