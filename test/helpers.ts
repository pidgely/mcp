import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { vi } from 'vitest';
import type { Config, PidgelyClient } from '../src';
import { createServer } from '../src';

export const API_KEY = 'pdg_abc123_secretSECRETsecret';

export function config(overrides: Partial<Config> = {}): Config {
  return { apiKey: API_KEY, dryRun: false, readOnly: false, transport: 'stdio', host: '127.0.0.1', port: 3333, ...overrides };
}

const ok = (data: unknown) => Promise.resolve({ data, error: null, headers: {} });

/** A fake SDK client whose methods resolve to `{ data: { ok: true, method } }`. */
export function fakeClient() {
  const m = (name: string) => vi.fn((..._args: unknown[]) => ok({ ok: true, method: name }));
  const created = { then: (f: (v: unknown) => unknown) => ok({ object: 'template', id: 'tpl_1' }).then(f), publish: m('templates.create.publish') };
  const client = {
    emails: { send: m('emails.send'), get: m('emails.get'), list: m('emails.list'), cancel: m('emails.cancel') },
    batch: { send: m('batch.send') },
    domains: {
      list: m('domains.list'),
      create: m('domains.create'),
      verify: m('domains.verify'),
      get: vi.fn(() =>
        ok({
          object: 'domain',
          id: 'dom_1',
          name: 'acme.com',
          status: 'pending',
          records: [
            { record: 'DKIM', name: 'pdg._domainkey', type: 'TXT', ttl: 'Auto', status: 'pending', value: 'p=MIGf' },
            { record: 'SPF', name: 'bounces', type: 'MX', ttl: 'Auto', status: 'verified', value: 'feedback.pidgely.com', priority: 10 },
          ],
        }),
      ),
    },
    contacts: { list: m('contacts.list'), create: m('contacts.create'), batch: m('contacts.batch'), update: m('contacts.update') },
    segments: { list: m('segments.list') },
    broadcasts: { create: m('broadcasts.create'), send: m('broadcasts.send') },
    templates: { list: m('templates.list'), preview: m('templates.preview'), create: vi.fn(() => created) },
    suppressions: { list: m('suppressions.list'), add: m('suppressions.add') },
    webhooks: { list: m('webhooks.list'), create: m('webhooks.create') },
  };
  return { client, created, typed: client as unknown as PidgelyClient };
}

export async function connect(cfg: Config = config(), client = fakeClient()) {
  const server = createServer({ config: cfg, client: client.typed });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await mcp.connect(clientSide);
  return { mcp, fake: client, server };
}

export function text(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content.map((c) => c.text).join('\n');
}
