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

A [Model Context Protocol](https://modelcontextprotocol.io) server for [Pidgely](https://pidgely.com), the Resend-compatible email API. It lets Claude, Cursor, VS Code and other MCP clients send email, set up sending domains, and manage contacts, broadcasts, templates, suppressions and webhooks.

- **23 tools** with precise JSON schemas, built on the official [`pidgely`](https://github.com/pidgely/pidgely-node) SDK and the official MCP TypeScript SDK.
- **Safe by default.** Sending tools require an explicit `to`, and broadcasts need `confirm: true`. A **dry-run** mode and a **read-only** mode are available. The API key is never echoed back to the model.
- **Runs locally over stdio** (`npx`), or as a **Streamable HTTP** server.

## Quick start

1. Create an API key in the [Pidgely dashboard](https://app.pidgely.com). A `sending_access` key is enough for sending only. Use `full_access` to manage domains, contacts and so on.
2. Add the server to your client using one of the configurations below.
3. Ask: *"Check which of my domains are verified, then send a test email from hello@acme.com to me@acme.com."*

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
| `send_email` | send | Send one email (html/text or a published template, cc/bcc, reply_to, tags, attachments by URL or base64, `scheduled_at`, `idempotency_key`). |
| `send_batch` | send | Send up to 100 different emails, `strict` or `permissive` validation. |
| `get_email` | read | Email details and `last_event` (delivered, bounced, …). |
| `list_emails` | read | Recent emails, cursor-paginated. |
| `cancel_email` | write | Cancel a scheduled email. |
| `list_domains` | read | Domains and their verification status. |
| `get_domain` | read | A domain plus the **DNS records to publish**, shown as a readable list and as JSON. |
| `create_domain` | write | Add a domain. Returns its DNS records. |
| `verify_domain` | write | Re-check DNS now. |
| `list_contacts` | read | Contacts, optionally by segment. |
| `create_contact` | write | Create or update a contact with properties and segments. |
| `batch_create_contacts` | write | Create or update up to 1,000 contacts in one call, optionally into a segment. Invalid rows are reported by index. |
| `update_contact` | write | Update by id or email. `unsubscribed` syncs the suppression list. |
| `list_segments` | read | Contact segments. |
| `create_broadcast` | write | Create a broadcast **draft** for a segment. |
| `send_broadcast` | send | Send or schedule a draft. Requires `confirm: true`. |
| `list_templates` | read | Templates and their status. |
| `preview_template` | read | Render a template draft with variables (nothing is sent) and list `missing_variables`. |
| `create_template` | write | Create a template with typed variables, optionally publishing it. |
| `list_suppressions` | read | Suppressed addresses by origin. |
| `add_suppression` | write | Never email an address again. |
| `list_webhooks` | read | Webhook endpoints. |
| `create_webhook` | write | Register an https endpoint. Returns its `whsec_…` signing secret. |

Each tool carries MCP annotations (`readOnlyHint`, `openWorldHint` for tools that email people), so clients can auto-approve reads and ask before sends.

**Prompt:** `draft_welcome_email` (arguments: `product`, `audience`, `tone`, `test_recipient`) drafts a welcome email. It sends a single test only to the address you give, and only after you confirm.

### Example requests

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
- **Secrets.** Tool output is scrubbed of your API key and of anything shaped like a Pidgely key (`pdg_…`). The CLI logs only to stderr.
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
