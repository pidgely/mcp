import type { BrandImport, BuilderDocument, BuilderRender } from 'pidgely';
import { z } from 'zod';
import { json } from '../format';
import {
  blockSchema,
  brandSchema,
  compact,
  documentSchema,
  languageSchema,
  page,
  pagination,
  recipients,
  sdkVariables,
  templateVariables,
  themeSchema,
} from './schemas';
import { DESTRUCTIVE, tool, type ToolDefinition } from './types';

const key = z.string().min(1).describe('Template id or alias.');
const alias = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i).describe('Stable alias, e.g. "welcome".');
const aiVariables = z.array(z.string()).optional().describe('Template variable keys the text may use, e.g. ["FIRST_NAME", "PLAN"].');
const templateId = z.string().optional().describe('Template being edited (recorded with the AI request).');

const contentShape = {
  from: z.string().optional().describe('Default sender, "Name <address@verified-domain>".'),
  subject: z.string().optional().describe('Subject; may use variables.'),
  reply_to: recipients('Reply-To').optional(),
  html: z.string().optional().describe('HTML body (or use builder).'),
  text: z.string().optional().describe('Plain-text body; generated when omitted.'),
  variables: templateVariables.optional(),
};

function renderSummary(r: BuilderRender): string {
  const issues = r.issues.length
    ? r.issues.map((i) => `- [${i.severity}] ${i.code}${i.block_id ? ` (block ${i.block_id})` : ''}: ${i.message}`).join('\n')
    : '- none';
  return `Rendered ${r.html.length} bytes of HTML. Variables: ${r.variables.join(', ') || 'none'}.\nDeliverability issues:\n${issues}`;
}

export const templateTools: ToolDefinition[] = [
  tool({
    name: 'list_templates',
    title: 'List templates',
    group: 'Templates',
    description: 'List email templates with their alias, status (draft/published) and dates.',
    kind: 'read',
    input: pagination,
    endpoint: () => 'GET /templates',
    run: (c, a) => c.templates.list(page(a)),
  }),
  tool({
    name: 'get_template',
    title: 'Get template',
    group: 'Templates',
    description:
      'Get a template draft by id or alias: subject, html, text, variables, has_unpublished_versions and, for visual builder templates, the builder document (null for HTML templates).',
    kind: 'read',
    input: { id: key },
    endpoint: (a) => `GET /templates/${a.id}`,
    run: (c, a) => c.templates.get(a.id),
  }),
  tool({
    name: 'preview_template',
    title: 'Preview template',
    group: 'Templates',
    description:
      'Render a template draft (by id or alias) with variables, without sending anything. Returns the rendered from, subject, html and text, ' +
      'plus missing_variables: variables with neither a value nor a fallback, which would make a send fail.',
    kind: 'read',
    input: {
      id: key,
      variables: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .optional()
        .describe('Values for the template variables, e.g. {"NAME": "Ana"}. Variables not given use their fallback value.'),
    },
    endpoint: (a) => `POST /templates/${a.id}/preview`,
    run: (c, a) => c.templates.preview(a.id, { variables: a.variables }),
  }),
  tool({
    name: 'render_template_html',
    title: 'Render builder document to HTML',
    group: 'Templates',
    description:
      'Render a visual builder document to the exact e-mail HTML and plain text a send would use (variable tags kept) and lint it for deliverability ' +
      '(spam words, all caps, link shorteners, placeholder links, missing unsubscribe…). Saves nothing. Scale plan.',
    kind: 'read',
    input: { document: documentSchema, subject: z.string().optional().describe('Subject, linted with the document.') },
    endpoint: () => 'POST /template-builder/render',
    run: (c, a) => c.templateBuilder.render(compact({ document: a.document as BuilderDocument, subject: a.subject })),
    format: (data) => `${renderSummary(data as BuilderRender)}\n\n${json(data)}`,
  }),
  tool({
    name: 'convert_html_to_builder',
    title: 'Convert HTML to builder document',
    group: 'Templates',
    description:
      'Convert simple e-mail HTML into a visual builder document. Only lossless conversions succeed (convertible=true); otherwise reasons explains what would be lost. Saves nothing. Scale plan.',
    kind: 'read',
    input: { html: z.string().min(1).describe('E-mail HTML.') },
    endpoint: () => 'POST /template-builder/convert',
    run: (c, a) => c.templateBuilder.convert({ html: a.html }),
  }),
  tool({
    name: 'create_template',
    title: 'Create template',
    group: 'Templates',
    description:
      'Create an email template with typed variables used as {{{NAME}}} in subject and content. Give html, or a visual builder document as builder ' +
      '(Scale plan; e.g. from generate_template_with_ai): Pidgely renders the HTML from it. Set publish=true so send_email can use it via template.id (id or alias).',
    kind: 'write',
    input: {
      name: z.string().min(1),
      alias: alias.optional(),
      ...contentShape,
      builder: documentSchema.optional(),
      publish: z.boolean().optional().describe('Publish right after creating (default false).'),
    },
    endpoint: (a) => (a.publish ? 'POST /templates + POST /templates/{id}/publish' : 'POST /templates'),
    validate: (a) => (a.builder && a.html ? 'Use either html or builder, not both.' : undefined),
    run: (c, a) => {
      const created = c.templates.create(
        compact({
          name: a.name,
          alias: a.alias,
          from: a.from,
          subject: a.subject,
          replyTo: a.reply_to,
          html: a.html,
          text: a.text,
          variables: sdkVariables(a.variables),
          builder: a.builder as BuilderDocument | undefined,
        }),
      );
      return a.publish ? created.publish() : created;
    },
  }),
  tool({
    name: 'update_template',
    title: 'Update template',
    group: 'Templates',
    description:
      'Update a template draft by id or alias (sends keep using the published version until publish_template). Pass builder to replace the visual document, ' +
      'builder=null to turn it into an HTML template, or html alone to detach it.',
    kind: 'write',
    idempotent: true,
    input: {
      id: key,
      name: z.string().min(1).optional(),
      alias: alias.optional(),
      ...contentShape,
      builder: documentSchema.nullable().optional(),
    },
    endpoint: (a) => `PATCH /templates/${a.id}`,
    validate: (a) => {
      if (Object.entries(a).every(([k, v]) => k === 'id' || v === undefined)) return 'Nothing to update.';
      return a.builder && a.html ? 'Use either html or builder, not both.' : undefined;
    },
    run: (c, a) =>
      c.templates.update(
        a.id,
        compact({
          name: a.name,
          alias: a.alias,
          from: a.from,
          subject: a.subject,
          replyTo: a.reply_to,
          html: a.html,
          text: a.text,
          variables: sdkVariables(a.variables),
          builder: a.builder as BuilderDocument | null | undefined,
        }),
      ),
  }),
  tool({
    name: 'publish_template',
    title: 'Publish template',
    group: 'Templates',
    description: 'Publish the current draft of a template (id or alias) as a new version. Sends with template.id use the latest published version.',
    kind: 'write',
    input: { id: key },
    endpoint: (a) => `POST /templates/${a.id}/publish`,
    run: (c, a) => c.templates.publish(a.id),
  }),
  tool({
    name: 'duplicate_template',
    title: 'Duplicate template',
    group: 'Templates',
    description: 'Copy a template (id or alias) as a new draft named "<name> (copy)".',
    kind: 'write',
    input: { id: key },
    endpoint: (a) => `POST /templates/${a.id}/duplicate`,
    run: (c, a) => c.templates.duplicate(a.id),
  }),
  tool({
    name: 'delete_template',
    title: 'Delete template',
    group: 'Templates',
    description: `${DESTRUCTIVE} Delete a template (id or alias) and all its versions; sends that reference it will fail.`,
    kind: 'write',
    destructive: true,
    idempotent: true,
    input: { id: key },
    endpoint: (a) => `DELETE /templates/${a.id}`,
    run: (c, a) => c.templates.remove(a.id),
  }),
];

export const aiTools: ToolDefinition[] = [
  tool({
    name: 'get_template_builder_capabilities',
    title: 'Template builder capabilities',
    group: 'AI assist',
    description:
      "Check what the organization can use before builder, AI or brand tools: builder (Scale plan), ai_available, the monthly AI quota (ai.used / ai.remaining), the saved theme and brand, and brand_import. Works on every plan.",
    kind: 'read',
    input: {},
    endpoint: () => 'GET /template-builder',
    run: (c) => c.templateBuilder.capabilities(),
  }),
  tool({
    name: 'generate_template_with_ai',
    title: 'Generate template with AI',
    group: 'AI assist',
    description:
      "Write a complete e-mail from a prompt with Pidgely's AI assist: returns subject, preview_text and a visual builder document styled with the organization's theme and brand " +
      '(import it first with import_brand_from_website). Save it with create_template (builder) and check it with render_template_html. Scale plan; uses the monthly AI quota.',
    kind: 'write',
    input: {
      prompt: z.string().min(1).max(2000).describe('What the e-mail is about, audience, tone, call to action.'),
      language: languageSchema.optional(),
      theme: themeSchema.optional().describe('Override the organization theme for this e-mail.'),
      variables: aiVariables,
      template_id: templateId,
    },
    endpoint: () => 'POST /template-builder/ai/generate',
    run: (c, a) =>
      c.templateBuilder.ai.generate(compact({ prompt: a.prompt, language: a.language, theme: a.theme, variables: a.variables, templateId: a.template_id })),
  }),
  tool({
    name: 'rewrite_block',
    title: 'Rewrite block with AI',
    group: 'AI assist',
    description:
      'Improve, shorten, lengthen, fix or change the tone of one builder block with AI. The block keeps its id, type, style and links; only the words change. Scale plan; uses the AI quota.',
    kind: 'write',
    input: {
      block: blockSchema,
      action: z.enum(['improve', 'shorten', 'lengthen', 'fix', 'tone']),
      tone: z.enum(['friendly', 'professional', 'playful', 'persuasive', 'formal', 'casual', 'empathetic', 'urgent']).optional().describe('Required with action "tone".'),
      language: languageSchema.optional(),
      variables: aiVariables,
      template_id: templateId,
    },
    endpoint: () => 'POST /template-builder/ai/rewrite',
    validate: (a) => (a.action === 'tone' && !a.tone ? 'action "tone" needs a tone.' : undefined),
    run: (c, a) =>
      c.templateBuilder.ai.rewrite(
        compact({ block: a.block as never, action: a.action, tone: a.tone, language: a.language, variables: a.variables, templateId: a.template_id }),
      ),
  }),
  tool({
    name: 'translate_template',
    title: 'Translate template with AI',
    group: 'AI assist',
    description:
      'Translate a builder document (and its subject) to another language with AI; structure, styles, links and variable tags stay. Get the document with get_template, then save the result with update_template or create_template. Scale plan; uses the AI quota.',
    kind: 'write',
    input: {
      document: documentSchema,
      subject: z.string().optional(),
      language: languageSchema,
      variables: aiVariables,
      template_id: templateId,
    },
    endpoint: () => 'POST /template-builder/ai/translate',
    run: (c, a) =>
      c.templateBuilder.ai.translate(
        compact({ document: a.document as BuilderDocument, subject: a.subject, language: a.language, variables: a.variables, templateId: a.template_id }),
      ),
  }),
  tool({
    name: 'suggest_subjects',
    title: 'Suggest subject lines with AI',
    group: 'AI assist',
    description: 'Suggest five subject line and preview text pairs, each with a different angle, for a builder document. Scale plan; uses the AI quota.',
    kind: 'write',
    input: {
      document: documentSchema,
      subject: z.string().optional().describe('Current subject, if any.'),
      language: languageSchema.optional(),
      variables: aiVariables,
      template_id: templateId,
    },
    endpoint: () => 'POST /template-builder/ai/subjects',
    run: (c, a) =>
      c.templateBuilder.ai.subjects(
        compact({ document: a.document as BuilderDocument, subject: a.subject, language: a.language, variables: a.variables, templateId: a.template_id }),
      ),
  }),
];

function brandSummary(b: BrandImport): string {
  const logo = b.logos[0];
  return [
    `Brand of ${b.name || b.url}${b.applied ? ' (applied as the organization theme)' : ' (not saved: call again with apply=true, or update_theme)'}:`,
    `- colors: brand ${b.palette.primary}, text ${b.palette.text}, background ${b.palette.background}, links ${b.palette.link}, button label ${b.palette.button_text}`,
    `- logo: ${logo ? `${logo.url} (${logo.width}x${logo.height}${logo.email_safe ? '' : ', not e-mail safe'})` : 'none found'}`,
    `- fonts: ${b.fonts.map((f) => f.family).join(', ') || 'none found'}`,
    `- socials: ${b.socials.map((s) => s.network).join(', ') || 'none'}; address: ${b.address || 'none'}`,
    ...(b.warnings.length ? [`- warnings: ${b.warnings.join(', ')}`] : []),
  ].join('\n');
}

export const brandTools: ToolDefinition[] = [
  tool({
    name: 'import_brand_from_website',
    title: 'Import brand from website',
    group: 'Brand',
    description:
      "Read a website (e.g. acme.com) and propose the organization's e-mail theme and brand profile: logo, brand colors with readable buttons and links, fonts, company name, social links and postal address. " +
      'With apply=true it becomes the default theme used by the builder and generate_template_with_ai. Without url, the root of the first verified sending domain is used. Scale plan.',
    kind: 'write',
    openWorld: true,
    input: {
      url: z.string().min(3).optional().describe('Website, e.g. acme.com or https://acme.com.'),
      apply: z.boolean().optional().describe('Save it as the organization theme and brand (default false: proposal only).'),
      ai: z.boolean().optional().describe('Let AI pick among the candidates when available (default true; uses the AI quota).'),
      language: languageSchema.optional().describe('Language of the AI rationale.'),
    },
    endpoint: () => 'POST /brand/import',
    run: (c, a) => c.brand.import(compact({ url: a.url, apply: a.apply, ai: a.ai, language: a.language })),
    format: (data) => `${brandSummary(data as BrandImport)}\n\n${json(data)}`,
  }),
  tool({
    name: 'get_theme',
    title: 'Get theme',
    group: 'Brand',
    description: "Get the organization's builder theme (colors, fonts, logo; the default one until saved) and brand profile (name, website, address, socials).",
    kind: 'read',
    input: {},
    endpoint: () => 'GET /template-builder/theme',
    run: (c) => c.templateBuilder.getTheme(),
  }),
  tool({
    name: 'update_theme',
    title: 'Update theme',
    group: 'Brand',
    description: "Save the organization's builder theme and, optionally, its brand profile. New builder e-mails and AI generation use them. Scale plan.",
    kind: 'write',
    idempotent: true,
    input: { theme: themeSchema, brand: brandSchema.optional() },
    endpoint: () => 'PATCH /template-builder/theme',
    run: (c, a) => c.templateBuilder.updateTheme(compact({ theme: a.theme, brand: a.brand })),
  }),
];
