import { z } from 'zod';
import { EVENTS, id, page, pagination } from './schemas';
import { DESTRUCTIVE, tool, type ToolDefinition } from './types';

const idOrEmail = z.string().min(1).describe('Suppression id or email address.');
const emails = z.array(z.email()).min(1).max(100);

export const suppressionTools: ToolDefinition[] = [
  tool({
    name: 'list_suppressions',
    title: 'List suppressions',
    group: 'Suppressions',
    description: 'List suppressed addresses (never emailed), optionally by origin: bounce, complaint, manual or unsubscribe.',
    kind: 'read',
    input: { origin: z.enum(['bounce', 'complaint', 'manual', 'unsubscribe']).optional(), ...pagination },
    endpoint: () => 'GET /suppressions',
    run: (c, a) => c.suppressions.list({ ...page(a), origin: a.origin }),
  }),
  tool({
    name: 'get_suppression',
    title: 'Get suppression',
    group: 'Suppressions',
    description: 'Check whether an address is suppressed, and why (origin) and since when. Takes the suppression id or the address.',
    kind: 'read',
    input: { id_or_email: idOrEmail },
    endpoint: (a) => `GET /suppressions/${a.id_or_email}`,
    run: (c, a) => c.suppressions.get(a.id_or_email),
  }),
  tool({
    name: 'add_suppression',
    title: 'Suppress address',
    group: 'Suppressions',
    description: 'Add an address to the suppression list so Pidgely never emails it again (until removed).',
    kind: 'write',
    idempotent: true,
    input: { email: z.email().describe('Address to suppress.') },
    endpoint: () => 'POST /suppressions',
    run: (c, a) => c.suppressions.add({ email: a.email }),
  }),
  tool({
    name: 'batch_add_suppressions',
    title: 'Suppress addresses in bulk',
    group: 'Suppressions',
    description: 'Suppress up to 100 addresses in one request.',
    kind: 'write',
    idempotent: true,
    input: { emails: emails.describe('Addresses to suppress (1-100).') },
    endpoint: () => 'POST /suppressions/batch/add',
    run: (c, a) => c.suppressions.batch.add({ emails: a.emails }),
  }),
  tool({
    name: 'remove_suppression',
    title: 'Remove suppression',
    group: 'Suppressions',
    description:
      'Allow sending to an address again. Only do this when the user confirms the recipient wants mail: re-mailing addresses that bounced or complained hurts deliverability.',
    kind: 'write',
    idempotent: true,
    input: { id_or_email: idOrEmail },
    endpoint: (a) => `DELETE /suppressions/${a.id_or_email}`,
    run: (c, a) => c.suppressions.remove(a.id_or_email),
  }),
  tool({
    name: 'batch_remove_suppressions',
    title: 'Remove suppressions in bulk',
    group: 'Suppressions',
    description: 'Allow sending again to up to 100 addresses, by email and/or suppression id. Same caution as remove_suppression.',
    kind: 'write',
    idempotent: true,
    input: { emails: emails.optional().describe('Addresses (up to 100).'), ids: z.array(z.string().min(1)).min(1).max(100).optional().describe('Suppression ids.') },
    endpoint: () => 'POST /suppressions/batch/remove',
    validate: (a) => (a.emails?.length || a.ids?.length ? undefined : 'Provide "emails" or "ids".'),
    run: (c, a) => c.suppressions.batch.remove({ emails: a.emails, ids: a.ids }),
  }),
];

const events = z.array(z.enum(EVENTS)).min(1);

export const webhookTools: ToolDefinition[] = [
  tool({
    name: 'list_webhooks',
    title: 'List webhooks',
    group: 'Webhooks',
    description: 'List webhook endpoints with their subscribed events and status.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /webhooks',
    run: (c, a) => c.webhooks.list(page(a)),
  }),
  tool({
    name: 'get_webhook',
    title: 'Get webhook',
    group: 'Webhooks',
    description: 'Get a webhook endpoint with its events and status (the signing secret is not returned).',
    kind: 'read',
    input: { id: id('Webhook') },
    endpoint: (a) => `GET /webhooks/${a.id}`,
    run: (c, a) => c.webhooks.get(a.id),
  }),
  tool({
    name: 'create_webhook',
    title: 'Create webhook',
    group: 'Webhooks',
    description:
      'Register an https endpoint for delivery events. Returns the signing_secret (whsec_…), shown only now, used to verify deliveries (Standard Webhooks / svix headers). Tell the user to store it in their secret manager.',
    kind: 'write',
    revealsSecret: true,
    input: {
      endpoint: z.url({ protocol: /^https$/ }).describe('https URL that receives POSTed events.'),
      events: events.describe('Events to subscribe to.'),
    },
    endpoint: () => 'POST /webhooks',
    run: (c, a) => c.webhooks.create({ endpoint: a.endpoint, events: [...a.events] }),
  }),
  tool({
    name: 'update_webhook',
    title: 'Update webhook',
    group: 'Webhooks',
    description: 'Change a webhook\'s endpoint or events, or disable/enable it (status).',
    kind: 'write',
    idempotent: true,
    input: {
      id: id('Webhook'),
      endpoint: z.url({ protocol: /^https$/ }).optional(),
      events: events.optional(),
      status: z.enum(['enabled', 'disabled']).optional(),
    },
    endpoint: (a) => `PATCH /webhooks/${a.id}`,
    validate: (a) => (a.endpoint === undefined && a.events === undefined && a.status === undefined ? 'Nothing to update.' : undefined),
    run: (c, a) => {
      const body: { endpoint?: string; events?: (typeof EVENTS)[number][]; status?: 'enabled' | 'disabled' } = {};
      if (a.endpoint !== undefined) body.endpoint = a.endpoint;
      if (a.events !== undefined) body.events = [...a.events];
      if (a.status !== undefined) body.status = a.status;
      return c.webhooks.update(a.id, body);
    },
  }),
  tool({
    name: 'rotate_webhook_secret',
    title: 'Rotate webhook signing secret',
    group: 'Webhooks',
    description:
      'Replace a webhook\'s signing secret. Returns the new whsec_… secret, shown only now; deliveries are signed with it from now on, so the receiver must be updated.',
    kind: 'write',
    revealsSecret: true,
    input: { id: id('Webhook') },
    endpoint: (a) => `POST /webhooks/${a.id}/signing-secret/rotate`,
    run: (c, a) => c.webhooks.rotateSigningSecret(a.id),
  }),
  tool({
    name: 'delete_webhook',
    title: 'Delete webhook',
    group: 'Webhooks',
    description: `${DESTRUCTIVE} Delete a webhook endpoint; queued deliveries to it are dropped.`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: { id: id('Webhook') },
    endpoint: (a) => `DELETE /webhooks/${a.id}`,
    run: (c, a) => c.webhooks.remove(a.id),
  }),
];

export const apiKeyTools: ToolDefinition[] = [
  tool({
    name: 'list_api_keys',
    title: 'List API keys',
    group: 'API keys',
    description: 'List API keys (name, permission, created and last used). Tokens are never returned.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /api-keys',
    run: (c, a) => c.apiKeys.list(page(a)),
  }),
  tool({
    name: 'create_api_key',
    title: 'Create API key',
    group: 'API keys',
    description:
      'Create an API key. The token is returned only in this result, never again: give it to the user once and tell them to store it in a secret manager. ' +
      'Prefer permission "sending_access" (optionally restricted to one domain_id) for services that only send.',
    kind: 'write',
    revealsSecret: true,
    input: {
      name: z.string().min(1).max(50),
      permission: z.enum(['full_access', 'sending_access']).optional().describe('Default full_access.'),
      domain_id: z.string().optional().describe('Restrict a sending_access key to this domain.'),
    },
    endpoint: () => 'POST /api-keys',
    validate: (a) => (a.domain_id && a.permission !== 'sending_access' ? 'domain_id needs permission "sending_access".' : undefined),
    run: (c, a) => c.apiKeys.create({ name: a.name, permission: a.permission, domainId: a.domain_id }),
  }),
  tool({
    name: 'rename_api_key',
    title: 'Rename API key',
    group: 'API keys',
    description: 'Rename an API key (permissions cannot be changed: create a new key instead).',
    kind: 'write',
    idempotent: true,
    input: { id: id('API key'), name: z.string().min(1).max(50) },
    endpoint: (a) => `PATCH /api-keys/${a.id}`,
    run: (c, a) => c.apiKeys.update(a.id, { name: a.name }),
  }),
  tool({
    name: 'revoke_api_key',
    title: 'Revoke API key',
    group: 'API keys',
    description: `${DESTRUCTIVE} Revoke an API key: every request with it fails from now on. Revoking the key this server uses disconnects it.`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: { id: id('API key') },
    endpoint: (a) => `DELETE /api-keys/${a.id}`,
    run: (c, a) => c.apiKeys.remove(a.id),
  }),
];

export const usageTools: ToolDefinition[] = [
  tool({
    name: 'get_usage',
    title: 'Get usage',
    group: 'Usage',
    description: "Today's sending counters (accepted, delivered, bounced, complained), the daily quota and the account status.",
    kind: 'read',
    input: {},
    endpoint: () => 'GET /v1/usage',
    run: (c) => c.usage.get(),
  }),
];
