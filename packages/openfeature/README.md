# @switchbox/openfeature

[OpenFeature](https://openfeature.dev) web provider for [Switchbox](https://switchbox.dev) feature flags.

[![npm](https://img.shields.io/npm/v/@switchbox/openfeature)](https://www.npmjs.com/package/@switchbox/openfeature)
[![License](https://img.shields.io/npm/l/@switchbox/openfeature)](https://github.com/ignat14/switchbox-sdk-js/blob/main/LICENSE)

## What is this?

A thin provider that plugs Switchbox into the vendor-neutral [OpenFeature](https://openfeature.dev) API. Your app codes against OpenFeature; Switchbox is one constructor line. Swap vendors by swapping the provider, not your call sites. That is the point: no lock-in.

The provider contains zero evaluation logic. It wraps [switchbox-js](https://www.npmjs.com/package/switchbox-js), which fetches static JSON from a CDN and evaluates rules locally in the browser. Nothing about the architecture changes: same 30 second polling, same local evaluation, same deterministic rollouts.

## Install

```bash
npm install @openfeature/web-sdk switchbox-js @switchbox/openfeature
```

Both `@openfeature/web-sdk` and `switchbox-js` are peer dependencies.

## Quick Start

```ts
import { OpenFeature } from '@openfeature/web-sdk';
import { SwitchboxProvider } from '@switchbox/openfeature';

// Who is evaluating: targetingKey becomes the Switchbox user_id
await OpenFeature.setContext({ targetingKey: 'user-42', plan: 'pro' });

// Register Switchbox as the provider (awaits the first config fetch)
await OpenFeature.setProviderAndWait(
  new SwitchboxProvider({ sdkKey: 'your-sdk-key-from-dashboard' }),
);

const client = OpenFeature.getClient();

if (client.getBooleanValue('new_checkout', false)) {
  showNewCheckout();
}
```

## React

Use the official [@openfeature/react-sdk](https://www.npmjs.com/package/@openfeature/react-sdk). The provider emits `ConfigurationChanged` when a new config version lands, so mounted hooks re-render within one poll interval when you flip a flag.

```tsx
import { OpenFeature, OpenFeatureProvider, useFlag } from '@openfeature/react-sdk';
import { SwitchboxProvider } from '@switchbox/openfeature';

await OpenFeature.setContext({ targetingKey: 'user-42' });
await OpenFeature.setProviderAndWait(new SwitchboxProvider({ sdkKey: '...' }));

function App() {
  return (
    <OpenFeatureProvider>
      <Checkout />
    </OpenFeatureProvider>
  );
}

function Checkout() {
  const { value: showNew } = useFlag('new_checkout', false);
  return showNew ? <NewCheckout /> : <OldCheckout />;
}
```

## Context mapping

OpenFeature's evaluation context maps onto the Switchbox user context:

| OpenFeature | Switchbox |
|---|---|
| `targetingKey` | `user_id` (deterministic rollout bucketing) |
| every other attribute | targeting attribute, passed through as-is |

```ts
// { targetingKey: 'user-42', plan: 'pro' }  →  { user_id: 'user-42', plan: 'pro' }
```

Because Switchbox evaluates locally, `OpenFeature.setContext(...)` costs zero network: the provider re-evaluates the cached config in memory. Remote-evaluation vendors make a round trip here.

## How it works

The OpenFeature web SDK requires synchronous flag resolution. The provider pre-evaluates every flag when it initializes and again on each context change or config update, then serves each `get*Value` call as a synchronous cache lookup. Evaluation itself is the real `switchbox-js` evaluator, so results are identical to using the SDK directly.

- Missing flag: OpenFeature returns your code default with `FLAG_NOT_FOUND`
- Evaluated value has the wrong type: code default with `TYPE_MISMATCH`
- CDN unreachable at startup: the provider enters the ERROR state and OpenFeature serves code defaults (the same fail-safe posture as the SDK itself)

## Sharing a client

If your app already uses `switchbox-js` directly, pass the existing client instead of options. The provider then leaves its lifecycle alone (no init, no destroy):

```ts
const client = await Switchbox.create({ sdkKey: '...' });
await OpenFeature.setProviderAndWait(new SwitchboxProvider(client));
```

## License

MIT
