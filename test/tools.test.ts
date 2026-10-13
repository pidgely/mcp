import { describe, expect, it } from 'vitest';
import { tools } from '../src';
import { API_KEY, config, connect, fakeClient, text } from './helpers';

const READ = [
  'get_email', 'list_emails', 'list_domains', 'get_domain', 'list_contacts', 'list_segments', 'list_templates', 'preview_template', 'list_suppressions',
  'list_webhooks',
];
const ALL = [
  'send_email', 'send_batch', 'get_email', 'list_emails', 'cancel_email', 'list_domains', 'get_domain', 'create_domain', 'verify_domain',
  'list_contacts', 'create_contact', 'batch_create_contacts', 'update_contact', 'list_segments', 'create_broadcast', 'send_broadcast',
  'list_templates', 'preview_template', 'create_template', 'list_suppressions', 'add_suppression', 'list_webhooks', 'create_webhook',
];

describe('tool registration', () => {
  it('registers all 23 tools with descriptions, JSON schemas and annotations', async () => {
    const { mcp } = await connect();
    const { tools: listed } = await mcp.listTools();
    expect(listed.map((t) => t.name).sort()).toEqual([...ALL].sort());
    for (const t of listed) {
      expect(t.description?.length).toBeGreaterThan(20);
      expect(t.inputSchema.type).toBe('object');
      expect(t.annotations?.readOnlyHint).toBe(READ.includes(t.name));
    }
    const send = listed.find((t) => t.name === 'send_email')!;
    expect(send.inputSchema.required).toContain('to');
    expect(send.annotations?.openWorldHint).toBe(true);
  });

  it('read-only mode hides every mutating tool', async () => {
    const { mcp } = await connect(config({ readOnly: true }));
    const { tools: listed } = await mcp.listTools();
    expect(listed.map((t) => t.name).sort()).toEqual([...READ].sort());
  });

  it('marks mutating tools in dry-run mode', async () => {
    const { mcp } = await connect(config({ dryRun: true }));
    const { tools: listed } = await mcp.listTools();
    expect(listed.find((t) => t.name === 'send_email')?.description).toMatch(/DRY RUN/);
    expect(listed.find((t) => t.name === 'list_emails')?.description).not.toMatch(/DRY RUN/);
  });

  it('every tool has a kind and endpoint', () => {
    expect(tools).toHaveLength(23);
    for (const t of tools) {
      expect(['read', 'write', 'send']).toContain(t.kind);
      expect(t.endpoint({} as never)).toMatch(/^(GET|POST|PATCH) \//);
    }
  });

  it('exposes the draft_welcome_email prompt', async () => {
    const { mcp } = await connect();
    const { prompts } = await mcp.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['draft_welcome_email']);
    const p = await mcp.getPrompt({ name: 'draft_welcome_email', arguments: { product: 'Acme', test_recipient: 'me@acme.com' } });
    expect(JSON.stringify(p.messages)).toMatch(/send_email tool to me@acme.com only/);
    const p2 = await mcp.getPrompt({ name: 'draft_welcome_email', arguments: { product: 'Acme', tone: 'formal' } });
    expect(JSON.stringify(p2.messages)).toMatch(/Do not send anything/);
    const { mcp: ro } = await connect(config({ readOnly: true }));
    const p3 = await ro.getPrompt({ name: 'draft_welcome_email', arguments: { product: 'Acme', test_recipient: 'x@y.com' } });
    expect(JSON.stringify(p3.messages)).toMatch(/read-only/);
  });
});

interface Case {
  tool: string;
  args: Record<string, unknown>;
  method: string;
  expected: unknown[];
}

const cases: Case[] = [
  {
    tool: 'send_email',
    args: { from: 'Acme <hi@acme.com>', to: ['a@x.com'], subject: 'Hi', html: '<p>Hi</p>', reply_to: 'r@acme.com', scheduled_at: 'in 1 hour', tags: [{ name: 'k', value: 'v' }], attachments: [{ filename: 'a.pdf', path: 'https://acme.com/a.pdf' }], idempotency_key: 'k1' },
    method: 'emails.send',
    expected: [
      { from: 'Acme <hi@acme.com>', to: ['a@x.com'], subject: 'Hi', html: '<p>Hi</p>', replyTo: 'r@acme.com', scheduledAt: 'in 1 hour', tags: [{ name: 'k', value: 'v' }], attachments: [{ filename: 'a.pdf', path: 'https://acme.com/a.pdf', content: undefined, contentType: undefined }] },
      { idempotencyKey: 'k1' },
    ],
  },
  {
    tool: 'send_email',
    args: { to: 'a@x.com', template: { id: 'welcome', variables: { NAME: 'Ana' } } },
    method: 'emails.send',
    expected: [{ to: 'a@x.com', template: { id: 'welcome', variables: { NAME: 'Ana' } } }, { idempotencyKey: undefined }],
  },
  {
    tool: 'send_batch',
    args: { emails: [{ from: 'a@acme.com', to: 'b@x.com', subject: 's', text: 't' }], batch_validation: 'permissive' },
    method: 'batch.send',
    expected: [[{ from: 'a@acme.com', to: 'b@x.com', subject: 's', text: 't' }], { idempotencyKey: undefined, batchValidation: 'permissive' }],
  },
  { tool: 'get_email', args: { id: 'em_1' }, method: 'emails.get', expected: ['em_1'] },
  { tool: 'list_emails', args: {}, method: 'emails.list', expected: [{ limit: 20, after: undefined }] },
  { tool: 'list_emails', args: { limit: 5, before: 'em_9' }, method: 'emails.list', expected: [{ limit: 5, before: 'em_9' }] },
  { tool: 'cancel_email', args: { id: 'em_1' }, method: 'emails.cancel', expected: ['em_1'] },
  { tool: 'list_domains', args: { limit: 3 }, method: 'domains.list', expected: [{ limit: 3, after: undefined }] },
  {
    tool: 'create_domain',
    args: { name: 'acme.com', custom_return_path: 'send', tls: 'enforced' },
    method: 'domains.create',
    expected: [{ name: 'acme.com', customReturnPath: 'send', tls: 'enforced', region: undefined }],
  },
  { tool: 'verify_domain', args: { id: 'dom_1' }, method: 'domains.verify', expected: ['dom_1'] },
  { tool: 'list_contacts', args: { segment_id: 'seg_1' }, method: 'contacts.list', expected: [{ limit: 20, after: undefined, segmentId: 'seg_1' }] },
  {
    tool: 'create_contact',
    args: { email: 'ana@x.com', first_name: 'Ana', properties: { plan: 'pro' }, segment_ids: ['seg_1'] },
    method: 'contacts.create',
    expected: [{ email: 'ana@x.com', firstName: 'Ana', lastName: undefined, unsubscribed: undefined, properties: { plan: 'pro' }, segments: [{ id: 'seg_1' }] }],
  },
  {
    tool: 'batch_create_contacts',
    args: { contacts: [{ email: 'ana@x.com', first_name: 'Ana', properties: { plan: 'pro' }, segment_ids: ['seg_2'] }, { email: 'bo@x.com' }], segment_id: 'seg_1' },
    method: 'contacts.batch',
    expected: [
      {
        contacts: [
          { email: 'ana@x.com', firstName: 'Ana', lastName: undefined, unsubscribed: undefined, properties: { plan: 'pro' }, segments: [{ id: 'seg_2' }] },
          { email: 'bo@x.com', firstName: undefined, lastName: undefined, unsubscribed: undefined, properties: undefined, segments: undefined },
        ],
        segmentId: 'seg_1',
      },
    ],
  },
  {
    tool: 'update_contact',
    args: { email: 'ana@x.com', unsubscribed: true, first_name: null },
    method: 'contacts.update',
    expected: [{ email: 'ana@x.com', firstName: null, lastName: undefined, unsubscribed: true, properties: undefined }],
  },
  {
    tool: 'update_contact',
    args: { id: 'ct_1', last_name: 'Lima' },
    method: 'contacts.update',
    expected: [{ id: 'ct_1', firstName: undefined, lastName: 'Lima', unsubscribed: undefined, properties: undefined }],
  },
  { tool: 'list_segments', args: {}, method: 'segments.list', expected: [{ limit: 20, after: undefined }] },
  {
    tool: 'create_broadcast',
    args: { segment_id: 'seg_1', from: 'n@acme.com', subject: 'News', html: '<p>Hi</p>', preview_text: 'p' },
    method: 'broadcasts.create',
    expected: [{ segmentId: 'seg_1', from: 'n@acme.com', subject: 'News', html: '<p>Hi</p>', text: undefined, name: undefined, previewText: 'p', replyTo: undefined }],
  },
  { tool: 'send_broadcast', args: { id: 'bc_1', confirm: true }, method: 'broadcasts.send', expected: ['bc_1', undefined] },
  { tool: 'send_broadcast', args: { id: 'bc_1', confirm: true, scheduled_at: 'tomorrow' }, method: 'broadcasts.send', expected: ['bc_1', { scheduledAt: 'tomorrow' }] },
  { tool: 'list_templates', args: {}, method: 'templates.list', expected: [{ limit: 20, after: undefined }] },
  { tool: 'preview_template', args: { id: 'welcome', variables: { NAME: 'Ana', DAYS: 14 } }, method: 'templates.preview', expected: ['welcome', { variables: { NAME: 'Ana', DAYS: 14 } }] },
  { tool: 'preview_template', args: { id: 'tpl_1' }, method: 'templates.preview', expected: ['tpl_1', { variables: undefined }] },
  { tool: 'list_suppressions', args: { origin: 'bounce' }, method: 'suppressions.list', expected: [{ limit: 20, after: undefined, origin: 'bounce' }] },
  { tool: 'add_suppression', args: { email: 'x@y.com' }, method: 'suppressions.add', expected: [{ email: 'x@y.com' }] },
  { tool: 'list_webhooks', args: {}, method: 'webhooks.list', expected: [{ limit: 20, after: undefined }] },
  {
    tool: 'create_webhook',
    args: { endpoint: 'https://acme.com/hook', events: ['email.bounced'] },
    method: 'webhooks.create',
    expected: [{ endpoint: 'https://acme.com/hook', events: ['email.bounced'] }],
  },
];

function method(fake: ReturnType<typeof fakeClient>, path: string) {
  const [res, fn] = path.split('.') as [string, string];
  return (fake.client as unknown as Record<string, Record<string, { mock: { calls: unknown[][] } }>>)[res]![fn]!;
}

describe('tool calls', () => {
  it.each(cases)('$tool → $method', async ({ tool, args, method: name, expected }) => {
    const { mcp, fake } = await connect();
    const result = await mcp.callTool({ name: tool, arguments: args });
    expect(result.isError).toBeFalsy();
    const out = text(result);
    expect(JSON.parse(out.slice(out.indexOf('{')))).toEqual({ ok: true, method: name });
    const calls = method(fake, name).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expected);
  });

  it('get_domain lists the DNS records to publish', async () => {
    const { mcp } = await connect();
    const out = text(await mcp.callTool({ name: 'get_domain', arguments: { id: 'dom_1' } }));
    expect(out).toMatch(/Publish these DNS records/);
    expect(out).toMatch(/DKIM TXT pdg._domainkey → p=MIGf {2}\[pending\]/);
    expect(out).toMatch(/SPF MX bounces \(priority 10\) → feedback.pidgely.com/);
  });

  it('create_domain shows records and handles a domain without records', async () => {
    const fake = fakeClient();
    fake.client.domains.create.mockImplementationOnce(() =>
      Promise.resolve({ data: { name: 'acme.com', status: 'not_started' }, error: null, headers: {} }) as never,
    );
    const { mcp } = await connect(config(), fake);
    expect(text(await mcp.callTool({ name: 'create_domain', arguments: { name: 'acme.com' } }))).toMatch(/No DNS records returned/);
  });

  it('create_template publishes when asked, with typed fallbacks', async () => {
    const { mcp, fake } = await connect();
    await mcp.callTool({
      name: 'create_template',
      arguments: { name: 'Welcome', alias: 'welcome', html: '<p>{{{NAME}}}</p>', variables: [{ key: 'NAME', type: 'string', fallback_value: 'there' }, { key: 'N', type: 'number', fallback_value: '3' }, { key: 'X', type: 'string' }], publish: true },
    });
    expect(fake.client.templates.create).toHaveBeenCalledWith({
      name: 'Welcome', alias: 'welcome', from: undefined, subject: undefined, html: '<p>{{{NAME}}}</p>', text: undefined,
      variables: [{ key: 'NAME', type: 'string', fallbackValue: 'there' }, { key: 'N', type: 'number', fallbackValue: 3 }, { key: 'X', type: 'string', fallbackValue: undefined }],
    });
    expect(fake.created.publish).toHaveBeenCalledOnce();
    const r = await mcp.callTool({ name: 'create_template', arguments: { name: 'Draft', variables: [{ key: 'N', type: 'number' }] } });
    expect(JSON.parse(text(r))).toEqual({ object: 'template', id: 'tpl_1' });
    expect(fake.created.publish).toHaveBeenCalledOnce();
  });

  it('uses PIDGELY_MCP_DEFAULT_FROM when from is omitted', async () => {
    const { mcp, fake } = await connect(config({ defaultFrom: 'Acme <hi@acme.com>' }));
    await mcp.callTool({ name: 'send_email', arguments: { to: 'a@x.com', subject: 's', text: 't' } });
    expect(fake.client.emails.send.mock.calls[0]?.[0]).toMatchObject({ from: 'Acme <hi@acme.com>' });
    await mcp.callTool({ name: 'create_broadcast', arguments: { segment_id: 's', subject: 's', text: 't' } });
    expect(fake.client.broadcasts.create.mock.calls[0]?.[0]).toMatchObject({ from: 'Acme <hi@acme.com>' });
  });
});

describe('argument validation', () => {
  const invalid: [string, Record<string, unknown>, RegExp][] = [
    ['send_email', { from: 'a@acme.com', subject: 's', text: 't' }, /to/],
    ['send_email', { from: 'a@acme.com', to: [], subject: 's', text: 't' }, /to/],
    ['send_email', { to: 'a@x.com', subject: 's', text: 't' }, /"from" is required/],
    ['send_email', { from: 'a@acme.com', to: 'a@x.com', subject: 's' }, /html, text or a template/],
    ['send_email', { from: 'a@acme.com', to: 'a@x.com', text: 't' }, /"subject" is required/],
    ['send_email', { to: 'a@x.com', template: { id: 't' }, html: '<p/>' }, /either a template or html/],
    ['send_email', { from: 'a@acme.com', to: 'a@x.com', subject: 's', text: 't', attachments: [{ filename: 'a' }] }, /exactly one of path or content/],
    ['send_email', { from: 'a@acme.com', to: 'a@x.com', subject: 's', text: 't', tags: [{ name: 'bad tag', value: 'v' }] }, /name/],
    ['send_batch', { emails: [] }, /emails/],
    ['send_batch', { emails: [{ from: 'a@acme.com', to: 'b@x.com', subject: 's' }] }, /emails\[0\]: provide html/],
    ['get_email', {}, /id/],
    ['list_emails', { limit: 500 }, /limit/],
    ['create_domain', { name: 'not a domain' }, /domain name/],
    ['create_contact', { email: 'nope' }, /email/],
    ['batch_create_contacts', { contacts: [] }, /contacts/],
    ['batch_create_contacts', { contacts: [{ email: 'nope' }] }, /email/],
    ['preview_template', {}, /id/],
    ['preview_template', { id: 'welcome', variables: { NAME: true } }, /variables/],
    ['update_contact', { unsubscribed: true }, /"id" or "email"/],
    ['create_broadcast', { segment_id: 's', subject: 's', html: 'h' }, /"from" is required/],
    ['create_broadcast', { segment_id: 's', from: 'a@acme.com', subject: 's' }, /Provide html or text/],
    ['send_broadcast', { id: 'bc_1' }, /confirm/],
    ['send_broadcast', { id: 'bc_1', confirm: false }, /confirm/],
    ['list_suppressions', { origin: 'spam' }, /origin/],
    ['add_suppression', { email: 'x' }, /email/],
    ['create_webhook', { endpoint: 'http://acme.com/hook', events: ['email.sent'] }, /endpoint/],
    ['create_webhook', { endpoint: 'https://acme.com/hook', events: ['email.unknown'] }, /events/],
    ['create_template', { name: 'x', variables: [{ key: '1bad', type: 'string' }] }, /key/],
  ];

  it.each(invalid)('%s rejects %j', async (tool, args, message) => {
    const { mcp, fake } = await connect();
    const result = await mcp.callTool({ name: tool, arguments: args });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(message);
    for (const resource of Object.values(fake.client)) {
      for (const fn of Object.values(resource)) {
        if (typeof fn === 'function' && 'mock' in fn) expect((fn as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
      }
    }
  });

  it('read-only mode refuses hidden tools', async () => {
    const { mcp, fake } = await connect(config({ readOnly: true }));
    const result = await mcp.callTool({ name: 'send_email', arguments: { from: 'a@acme.com', to: 'b@x.com', subject: 's', text: 't' } });
    expect(result.isError).toBe(true);
    expect(fake.client.emails.send).not.toHaveBeenCalled();
  });
});

describe('dry run', () => {
  it('describes mutating calls without executing them', async () => {
    const { mcp, fake } = await connect(config({ dryRun: true, defaultFrom: 'Acme <hi@acme.com>' }));
    const out = JSON.parse(text(await mcp.callTool({ name: 'send_email', arguments: { to: 'a@x.com', subject: 's', text: 't' } })));
    expect(out).toMatchObject({ dry_run: true, tool: 'send_email', request: 'POST /emails', payload: { from: 'Acme <hi@acme.com>', to: 'a@x.com' } });
    const del = JSON.parse(text(await mcp.callTool({ name: 'verify_domain', arguments: { id: 'dom_1' } })));
    expect(del).toMatchObject({ dry_run: true, request: 'POST /domains/dom_1/verify', payload: { id: 'dom_1' } });
    const batch = JSON.parse(text(await mcp.callTool({ name: 'send_batch', arguments: { emails: [{ to: 'a@x.com', subject: 's', text: 't' }] } })));
    expect(batch.payload).toEqual([{ from: 'Acme <hi@acme.com>', to: 'a@x.com', subject: 's', text: 't' }]);
    const tpl = JSON.parse(text(await mcp.callTool({ name: 'create_template', arguments: { name: 'x', publish: true } })));
    expect(tpl.request).toMatch(/publish/);
    const many = JSON.parse(text(await mcp.callTool({ name: 'batch_create_contacts', arguments: { contacts: [{ email: 'a@x.com' }], segment_id: 'seg_1' } })));
    expect(many).toMatchObject({ dry_run: true, request: 'POST /contacts/batch', payload: { contacts: [{ email: 'a@x.com' }], segment_id: 'seg_1' } });
    expect(fake.client.contacts.batch).not.toHaveBeenCalled();
    expect(fake.client.emails.send).not.toHaveBeenCalled();
    expect(fake.client.domains.verify).not.toHaveBeenCalled();
    expect(fake.client.batch.send).not.toHaveBeenCalled();
  });

  it('still validates and still runs read tools', async () => {
    const { mcp, fake } = await connect(config({ dryRun: true }));
    expect((await mcp.callTool({ name: 'send_email', arguments: { to: 'a@x.com', subject: 's', text: 't' } })).isError).toBe(true);
    await mcp.callTool({ name: 'list_emails', arguments: {} });
    expect(fake.client.emails.list).toHaveBeenCalledOnce();
    await mcp.callTool({ name: 'preview_template', arguments: { id: 'welcome' } });
    expect(fake.client.templates.preview).toHaveBeenCalledOnce();
  });
});

describe('errors and secrets', () => {
  it('returns API errors as tool errors', async () => {
    const fake = fakeClient();
    fake.client.emails.get.mockResolvedValueOnce({ data: null, error: { statusCode: 404, name: 'not_found', message: 'Email not found' }, headers: {} } as never);
    fake.client.emails.list.mockResolvedValueOnce({ data: null, error: { statusCode: null, name: 'application_error', message: 'timeout' }, headers: null } as never);
    const { mcp } = await connect(config(), fake);
    const r = await mcp.callTool({ name: 'get_email', arguments: { id: 'x' } });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Pidgely API error (404 not_found): Email not found');
    expect(text(await mcp.callTool({ name: 'list_emails', arguments: {} }))).toBe('Pidgely API error (application_error): timeout');
  });

  it('turns thrown errors into tool errors', async () => {
    const fake = fakeClient();
    fake.client.emails.get.mockRejectedValueOnce(new Error('boom'));
    fake.client.emails.list.mockRejectedValueOnce('weird');
    const { mcp } = await connect(config(), fake);
    expect(text(await mcp.callTool({ name: 'get_email', arguments: { id: 'x' } }))).toBe('get_email failed: boom');
    expect(text(await mcp.callTool({ name: 'list_emails', arguments: {} }))).toBe('list_emails failed: weird');
  });

  it('never echoes the API key', async () => {
    const fake = fakeClient();
    fake.client.emails.get.mockResolvedValueOnce({ data: null, error: { statusCode: 401, name: 'invalid_api_key', message: `Key ${API_KEY} is invalid` }, headers: {} } as never);
    fake.client.emails.list.mockResolvedValueOnce({ data: { note: `other key pdg_zz9_Other0Secret and ${API_KEY}` }, error: null, headers: {} } as never);
    const { mcp } = await connect(config(), fake);
    const a = text(await mcp.callTool({ name: 'get_email', arguments: { id: 'x' } }));
    const b = text(await mcp.callTool({ name: 'list_emails', arguments: {} }));
    for (const out of [a, b]) {
      expect(out).not.toContain(API_KEY);
      expect(out).not.toContain('Other0Secret');
    }
    expect(a).toContain('[redacted]');
  });
});
