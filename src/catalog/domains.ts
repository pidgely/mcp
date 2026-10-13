import type { CloudflareSetup, DnsProvider, Domain } from 'pidgely';
import { z } from 'zod';
import { json } from '../format';
import { compact, id, page, pagination } from './schemas';
import { DESTRUCTIVE, tool, type ToolDefinition } from './types';

function dnsTable(domain: Domain): string {
  const records = domain.records ?? [];
  if (records.length === 0) return `Domain ${domain.name} (${domain.status}). No DNS records returned.`;
  const lines = records.map(
    (r) => `- ${r.record} ${r.type} ${r.name}${r.priority ? ` (priority ${r.priority})` : ''} → ${r.value}  [${r.status ?? 'unknown'}]`,
  );
  return [
    `Domain ${domain.name} is ${domain.status}. Publish these DNS records at the domain's DNS provider (names are relative to ${domain.name}), or set them up automatically (detect_dns_provider), then call verify_domain:`,
    ...lines,
  ].join('\n');
}

function providerSummary(p: DnsProvider): string {
  const who = p.provider ? `${p.provider.name}` : 'an unrecognised provider';
  const lines = [`Zone ${p.zone} (host "${p.host || '@'}") is hosted by ${who}.`];
  if (p.cloudflare) lines.push('Cloudflare: call setup_dns_cloudflare with a Cloudflare API token (Zone → DNS → Edit, Zone → Zone → Read) to create the records.');
  if (p.domain_connect) lines.push(`Domain Connect: ask the user to open this signed link and approve the records at ${p.domain_connect.provider_name}: ${p.domain_connect.url}`);
  if (!p.cloudflare && !p.domain_connect) lines.push('No automatic setup for this provider: publish the records from get_domain by hand.');
  return lines.join('\n');
}

function setupSummary(s: CloudflareSetup): string {
  return [`Cloudflare zone ${s.zone} updated:`, ...s.records.map((r) => `- ${r.purpose} ${r.type} ${r.name}: ${r.action}`), 'A DNS check runs right away; call get_domain to see the status.'].join('\n');
}

export const domainTools: ToolDefinition[] = [
  tool({
    name: 'list_domains',
    title: 'List domains',
    group: 'Domains',
    description: 'List sending domains with their verification status (not_started, pending, verified, failed, temporary_failure).',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /domains',
    run: (c, a) => c.domains.list(page(a)),
  }),
  tool({
    name: 'get_domain',
    title: 'Get domain and DNS records',
    group: 'Domains',
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
    group: 'Domains',
    description:
      'Add a sending domain (e.g. "acme.com" or "mail.acme.com"). Returns the DNS records to publish; then use detect_dns_provider for automatic setup, or publish them by hand and call verify_domain.',
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
    run: (c, a) => c.domains.create(compact({ name: a.name, customReturnPath: a.custom_return_path, tls: a.tls, region: a.region })),
    format: (data) => `${dnsTable(data as Domain)}\n\n${json(data)}`,
  }),
  tool({
    name: 'update_domain',
    title: 'Update domain',
    group: 'Domains',
    description: 'Change a domain\'s delivery settings: tls "enforced" never sends in clear text (mail to servers without TLS fails); "opportunistic" is the default.',
    kind: 'write',
    idempotent: true,
    input: {
      id: id('Domain'),
      tls: z.enum(['opportunistic', 'enforced']).optional(),
      open_tracking: z.boolean().optional().describe('Accepted for Resend compatibility; not supported yet.'),
      click_tracking: z.boolean().optional().describe('Accepted for Resend compatibility; not supported yet.'),
    },
    endpoint: (a) => `PATCH /domains/${a.id}`,
    validate: (a) => (a.tls === undefined && a.open_tracking === undefined && a.click_tracking === undefined ? 'Nothing to update.' : undefined),
    run: (c, a) => c.domains.update(compact({ id: a.id, tls: a.tls, openTracking: a.open_tracking, clickTracking: a.click_tracking })),
  }),
  tool({
    name: 'verify_domain',
    title: 'Verify domain',
    group: 'Domains',
    description: "Ask Pidgely to check the domain's DNS records now. Call get_domain afterwards to see the per-record status.",
    kind: 'write',
    idempotent: true,
    input: { id: id('Domain') },
    endpoint: (a) => `POST /domains/${a.id}/verify`,
    run: (c, a) => c.domains.verify(a.id),
  }),
  tool({
    name: 'detect_dns_provider',
    title: 'Detect DNS provider',
    group: 'Domains',
    description:
      'Find who hosts the domain\'s DNS and how to set its records up automatically: cloudflare=true means setup_dns_cloudflare can create them with an API token; domain_connect.url is a signed link the user opens to approve them at their provider.',
    kind: 'read',
    input: { id: id('Domain') },
    endpoint: (a) => `GET /domains/${a.id}/dns-provider`,
    run: (c, a) => c.domains.dnsProvider(a.id),
    format: (data) => `${providerSummary(data as DnsProvider)}\n\n${json(data)}`,
  }),
  tool({
    name: 'setup_dns_cloudflare',
    title: 'Set up DNS on Cloudflare',
    group: 'Domains',
    description:
      "Create Pidgely's DNS records in the domain's Cloudflare zone with a Cloudflare API token the user gives you (permissions Zone → DNS → Edit and Zone → Zone → Read). " +
      'Idempotent; never touches unrelated records, merges into an existing SPF record and keeps an existing DMARC policy. ' +
      'The token is write-only: it is used for this one request, never stored, and never shown back. Do not repeat it in your answers.',
    kind: 'write',
    idempotent: true,
    openWorld: true,
    secretArgs: ['api_token'],
    input: {
      id: id('Domain'),
      api_token: z.string().min(20).max(200).describe('Cloudflare API token (write-only, used once).'),
    },
    endpoint: (a) => `POST /domains/${a.id}/dns-provider/cloudflare`,
    run: (c, a) => c.domains.setupCloudflare(a.id, { apiToken: a.api_token }),
    format: (data) => `${setupSummary(data as CloudflareSetup)}\n\n${json(data)}`,
  }),
  tool({
    name: 'delete_domain',
    title: 'Delete domain',
    group: 'Domains',
    description: `${DESTRUCTIVE} Remove a sending domain: emails from it stop being accepted and its DKIM key is discarded (adding it again needs new DNS records).`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: { id: id('Domain') },
    endpoint: (a) => `DELETE /domains/${a.id}`,
    run: (c, a) => c.domains.remove(a.id),
  }),
];
