// End-to-end check of the built CLI over stdio (run after `npm run build`). No network calls.
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const cli = new URL('../dist/cli.js', import.meta.url).pathname;

const noKey = spawnSync(process.execPath, [cli], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
if (noKey.status !== 1 || !noKey.stderr.includes('PIDGELY_API_KEY is not set')) {
  throw new Error(`expected a clear error without an API key, got ${noKey.status}: ${noKey.stderr}`);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cli],
  env: { PATH: process.env.PATH ?? '', PIDGELY_API_KEY: 'pdg_smoke_test', PIDGELY_MCP_DRY_RUN: 'true', PIDGELY_MCP_DEFAULT_FROM: 'Smoke <smoke@example.com>' },
  stderr: 'ignore',
});
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(transport);
const { tools } = await client.listTools();
if (tools.length !== 21) throw new Error(`expected 21 tools, got ${tools.length}`);
const result = await client.callTool({ name: 'send_email', arguments: { to: 'a@example.com', subject: 'Hi', text: 'Hello' } });
const text = result.content[0].text;
if (!text.includes('"dry_run": true') || text.includes('pdg_smoke_test')) throw new Error(`unexpected dry-run result: ${text}`);
await client.close();
console.log(`ok: ${tools.length} tools, dry-run send works, key not echoed (server ${client.getServerVersion()?.version})`);
