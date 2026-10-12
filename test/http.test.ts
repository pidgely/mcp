import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp, listen } from '../src';
import { config, fakeClient, text } from './helpers';

let app: Server | undefined;
afterEach(() => new Promise<void>((r) => (app ? app.close(() => r()) : r())));

async function start(overrides = {}) {
  const fake = fakeClient();
  const cfg = config({ transport: 'http', port: 0, ...overrides });
  app = createHttpApp({ config: cfg, client: fake.typed });
  const { port } = await listen(app, cfg);
  return { base: `http://127.0.0.1:${port}`, fake };
}

describe('hostname', () => {
  it('strips ports and brackets', async () => {
    const { hostname } = await import('../src/http');
    expect(hostname('localhost:3333')).toBe('localhost');
    expect(hostname('[::1]:3333')).toBe('::1');
    expect(hostname('127.0.0.1')).toBe('127.0.0.1');
    expect(hostname(undefined)).toBe('');
  });
});

describe('Streamable HTTP transport', () => {
  it('serves tools over /mcp', async () => {
    const { base, fake } = await start();
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(21);
    const r = await client.callTool({ name: 'list_domains', arguments: {} });
    expect(JSON.parse(text(r))).toEqual({ ok: true, method: 'domains.list' });
    expect(fake.client.domains.list).toHaveBeenCalledOnce();
    await client.close();
  });

  it('health, 404 and 405', async () => {
    const { base } = await start();
    expect(await (await fetch(`${base}/healthz`)).json()).toEqual({ status: 'ok' });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });

  it('requires the bearer token when configured', async () => {
    const { base } = await start({ httpToken: 's3cret' });
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    expect((await fetch(`${base}/mcp`, { method: 'POST', body, headers })).status).toBe(401);
    expect((await fetch(`${base}/mcp`, { method: 'POST', body, headers: { ...headers, Authorization: 'Bearer wrong!' } })).status).toBe(401);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: 'Bearer s3cret' } } }));
    expect((await client.listTools()).tools.length).toBe(21);
    await client.close();
  });

  it('rejects foreign Host headers on loopback (DNS rebinding)', async () => {
    const { base } = await start();
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${base}/mcp`, { method: 'POST', headers: { Host: 'evil.example', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    });
    expect(status).toBe(403);
  });
});
