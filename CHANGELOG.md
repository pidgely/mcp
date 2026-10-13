# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `preview_template` (read): renders a template draft with variables without sending anything and reports `missing_variables`.
- `batch_create_contacts` (write): creates or updates up to 1,000 contacts in one call, optionally adding them to a segment; invalid rows are reported with their index.

### Changed

- The bundled `pidgely` SDK is pinned to a commit that includes `templates.preview` and `contacts.batch`.

## [0.1.0] - 2026-10-12

### Added

- First release of the Pidgely MCP server, built on the official `pidgely` SDK (bundled for now) and `@modelcontextprotocol/sdk`.
- 21 tools: `send_email`, `send_batch`, `get_email`, `list_emails`, `cancel_email`, `list_domains`, `get_domain`, `create_domain`, `verify_domain`, `list_contacts`, `create_contact`, `update_contact`, `list_segments`, `create_broadcast`, `send_broadcast`, `list_templates`, `create_template`, `list_suppressions`, `add_suppression`, `list_webhooks` and `create_webhook`.
- `draft_welcome_email` prompt.
- Safety features: explicit `to` on sending tools, `confirm: true` for `send_broadcast`, `PIDGELY_MCP_DRY_RUN`, `PIDGELY_MCP_READ_ONLY`, and API key redaction in tool output.
- stdio transport (default) and stateless Streamable HTTP transport (`--http`). HTTP mode protects against DNS rebinding and supports bearer-token auth.

[Unreleased]: https://github.com/pidgely/mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/pidgely/mcp/releases/tag/v0.1.0
