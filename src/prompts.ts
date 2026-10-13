import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** Registers reusable prompts. */
export function registerPrompts(server: McpServer, options: { readOnly: boolean }): void {
  server.registerPrompt(
    'draft_welcome_email',
    {
      title: 'Draft a welcome email',
      description: 'Draft a welcome email for new users of a product, then (optionally) send a test to one address.',
      argsSchema: {
        product: z.string().describe('Product or company name.'),
        audience: z.string().optional().describe('Who signs up, e.g. "developers on the free plan".'),
        tone: z.string().optional().describe('Tone of voice, e.g. "friendly", "concise".'),
        test_recipient: z.string().optional().describe('Address to send a single test email to.'),
      },
    },
    ({ product, audience, tone, test_recipient }) => {
      const steps = [
        `Write a welcome email for new users of ${product}${audience ? ` (${audience})` : ''}.`,
        `Tone: ${tone || 'warm, clear and concise'}.`,
        'Give a subject line (under 60 characters), a preview line, a short HTML body with one clear call to action, and a plain-text version.',
        'Use {{{FIRST_NAME|there}}} to greet the reader so it also works as a broadcast or template.',
        'Keep the HTML simple and email-client safe: inline styles, no scripts, max width 600px.',
      ];
      if (options.readOnly) {
        steps.push('This server is read-only: show the draft only, do not try to send it.');
      } else if (test_recipient) {
        steps.push(
          `After showing the draft, ask me to confirm, then send ONE test with the send_email tool to ${test_recipient} only. Use list_domains first to pick a verified sender domain.`,
        );
      } else {
        steps.push('Show the draft only. Do not send anything unless I ask; offer to save it as a template with create_template.');
      }
      return { messages: [{ role: 'user', content: { type: 'text', text: steps.join('\n') } }] };
    },
  );

  server.registerPrompt(
    'branded_template_from_website',
    {
      title: 'Create a branded template from a website',
      description:
        'Import the brand from a website, write an e-mail template with AI in that brand, check it, save it and (optionally) send one test. Needs the Scale plan.',
      argsSchema: {
        website: z.string().describe('Company website, e.g. acme.com.'),
        purpose: z.string().describe('What the e-mail is for, e.g. "welcome new users and invite them to create their first project".'),
        language: z.string().optional().describe('Language tag, e.g. en, pt-br, es (default en).'),
        test_recipient: z.string().optional().describe('Address to send a single test email to.'),
      },
    },
    ({ website, purpose, language, test_recipient }) => {
      const steps = [
        'Call get_template_builder_capabilities. If builder is false, explain that the visual builder and AI assist need the Scale plan and stop.',
      ];
      if (options.readOnly) {
        steps.push(
          `This server is read-only: describe the plan (import the brand of ${website}, generate a "${purpose}" e-mail, save it as a template) without calling tools that change anything.`,
        );
      } else {
        steps.push(
          `Call import_brand_from_website with url "${website}" and apply=true, then summarise the logo, colors and fonts it found.`,
          `Call generate_template_with_ai with the prompt "${purpose}"${language ? ` and language "${language}"` : ''}.`,
          'Call render_template_html with the document and subject; fix any error-level issues (rewrite_block can help) and mention the warnings.',
          'Call create_template with a short name, an alias, the subject and the document as builder, with publish=true.',
        );
        if (test_recipient) {
          steps.push(
            `Show me the subject and a summary, ask me to confirm, then send ONE test with the send_email tool to ${test_recipient} only, using template.id = the alias and a verified sender domain from list_domains. Pass PIDGELY_UNSUBSCRIBE_URL as a template variable if the footer has an unsubscribe link.`,
          );
        } else {
          steps.push('Do not send anything unless I ask.');
        }
      }
      return { messages: [{ role: 'user', content: { type: 'text', text: steps.join('\n') } }] };
    },
  );
}
