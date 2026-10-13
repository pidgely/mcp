import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Matches Pidgely API keys (`pdg_<prefix>_<secret>`). */
const API_KEY_PATTERN = /pdg_[A-Za-z0-9]+_[A-Za-z0-9]+/g;

export interface RedactOptions {
  /**
   * Keep other key-shaped strings: set only for results that carry a secret shown once on purpose
   * (a newly created API key). The configured key is always removed.
   */
  allowKeyShaped?: boolean;
  /** Write-only values from the arguments (e.g. a Cloudflare token) to remove wherever they appear. */
  secrets?: readonly string[];
}

/** Removes the configured API key, write-only arguments and anything shaped like a Pidgely key from text sent to the model. */
export function redact(text: string, apiKey: string, options: RedactOptions = {}): string {
  let out = text;
  for (const s of [apiKey, ...(options.secrets ?? [])]) {
    if (s && s.length >= 8) out = out.split(s).join('[redacted]');
  }
  return options.allowKeyShaped ? out : out.replace(API_KEY_PATTERN, 'pdg_[redacted]');
}

export function textResult(text: string, apiKey: string, isError = false, options: RedactOptions = {}): CallToolResult {
  const result: CallToolResult = { content: [{ type: 'text', text: redact(text, apiKey, options) }] };
  if (isError) result.isError = true;
  return result;
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
