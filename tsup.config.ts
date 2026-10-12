import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: { entry: 'src/index.ts', resolve: ['pidgely'] },
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  // The `pidgely` SDK is bundled until it is published on npm; see README "Dependencies".
  noExternal: ['pidgely'],
});
