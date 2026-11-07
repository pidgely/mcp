# Pidgely MCP server

An open-source (MIT) [Model Context Protocol](https://modelcontextprotocol.io) server for [Pidgely](https://pidgely.com), an email API with the same send format as Resend. It gives Claude, Cursor, VS Code and other MCP clients 74 tools to send email, add sending domains, set up their DNS, build templates, manage contacts, segments, broadcasts, suppressions, webhooks and API keys.

Pidgely has a [Free plan with 6,000 emails a month](https://pidgely.com/) (no card). Paid plans start at $9 a month. Full docs: [docs.pidgely.com](https://docs.pidgely.com).

## Install

The package is not on npm yet, so build it from source (Node 20 or newer):

```sh
git clone https://github.com/pidgely/mcp.git
cd mcp
npm install && npm run build
```

Create an API key in the [Pidgely dashboard](https://app.pidgely.com) (a `sending_access` key is enough to send), then point your client at `dist/cli.js`. For Claude Code:

```sh
claude mcp add pidgely --env PIDGELY_API_KEY=pdg_your_key -- node /path/to/mcp/dist/cli.js
```

Start safely with `--env PIDGELY_MCP_DRY_RUN=true` (mutating tools only show the request they would make) or `--env PIDGELY_MCP_READ_ONLY=true` (write and send tools are not listed at all).

## Ask it

- "Add the domain mail.acme.com and tell me which DNS records to create."
- "Did the email to ana@example.com yesterday get delivered?"
- "Draft a broadcast to the Pro customers segment, but don't send it."
- "Which addresses bounced this week?"

## Safety

- `to` is required on every sending tool and never guessed.
- A broadcast is a draft first; `send_broadcast` needs `confirm: true`.
- Destructive tools (`delete_*`, `revoke_api_key`, `send_broadcast`) are marked so clients ask before running them.
- Your API key is scrubbed from tool output.

## Links

- Source and full tool list: [github.com/pidgely/mcp](https://github.com/pidgely/mcp)
- Pidgely: [pidgely.com](https://pidgely.com/) · [Pidgely vs Resend](https://pidgely.com/compare/pidgely-vs-resend/)
- Go SDK: [pidgely-go](https://github.com/pidgely/pidgely-go)
