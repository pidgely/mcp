// Prints the README tool table from the built catalog (run after `npm run build`):
//   node scripts/tools-table.mjs
import { GROUPS, tools } from '../dist/index.js';

const kind = (t) => (t.destructive ? 'destructive' : t.kind === 'read' ? 'read' : t.kind);
const summary = (t) => {
  const d = t.description.replace(/^DESTRUCTIVE, cannot be undone: only call it when the user explicitly asked for it\. /, '');
  const safe = d.replace(/e\.g\./g, 'e\u2024g\u2024');
  const first = (safe.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? safe).replace(/e\u2024g\u2024/g, 'e.g.');
  return first.replace(/\|/g, '\\|');
};
const out = [];
for (const g of GROUPS) {
  const rows = tools.filter((t) => t.group === g);
  out.push(`| **${g}** | | |`);
  for (const t of rows) out.push(`| \`${t.name}\` | ${kind(t)} | ${summary(t)} |`);
}
console.log(['| Tool | Kind | What it does |', '|---|---|---|', ...out].join('\n'));
