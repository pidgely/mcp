import type { Pidgely, Response } from 'pidgely';
import type { z } from 'zod';
import type { Config } from '../config';

/** The part of the SDK client the tools use (a fake can be passed in tests). */
export type PidgelyClient = Pick<
  Pidgely,
  | 'emails'
  | 'batch'
  | 'domains'
  | 'apiKeys'
  | 'contacts'
  | 'segments'
  | 'broadcasts'
  | 'templates'
  | 'templateBuilder'
  | 'brand'
  | 'suppressions'
  | 'webhooks'
  | 'usage'
>;

/**
 * `read` tools only fetch data. `write` tools change account state (or use the AI quota). `send` tools
 * deliver email to real people. `write` and `send` tools are hidden in read-only mode and simulated in
 * dry-run mode.
 */
export type ToolKind = 'read' | 'write' | 'send';

/** Tool groups, in the order of the README and the docs. */
export const GROUPS = [
  'Emails',
  'Domains',
  'Templates',
  'AI assist',
  'Brand',
  'Contacts',
  'Segments',
  'Broadcasts',
  'Suppressions',
  'Webhooks',
  'API keys',
  'Usage',
] as const;
export type ToolGroup = (typeof GROUPS)[number];

export interface ToolDefinition<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  group: ToolGroup;
  kind: ToolKind;
  /** Deletes or revokes something, or sends a broadcast: cannot be undone (MCP `destructiveHint`). */
  destructive?: boolean;
  /** Calling it again with the same arguments has no further effect (MCP `idempotentHint`; reads always are). */
  idempotent?: boolean;
  /** Reaches beyond Pidgely: e-mails people, fetches websites, writes DNS (MCP `openWorldHint`; send tools always do). */
  openWorld?: boolean;
  /** The result carries a secret shown only once (a new API key): Pidgely-key redaction is relaxed for it. */
  revealsSecret?: boolean;
  /** Write-only arguments (credentials): never echoed in previews or results. */
  secretArgs?: readonly string[];
  input: S;
  /** `METHOD /path` of the API call, shown in dry-run results. */
  endpoint: (args: z.infer<z.ZodObject<S>>) => string;
  /** Extra checks that JSON Schema cannot express. Returns an error message. */
  validate?: (args: z.infer<z.ZodObject<S>>, config: Config) => string | undefined;
  /** Request body (or arguments) echoed in dry-run results. Defaults to the arguments. */
  preview?: (args: z.infer<z.ZodObject<S>>, config: Config) => unknown;
  run: (client: PidgelyClient, args: z.infer<z.ZodObject<S>>, config: Config) => Promise<Response<unknown>> | PromiseLike<Response<unknown>>;
  /** Human-oriented rendering of a successful result. Defaults to pretty JSON. */
  format?: (data: unknown, args: z.infer<z.ZodObject<S>>) => string;
}

export function tool<S extends z.ZodRawShape>(def: ToolDefinition<S>): ToolDefinition {
  return def as unknown as ToolDefinition;
}

/** Prefix of every destructive tool description. */
export const DESTRUCTIVE = 'DESTRUCTIVE, cannot be undone: only call it when the user explicitly asked for it.';
