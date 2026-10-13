import type { CreateEmailOptions } from 'pidgely';
import { z } from 'zod';
import type { Config } from '../config';
import { id, page, pagination, recipients } from './schemas';
import { tool, type ToolDefinition } from './types';

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

const idempotencyKey = z.string().max(256).optional().describe('Unique key: retries with the same key will not send twice (24h).');

export const emailTools: ToolDefinition[] = [
  tool({
    name: 'send_email',
    title: 'Send email',
    group: 'Emails',
    description:
      'Send one email through Pidgely to the explicit recipients in "to" (never guess recipients). ' +
      'Provide html and/or text with a subject, or a published template. Supports cc/bcc, reply_to, tags, attachments and scheduling (scheduled_at). ' +
      'Pass idempotency_key to make retries safe. Returns the email id.',
    kind: 'send',
    input: { ...emailShape, idempotency_key: idempotencyKey },
    endpoint: () => 'POST /emails',
    validate: (args, config) => validateEmail(args, config),
    preview: (args, config) => toSdkEmail(args, config),
    run: (c, args, config) => c.emails.send(toSdkEmail(args, config), { idempotencyKey: args.idempotency_key }),
  }),
  tool({
    name: 'send_batch',
    title: 'Send batch of emails',
    group: 'Emails',
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
      idempotency_key: idempotencyKey,
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
    group: 'Emails',
    description:
      'Retrieve a sent or scheduled email by id, including its last_event (queued, sent, delivered, bounced, complained, failed, canceled…), recipients, subject and bodies.',
    kind: 'read',
    input: { id: id('Email') },
    endpoint: (a) => `GET /emails/${a.id}`,
    run: (c, a) => c.emails.get(a.id),
  }),
  tool({
    name: 'list_emails',
    title: 'List emails',
    group: 'Emails',
    description: 'List recently sent emails, newest first, with their last_event. Cursor-paginated: pass the last id as "after" for the next page.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /emails',
    run: (c, a) => c.emails.list(page(a)),
  }),
  tool({
    name: 'list_email_attachments',
    title: 'List email attachments',
    group: 'Emails',
    description: 'List the attachments of a sent email (filename, size, content type).',
    kind: 'read',
    input: { email_id: id('Email'), ...pagination },
    endpoint: (a) => `GET /emails/${a.email_id}/attachments`,
    run: (c, a) => c.emails.attachments.list({ emailId: a.email_id, ...page(a) }),
  }),
  tool({
    name: 'get_email_attachment',
    title: 'Get email attachment',
    group: 'Emails',
    description: 'Get one attachment of a sent email, with a signed download_url valid for 1 hour.',
    kind: 'read',
    input: { email_id: id('Email'), id: id('Attachment') },
    endpoint: (a) => `GET /emails/${a.email_id}/attachments/${a.id}`,
    run: (c, a) => c.emails.attachments.get({ emailId: a.email_id, id: a.id }),
  }),
  tool({
    name: 'reschedule_email',
    title: 'Reschedule email',
    group: 'Emails',
    description: 'Change when a scheduled email (not sent yet) goes out.',
    kind: 'write',
    idempotent: true,
    input: {
      id: id('Email'),
      scheduled_at: z.string().min(1).describe('New time: ISO 8601 or natural language ("tomorrow at 9am"), within 30 days.'),
    },
    endpoint: (a) => `PATCH /emails/${a.id}`,
    run: (c, a) => c.emails.update({ id: a.id, scheduledAt: a.scheduled_at }),
  }),
  tool({
    name: 'cancel_email',
    title: 'Cancel scheduled email',
    group: 'Emails',
    description: 'Cancel an email that was scheduled with scheduled_at and has not been sent yet.',
    kind: 'write',
    idempotent: true,
    input: { id: id('Email') },
    endpoint: (a) => `POST /emails/${a.id}/cancel`,
    run: (c, a) => c.emails.cancel(a.id),
  }),
];
