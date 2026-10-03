# AGENTS.md

Guidance for contributors and coding agents working in this repository.

## Repository layout

This is a pnpm workspace containing three published packages:

- `packages/core` publishes `switchbox-js`. It owns config fetching, caching, evaluation, rollout hashing, and telemetry.
- `packages/react` publishes `@switchbox/react`. It is a thin React adapter over `switchbox-js` and must not duplicate evaluation or networking logic.
- `packages/openfeature` publishes `@switchbox/openfeature`. It translates between OpenFeature and `switchbox-js`; evaluation remains in the core package.
- Package source is under `packages/*/src`, tests under `packages/*/tests`, and shared TypeScript settings are in `tsconfig.base.json`.
- `vitest.config.ts` aliases `switchbox-js` to the core source so adapter tests do not accidentally exercise stale build output.

The package READMEs are the canonical public documentation and are also published to npm. Keep them aligned with public API or behavior changes.

## Install, build, test, and formatting

CI uses Node.js 24 and pnpm 9. From the repository root, run:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
```

`pnpm build` and `pnpm lint` recurse through all workspace packages. Linting is strict TypeScript checking with `tsc --noEmit`; tests run from the root with Vitest in jsdom. Before handing off a change, run build, lint, and the full test suite when practical.

There is no formatter script or formatter configuration in this repository. Match the existing TypeScript and Markdown style, and do not introduce a formatter as an unrelated change.

## Runtime and package boundaries

- Keep `switchbox-js` at zero runtime dependencies. Its `dependencies` field is empty by design; use browser APIs such as `fetch` and Web Crypto rather than adding a runtime package.
- React, OpenFeature, and `switchbox-js` remain peer dependencies where declared. Keep peer packages external in the adapter `tsup.config.ts` files so they are not bundled.
- Preserve browser compatibility and the async evaluation API: rollout hashing uses `crypto.subtle.digest`.
- Keep public exports routed through each package's `src/index.ts`. Builds emit ESM, CommonJS, declarations, and source maps to `dist`; do not commit generated `dist` output.

## Evaluator invariants

- Keep `packages/core/src/evaluator.ts` pure: no logging, I/O, fetching, cache access, or telemetry side effects. Report contained failures only through the optional `onError` callback.
- Evaluation must never throw to callers. Malformed config or hashing failures fall back to the flag's `default_value`.
- Preserve cross-SDK behavior for rule coercion, DNF rule groups, missing attributes, `user_id`/`id` resolution, rollout hashing, omitted-field defaults, and legacy flat rules.
- Exercise parity vectors through the real `normalizeConfig` parse path. Do not recreate evaluator logic in the React or OpenFeature packages.
- Changes to evaluation, parsing, hashing, or CDN JSON handling require corresponding contract/parity coverage, not only isolated unit tests.

## Shared fixtures

These JSON files encode cross-SDK contracts and should change only as part of an intentional contract update:

- `packages/core/tests/fixtures/cdn-json/`
- `packages/core/tests/fixtures/parity/parity_vectors.json`
- `packages/core/tests/fixtures/telemetry/value_reprs.json`

`.github/workflows/test.yml` compares the CDN JSON and parity files byte-for-byte with their public `switchbox-sdk-python` copies. Keep those public copies aligned when a shared contract changes. The telemetry fixture is not part of that drift job, but `telemetry.test.ts` and `telemetry.ts` identify it as a cross-SDK value-representation contract. Do not rewrite fixtures merely to make a local implementation pass; update the affected implementation, tests, and public contract copies together.

## Release-sensitive files

- Releases are tag-driven by `.github/workflows/publish.yml`; ordinary changes must not create or push release tags.
- Keep the versions in all three `packages/*/package.json` files synchronized for a release. The core version is injected by `packages/core/tsup.config.ts` into telemetry, so package metadata is the source of truth.
- Preserve the publish order in `.github/workflows/publish.yml`: `switchbox-js`, then `@switchbox/react`, then `@switchbox/openfeature`. The adapter manifests declare `switchbox-js` as a peer dependency.
- Review package `exports`, `files`, peer dependency ranges, and all `tsup.config.ts` external lists when changing package boundaries or public entry points.
- Update `pnpm-lock.yaml` whenever dependency metadata changes.
- Treat package READMEs, shared fixtures, `.github/workflows/test.yml`, and `.github/workflows/publish.yml` as behavior- or release-sensitive; update them deliberately when their associated contract changes.

Do not include credentials, private operational links, or internal-only process material in source, tests, documentation, or fixtures.
