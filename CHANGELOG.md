# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `preview_template` (read): renders a template draft with variables without sending anything and reports `missing_variables`.
- `batch_create_contacts` (write): creates or updates up to 1,000 contacts in one call, optionally adding them to a segment; invalid rows are reported with their index.

- Full API coverage: 74 tools in 12 groups. New: `list_email_attachments`, `get_email_attachment`, `reschedule_email`; `update_domain`, `delete_domain`, `detect_dns_provider`, `setup_dns_cloudflare`; `get_template`, `update_template`, `publish_template`, `duplicate_template`, `delete_template`, `render_template_html`, `convert_html_to_builder`; AI assist `get_template_builder_capabilities`, `generate_template_with_ai`, `rewrite_block`, `translate_template`, `suggest_subjects`; brand `import_brand_from_website`, `get_theme`, `update_theme`; `get_contact`, `delete_contact`, `list_contact_segments`, `add_contact_to_segment`, `remove_contact_from_segment`; `get_segment`, `list_segment_contacts`, `create_segment`, `update_segment`, `delete_segment`; `list_broadcasts`, `get_broadcast`, `update_broadcast`, `cancel_broadcast`, `duplicate_broadcast`, `delete_broadcast`; `get_suppression`, `batch_add_suppressions`, `remove_suppression`, `batch_remove_suppressions`; `get_webhook`, `update_webhook`, `rotate_webhook_secret`, `delete_webhook`; `list_api_keys`, `create_api_key`, `rename_api_key`, `revoke_api_key`; `get_usage`.
- `create_template` accepts a visual builder document (`builder`) and `reply_to`.
- `branded_template_from_website` prompt.
- MCP annotations per tool: `destructiveHint` for deletions, key revocation and `send_broadcast` (whose descriptions start with `DESTRUCTIVE`), `idempotentHint` and `openWorldHint` where they apply.

### Changed

- The bundled `pidgely` SDK is pinned to a commit that includes the template builder, AI assist, brand import, DNS setup and usage methods.
- Write-only arguments (Cloudflare tokens) are masked in dry-run previews and removed from any output; `create_api_key` shows the new key once.
- Tools are organized in `src/catalog/` by group.

## [0.1.0] - 2026-10-12

### Added

- First release of the Pidgely MCP server, built on the official `pidgely` SDK (bundled for now) and `@modelcontextprotocol/sdk`.
- 21 tools: `send_email`, `send_batch`, `get_email`, `list_emails`, `cancel_email`, `list_domains`, `get_domain`, `create_domain`, `verify_domain`, `list_contacts`, `create_contact`, `update_contact`, `list_segments`, `create_broadcast`, `send_broadcast`, `list_templates`, `create_template`, `list_suppressions`, `add_suppression`, `list_webhooks` and `create_webhook`.
- `draft_welcome_email` prompt.
- Safety features: explicit `to` on sending tools, `confirm: true` for `send_broadcast`, `PIDGELY_MCP_DRY_RUN`, `PIDGELY_MCP_READ_ONLY`, and API key redaction in tool output.
- stdio transport (default) and stateless Streamable HTTP transport (`--http`). HTTP mode protects against DNS rebinding and supports bearer-token auth.

[Unreleased]: https://github.com/pidgely/mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/pidgely/mcp/releases/tag/v0.1.0
