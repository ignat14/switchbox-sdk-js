/**
 * Single source of the SDK name + version for telemetry (MEASUREMENT Phase 1).
 *
 * `__SDK_VERSION__` is injected at build time by tsup's `define` from
 * package.json, so the shipped version can't drift from the published one
 * (mirrors the Python SDK deriving `__version__` from its installed metadata).
 * In tests (vitest runs the raw source, no `define`) the identifier is
 * undeclared; `typeof` on a free identifier is the one safe read, so it falls
 * back to "0.0.0".
 */
declare const __SDK_VERSION__: string | undefined;

export const SDK_NAME = 'switchbox-js';
export const SDK_VERSION: string =
  typeof __SDK_VERSION__ !== 'undefined' ? __SDK_VERSION__ : '0.0.0';
