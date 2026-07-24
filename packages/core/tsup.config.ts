import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

// Inject the package version at build time so telemetry's sdk_version is the
// single source of truth (package.json) and can't drift from the published
// package. `version.ts` falls back to "0.0.0" when this define is absent (tests).
const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  define: { __SDK_VERSION__: JSON.stringify(pkg.version) },
});
