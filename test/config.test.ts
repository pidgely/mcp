import { describe, expect, it } from 'vitest';
import { ConfigError, isLoopback, loadConfig } from '../src';
import { parseBool } from '../src/config';

const env = { PIDGELY_API_KEY: 'pdg_a_b' };

describe('loadConfig', () => {
  it('defaults to stdio, full access', () => {
    expect(loadConfig([], env)).toEqual({
      action: 'run',
      config: { apiKey: 'pdg_a_b', baseUrl: undefined, dryRun: false, readOnly: false, defaultFrom: undefined, transport: 'stdio', host: '127.0.0.1', port: 3333, httpToken: undefined },
    });
  });

  it('reads environment variables', () => {
    const r = loadConfig([], {
      ...env,
      PIDGELY_BASE_URL: 'http://localhost:8080',
      PIDGELY_MCP_DRY_RUN: 'true',
      PIDGELY_MCP_READ_ONLY: '1',
      PIDGELY_MCP_DEFAULT_FROM: 'Acme <hi@acme.com>',
      PIDGELY_MCP_TRANSPORT: 'http',
      PORT: '8080',
    });
    expect(r).toMatchObject({ config: { baseUrl: 'http://localhost:8080', dryRun: true, readOnly: true, defaultFrom: 'Acme <hi@acme.com>', transport: 'http', port: 8080 } });
  });

  it('CLI flags win', () => {
    const r = loadConfig(['--http', '--port', '4000', '--host=localhost', '--read-only', '--dry-run'], { ...env, PIDGELY_MCP_DRY_RUN: 'false' });
    expect(r).toMatchObject({ config: { transport: 'http', port: 4000, host: 'localhost', readOnly: true, dryRun: true } });
  });

  it('help and version', () => {
    expect(loadConfig(['--help'], {})).toEqual({ action: 'help' });
    expect(loadConfig(['-v'], {})).toEqual({ action: 'version' });
  });

  it.each([
    [[], {}, /PIDGELY_API_KEY is not set/],
    [['--nope'], env, /Unknown option/],
    [['--port'], env, /needs a value/],
    [['--port', 'x'], env, /Invalid port/],
    [[], { ...env, PIDGELY_MCP_TRANSPORT: 'sse' }, /stdio or http/],
    [[], { ...env, PIDGELY_MCP_DRY_RUN: 'maybe' }, /true or false/],
    [['--http', '--host', '0.0.0.0'], env, /without PIDGELY_MCP_HTTP_TOKEN/],
  ] as const)('rejects %j %j', (argv, e, message) => {
    expect(() => loadConfig([...argv], e)).toThrow(ConfigError);
    expect(() => loadConfig([...argv], e)).toThrow(message);
  });

  it('allows a public bind address with a token', () => {
    expect(loadConfig(['--http', '--host', '0.0.0.0'], { ...env, PIDGELY_MCP_HTTP_TOKEN: 't0k' })).toMatchObject({ config: { httpToken: 't0k' } });
  });

  it('helpers', () => {
    expect(parseBool('X', 'YES')).toBe(true);
    expect(parseBool('X', undefined)).toBe(false);
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('localhost')).toBe(true);
    expect(isLoopback('0.0.0.0')).toBe(false);
  });
});
