export type Transport = 'stdio' | 'http';

export interface Config {
  /** Pidgely API key (`pdg_…`). */
  apiKey: string;
  /** API base URL (default https://api.pidgely.com). */
  baseUrl?: string;
  /** Mutating tools return what they would do instead of calling the API. */
  dryRun: boolean;
  /** Only read-only tools are registered. */
  readOnly: boolean;
  /** Sender used by send tools when `from` is omitted. */
  defaultFrom?: string;
  transport: Transport;
  /** Streamable HTTP mode: bind address and port. */
  host: string;
  port: number;
  /** Streamable HTTP mode: bearer token required from clients (mandatory off loopback). */
  httpToken?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const TRUE = new Set(['1', 'true', 'yes', 'on']);
const FALSE = new Set(['', '0', 'false', 'no', 'off']);

export function parseBool(name: string, value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  throw new ConfigError(`${name} must be true or false (got "${value}")`);
}

export const HELP = `Pidgely MCP server

Usage: pidgely-mcp [options]

Options:
  --http               Serve MCP over Streamable HTTP instead of stdio
  --port <port>        HTTP port (default 3333, env PORT)
  --host <host>        HTTP bind address (default 127.0.0.1)
  --read-only          Only expose read-only tools
  --dry-run            Mutating tools describe the request instead of sending it
  -h, --help           Show this help
  -v, --version        Show the version

Environment:
  PIDGELY_API_KEY          API key (required)
  PIDGELY_BASE_URL         API base URL (default https://api.pidgely.com)
  PIDGELY_MCP_READ_ONLY    true to hide mutating tools
  PIDGELY_MCP_DRY_RUN      true to never call mutating endpoints
  PIDGELY_MCP_DEFAULT_FROM Default sender, e.g. "Acme <hello@acme.com>"
  PIDGELY_MCP_TRANSPORT    stdio (default) or http
  PIDGELY_MCP_HOST         HTTP bind address (default 127.0.0.1)
  PIDGELY_MCP_HTTP_TOKEN   Bearer token required by the HTTP transport
`;

export type CliAction = { action: 'help' } | { action: 'version' } | { action: 'run'; config: Config };

/** Builds the configuration from CLI arguments (which win) and environment variables. */
export function loadConfig(argv: string[], env: Record<string, string | undefined>): CliAction {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') return { action: 'help' };
    if (arg === '-v' || arg === '--version') return { action: 'version' };
    const [name, inline] = arg.split('=', 2) as [string, string | undefined];
    switch (name) {
      case '--http':
      case '--read-only':
      case '--dry-run':
        flags.set(name, true);
        break;
      case '--port':
      case '--host': {
        const value = inline ?? argv[++i];
        if (!value || value.startsWith('--')) throw new ConfigError(`${name} needs a value`);
        flags.set(name, value);
        break;
      }
      default:
        throw new ConfigError(`Unknown option: ${arg}. Run with --help for usage.`);
    }
  }

  const apiKey = env.PIDGELY_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError('PIDGELY_API_KEY is not set. Create a key at https://app.pidgely.com and pass it in the MCP server env.');
  }

  const transportEnv = (env.PIDGELY_MCP_TRANSPORT ?? 'stdio').trim().toLowerCase();
  if (transportEnv !== 'stdio' && transportEnv !== 'http') {
    throw new ConfigError(`PIDGELY_MCP_TRANSPORT must be stdio or http (got "${env.PIDGELY_MCP_TRANSPORT}")`);
  }
  const transport: Transport = flags.has('--http') ? 'http' : transportEnv;

  const portRaw = (flags.get('--port') as string | undefined) ?? env.PORT ?? '3333';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`Invalid port: ${portRaw}`);

  const host = (flags.get('--host') as string | undefined) ?? env.PIDGELY_MCP_HOST ?? '127.0.0.1';
  const httpToken = env.PIDGELY_MCP_HTTP_TOKEN?.trim() || undefined;
  if (transport === 'http' && !isLoopback(host) && !httpToken) {
    throw new ConfigError(`Refusing to serve HTTP on ${host} without PIDGELY_MCP_HTTP_TOKEN: anyone who can reach it could use your API key.`);
  }

  return {
    action: 'run',
    config: {
      apiKey,
      baseUrl: env.PIDGELY_BASE_URL?.trim() || undefined,
      dryRun: flags.has('--dry-run') || parseBool('PIDGELY_MCP_DRY_RUN', env.PIDGELY_MCP_DRY_RUN),
      readOnly: flags.has('--read-only') || parseBool('PIDGELY_MCP_READ_ONLY', env.PIDGELY_MCP_READ_ONLY),
      defaultFrom: env.PIDGELY_MCP_DEFAULT_FROM?.trim() || undefined,
      transport,
      host,
      port,
      httpToken,
    },
  };
}

export function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host);
}
