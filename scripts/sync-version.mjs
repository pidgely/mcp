// Writes package.json's version into src/version.ts (run by `npm version`).
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const file = new URL('../src/version.ts', import.meta.url);
const src = readFileSync(file, 'utf8').replace(/VERSION = '[^']*'/, `VERSION = '${version}'`);
writeFileSync(file, src);
