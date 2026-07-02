# Switchbox JavaScript SDKs

Feature flags served from a CDN. Zero dependencies. Sub-millisecond evaluation.

This is the pnpm workspace for the two published JavaScript packages. **The full docs live in each package's README** (the canonical reference — also what npm shows):

| Package | Description | Install | Docs |
|---------|-------------|---------|------|
| [`switchbox-js`](./packages/core) | Core browser SDK | `npm install switchbox-js` | [README](./packages/core/README.md) · [npm](https://www.npmjs.com/package/switchbox-js) |
| [`@switchbox/react`](./packages/react) | React hooks & components | `npm install switchbox-js @switchbox/react` | [README](./packages/react/README.md) · [npm](https://www.npmjs.com/package/@switchbox/react) |

## At a glance

```js
// Vanilla JS — switchbox-js
import { Switchbox } from 'switchbox-js';

const client = await Switchbox.create({ sdkKey: 'your-sdk-key-from-dashboard' });

if (await client.enabled('new_checkout', { user_id: '42' })) {
  showNewCheckout();
}
```

```tsx
// React — @switchbox/react
import { useFlag } from '@switchbox/react';

function Checkout() {
  const showNew = useFlag('new_checkout', { user_id: '42' });
  return showNew ? <NewCheckout /> : <OldCheckout />;
}
```

Switchbox reads flag configs from static JSON on a CDN — served from the edge, never from our API. Rules and rollouts are evaluated locally in the browser. See the [**switchbox-js** README](./packages/core/README.md) for the full API, options, evaluation semantics, and architecture; see the [**@switchbox/react** README](./packages/react/README.md) for the hooks and components.

## Development

```bash
pnpm install       # install workspace deps
pnpm -r build      # build all packages
pnpm test          # vitest at the workspace root
pnpm -r lint       # tsc --noEmit per package
```

Publishing is tag-driven: bump both `package.json` versions, then `git tag v0.x.x && git push --tags` (CI builds, tests, and publishes both packages to npm).

## License

MIT
