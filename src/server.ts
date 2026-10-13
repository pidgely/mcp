import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { Pidgely } from 'pidgely';
import type { Config } from './config';
import { json, textResult } from './format';
import { registerPrompts } from './prompts';
import type { PidgelyClient, ToolDefinition } from './tools';
import { tools as allTools } from './tools';
import { VERSION } from './version';

export interface CreateServerOptions {
  config: Config;
  /** SDK client; created from the config when omitted. */
  client?: PidgelyClient;
  /** Tool set (defaults to all Pidgely tools). */
  tools?: ToolDefinition[];
}

const INSTRUCTIONS = `Pidgely is an email API. Use these tools to send email; manage sending domains and set up their DNS automatically; design templates with the visual builder and AI assist (generate, rewrite, translate, subject lines) in the organization's brand, imported from its website; and manage contacts, segments, broadcasts, suppressions, webhooks, API keys and usage.
Rules: only email the recipients the user gave you explicitly; never invent addresses. The sender ("from") must use a verified domain (check list_domains). Broadcasts are created as drafts; send them with send_broadcast only after the user confirms. Tools marked DESTRUCTIVE cannot be undone: call them only when the user explicitly asked. Never repeat credentials the user gives you (Cloudflare tokens); a new API key or webhook secret is shown once: hand it to the user, do not store or repeat it.
Builder, AI and brand tools need the Scale plan: check get_template_builder_capabilities first. A typical flow: import_brand_from_website (apply=true), generate_template_with_ai, render_template_html to check it, create_template with the builder document, then send one test with send_email after the user confirms.`;

export function annotationsFor(def: ToolDefinition): ToolAnnotations {
  return {
    title: def.title,
    readOnlyHint: def.kind === 'read',
    destructiveHint: def.destructive === true,
    idempotentHint: def.kind === 'read' || def.idempotent === true,
    openWorldHint: def.openWorld ?? def.kind === 'send',
  };
}

/** Write-only argument values of a call (never echoed). */
function secretValues(def: ToolDefinition, args: Record<string, unknown>): string[] {
  return (def.secretArgs ?? []).map((k) => args[k]).filter((v): v is string => typeof v === 'string');
}

/** The arguments with write-only values masked. */
function masked(def: ToolDefinition, value: unknown): unknown {
  if (!def.secretArgs?.length || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const k of def.secretArgs) if (k in out) out[k] = '[write-only]';
  return out;
}

/** The tools exposed for a configuration (read-only mode hides `write` and `send` tools). */
export function visibleTools(config: Pick<Config, 'readOnly'>, tools: ToolDefinition[] = allTools): ToolDefinition[] {
  return config.readOnly ? tools.filter((t) => t.kind === 'read') : tools;
}

export async function callTool(def: ToolDefinition, args: Record<string, unknown>, client: PidgelyClient, config: Config): Promise<CallToolResult> {
  const typed = args as never;
  const secrets = { secrets: secretValues(def, args) };
  const problem = def.validate?.(typed, config);
  if (problem) return textResult(`Invalid arguments for ${def.name}: ${problem}`, config.apiKey, true, secrets);

  if (config.dryRun && def.kind !== 'read') {
    const preview = masked(def, def.preview ? def.preview(typed, config) : args);
    return textResult(
      json({ dry_run: true, tool: def.name, request: def.endpoint(typed), payload: preview, note: 'PIDGELY_MCP_DRY_RUN is on: nothing was sent or changed.' }),
      config.apiKey,
      false,
      secrets,
    );
  }

  try {
    const { data, error } = await def.run(client, typed, config);
    if (error) {
      const status = error.statusCode ? `${error.statusCode} ` : '';
      return textResult(`Pidgely API error (${status}${error.name}): ${error.message}`, config.apiKey, true, secrets);
    }
    const text = def.format ? def.format(data, typed) : json(data);
    return textResult(text, config.apiKey, false, { ...secrets, allowKeyShaped: def.revealsSecret === true });
  } catch (err) {
    return textResult(`${def.name} failed: ${err instanceof Error ? err.message : String(err)}`, config.apiKey, true, secrets);
  }
}

/** Builds an MCP server exposing Pidgely tools and prompts. */
export function createServer({ config, client, tools = allTools }: CreateServerOptions): McpServer {
  const pidgely: PidgelyClient = client ?? new Pidgely(config.apiKey, { baseUrl: config.baseUrl, userAgent: `pidgely-mcp/${VERSION}` });
  const server = new McpServer(
    { name: 'pidgely', title: 'Pidgely', version: VERSION, websiteUrl: 'https://pidgely.com' },
    { instructions: INSTRUCTIONS, capabilities: { tools: {}, prompts: {} } },
  );

  for (const def of visibleTools(config, tools)) {
    const description =
      config.dryRun && def.kind !== 'read' ? `${def.description} [DRY RUN: returns the request instead of executing it.]` : def.description;
    server.registerTool(
      def.name,
      { title: def.title, description, inputSchema: def.input, annotations: annotationsFor(def) },
      (args: Record<string, unknown>) => callTool(def, args, pidgely, config),
    );
  }
  registerPrompts(server, { readOnly: config.readOnly });
  return server;
}
