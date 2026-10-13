<p align="center">
  <a href="https://pidgely.com"><img src=".github/assets/banner.png" alt="Pidgely — Email API for developers" width="100%"></a>
</p>

<p align="center">
  <a href="https://github.com/pidgely/mcp/actions/workflows/ci.yml"><img src="https://github.com/pidgely/mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@pidgely/mcp"><img src="https://img.shields.io/npm/v/@pidgely/mcp?color=E2793F" alt="npm"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white" alt="Node ≥ 20">
  <img src="https://img.shields.io/badge/MCP-stdio%20%7C%20Streamable%20HTTP-6E56CF" alt="MCP">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
</p>

# @pidgely/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Pidgely](https://pidgely.com), the Resend-compatible email API. It lets Claude, Cursor, VS Code and other MCP clients send email, add domains and configure their DNS automatically, design templates with the visual builder and AI in your brand (imported from your website), and manage contacts, segments, broadcasts, suppressions, webhooks, API keys and usage.

- **74 tools**, one per useful API operation, with precise JSON schemas, built on the official [`pidgely`](https://github.com/pidgely/pidgely-node) SDK and the official MCP TypeScript SDK.
- **Safe by default.** Sending tools require an explicit `to`, broadcasts need `confirm: true`, and every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). A **dry-run** mode and a **read-only** mode are available. The API key is never echoed back to the model, and credentials you pass (Cloudflare tokens) are write-only.
- **Runs locally over stdio** (`npx`), or as a **Streamable HTTP** server.

## Quick start

1. Create an API key in the [Pidgely dashboard](https://app.pidgely.com). A `sending_access` key is enough for sending only. Use `full_access` to manage domains, contacts and so on.
2. Add the server to your client using one of the configurations below.
3. Ask: *"Check which of my domains are verified, then send a test email from hello@acme.com to me@acme.com."* or *"Create a welcome template with my brand from acme.com and send me a test."*

### Claude Code

```sh
claude mcp add pidgely --env PIDGELY_API_KEY=pdg_your_key -- npx -y @pidgely/mcp
```

To start safely, add `--env PIDGELY_MCP_DRY_RUN=true` or `--env PIDGELY_MCP_READ_ONLY=true`. Use `--scope user` to make the server available in every project.

### Claude Desktop

Edit `claude_desktop_config.json` (*Settings → Developer → Edit Config*):

```json
{
  "mcpServers": {
    "pidgely": {
      "command": "npx",
      "args": ["-y", "@pidgely/mcp"],
      "env": {
        "PIDGELY_API_KEY": "pdg_your_key",
        "PIDGELY_MCP_DEFAULT_FROM": "Acme <hello@acme.com>"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "pidgely": {
      "command": "npx",
      "args": ["-y", "@pidgely/mcp"],
      "env": { "PIDGELY_API_KEY": "pdg_your_key" }
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json`. VS Code prompts for the key once and stores it securely:

```json
{
  "inputs": [
    { "type": "promptString", "id": "pidgely-key", "description": "Pidgely API key", "password": true }
  ],
  "servers": {
    "pidgely": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@pidgely/mcp"],
      "env": { "PIDGELY_API_KEY": "${input:pidgely-key}" }
    }
  }
}
```

### Other clients

Any MCP client that can launch a stdio server can use `npx -y @pidgely/mcp` with `PIDGELY_API_KEY` set in its environment. For remote or shared setups, see [Streamable HTTP](#streamable-http).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PIDGELY_API_KEY` | (required) | Your `pdg_…` API key. |
| `PIDGELY_BASE_URL` | `https://api.pidgely.com` | API base URL (self-hosted or staging). |
| `PIDGELY_MCP_READ_ONLY` | `false` | `true` registers only read tools. Mutating tools are not even listed. |
| `PIDGELY_MCP_DRY_RUN` | `false` | `true` makes mutating tools return the request they *would* make (method, path, payload) without calling the API. Read tools still work. |
| `PIDGELY_MCP_DEFAULT_FROM` | (none) | Sender used when a tool call omits `from`, e.g. `Acme <hello@acme.com>`. |
| `PIDGELY_MCP_TRANSPORT` | `stdio` | `stdio` or `http`. |
| `PORT` | `3333` | HTTP port. |
| `PIDGELY_MCP_HOST` | `127.0.0.1` | HTTP bind address. |
| `PIDGELY_MCP_HTTP_TOKEN` | (none) | Bearer token that HTTP clients must send. Required when binding to a non-loopback address. |

CLI flags override the environment: `--http`, `--port <n>`, `--host <addr>`, `--read-only`, `--dry-run`, `--help`, `--version`.

## Tools

| Tool | Kind | What it does |
|---|---|---|
| **Emails** | | |
| `send_email` | send | Send one email through Pidgely to the explicit recipients in "to" (never guess recipients). |
| `send_batch` | send | Send up to 100 different emails in one request. |
| `get_email` | read | Retrieve a sent or scheduled email by id, including its last_event (queued, sent, delivered, bounced, complained, failed, canceled…), recipients, subject and bodies. |
| `list_emails` | read | List recently sent emails, newest first, with their last_event. |
| `list_email_attachments` | read | List the attachments of a sent email (filename, size, content type). |
| `get_email_attachment` | read | Get one attachment of a sent email, with a signed download_url valid for 1 hour. |
| `reschedule_email` | write | Change when a scheduled email (not sent yet) goes out. |
| `cancel_email` | write | Cancel an email that was scheduled with scheduled_at and has not been sent yet. |
| **Domains** | | |
| `list_domains` | read | List sending domains with their verification status (not_started, pending, verified, failed, temporary_failure). |
| `get_domain` | read | Get a domain with the DNS records to publish (DKIM TXT, return-path MX and SPF TXT, DMARC) and the verification status of each record. |
| `create_domain` | write | Add a sending domain (e.g. "acme.com" or "mail.acme.com"). |
| `update_domain` | write | Change a domain's delivery settings: tls "enforced" never sends in clear text (mail to servers without TLS fails); "opportunistic" is the default. |
| `verify_domain` | write | Ask Pidgely to check the domain's DNS records now. |
| `detect_dns_provider` | read | Find who hosts the domain's DNS and how to set its records up automatically: cloudflare=true means setup_dns_cloudflare can create them with an API token; domain_connect.url is a signed link the user opens to approve them at their provider. |
| `setup_dns_cloudflare` | write | Create Pidgely's DNS records in the domain's Cloudflare zone with a Cloudflare API token the user gives you (permissions Zone → DNS → Edit and Zone → Zone → Read). |
| `delete_domain` | destructive | Remove a sending domain: emails from it stop being accepted and its DKIM key is discarded (adding it again needs new DNS records). |
| **Templates** | | |
| `list_templates` | read | List email templates with their alias, status (draft/published) and dates. |
| `get_template` | read | Get a template draft by id or alias: subject, html, text, variables, has_unpublished_versions and, for visual builder templates, the builder document (null for HTML templates). |
| `preview_template` | read | Render a template draft (by id or alias) with variables, without sending anything. |
| `render_template_html` | read | Render a visual builder document to the exact e-mail HTML and plain text a send would use (variable tags kept) and lint it for deliverability (spam words, all caps, link shorteners, placeholder links, missing unsubscribe…). |
| `convert_html_to_builder` | read | Convert simple e-mail HTML into a visual builder document. |
| `create_template` | write | Create an email template with typed variables used as {{{NAME}}} in subject and content. |
| `update_template` | write | Update a template draft by id or alias (sends keep using the published version until publish_template). |
| `publish_template` | write | Publish the current draft of a template (id or alias) as a new version. |
| `duplicate_template` | write | Copy a template (id or alias) as a new draft named "<name> (copy)". |
| `delete_template` | destructive | Delete a template (id or alias) and all its versions; sends that reference it will fail. |
| **AI assist** | | |
| `get_template_builder_capabilities` | read | Check what the organization can use before builder, AI or brand tools: builder (Scale plan), ai_available, the monthly AI quota (ai.used / ai.remaining), the saved theme and brand, and brand_import. |
| `generate_template_with_ai` | write | Write a complete e-mail from a prompt with Pidgely's AI assist: returns subject, preview_text and a visual builder document styled with the organization's theme and brand (import it first with import_brand_from_website). |
| `rewrite_block` | write | Improve, shorten, lengthen, fix or change the tone of one builder block with AI. |
| `translate_template` | write | Translate a builder document (and its subject) to another language with AI; structure, styles, links and variable tags stay. |
| `suggest_subjects` | write | Suggest five subject line and preview text pairs, each with a different angle, for a builder document. |
| **Brand** | | |
| `import_brand_from_website` | write | Read a website (e.g. acme.com) and propose the organization's e-mail theme and brand profile: logo, brand colors with readable buttons and links, fonts, company name, social links and postal address. |
| `get_theme` | read | Get the organization's builder theme (colors, fonts, logo; the default one until saved) and brand profile (name, website, address, socials). |
| `update_theme` | write | Save the organization's builder theme and, optionally, its brand profile. |
| **Contacts** | | |
| `list_contacts` | read | List contacts, optionally only those in one segment. |
| `get_contact` | read | Get a contact by id or email, with its properties and unsubscribed state. |
| `create_contact` | write | Create a contact (or update it if the email exists), with optional custom properties and segment membership. |
| `batch_create_contacts` | write | Create or update up to 1,000 contacts in one request (matched by email), optionally adding all of them to a segment. |
| `update_contact` | write | Update a contact selected by id or email. |
| `delete_contact` | destructive | Delete a contact (by id or email) with its properties and segment memberships. |
| `list_contact_segments` | read | List the segments a contact (by id or email) belongs to. |
| `add_contact_to_segment` | write | Add a contact (by id or email) to a segment. |
| `remove_contact_from_segment` | write | Remove a contact (by id or email) from a segment. |
| **Segments** | | |
| `list_segments` | read | List contact segments (audiences). |
| `get_segment` | read | Get a segment by id, with its name and creation date. |
| `list_segment_contacts` | read | List the contacts in a segment. |
| `create_segment` | write | Create a segment: a named group of contacts that broadcasts are sent to. |
| `update_segment` | write | Rename a segment; its contacts and broadcasts are unchanged. |
| `delete_segment` | destructive | Delete a segment. |
| **Broadcasts** | | |
| `list_broadcasts` | read | List broadcasts, newest first, with their status (draft, scheduled, queued, sending, sent, canceled, failed). |
| `get_broadcast` | read | Get a broadcast with its status, content, recipients count and delivery stats. |
| `create_broadcast` | write | Create a broadcast draft to a segment. |
| `update_broadcast` | write | Change a broadcast draft (segment, sender, subject, content, name, preview text). |
| `send_broadcast` | destructive | Send a broadcast draft to every contact in its segment, now or at scheduled_at. |
| `cancel_broadcast` | write | Cancel a scheduled or queued broadcast before it finishes sending. |
| `duplicate_broadcast` | write | Copy a broadcast as a new draft with the same content and no schedule. |
| `delete_broadcast` | destructive | Delete a broadcast (draft, sent, canceled or failed). |
| **Suppressions** | | |
| `list_suppressions` | read | List suppressed addresses (never emailed), optionally by origin: bounce, complaint, manual or unsubscribe. |
| `get_suppression` | read | Check whether an address is suppressed, and why (origin) and since when. |
| `add_suppression` | write | Add an address to the suppression list so Pidgely never emails it again (until removed). |
| `batch_add_suppressions` | write | Suppress up to 100 addresses in one request. |
| `remove_suppression` | write | Allow sending to an address again. |
| `batch_remove_suppressions` | write | Allow sending again to up to 100 addresses, by email and/or suppression id. |
| **Webhooks** | | |
| `list_webhooks` | read | List webhook endpoints with their subscribed events and status. |
| `get_webhook` | read | Get a webhook endpoint with its events and status (the signing secret is not returned). |
| `create_webhook` | write | Register an https endpoint for delivery events. |
| `update_webhook` | write | Change a webhook's endpoint or events, or disable/enable it (status). |
| `rotate_webhook_secret` | write | Replace a webhook's signing secret. |
| `delete_webhook` | destructive | Delete a webhook endpoint; queued deliveries to it are dropped. |
| **API keys** | | |
| `list_api_keys` | read | List API keys (name, permission, created and last used). |
| `create_api_key` | write | Create an API key. |
| `rename_api_key` | write | Rename an API key (permissions cannot be changed: create a new key instead). |
| `revoke_api_key` | destructive | Revoke an API key: every request with it fails from now on. |
| **Usage** | | |
| `get_usage` | read | Today's sending counters (accepted, delivered, bounced, complained), the daily quota and the account status. |

**Kinds:** *read* tools only fetch data and are the only ones listed in read-only mode. *write* tools change your account (AI tools also use the monthly AI quota). *send* tools e-mail people. *destructive* tools delete or revoke something, or send a broadcast, and cannot be undone: their descriptions start with `DESTRUCTIVE` and they carry `destructiveHint: true`, so clients ask before running them. Reads are `readOnlyHint` and `idempotentHint`; tools that reach beyond Pidgely (sending, fetching your website, writing Cloudflare DNS) are `openWorldHint`.

The table is generated from the catalog with `npm run build && node scripts/tools-table.mjs`; a test keeps it in sync.

The builder, AI and brand tools need the Scale plan (the API answers `403 plan_required` otherwise). Builder documents are the JSON format of `builder` in the [Templates API](https://docs.pidgely.com/guides/templates/#visual-builder-and-ai-assist): typed `blocks` plus a `theme`.

**Prompts:**

- `draft_welcome_email` (arguments: `product`, `audience`, `tone`, `test_recipient`) drafts a welcome email. It sends a single test only to the address you give, and only after you confirm.
- `branded_template_from_website` (arguments: `website`, `purpose`, `language`, `test_recipient`) imports your brand, writes the template with AI, checks and saves it, and sends one test after you confirm.

### Example requests

- *"Create a welcome template with my brand from acme.com and send me a test at me@acme.com."*
- *"Add the domain mail.acme.com and set up its DNS on Cloudflare."* (paste a token when asked; it is used once and never shown back)
- *"Translate the welcome template to Portuguese and suggest five subject lines."*
- *"Create a sending-only API key for the billing service, restricted to acme.com."*
- *"Add the domain mail.acme.com and tell me which DNS records to create."*
- *"Did the email to ana@example.com yesterday get delivered?"*
- *"Create a template called welcome with a NAME variable and publish it, then send it to ana@example.com with NAME=Ana."*
- *"Draft a broadcast to the 'Pro customers' segment announcing our new API, but don't send it."*
- *"Which addresses bounced this week? Suppress bob@example.com."*

## Safety

- **No guessed recipients.** `to` is required on every sending tool and is never filled in for the model. The server instructions also tell the model to email only addresses the user provided.
- **Broadcasts are two-step.** `create_broadcast` always makes a draft. `send_broadcast` requires `confirm: true`.
- **Dry run** (`PIDGELY_MCP_DRY_RUN=true`) is useful for trying a client or a prompt: nothing is sent or changed.
- **Read only** (`PIDGELY_MCP_READ_ONLY=true`) removes every tool that writes or sends. Pair it with a restricted key for analytics-style use.
- **Destructive tools are marked.** `delete_*`, `revoke_api_key` and `send_broadcast` say so in their description and carry `destructiveHint`, so clients confirm them.
- **Secrets.** Tool output is scrubbed of your API key and of anything shaped like a Pidgely key (`pdg_…`), except the new key `create_api_key` returns once. Write-only arguments (the Cloudflare token of `setup_dns_cloudflare`) are never echoed: not in results, errors or dry-run previews. The CLI logs only to stderr.
- **Least privilege.** Prefer a `sending_access` key restricted to one domain when you only need to send.

## Streamable HTTP

```sh
PIDGELY_API_KEY=pdg_your_key npx -y @pidgely/mcp --http --port 3333
# → http://127.0.0.1:3333/mcp   (health check: /healthz)
```

The server is stateless: each POST to `/mcp` gets a fresh MCP server, so it scales horizontally behind a load balancer. By default it binds to loopback and rejects requests whose `Host` header is not a loopback name, which protects against DNS rebinding. To expose it on a network, set a token:

```sh
PIDGELY_MCP_HTTP_TOKEN=$(openssl rand -hex 32) PIDGELY_API_KEY=pdg_… npx -y @pidgely/mcp --http --host 0.0.0.0
```

Clients must then send `Authorization: Bearer <token>`. Put TLS in front of it with a reverse proxy. All callers share the server's API key, so treat the token like that key.

## Programmatic use

```ts
import { createServer, loadConfig } from '@pidgely/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const parsed = loadConfig([], process.env);
if (parsed.action === 'run') {
  await createServer({ config: parsed.config }).connect(new StdioServerTransport());
}
```

`createServer` also accepts a custom `client` (any object with the `pidgely` SDK's shape) and a custom `tools` list.

## Development

```sh
npm install
npm run typecheck && npm run lint
npm test              # vitest: tool registration, schemas, validation, dry-run, redaction, HTTP transport
npm run build && npm run test:dist   # stdio end-to-end smoke test of dist/cli.js
npm run inspect       # open the MCP Inspector against the local build
```

### Dependencies

The server is built on the [`pidgely`](https://github.com/pidgely/pidgely-node) SDK. Until that SDK is published to npm, it is a dev dependency pinned to a commit of `github:pidgely/pidgely-node`, and `tsup` **bundles** it into `dist/`. The published `@pidgely/mcp` therefore depends only on `@modelcontextprotocol/sdk` and `zod`, and `npx -y @pidgely/mcp` works without `pidgely` being on npm. Once `pidgely` is published, it will move to a regular `"pidgely": "^0.1.0"` dependency and the `noExternal` bundling in `tsup.config.ts` will be dropped.

### Publishing

Releases are published by [`release.yml`](.github/workflows/release.yml) with npm provenance when a `v*` tag is pushed:

1. One-time setup: create the npm organisation **`pidgely`** (so the `@pidgely` scope exists). Create a granular access token with read and write access to `@pidgely/mcp` (or the whole scope) and save it as the repository secret **`NPM_TOKEN`**.
2. Update `CHANGELOG.md`, run `npm version <patch|minor|major>`, then `git push --follow-tags`.

## Links

- Documentation: https://docs.pidgely.com
- Node.js SDK: https://github.com/pidgely/pidgely-node
- Security: see [SECURITY.md](https://github.com/pidgely/.github/blob/main/SECURITY.md)

## License

[MIT](LICENSE) © Caotec Serviços em Tecnologia Ltda
