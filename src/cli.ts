#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError, HELP, loadConfig } from './config';
import { createHttpApp, listen } from './http';
import { createServer } from './server';
import { VERSION } from './version';

// stdout is the MCP channel in stdio mode: log to stderr only.
const log = (message: string) => process.stderr.write(`[pidgely-mcp] ${message}\n`);

async function main(): Promise<void> {
  const parsed = loadConfig(process.argv.slice(2), process.env);
  if (parsed.action === 'help') return void process.stdout.write(HELP);
  if (parsed.action === 'version') return void process.stdout.write(`${VERSION}\n`);
  const { config } = parsed;
  const mode = [config.readOnly && 'read-only', config.dryRun && 'dry-run'].filter(Boolean).join(', ') || 'full access';

  if (config.transport === 'http') {
    const app = createHttpApp({ config });
    const { port } = await listen(app, config);
    log(`v${VERSION} listening on http://${config.host}:${port}/mcp (${mode})`);
    const stop = () => app.close(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }

  const server = createServer({ config });
  await server.connect(new StdioServerTransport());
  log(`v${VERSION} running on stdio (${mode})`);
}

main().catch((err: unknown) => {
  log(err instanceof ConfigError ? err.message : `fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});
