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

const INSTRUCTIONS = `Pidgely is an email API. Use these tools to send transactional email, manage sending domains and their DNS records, contacts, segments, broadcasts, templates, suppressions and webhooks.
Rules: only email the recipients the user gave you explicitly; never invent addresses. The sender ("from") must use a verified domain (check list_domains). Broadcasts are created as drafts; send them with send_broadcast only after the user confirms.`;

export function annotationsFor(def: ToolDefinition): ToolAnnotations {
  return {
    title: def.title,
    readOnlyHint: def.kind === 'read',
    destructiveHint: false,
    idempotentHint: def.kind === 'read',
    openWorldHint: def.kind === 'send',
  };
}

/** The tools exposed for a configuration (read-only mode hides `write` and `send` tools). */
export function visibleTools(config: Pick<Config, 'readOnly'>, tools: ToolDefinition[] = allTools): ToolDefinition[] {
  return config.readOnly ? tools.filter((t) => t.kind === 'read') : tools;
}

async function callTool(def: ToolDefinition, args: Record<string, unknown>, client: PidgelyClient, config: Config): Promise<CallToolResult> {
  const typed = args as never;
  const problem = def.validate?.(typed, config);
  if (problem) return textResult(`Invalid arguments for ${def.name}: ${problem}`, config.apiKey, true);

  if (config.dryRun && def.kind !== 'read') {
    const preview = def.preview ? def.preview(typed, config) : args;
    return textResult(
      json({ dry_run: true, tool: def.name, request: def.endpoint(typed), payload: preview, note: 'PIDGELY_MCP_DRY_RUN is on: nothing was sent or changed.' }),
      config.apiKey,
    );
  }

  try {
    const { data, error } = await def.run(client, typed, config);
    if (error) {
      const status = error.statusCode ? `${error.statusCode} ` : '';
      return textResult(`Pidgely API error (${status}${error.name}): ${error.message}`, config.apiKey, true);
    }
    return textResult(def.format ? def.format(data, typed) : json(data), config.apiKey);
  } catch (err) {
    return textResult(`${def.name} failed: ${err instanceof Error ? err.message : String(err)}`, config.apiKey, true);
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
