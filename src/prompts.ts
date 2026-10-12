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
}
