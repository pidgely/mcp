import { z } from 'zod';
import { compact, contactSelector, id, page, pagination, properties, recipients, selector, validateSelector } from './schemas';
import { DESTRUCTIVE, tool, type ToolDefinition } from './types';

const contactKey = (a: { id?: string; email?: string }) => a.id ?? a.email;
const segmentSel = (a: { id?: string; email?: string }) => (a.id ? { contactId: a.id } : { email: a.email as string });

export const contactTools: ToolDefinition[] = [
  tool({
    name: 'list_contacts',
    title: 'List contacts',
    group: 'Contacts',
    description: 'List contacts, optionally only those in one segment.',
    kind: 'read',
    input: { segment_id: z.string().optional().describe('Only contacts in this segment.'), ...pagination },
    endpoint: () => 'GET /contacts',
    run: (c, a) => c.contacts.list({ ...page(a), segmentId: a.segment_id }),
  }),
  tool({
    name: 'get_contact',
    title: 'Get contact',
    group: 'Contacts',
    description: 'Get a contact by id or email, with its properties and unsubscribed state.',
    kind: 'read',
    input: contactSelector,
    endpoint: (a) => `GET /contacts/${contactKey(a)}`,
    validate: validateSelector,
    run: (c, a) => c.contacts.get(selector(a)),
  }),
  tool({
    name: 'create_contact',
    title: 'Create contact',
    group: 'Contacts',
    description: 'Create a contact (or update it if the email exists), with optional custom properties and segment membership.',
    kind: 'write',
    idempotent: true,
    input: {
      email: z.email().describe('Contact email address.'),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      unsubscribed: z.boolean().optional().describe('true to opt the contact out of broadcasts.'),
      properties: properties.optional(),
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
    name: 'batch_create_contacts',
    title: 'Create contacts in bulk',
    group: 'Contacts',
    description:
      'Create or update up to 1,000 contacts in one request (matched by email), optionally adding all of them to a segment. ' +
      'Each row is saved independently: invalid rows are reported in "errors" with their index, the others are saved. Returns the ids by index.',
    kind: 'write',
    idempotent: true,
    input: {
      contacts: z
        .array(
          z.object({
            email: z.email().describe('Contact email address.'),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            unsubscribed: z.boolean().optional().describe('true to opt the contact out of broadcasts.'),
            properties: properties.optional(),
            segment_ids: z.array(z.string()).optional().describe('Segments to add this contact to.'),
          }),
        )
        .min(1)
        .max(1000)
        .describe('The contacts to save (1-1000).'),
      segment_id: z.string().optional().describe('Segment every contact is added to.'),
    },
    endpoint: () => 'POST /contacts/batch',
    run: (c, a) =>
      c.contacts.batch({
        contacts: a.contacts.map((ct) => ({
          email: ct.email,
          firstName: ct.first_name,
          lastName: ct.last_name,
          unsubscribed: ct.unsubscribed,
          properties: ct.properties,
          segments: ct.segment_ids?.map((s) => ({ id: s })),
        })),
        segmentId: a.segment_id,
      }),
  }),
  tool({
    name: 'update_contact',
    title: 'Update contact',
    group: 'Contacts',
    description:
      'Update a contact selected by id or email. Setting unsubscribed=true also suppresses the address; false removes the unsubscribe suppression.',
    kind: 'write',
    idempotent: true,
    input: {
      ...contactSelector,
      first_name: z.string().nullable().optional().describe('null clears it.'),
      last_name: z.string().nullable().optional().describe('null clears it.'),
      unsubscribed: z.boolean().optional(),
      properties: properties.optional().describe('Properties to set; null removes one.'),
    },
    endpoint: (a) => `PATCH /contacts/${contactKey(a)}`,
    validate: validateSelector,
    run: (c, a) =>
      c.contacts.update({ ...selector(a), firstName: a.first_name, lastName: a.last_name, unsubscribed: a.unsubscribed, properties: a.properties }),
  }),
  tool({
    name: 'delete_contact',
    title: 'Delete contact',
    group: 'Contacts',
    description: `${DESTRUCTIVE} Delete a contact (by id or email) with its properties and segment memberships. Its suppression entry, if any, is kept.`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: contactSelector,
    endpoint: (a) => `DELETE /contacts/${contactKey(a)}`,
    validate: validateSelector,
    run: (c, a) => c.contacts.remove(selector(a)),
  }),
  tool({
    name: 'list_contact_segments',
    title: "List a contact's segments",
    group: 'Contacts',
    description: 'List the segments a contact (by id or email) belongs to.',
    kind: 'read',
    input: { ...contactSelector, ...pagination },
    endpoint: (a) => `GET /contacts/${contactKey(a)}/segments`,
    validate: validateSelector,
    run: (c, a) => c.contacts.segments.list({ ...segmentSel(a), ...page(a) }),
  }),
  tool({
    name: 'add_contact_to_segment',
    title: 'Add contact to segment',
    group: 'Contacts',
    description: 'Add a contact (by id or email) to a segment.',
    kind: 'write',
    idempotent: true,
    input: { ...contactSelector, segment_id: id('Segment') },
    endpoint: (a) => `POST /contacts/${contactKey(a)}/segments/${a.segment_id}`,
    validate: validateSelector,
    run: (c, a) => c.contacts.segments.add({ ...segmentSel(a), segmentId: a.segment_id }),
  }),
  tool({
    name: 'remove_contact_from_segment',
    title: 'Remove contact from segment',
    group: 'Contacts',
    description: 'Remove a contact (by id or email) from a segment. The contact itself is kept.',
    kind: 'write',
    idempotent: true,
    input: { ...contactSelector, segment_id: id('Segment') },
    endpoint: (a) => `DELETE /contacts/${contactKey(a)}/segments/${a.segment_id}`,
    validate: validateSelector,
    run: (c, a) => c.contacts.segments.remove({ ...segmentSel(a), segmentId: a.segment_id }),
  }),
];

export const segmentTools: ToolDefinition[] = [
  tool({
    name: 'list_segments',
    title: 'List segments',
    group: 'Segments',
    description: 'List contact segments (audiences). Use a segment id with create_broadcast or list_contacts.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /segments',
    run: (c, a) => c.segments.list(page(a)),
  }),
  tool({
    name: 'get_segment',
    title: 'Get segment',
    group: 'Segments',
    description: 'Get a segment by id, with its name and creation date.',
    kind: 'read',
    input: { id: id('Segment') },
    endpoint: (a) => `GET /segments/${a.id}`,
    run: (c, a) => c.segments.get(a.id),
  }),
  tool({
    name: 'list_segment_contacts',
    title: 'List segment contacts',
    group: 'Segments',
    description: 'List the contacts in a segment.',
    kind: 'read',
    input: { id: id('Segment'), ...pagination },
    endpoint: (a) => `GET /segments/${a.id}/contacts`,
    run: (c, a) => c.segments.listContacts(a.id, page(a)),
  }),
  tool({
    name: 'create_segment',
    title: 'Create segment',
    group: 'Segments',
    description: 'Create a segment: a named group of contacts that broadcasts are sent to.',
    kind: 'write',
    input: { name: z.string().min(1).max(200) },
    endpoint: () => 'POST /segments',
    run: (c, a) => c.segments.create({ name: a.name }),
  }),
  tool({
    name: 'update_segment',
    title: 'Rename segment',
    group: 'Segments',
    description: 'Rename a segment; its contacts and broadcasts are unchanged.',
    kind: 'write',
    idempotent: true,
    input: { id: id('Segment'), name: z.string().min(1).max(200) },
    endpoint: (a) => `PATCH /segments/${a.id}`,
    run: (c, a) => c.segments.update(a.id, { name: a.name }),
  }),
  tool({
    name: 'delete_segment',
    title: 'Delete segment',
    group: 'Segments',
    description: `${DESTRUCTIVE} Delete a segment. Its contacts are kept; only the memberships are removed.`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: { id: id('Segment') },
    endpoint: (a) => `DELETE /segments/${a.id}`,
    run: (c, a) => c.segments.remove(a.id),
  }),
];

const broadcastContent = {
  from: z.string().min(3).optional().describe('Sender. Defaults to PIDGELY_MCP_DEFAULT_FROM.'),
  subject: z.string().min(1).max(998),
  html: z
    .string()
    .optional()
    .describe('Supports {{{FIRST_NAME|fallback}}}, {{{LAST_NAME}}}, {{{EMAIL}}}, {{{contact.<property>}}} and {{{PIDGELY_UNSUBSCRIBE_URL}}}.'),
  text: z.string().optional(),
  name: z.string().optional().describe('Internal name.'),
  preview_text: z.string().optional().describe('Inbox preview snippet.'),
  reply_to: recipients('Reply-To').optional(),
};

export const broadcastTools: ToolDefinition[] = [
  tool({
    name: 'list_broadcasts',
    title: 'List broadcasts',
    group: 'Broadcasts',
    description: 'List broadcasts, newest first, with their status (draft, scheduled, queued, sending, sent, canceled, failed).',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /broadcasts',
    run: (c, a) => c.broadcasts.list(page(a)),
  }),
  tool({
    name: 'get_broadcast',
    title: 'Get broadcast',
    group: 'Broadcasts',
    description: 'Get a broadcast with its status, content, recipients count and delivery stats.',
    kind: 'read',
    input: { id: id('Broadcast') },
    endpoint: (a) => `GET /broadcasts/${a.id}`,
    run: (c, a) => c.broadcasts.get(a.id),
  }),
  tool({
    name: 'create_broadcast',
    title: 'Create broadcast (draft)',
    group: 'Broadcasts',
    description:
      'Create a broadcast draft to a segment. It is NOT sent; call send_broadcast only after the user confirms. ' +
      'html supports {{{FIRST_NAME|fallback}}}, {{{LAST_NAME}}}, {{{EMAIL}}}, {{{contact.<property>}}} and {{{PIDGELY_UNSUBSCRIBE_URL}}}.',
    kind: 'write',
    input: { segment_id: z.string().min(1).describe('Segment to send to.'), ...broadcastContent },
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
    name: 'update_broadcast',
    title: 'Update broadcast draft',
    group: 'Broadcasts',
    description: 'Change a broadcast draft (segment, sender, subject, content, name, preview text). Only drafts can be changed.',
    kind: 'write',
    idempotent: true,
    input: {
      id: id('Broadcast'),
      segment_id: z.string().min(1).optional(),
      ...broadcastContent,
      subject: broadcastContent.subject.optional(),
    },
    endpoint: (a) => `PATCH /broadcasts/${a.id}`,
    validate: (a) => {
      return Object.entries(a).every(([k, v]) => k === 'id' || v === undefined) ? 'Nothing to update.' : undefined;
    },
    run: (c, a) =>
      c.broadcasts.update(
        a.id,
        compact({
          segmentId: a.segment_id,
          from: a.from,
          subject: a.subject,
          html: a.html,
          text: a.text,
          name: a.name,
          previewText: a.preview_text,
          replyTo: a.reply_to,
        }),
      ),
  }),
  tool({
    name: 'send_broadcast',
    title: 'Send broadcast',
    group: 'Broadcasts',
    description: `${DESTRUCTIVE} Send a broadcast draft to every contact in its segment, now or at scheduled_at. This emails real people: only call it when the user explicitly asked to send, and set confirm=true.`,
    kind: 'send',
    destructive: true,
    input: {
      id: id('Broadcast'),
      scheduled_at: z.string().optional().describe('ISO 8601 or natural language; omit to send now.'),
      confirm: z.literal(true).describe('Must be true: confirms the user explicitly asked to send this broadcast.'),
    },
    endpoint: (a) => `POST /broadcasts/${a.id}/send`,
    run: (c, a) => c.broadcasts.send(a.id, a.scheduled_at ? { scheduledAt: a.scheduled_at } : undefined),
  }),
  tool({
    name: 'cancel_broadcast',
    title: 'Cancel broadcast',
    group: 'Broadcasts',
    description: 'Cancel a scheduled or queued broadcast before it finishes sending. Messages already sent are not recalled; duplicate_broadcast makes a new draft.',
    kind: 'write',
    idempotent: true,
    input: { id: id('Broadcast') },
    endpoint: (a) => `POST /broadcasts/${a.id}/cancel`,
    run: (c, a) => c.broadcasts.cancel(a.id),
  }),
  tool({
    name: 'duplicate_broadcast',
    title: 'Duplicate broadcast',
    group: 'Broadcasts',
    description: 'Copy a broadcast as a new draft with the same content and no schedule.',
    kind: 'write',
    input: { id: id('Broadcast') },
    endpoint: (a) => `POST /broadcasts/${a.id}/duplicate`,
    run: (c, a) => c.broadcasts.duplicate(a.id),
  }),
  tool({
    name: 'delete_broadcast',
    title: 'Delete broadcast',
    group: 'Broadcasts',
    description: `${DESTRUCTIVE} Delete a broadcast (draft, sent, canceled or failed). Scheduled, queued or sending broadcasts must be canceled first (cancel_broadcast).`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: { id: id('Broadcast') },
    endpoint: (a) => `DELETE /broadcasts/${a.id}`,
    run: (c, a) => c.broadcasts.remove(a.id),
  }),
];
