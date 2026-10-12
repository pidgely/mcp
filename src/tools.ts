import type { CreateEmailOptions, Domain, Pidgely, Response } from 'pidgely';
import { z } from 'zod';
import type { Config } from './config';
import { json } from './format';

/** The part of the SDK client the tools use (a fake can be passed in tests). */
export type PidgelyClient = Pick<
  Pidgely,
  'emails' | 'batch' | 'domains' | 'contacts' | 'segments' | 'broadcasts' | 'templates' | 'suppressions' | 'webhooks'
>;

/**
 * `read` tools only fetch data. `write` tools change account state. `send` tools deliver
 * email to real people. `write` and `send` tools are hidden in read-only mode and simulated
 * in dry-run mode.
 */
export type ToolKind = 'read' | 'write' | 'send';

export interface ToolDefinition<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  input: S;
  /** `METHOD /path` of the API call, shown in dry-run results. */
  endpoint: (args: z.infer<z.ZodObject<S>>) => string;
  /** Extra checks that JSON Schema cannot express. Returns an error message. */
  validate?: (args: z.infer<z.ZodObject<S>>, config: Config) => string | undefined;
  /** Request body (or arguments) echoed in dry-run results. Defaults to the arguments. */
  preview?: (args: z.infer<z.ZodObject<S>>, config: Config) => unknown;
  run: (client: PidgelyClient, args: z.infer<z.ZodObject<S>>, config: Config) => Promise<Response<unknown>>;
  /** Human-oriented rendering of a successful result. Defaults to pretty JSON. */
  format?: (data: unknown, args: z.infer<z.ZodObject<S>>) => string;
}

function tool<S extends z.ZodRawShape>(def: ToolDefinition<S>): ToolDefinition {
  return def as unknown as ToolDefinition;
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const id = (what: string) => z.string().min(1).describe(`${what} id`);
const recipients = (what: string) =>
  z
    .union([z.string().min(3), z.array(z.string().min(3)).min(1).max(50)])
    .describe(`${what}: one email address or a list (max 50). Plain addresses or "Name <address>".`);
const pagination = {
  limit: z.number().int().min(1).max(100).optional().describe('Page size, 1-100 (default 20).'),
  after: z.string().optional().describe('Cursor: id of the last item of the previous page (older items).'),
  before: z.string().optional().describe('Cursor: id of the first item of the current page (newer items).'),
};
const page = (args: { limit?: number; after?: string; before?: string }) =>
  (args.before ? { limit: args.limit ?? 20, before: args.before } : { limit: args.limit ?? 20, after: args.after });

const tagSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).describe('Tag name: ASCII letters, digits, _ or -.'),
  value: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/).describe('Tag value: ASCII letters, digits, _ or -.'),
});

const emailShape = {
  from: z
    .string()
    .min(3)
    .optional()
    .describe('Sender, "Name <address@verified-domain>". Optional when PIDGELY_MCP_DEFAULT_FROM is set or the template defines it.'),
  to: recipients('Recipients (required, never inferred)'),
  subject: z.string().min(1).max(998).optional().describe('Subject line. Required unless a template is used.'),
  html: z.string().optional().describe('HTML body.'),
  text: z.string().optional().describe('Plain-text body. Generated from html when omitted.'),
  cc: recipients('Cc').optional(),
  bcc: recipients('Bcc').optional(),
  reply_to: recipients('Reply-To').optional(),
  scheduled_at: z
    .string()
    .optional()
    .describe('Send later: ISO 8601 (2026-11-01T09:00:00Z) or natural language ("in 1 hour", "tomorrow at 9am"), within 30 days.'),
  tags: z.array(tagSchema).max(10).optional().describe('Tags for filtering and webhooks.'),
  template: z
    .object({
      id: z.string().min(1).describe('Template id or alias (its published version is sent).'),
      variables: z.record(z.string(), z.union([z.string().max(2000), z.number()])).optional().describe('Template variables.'),
    })
    .optional()
    .describe('Send a published template instead of html/text.'),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        path: z.url().optional().describe('https URL fetched at send time.'),
        content: z.string().optional().describe('Base64 file content (use path or content).'),
        content_type: z.string().optional(),
      }),
    )
    .max(20)
    .optional()
    .describe('Attachments, by URL (path) or base64 content.'),
};

type EmailArgs = z.infer<z.ZodObject<typeof emailShape>>;

function validateEmail(args: EmailArgs, config: Config, label = ''): string | undefined {
  if (!args.from && !config.defaultFrom && !args.template) {
    return `${label}"from" is required (or set PIDGELY_MCP_DEFAULT_FROM).`;
  }
  if (args.template && (args.html || args.text)) return `${label}use either a template or html/text, not both.`;
  if (!args.template && !args.html && !args.text) return `${label}provide html, text or a template.`;
  if (!args.template && !args.subject) return `${label}"subject" is required unless a template is used.`;
  for (const a of args.attachments ?? []) {
    if (!a.path === !a.content) return `${label}attachment "${a.filename}" needs exactly one of path or content.`;
  }
  return undefined;
}

function toSdkEmail(args: EmailArgs, config: Config): CreateEmailOptions {
  const email: Record<string, unknown> = {
    from: args.from ?? config.defaultFrom,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
    cc: args.cc,
    bcc: args.bcc,
    replyTo: args.reply_to,
    scheduledAt: args.scheduled_at,
    tags: args.tags,
    template: args.template,
    attachments: args.attachments?.map((a) => ({ filename: a.filename, path: a.path, content: a.content, contentType: a.content_type })),
  };
  for (const key of Object.keys(email)) if (email[key] === undefined) delete email[key];
  return email as unknown as CreateEmailOptions;
}

function dnsTable(domain: Domain): string {
  const records = domain.records ?? [];
  if (records.length === 0) return `Domain ${domain.name} (${domain.status}). No DNS records returned.`;
  const lines = records.map(
    (r) =>
      `- ${r.record} ${r.type} ${r.name}${r.priority ? ` (priority ${r.priority})` : ''} → ${r.value}  [${r.status ?? 'unknown'}]`,
  );
  return [
    `Domain ${domain.name} is ${domain.status}. Publish these DNS records at the domain's DNS provider (names are relative to ${domain.name}), then call verify_domain:`,
    ...lines,
  ].join('\n');
}

const EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'domain.updated',
  'contact.created',
  'contact.updated',
  'contact.deleted',
] as const;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const tools: ToolDefinition[] = [
  // Emails
  tool({
    name: 'send_email',
    title: 'Send email',
    description:
      'Send one email through Pidgely to the explicit recipients in "to" (never guess recipients). ' +
      'Provide html and/or text with a subject, or a published template. Supports cc/bcc, reply_to, tags, attachments and scheduling (scheduled_at). ' +
      'Pass idempotency_key to make retries safe. Returns the email id.',
    kind: 'send',
    input: {
      ...emailShape,
      idempotency_key: z.string().max(256).optional().describe('Unique key: retries with the same key will not send twice (24h).'),
    },
    endpoint: () => 'POST /emails',
    validate: (args, config) => validateEmail(args, config),
    preview: (args, config) => toSdkEmail(args, config),
    run: (c, args, config) => c.emails.send(toSdkEmail(args, config), { idempotencyKey: args.idempotency_key }),
  }),
  tool({
    name: 'send_batch',
    title: 'Send batch of emails',
    description:
      'Send up to 100 different emails in one request. Each email needs its own explicit "to". ' +
      'batch_validation "strict" (default) sends all or none; "permissive" sends the valid ones and reports errors by index. Attachments and scheduling are not supported in batches.',
    kind: 'send',
    input: {
      emails: z
        .array(z.object((({ attachments: _a, scheduled_at: _s, ...rest }) => rest)(emailShape)))
        .min(1)
        .max(100)
        .describe('The emails to send (1-100).'),
      batch_validation: z.enum(['strict', 'permissive']).optional().describe('strict (default) or permissive.'),
      idempotency_key: z.string().max(256).optional().describe('Unique key: retries with the same key will not send twice (24h).'),
    },
    endpoint: () => 'POST /emails/batch',
    validate: (args, config) => {
      for (const [i, email] of args.emails.entries()) {
        const err = validateEmail(email, config, `emails[${i}]: `);
        if (err) return err;
      }
      return undefined;
    },
    preview: (args, config) => args.emails.map((e) => toSdkEmail(e, config)),
    run: (c, args, config) =>
      c.batch.send(
        args.emails.map((e) => toSdkEmail(e, config)),
        { idempotencyKey: args.idempotency_key, batchValidation: args.batch_validation },
      ),
  }),
  tool({
    name: 'get_email',
    title: 'Get email',
    description: 'Retrieve a sent or scheduled email by id, including its last_event (queued, sent, delivered, bounced, complained, failed, canceled…), recipients, subject and bodies.',
    kind: 'read',
    input: { id: id('Email') },
    endpoint: (a) => `GET /emails/${a.id}`,
    run: (c, a) => c.emails.get(a.id),
  }),
  tool({
    name: 'list_emails',
    title: 'List emails',
    description: 'List recently sent emails, newest first, with their last_event. Cursor-paginated: pass the last id as "after" for the next page.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /emails',
    run: (c, a) => c.emails.list(page(a)),
  }),
  tool({
    name: 'cancel_email',
    title: 'Cancel scheduled email',
    description: 'Cancel an email that was scheduled with scheduled_at and has not been sent yet.',
    kind: 'write',
    input: { id: id('Email') },
    endpoint: (a) => `POST /emails/${a.id}/cancel`,
    run: (c, a) => c.emails.cancel(a.id),
  }),

  // Domains
  tool({
    name: 'list_domains',
    title: 'List domains',
    description: 'List sending domains with their verification status (not_started, pending, verified, failed).',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /domains',
    run: (c, a) => c.domains.list(page(a)),
  }),
  tool({
    name: 'get_domain',
    title: 'Get domain and DNS records',
    description:
      'Get a domain with the DNS records to publish (DKIM TXT, return-path MX and SPF TXT, DMARC) and the verification status of each record.',
    kind: 'read',
    input: { id: id('Domain') },
    endpoint: (a) => `GET /domains/${a.id}`,
    run: (c, a) => c.domains.get(a.id),
    format: (data) => `${dnsTable(data as Domain)}\n\n${json(data)}`,
  }),
  tool({
    name: 'create_domain',
    title: 'Add domain',
    description:
      'Add a sending domain (e.g. "acme.com" or "mail.acme.com"). Returns the DNS records the user must publish; then call verify_domain.',
    kind: 'write',
    input: {
      name: z
        .string()
        .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i, 'Must be a domain name like acme.com')
        .describe('Domain name, e.g. acme.com.'),
      custom_return_path: z
        .string()
        .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i)
        .optional()
        .describe('Bounce subdomain label (default "bounces").'),
      tls: z.enum(['opportunistic', 'enforced']).optional().describe('TLS policy for delivery (default opportunistic).'),
      region: z.string().optional().describe('Informative region label.'),
    },
    endpoint: () => 'POST /domains',
    run: (c, a) => c.domains.create({ name: a.name, customReturnPath: a.custom_return_path, tls: a.tls, region: a.region }),
    format: (data) => `${dnsTable(data as Domain)}\n\n${json(data)}`,
  }),
  tool({
    name: 'verify_domain',
    title: 'Verify domain',
    description: 'Ask Pidgely to check the domain\'s DNS records now. Call get_domain afterwards to see the per-record status.',
    kind: 'write',
    input: { id: id('Domain') },
    endpoint: (a) => `POST /domains/${a.id}/verify`,
    run: (c, a) => c.domains.verify(a.id),
  }),

  // Contacts and segments
  tool({
    name: 'list_contacts',
    title: 'List contacts',
    description: 'List contacts, optionally only those in one segment.',
    kind: 'read',
    input: { segment_id: z.string().optional().describe('Only contacts in this segment.'), ...pagination },
    endpoint: () => 'GET /contacts',
    run: (c, a) => c.contacts.list({ ...page(a), segmentId: a.segment_id }),
  }),
  tool({
    name: 'create_contact',
    title: 'Create contact',
    description: 'Create a contact (or update it if the email exists), with optional custom properties and segment membership.',
    kind: 'write',
    input: {
      email: z.email().describe('Contact email address.'),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      unsubscribed: z.boolean().optional().describe('true to opt the contact out of broadcasts.'),
      properties: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional()
        .describe('Custom properties, usable in broadcasts as {{{contact.<name>}}}.'),
      segment_ids: z.array(z.string()).optional().describe('Segments to add the contact to.'),
    },
    endpoint: () => 'POST /contacts',
    run: (c, a) =>
      c.contacts.create({
        email: a.email,
        firstName: a.first_name,
        lastName: a.last_name,
        unsubscribed: a.unsubscribed,
        properties: a.properties,
        segments: a.segment_ids?.map((s) => ({ id: s })),
      }),
  }),
  tool({
    name: 'update_contact',
    title: 'Update contact',
    description:
      'Update a contact selected by id or email. Setting unsubscribed=true also suppresses the address; false removes the unsubscribe suppression.',
    kind: 'write',
    input: {
      id: z.string().optional().describe('Contact id (or use email).'),
      email: z.email().optional().describe('Contact email (or use id).'),
      first_name: z.string().nullable().optional().describe('null clears it.'),
      last_name: z.string().nullable().optional().describe('null clears it.'),
      unsubscribed: z.boolean().optional(),
      properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe('Properties to set; null removes one.'),
    },
    endpoint: (a) => `PATCH /contacts/${a.id ?? a.email}`,
    validate: (a) => (a.id || a.email ? undefined : 'Provide the contact "id" or "email".'),
    run: (c, a) => {
      const selector = a.id ? { id: a.id } : { email: a.email as string };
      return c.contacts.update({
        ...selector,
        firstName: a.first_name,
        lastName: a.last_name,
        unsubscribed: a.unsubscribed,
        properties: a.properties,
      });
    },
  }),
  tool({
    name: 'list_segments',
    title: 'List segments',
    description: 'List contact segments (audiences). Use a segment id with create_broadcast or list_contacts.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /segments',
    run: (c, a) => c.segments.list(page(a)),
  }),

  // Broadcasts
  tool({
    name: 'create_broadcast',
    title: 'Create broadcast (draft)',
    description:
      'Create a broadcast draft to a segment. It is NOT sent; call send_broadcast after the user confirms. ' +
      'html supports {{{FIRST_NAME|fallback}}}, {{{LAST_NAME}}}, {{{EMAIL}}}, {{{contact.<property>}}} and {{{PIDGELY_UNSUBSCRIBE_URL}}}.',
    kind: 'write',
    input: {
      segment_id: z.string().min(1).describe('Segment to send to.'),
      from: z.string().min(3).optional().describe('Sender. Defaults to PIDGELY_MCP_DEFAULT_FROM.'),
      subject: z.string().min(1).max(998),
      html: z.string().optional(),
      text: z.string().optional(),
      name: z.string().optional().describe('Internal name.'),
      preview_text: z.string().optional().describe('Inbox preview snippet.'),
      reply_to: recipients('Reply-To').optional(),
    },
    endpoint: () => 'POST /broadcasts',
    validate: (a, config) => {
      if (!a.from && !config.defaultFrom) return '"from" is required (or set PIDGELY_MCP_DEFAULT_FROM).';
      if (!a.html && !a.text) return 'Provide html or text.';
      return undefined;
    },
    run: (c, a, config) =>
      c.broadcasts.create({
        segmentId: a.segment_id,
        from: (a.from ?? config.defaultFrom) as string,
        subject: a.subject,
        html: a.html,
        text: a.text,
        name: a.name,
        previewText: a.preview_text,
        replyTo: a.reply_to,
      }),
  }),
  tool({
    name: 'send_broadcast',
    title: 'Send broadcast',
    description:
      'Send a broadcast draft to every contact in its segment, now or at scheduled_at. This emails real people: only call it when the user explicitly asked to send, and set confirm=true.',
    kind: 'send',
    input: {
      id: id('Broadcast'),
      scheduled_at: z.string().optional().describe('ISO 8601 or natural language; omit to send now.'),
      confirm: z.literal(true).describe('Must be true: confirms the user explicitly asked to send this broadcast.'),
    },
    endpoint: (a) => `POST /broadcasts/${a.id}/send`,
    run: (c, a) => c.broadcasts.send(a.id, a.scheduled_at ? { scheduledAt: a.scheduled_at } : undefined),
  }),

  // Templates
  tool({
    name: 'list_templates',
    title: 'List templates',
    description: 'List email templates with their alias, status (draft/published) and dates.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /templates',
    run: (c, a) => c.templates.list(page(a)),
  }),
  tool({
    name: 'create_template',
    title: 'Create template',
    description:
      'Create an email template with typed variables used as {{{NAME}}} in subject/html. Set publish=true to publish it so send_email can use it via template.id (id or alias).',
    kind: 'write',
    input: {
      name: z.string().min(1),
      alias: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i).optional().describe('Stable alias, e.g. "welcome".'),
      from: z.string().optional(),
      subject: z.string().optional(),
      html: z.string().optional(),
      text: z.string().optional(),
      variables: z
        .array(
          z.object({
            key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).describe('Variable name, e.g. NAME.'),
            type: z.enum(['string', 'number']),
            fallback_value: z.union([z.string(), z.number()]).optional(),
          }),
        )
        .optional(),
      publish: z.boolean().optional().describe('Publish right after creating (default false).'),
    },
    endpoint: (a) => (a.publish ? 'POST /templates + POST /templates/{id}/publish' : 'POST /templates'),
    run: (c, a) => {
      const created = c.templates.create({
        name: a.name,
        alias: a.alias,
        from: a.from,
        subject: a.subject,
        html: a.html,
        text: a.text,
        variables: a.variables?.map((v) =>
          v.type === 'number'
            ? { key: v.key, type: 'number' as const, fallbackValue: v.fallback_value === undefined ? undefined : Number(v.fallback_value) }
            : { key: v.key, type: 'string' as const, fallbackValue: v.fallback_value === undefined ? undefined : String(v.fallback_value) },
        ),
      });
      return a.publish ? created.publish() : Promise.resolve(created);
    },
  }),

  // Suppressions
  tool({
    name: 'list_suppressions',
    title: 'List suppressions',
    description: 'List suppressed addresses (never emailed), optionally by origin: bounce, complaint, manual or unsubscribe.',
    kind: 'read',
    input: { origin: z.enum(['bounce', 'complaint', 'manual', 'unsubscribe']).optional(), ...pagination },
    endpoint: () => 'GET /suppressions',
    run: (c, a) => c.suppressions.list({ ...page(a), origin: a.origin }),
  }),
  tool({
    name: 'add_suppression',
    title: 'Suppress address',
    description: 'Add an address to the suppression list so Pidgely never emails it again (until removed).',
    kind: 'write',
    input: { email: z.email().describe('Address to suppress.') },
    endpoint: () => 'POST /suppressions',
    run: (c, a) => c.suppressions.add({ email: a.email }),
  }),

  // Webhooks
  tool({
    name: 'list_webhooks',
    title: 'List webhooks',
    description: 'List webhook endpoints with their subscribed events and status.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /webhooks',
    run: (c, a) => c.webhooks.list(page(a)),
  }),
  tool({
    name: 'create_webhook',
    title: 'Create webhook',
    description:
      'Register an https endpoint for delivery events. Returns the signing_secret (whsec_…) used to verify deliveries (Standard Webhooks / svix headers).',
    kind: 'write',
    input: {
      endpoint: z.url({ protocol: /^https$/ }).describe('https URL that receives POSTed events.'),
      events: z.array(z.enum(EVENTS)).min(1).describe('Events to subscribe to.'),
    },
    endpoint: () => 'POST /webhooks',
    run: (c, a) => c.webhooks.create({ endpoint: a.endpoint, events: [...a.events] }),
  }),
];
