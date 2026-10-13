import { apiKeyTools, suppressionTools, usageTools, webhookTools } from './catalog/account';
import { broadcastTools, contactTools, segmentTools } from './catalog/audience';
import { domainTools } from './catalog/domains';
import { emailTools } from './catalog/emails';
import { aiTools, brandTools, templateTools } from './catalog/templates';
import type { ToolDefinition } from './catalog/types';

export type { PidgelyClient, ToolDefinition, ToolGroup, ToolKind } from './catalog/types';
export { GROUPS } from './catalog/types';

/** Every Pidgely tool, grouped (emails, domains, templates, AI, brand, contacts, segments, broadcasts, suppressions, webhooks, API keys, usage). */
export const tools: ToolDefinition[] = [
  ...emailTools,
  ...domainTools,
  ...templateTools,
  ...aiTools,
  ...brandTools,
  ...contactTools,
  ...segmentTools,
  ...broadcastTools,
  ...suppressionTools,
  ...webhookTools,
  ...apiKeyTools,
  ...usageTools,
];
