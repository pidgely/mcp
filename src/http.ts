import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from './config';
import { isLoopback } from './config';
import type { CreateServerOptions } from './server';
import { createServer } from './server';

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null }, headers);
}

/** Host header without the port (`[::1]:3333` → `::1`). */
export function hostname(host: string | undefined): string {
  if (!host) return '';
  const m = /^\[([^\]]+)\](?::\d+)?$/.exec(host);
  if (m) return m[1] as string;
  return host.replace(/:\d+$/, '');
}

function authorized(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const header = req.headers.authorization ?? '';
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Serves MCP over Streamable HTTP at `/mcp` in stateless mode (a fresh server per request),
 * with a `/healthz` probe. Binds to loopback by default; a bearer token is required elsewhere.
 */
export function createHttpApp(options: CreateServerOptions): Server {
  const { config } = options;
  // DNS-rebinding protection: on loopback, only accept requests addressed to a loopback name.
  const checkHost = isLoopback(config.host);

  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') return sendJson(res, 200, { status: 'ok' });
    if (url.pathname !== '/mcp') return sendJson(res, 404, { error: 'not found' });
    if (!authorized(req, config.httpToken)) {
      return rpcError(res, 401, 'Unauthorized', { 'WWW-Authenticate': 'Bearer' });
    }
    if (checkHost && !isLoopback(hostname(req.headers.host))) {
      return rpcError(res, 403, `Invalid Host header: ${req.headers.host ?? ''}`);
    }
    if (req.method !== 'POST') return rpcError(res, 405, 'Method not allowed (stateless server: use POST).', { Allow: 'POST' });

    const server = createServer(options);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) rpcError(res, 500, err instanceof Error ? err.message : 'Internal error');
    }
  });
}

export function listen(app: Server, config: Pick<Config, 'host' | 'port'>): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(config.port, config.host, () => {
      const address = app.address();
      resolve({ port: typeof address === 'object' && address ? address.port : config.port });
    });
  });
}
