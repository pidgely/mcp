import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync } from 'node:fs';
import { Pidgely } from 'pidgely';
import { describe, expect, it } from 'vitest';
import type { Config } from '../src';
import { createServer, GROUPS, tools } from '../src';
import { API_KEY, config, text } from './helpers';

/**
 * Every tool, end to end through the real `pidgely` SDK with HTTP mocked at `fetch`: the MCP arguments
 * must become exactly this request (method, path, query and JSON body).
 */

const BASE = 'https://api.test';
const NEW_KEY = 'pdg_newkey9_NewSecretValue123';
const CF_TOKEN = 'cf-token-0123456789abcdefghijklmnopqrstuv';

interface Request {
  method: string;
  path: string;
  body: unknown;
}

const DOMAIN = {
  object: 'domain',
  id: 'dom_1',
  name: 'acme.com',
  status: 'pending',
  records: [{ record: 'DKIM', name: 'pdg._domainkey', type: 'TXT', ttl: 'Auto', status: 'pending', value: 'p=MIGf' }],
};
const DOC = { blocks: [{ type: 'heading', text: 'Welcome, {{{FIRST_NAME|there}}}' }, { type: 'button', label: 'Start', href: 'https://acme.com/start' }] };

/** Realistic bodies for tools whose result is summarised; everything else gets `{ object, id }`. */
function reply(method: string, path: string): unknown {
  if (/^\/domains\/[^/]+$/.test(path) && method === 'GET') return DOMAIN;
  if (path === '/domains' && method === 'POST') return DOMAIN;
  if (path.endsWith('/dns-provider')) {
    return { object: 'dns_provider', zone: 'acme.com', host: 'mail', nameservers: ['a.ns.cloudflare.com'], provider: { id: 'cloudflare', name: 'Cloudflare' }, domain_connect: null, cloudflare: true };
  }
  if (path.endsWith('/dns-provider/cloudflare')) {
    return { object: 'cloudflare_setup', zone: 'acme.com', records: [{ purpose: 'dkim', type: 'TXT', name: 'pdg._domainkey.mail.acme.com', content: 'p=MIGf', action: 'created' }] };
  }
  if (path === '/template-builder/render') {
    return { object: 'template_render', html: '<!DOCTYPE html>…', text: 'Welcome', variables: ['FIRST_NAME'], document: DOC, issues: [{ code: 'missing_unsubscribe', severity: 'warning', message: 'No unsubscribe link.' }] };
  }
  if (path === '/brand/import') {
    return {
      object: 'brand_import', url: 'https://acme.com/', name: 'Acme', applied: true, address: '',
      logos: [{ url: 'https://api.pidgely.com/files/brand/k.png', width: 320, height: 80, email_safe: true }],
      palette: { primary: '#2563eb', text: '#0f172a', background: '#f2f4f9', link: '#2563eb', button_text: '#ffffff', button_contrast: 5.2 },
      fonts: [{ family: 'Inter' }], socials: [{ network: 'x', url: 'https://x.com/acme' }], warnings: ['logo_not_on_dark'],
    };
  }
  if (path === '/api-keys' && method === 'POST') return { id: 'key_2', token: NEW_KEY };
  return { object: 'x', id: 'id_1' };
}

function mockedClient(answer: (method: string, path: string) => unknown = reply) {
  const requests: Request[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    requests.push({ method, path: u.pathname + u.search, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify(answer(method, u.pathname)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { client: new Pidgely(API_KEY, { baseUrl: BASE, fetch, maxRetries: 0 }), requests };
}

async function connectHttp(cfg: Config = config(), answer?: (method: string, path: string) => unknown) {
  const { client, requests } = mockedClient(answer);
  const server = createServer({ config: cfg, client });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await mcp.connect(clientSide);
  return { mcp, requests };
}

interface Case {
  tool: string;
  args: Record<string, unknown>;
  requests: [string, string, unknown?][];
  /** Extra check on the tool output. */
  output?: RegExp;
}

const cases: Case[] = [
  // Emails
  { tool: 'send_email', args: { from: 'Acme <hi@acme.com>', to: 'a@x.com', subject: 'Hi', text: 'Hello', idempotency_key: 'k1' }, requests: [['POST', '/emails', { from: 'Acme <hi@acme.com>', to: 'a@x.com', subject: 'Hi', text: 'Hello' }]] },
  { tool: 'send_batch', args: { emails: [{ from: 'a@acme.com', to: 'b@x.com', subject: 's', text: 't' }] }, requests: [['POST', '/emails/batch', [{ from: 'a@acme.com', to: 'b@x.com', subject: 's', text: 't' }]]] },
  { tool: 'get_email', args: { id: 'em_1' }, requests: [['GET', '/emails/em_1']] },
  { tool: 'list_emails', args: { limit: 5 }, requests: [['GET', '/emails?limit=5']] },
  { tool: 'list_email_attachments', args: { email_id: 'em_1' }, requests: [['GET', '/emails/em_1/attachments?limit=20']] },
  { tool: 'get_email_attachment', args: { email_id: 'em_1', id: 'att_1' }, requests: [['GET', '/emails/em_1/attachments/att_1']] },
  { tool: 'reschedule_email', args: { id: 'em_1', scheduled_at: 'tomorrow at 9am' }, requests: [['PATCH', '/emails/em_1', { scheduled_at: 'tomorrow at 9am' }]] },
  { tool: 'cancel_email', args: { id: 'em_1' }, requests: [['POST', '/emails/em_1/cancel']] },
  // Domains
  { tool: 'list_domains', args: {}, requests: [['GET', '/domains?limit=20']] },
  { tool: 'get_domain', args: { id: 'dom_1' }, requests: [['GET', '/domains/dom_1']], output: /DKIM TXT pdg._domainkey → p=MIGf/ },
  { tool: 'create_domain', args: { name: 'acme.com', tls: 'enforced' }, requests: [['POST', '/domains', { name: 'acme.com', tls: 'enforced' }]], output: /detect_dns_provider/ },
  { tool: 'update_domain', args: { id: 'dom_1', tls: 'enforced' }, requests: [['PATCH', '/domains/dom_1', { tls: 'enforced' }]] },
  { tool: 'verify_domain', args: { id: 'dom_1' }, requests: [['POST', '/domains/dom_1/verify']] },
  { tool: 'detect_dns_provider', args: { id: 'dom_1' }, requests: [['GET', '/domains/dom_1/dns-provider']], output: /hosted by Cloudflare[\s\S]*setup_dns_cloudflare/ },
  { tool: 'setup_dns_cloudflare', args: { id: 'dom_1', api_token: CF_TOKEN }, requests: [['POST', '/domains/dom_1/dns-provider/cloudflare', { api_token: CF_TOKEN }]], output: /dkim TXT pdg._domainkey.mail.acme.com: created/ },
  { tool: 'delete_domain', args: { id: 'dom_1' }, requests: [['DELETE', '/domains/dom_1']] },
  // Templates
  { tool: 'list_templates', args: {}, requests: [['GET', '/templates?limit=20']] },
  { tool: 'get_template', args: { id: 'welcome' }, requests: [['GET', '/templates/welcome']] },
  { tool: 'preview_template', args: { id: 'welcome', variables: { NAME: 'Ana' } }, requests: [['POST', '/templates/welcome/preview', { variables: { NAME: 'Ana' } }]] },
  { tool: 'render_template_html', args: { document: DOC, subject: 'Welcome' }, requests: [['POST', '/template-builder/render', { document: DOC, subject: 'Welcome' }]], output: /\[warning\] missing_unsubscribe/ },
  { tool: 'convert_html_to_builder', args: { html: '<h1>Hi</h1>' }, requests: [['POST', '/template-builder/convert', { html: '<h1>Hi</h1>' }]] },
  {
    tool: 'create_template',
    args: { name: 'Welcome', alias: 'welcome', subject: 'Hi {{{NAME}}}', builder: DOC, reply_to: 'r@acme.com', variables: [{ key: 'NAME', type: 'string', fallback_value: 'there' }], publish: true },
    requests: [
      ['POST', '/templates', { name: 'Welcome', alias: 'welcome', subject: 'Hi {{{NAME}}}', builder: DOC, reply_to: 'r@acme.com', variables: [{ key: 'NAME', type: 'string', fallback_value: 'there' }] }],
      ['POST', '/templates/id_1/publish'],
    ],
  },
  { tool: 'update_template', args: { id: 'welcome', builder: null }, requests: [['PATCH', '/templates/welcome', { builder: null }]] },
  { tool: 'update_template', args: { id: 'welcome', subject: 'New', builder: DOC }, requests: [['PATCH', '/templates/welcome', { subject: 'New', builder: DOC }]] },
  { tool: 'publish_template', args: { id: 'welcome' }, requests: [['POST', '/templates/welcome/publish']] },
  { tool: 'duplicate_template', args: { id: 'welcome' }, requests: [['POST', '/templates/welcome/duplicate']] },
  { tool: 'delete_template', args: { id: 'welcome' }, requests: [['DELETE', '/templates/welcome']] },
  // AI assist
  { tool: 'get_template_builder_capabilities', args: {}, requests: [['GET', '/template-builder']] },
  {
    tool: 'generate_template_with_ai',
    args: { prompt: 'Welcome e-mail', language: 'pt-br', variables: ['PLAN'], template_id: 'tpl_1', theme: { brand_color: '#2563eb' } },
    requests: [['POST', '/template-builder/ai/generate', { prompt: 'Welcome e-mail', language: 'pt-br', variables: ['PLAN'], template_id: 'tpl_1', theme: { brand_color: '#2563eb' } }]],
  },
  {
    tool: 'rewrite_block',
    args: { block: { type: 'text', runs: [{ text: 'Hi' }] }, action: 'tone', tone: 'friendly' },
    requests: [['POST', '/template-builder/ai/rewrite', { block: { type: 'text', runs: [{ text: 'Hi' }] }, action: 'tone', tone: 'friendly' }]],
  },
  { tool: 'translate_template', args: { document: DOC, subject: 'Hi', language: 'es' }, requests: [['POST', '/template-builder/ai/translate', { document: DOC, subject: 'Hi', language: 'es' }]] },
  { tool: 'suggest_subjects', args: { document: DOC }, requests: [['POST', '/template-builder/ai/subjects', { document: DOC }]] },
  // Brand
  { tool: 'import_brand_from_website', args: { url: 'acme.com', apply: true }, requests: [['POST', '/brand/import', { url: 'acme.com', apply: true }]], output: /applied as the organization theme[\s\S]*brand #2563eb/ },
  { tool: 'get_theme', args: {}, requests: [['GET', '/template-builder/theme']] },
  {
    tool: 'update_theme',
    args: { theme: { brand_color: '#2563eb', font: 'inter' }, brand: { name: 'Acme', website: 'https://acme.com/' } },
    requests: [['PATCH', '/template-builder/theme', { theme: { brand_color: '#2563eb', font: 'inter' }, brand: { name: 'Acme', website: 'https://acme.com/' } }]],
  },
  // Contacts
  { tool: 'list_contacts', args: { segment_id: 'seg_1' }, requests: [['GET', '/contacts?limit=20&segment_id=seg_1']] },
  { tool: 'get_contact', args: { email: 'ana@x.com' }, requests: [['GET', '/contacts/ana%40x.com']] },
  { tool: 'create_contact', args: { email: 'ana@x.com', first_name: 'Ana' }, requests: [['POST', '/contacts', { email: 'ana@x.com', first_name: 'Ana' }]] },
  { tool: 'batch_create_contacts', args: { contacts: [{ email: 'ana@x.com' }], segment_id: 'seg_1' }, requests: [['POST', '/contacts/batch', { contacts: [{ email: 'ana@x.com' }], segment_id: 'seg_1' }]] },
  { tool: 'update_contact', args: { id: 'ct_1', unsubscribed: true }, requests: [['PATCH', '/contacts/ct_1', { unsubscribed: true }]] },
  { tool: 'delete_contact', args: { id: 'ct_1' }, requests: [['DELETE', '/contacts/ct_1']] },
  { tool: 'list_contact_segments', args: { email: 'ana@x.com' }, requests: [['GET', '/contacts/ana%40x.com/segments?limit=20']] },
  { tool: 'add_contact_to_segment', args: { id: 'ct_1', segment_id: 'seg_1' }, requests: [['POST', '/contacts/ct_1/segments/seg_1']] },
  { tool: 'remove_contact_from_segment', args: { email: 'ana@x.com', segment_id: 'seg_1' }, requests: [['DELETE', '/contacts/ana%40x.com/segments/seg_1']] },
  // Segments
  { tool: 'list_segments', args: {}, requests: [['GET', '/segments?limit=20']] },
  { tool: 'get_segment', args: { id: 'seg_1' }, requests: [['GET', '/segments/seg_1']] },
  { tool: 'list_segment_contacts', args: { id: 'seg_1', after: 'ct_9' }, requests: [['GET', '/segments/seg_1/contacts?limit=20&after=ct_9']] },
  { tool: 'create_segment', args: { name: 'Newsletter' }, requests: [['POST', '/segments', { name: 'Newsletter' }]] },
  { tool: 'update_segment', args: { id: 'seg_1', name: 'Product' }, requests: [['PATCH', '/segments/seg_1', { name: 'Product' }]] },
  { tool: 'delete_segment', args: { id: 'seg_1' }, requests: [['DELETE', '/segments/seg_1']] },
  // Broadcasts
  { tool: 'list_broadcasts', args: {}, requests: [['GET', '/broadcasts?limit=20']] },
  { tool: 'get_broadcast', args: { id: 'bc_1' }, requests: [['GET', '/broadcasts/bc_1']] },
  {
    tool: 'create_broadcast',
    args: { segment_id: 'seg_1', from: 'n@acme.com', subject: 'News', html: '<p>Hi</p>', preview_text: 'p' },
    requests: [['POST', '/broadcasts', { segment_id: 'seg_1', from: 'n@acme.com', subject: 'News', html: '<p>Hi</p>', preview_text: 'p' }]],
  },
  { tool: 'update_broadcast', args: { id: 'bc_1', subject: 'News!', segment_id: 'seg_2' }, requests: [['PATCH', '/broadcasts/bc_1', { segment_id: 'seg_2', subject: 'News!' }]] },
  { tool: 'send_broadcast', args: { id: 'bc_1', confirm: true, scheduled_at: 'tomorrow' }, requests: [['POST', '/broadcasts/bc_1/send', { scheduled_at: 'tomorrow' }]] },
  { tool: 'cancel_broadcast', args: { id: 'bc_1' }, requests: [['POST', '/broadcasts/bc_1/cancel']] },
  { tool: 'duplicate_broadcast', args: { id: 'bc_1' }, requests: [['POST', '/broadcasts/bc_1/duplicate']] },
  { tool: 'delete_broadcast', args: { id: 'bc_1' }, requests: [['DELETE', '/broadcasts/bc_1']] },
  // Suppressions
  { tool: 'list_suppressions', args: { origin: 'bounce' }, requests: [['GET', '/suppressions?limit=20&origin=bounce']] },
  { tool: 'get_suppression', args: { id_or_email: 'x@y.com' }, requests: [['GET', '/suppressions/x%40y.com']] },
  { tool: 'add_suppression', args: { email: 'x@y.com' }, requests: [['POST', '/suppressions', { email: 'x@y.com' }]] },
  { tool: 'batch_add_suppressions', args: { emails: ['a@y.com', 'b@y.com'] }, requests: [['POST', '/suppressions/batch/add', { emails: ['a@y.com', 'b@y.com'] }]] },
  { tool: 'remove_suppression', args: { id_or_email: 'sup_1' }, requests: [['DELETE', '/suppressions/sup_1']] },
  { tool: 'batch_remove_suppressions', args: { ids: ['sup_1'] }, requests: [['POST', '/suppressions/batch/remove', { ids: ['sup_1'] }]] },
  // Webhooks
  { tool: 'list_webhooks', args: {}, requests: [['GET', '/webhooks?limit=20']] },
  { tool: 'get_webhook', args: { id: 'wh_1' }, requests: [['GET', '/webhooks/wh_1']] },
  { tool: 'create_webhook', args: { endpoint: 'https://acme.com/hook', events: ['email.bounced'] }, requests: [['POST', '/webhooks', { endpoint: 'https://acme.com/hook', events: ['email.bounced'] }]] },
  { tool: 'update_webhook', args: { id: 'wh_1', status: 'disabled' }, requests: [['PATCH', '/webhooks/wh_1', { status: 'disabled' }]] },
  { tool: 'rotate_webhook_secret', args: { id: 'wh_1' }, requests: [['POST', '/webhooks/wh_1/signing-secret/rotate']] },
  { tool: 'delete_webhook', args: { id: 'wh_1' }, requests: [['DELETE', '/webhooks/wh_1']] },
  // API keys
  { tool: 'list_api_keys', args: {}, requests: [['GET', '/api-keys?limit=20']] },
  {
    tool: 'create_api_key',
    args: { name: 'billing', permission: 'sending_access', domain_id: 'dom_1' },
    requests: [['POST', '/api-keys', { name: 'billing', permission: 'sending_access', domain_id: 'dom_1' }]],
    output: new RegExp(NEW_KEY),
  },
  { tool: 'rename_api_key', args: { id: 'key_1', name: 'prod' }, requests: [['PATCH', '/api-keys/key_1', { name: 'prod' }]] },
  { tool: 'revoke_api_key', args: { id: 'key_1' }, requests: [['DELETE', '/api-keys/key_1']] },
  // Usage
  { tool: 'get_usage', args: {}, requests: [['GET', '/v1/usage']] },
];

describe('every tool over HTTP', () => {
  it('has a case for every tool', () => {
    expect(new Set(cases.map((c) => c.tool))).toEqual(new Set(tools.map((t) => t.name)));
  });

  it.each(cases)('$tool', async ({ tool, args, requests: want, output }) => {
    const { mcp, requests } = await connectHttp(config({ defaultFrom: 'Acme <hi@acme.com>' }));
    const result = await mcp.callTool({ name: tool, arguments: args });
    const out = text(result);
    expect(result.isError, out).toBeFalsy();
    expect(requests.map((r) => [r.method, r.path, r.body])).toEqual(want.map(([m, p, b]) => [m, p, b]));
    if (output) expect(out).toMatch(output);
    expect(out).not.toContain(API_KEY);
  });
});

describe('catalog', () => {
  const byName = new Map(tools.map((t) => [t.name, t]));

  it('groups every tool, in order', () => {
    for (const t of tools) expect(GROUPS).toContain(t.group);
    const order = tools.map((t) => GROUPS.indexOf(t.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('marks destructive tools in the annotations and the description', async () => {
    const destructive = ['delete_domain', 'delete_template', 'delete_contact', 'delete_segment', 'delete_broadcast', 'send_broadcast', 'delete_webhook', 'revoke_api_key'];
    expect(tools.filter((t) => t.destructive).map((t) => t.name).sort()).toEqual([...destructive].sort());
    for (const t of tools) {
      if (t.name.startsWith('delete_')) expect(t.destructive).toBe(true);
      expect(t.description.startsWith('DESTRUCTIVE')).toBe(t.destructive === true);
    }
    const { mcp } = await connectHttp();
    const { tools: listed } = await mcp.listTools();
    for (const t of listed) {
      const def = byName.get(t.name)!;
      expect(t.annotations).toMatchObject({
        readOnlyHint: def.kind === 'read',
        destructiveHint: def.destructive === true,
        idempotentHint: def.kind === 'read' || def.idempotent === true,
      });
    }
    expect(listed.find((t) => t.name === 'setup_dns_cloudflare')?.annotations?.openWorldHint).toBe(true);
    expect(listed.find((t) => t.name === 'import_brand_from_website')?.annotations?.openWorldHint).toBe(true);
    expect(listed.find((t) => t.name === 'render_template_html')?.annotations?.readOnlyHint).toBe(true);
  });

  it('documents every tool in the README table', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const rows = [...readme.matchAll(/^\| `([a-z_]+)` \| ([a-z]+) \|/gm)].map((m) => [m[1], m[2]]);
    const kind = (t: (typeof tools)[number]) => (t.destructive ? 'destructive' : t.kind);
    expect(rows).toEqual(tools.map((t) => [t.name, kind(t)]));
  });

  it('exposes builder documents as JSON schemas', async () => {
    const { mcp } = await connectHttp();
    const { tools: listed } = await mcp.listTools();
    const create = listed.find((t) => t.name === 'create_template')!;
    const builder = (create.inputSchema.properties as Record<string, { properties?: Record<string, unknown> }>).builder;
    expect(Object.keys(builder?.properties ?? {})).toEqual(expect.arrayContaining(['blocks', 'theme', 'preview_text']));
    expect(listed.find((t) => t.name === 'translate_template')?.inputSchema.required).toEqual(expect.arrayContaining(['document', 'language']));
  });
});

describe('secrets', () => {
  it('never echoes the Cloudflare token, even if the API did', async () => {
    const { mcp } = await connectHttp(config(), (method, path) =>
      path.endsWith('/cloudflare') ? { object: 'cloudflare_setup', zone: 'acme.com', records: [], note: `token ${CF_TOKEN}` } : reply(method, path),
    );
    const out = text(await mcp.callTool({ name: 'setup_dns_cloudflare', arguments: { id: 'dom_1', api_token: CF_TOKEN } }));
    expect(out).not.toContain(CF_TOKEN);
    expect(out).toContain('[redacted]');
  });

  it('masks the Cloudflare token in dry-run previews and errors', async () => {
    const { mcp, requests } = await connectHttp(config({ dryRun: true }));
    const out = text(await mcp.callTool({ name: 'setup_dns_cloudflare', arguments: { id: 'dom_1', api_token: CF_TOKEN } }));
    expect(JSON.parse(out)).toMatchObject({ dry_run: true, request: 'POST /domains/dom_1/dns-provider/cloudflare', payload: { id: 'dom_1', api_token: '[write-only]' } });
    expect(requests).toHaveLength(0);

    const failing = await connectHttp(config(), () => ({ statusCode: 422, name: 'cloudflare_invalid_token', message: `bad token ${CF_TOKEN}` }));
    const err = text(await failing.mcp.callTool({ name: 'setup_dns_cloudflare', arguments: { id: 'dom_1', api_token: CF_TOKEN } }));
    expect(err).not.toContain(CF_TOKEN);
  });

  it('shows a new API key once but never the configured one', async () => {
    const { mcp } = await connectHttp(config(), (method, path) => (path === '/api-keys' && method === 'POST' ? { id: 'key_2', token: NEW_KEY, leaked: API_KEY } : reply(method, path)));
    const out = text(await mcp.callTool({ name: 'create_api_key', arguments: { name: 'ci' } }));
    expect(out).toContain(NEW_KEY);
    expect(out).not.toContain(API_KEY);
    // Other tools keep scrubbing anything key-shaped.
    const other = await connectHttp(config(), () => ({ data: [{ note: NEW_KEY }] }));
    expect(text(await other.mcp.callTool({ name: 'list_api_keys', arguments: {} }))).not.toContain(NEW_KEY);
  });
});

describe('validation of the new tools', () => {
  const invalid: [string, Record<string, unknown>, RegExp][] = [
    ['rewrite_block', { block: { type: 'text', runs: [{ text: 'x' }] }, action: 'tone' }, /needs a tone/],
    ['rewrite_block', { block: { type: 'paragraph' }, action: 'improve' }, /type/],
    ['translate_template', { document: DOC }, /language/],
    ['render_template_html', { document: { blocks: 'nope' } }, /blocks/],
    ['update_theme', { theme: { brand_color: 'blue' } }, /brand_color|Hex/],
    ['create_template', { name: 'x', html: '<p/>', builder: DOC }, /either html or builder/],
    ['update_template', { id: 'welcome' }, /Nothing to update/],
    ['update_domain', { id: 'dom_1' }, /Nothing to update/],
    ['update_broadcast', { id: 'bc_1' }, /Nothing to update/],
    ['update_webhook', { id: 'wh_1' }, /Nothing to update/],
    ['get_contact', {}, /"id" or "email"/],
    ['delete_contact', { id: 'ct_1', email: 'a@x.com' }, /not both/],
    ['add_contact_to_segment', { email: 'a@x.com' }, /segment_id/],
    ['batch_remove_suppressions', {}, /"emails" or "ids"/],
    ['batch_add_suppressions', { emails: ['nope'] }, /emails/],
    ['create_api_key', { name: 'x', domain_id: 'dom_1' }, /sending_access/],
    ['setup_dns_cloudflare', { id: 'dom_1', api_token: 'short' }, /api_token/],
    ['generate_template_with_ai', { prompt: '' }, /prompt/],
  ];

  it.each(invalid)('%s rejects %j', async (tool, args, message) => {
    const { mcp, requests } = await connectHttp();
    const result = await mcp.callTool({ name: tool, arguments: args });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(message);
    expect(requests).toHaveLength(0);
  });
});
