import { z } from 'zod';

export const id = (what: string) => z.string().min(1).describe(`${what} id`);

export const recipients = (what: string) =>
  z
    .union([z.string().min(3), z.array(z.string().min(3)).min(1).max(50)])
    .describe(`${what}: one email address or a list (max 50). Plain addresses or "Name <address>".`);

export const pagination = {
  limit: z.number().int().min(1).max(100).optional().describe('Page size, 1-100 (default 20).'),
  after: z.string().optional().describe('Cursor: id of the last item of the previous page (older items).'),
  before: z.string().optional().describe('Cursor: id of the first item of the current page (newer items).'),
};

export const page = (args: { limit?: number; after?: string; before?: string }) =>
  args.before ? { limit: args.limit ?? 20, before: args.before } : { limit: args.limit ?? 20, after: args.after };

export const properties = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .describe('Custom properties, usable in broadcasts as {{{contact.<name>}}}.');

/** Select a contact by id or email (exactly one). */
export const contactSelector = {
  id: z.string().optional().describe('Contact id (or use email).'),
  email: z.email().optional().describe('Contact email (or use id).'),
};
export const validateSelector = (a: { id?: string; email?: string }) =>
  a.id || a.email ? (a.id && a.email ? 'Provide either "id" or "email", not both.' : undefined) : 'Provide the contact "id" or "email".';
export const selector = (a: { id?: string; email?: string }) => (a.id ? { id: a.id } : { email: a.email as string });

export const languageSchema = z.string().min(2).max(20).describe('Language tag, e.g. en, pt-br, es, fr (default en).');

// ---------------------------------------------------------------------------
// Visual builder documents (validated fully by the API; these schemas guide the model)
// ---------------------------------------------------------------------------

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex color like #2563eb');
const FONTS = ['system', 'inter', 'helvetica', 'georgia', 'verdana', 'trebuchet'] as const;
const NETWORKS = ['x', 'linkedin', 'instagram', 'facebook', 'youtube', 'github', 'tiktok', 'discord', 'website'] as const;

export const themeSchema = z
  .looseObject({
    brand_color: hex.optional().describe('Buttons, links and accents.'),
    text_color: hex.optional(),
    background_color: hex.optional().describe('Page background.'),
    content_color: hex.optional().describe('Background of the content card.'),
    link_color: hex.optional(),
    button_text_color: hex.optional().describe('Button label color; omit to pick white or near-black automatically.'),
    font: z.enum(FONTS).optional().describe('E-mail-safe font stack.'),
    heading_font: z.enum(FONTS).optional(),
    web_font: z.string().optional().describe('Google Fonts family where clients support web fonts (font is the fallback).'),
    heading_web_font: z.string().optional(),
    content_width: z.number().int().min(480).max(800).optional(),
    radius: z.number().int().min(0).max(32).optional().describe('Corner radius of buttons and the card.'),
    logo_url: z.url().optional().describe('Absolute https URL of the logo.'),
    logo_dark_url: z.url().optional().describe('Logo for dark mode (Apple Mail, iOS).'),
    logo_width: z.number().int().optional(),
    logo_alt: z.string().optional(),
    logo_align: z.enum(['left', 'center', 'right']).optional(),
  })
  .describe('Global look of a builder e-mail. Colors are hex (#rrggbb).');

export const brandSchema = z
  .looseObject({
    name: z.string().optional().describe('Company name.'),
    website: z.url().optional(),
    address: z.string().optional().describe('Postal address shown in footers.'),
    socials: z.array(z.object({ network: z.enum(NETWORKS), url: z.url() })).optional(),
  })
  .describe('Brand profile used by AI generation for the footer, social links and links.');

export const runSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: z.string().optional().describe('https, http, mailto, tel or a variable tag.'),
});

export const blockSchema = z
  .looseObject({
    id: z.string().optional(),
    type: z.enum(['heading', 'text', 'button', 'image', 'divider', 'spacer', 'columns', 'list', 'quote', 'code', 'social', 'footer']),
    level: z.number().int().min(1).max(3).optional().describe('heading: 1-3.'),
    text: z.string().optional().describe('heading and code text.'),
    runs: z.array(runSchema).optional().describe('text, quote and footer: inline runs.'),
    label: z.string().optional().describe('button label.'),
    href: z.string().optional().describe('button or image link.'),
    src: z.string().optional().describe('image: absolute https URL.'),
    alt: z.string().optional(),
    unsubscribe: z.boolean().optional().describe('footer: add the unsubscribe link ({{{PIDGELY_UNSUBSCRIBE_URL}}}).'),
  })
  .describe(
    'One row of the e-mail. Fields per type: heading (level, text), text/quote (runs), button (label, href, full_width), image (src, alt, href, width), divider (thickness), spacer (height), columns (columns: [{ blocks }], 2-3, not nested), list (ordered, items: runs[][]), code (text), social (links: [{ network, url }]), footer (runs, unsubscribe). Optional style: { align, color, background, font_size, padding }.',
  );

export const documentSchema = z
  .looseObject({
    version: z.literal(1).optional(),
    preview_text: z.string().optional().describe('Hidden inbox preview line.'),
    theme: themeSchema.optional(),
    blocks: z.array(blockSchema).describe('The e-mail, top to bottom. Text is plain strings and runs; never HTML.'),
  })
  .describe(
    'Visual builder document (Scale plan): typed blocks plus a theme. Pidgely renders it to Outlook-safe, responsive, dark-mode-ready HTML. Variable tags like {{{FIRST_NAME|there}}} are kept and filled at send time.',
  );

export const templateVariables = z
  .array(
    z.object({
      key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).describe('Variable name, e.g. NAME.'),
      type: z.enum(['string', 'number']),
      fallback_value: z.union([z.string(), z.number()]).optional(),
    }),
  )
  .describe('Typed variables used as {{{NAME}}} in subject and content.');

export function sdkVariables(vars: z.infer<typeof templateVariables> | undefined) {
  return vars?.map((v) =>
    v.type === 'number'
      ? { key: v.key, type: 'number' as const, fallbackValue: v.fallback_value === undefined ? undefined : Number(v.fallback_value) }
      : { key: v.key, type: 'string' as const, fallbackValue: v.fallback_value === undefined ? undefined : String(v.fallback_value) },
  );
}

/** Drops undefined values (keeps payloads and dry-run previews minimal). */
export function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

export const EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'domain.updated',
  'contact.created',
  'contact.updated',
  'contact.deleted',
] as const;
