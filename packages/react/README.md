# @switchbox/react

React hooks and components for [Switchbox](https://switchbox.dev) feature flags.

[![npm](https://img.shields.io/npm/v/@switchbox/react)](https://www.npmjs.com/package/@switchbox/react)
[![License](https://img.shields.io/npm/l/@switchbox/react)](https://github.com/ignat14/switchbox-sdk-js/blob/main/LICENSE)

## What is this?

A thin wrapper over [switchbox-js](https://www.npmjs.com/package/switchbox-js) — no evaluation logic, no networking, just React primitives. You create the client with `switchbox-js`, hand it to a provider, and read flags with hooks that re-render when a flag toggles.

Flag configs are static JSON files served from a CDN; rules and rollouts are evaluated locally in the browser. See [switchbox-js](https://www.npmjs.com/package/switchbox-js) for the full architecture and evaluation semantics.

## Install

```bash
npm install switchbox-js @switchbox/react
```

`switchbox-js` is a peer dependency — you create the client with it and pass it to the provider.

## Quick Start

```tsx
import { Switchbox } from 'switchbox-js';
import { SwitchboxProvider, useFlag } from '@switchbox/react';

// Create the client once (awaits the first config fetch)
const client = await Switchbox.create({ sdkKey: 'your-sdk-key-from-dashboard' });

function App() {
  return (
    <SwitchboxProvider client={client}>
      <Checkout />
    </SwitchboxProvider>
  );
}

function Checkout() {
  const showNew = useFlag('new_checkout', { user_id: '42' });
  return showNew ? <NewCheckout /> : <OldCheckout />;
}
```

## Features

- **Live updates** — hooks re-render when a flag toggles, within one poll interval (no remount needed)
- **Zero evaluation logic** — delegates to `switchbox-js`; identical results across every SDK
- **Declarative or imperative** — the `<Feature>` component or the `useFlag` / `useValue` hooks
- **Tiny** — React primitives only; the SDK weight lives in `switchbox-js`

## Setup

Create one client for your app and pass it to `SwitchboxProvider`. Everything below it can read flags.

```tsx
import { Switchbox } from 'switchbox-js';
import { SwitchboxProvider } from '@switchbox/react';

const client = await Switchbox.create({ sdkKey: 'your-sdk-key-from-dashboard' });

function App() {
  return (
    <SwitchboxProvider client={client}>
      <MyApp />
    </SwitchboxProvider>
  );
}
```

To avoid a top-level `await`, construct with `new Switchbox({ sdkKey })` + `client.init()` (un-awaited) and render immediately — flags fall back to their defaults until the first config lands, then the hooks re-render. See [switchbox-js: blocking vs. non-blocking startup](https://www.npmjs.com/package/switchbox-js#blocking-vs-non-blocking-startup).

## Hooks

### `useFlag(flagKey, user?): boolean`

Returns whether a boolean flag is enabled for the given user. Re-renders when the flag toggles. Returns `false` until the first config loads or if the flag doesn't exist.

```tsx
import { useFlag } from '@switchbox/react';

function Checkout() {
  const showNew = useFlag('new_checkout', { user_id: '42' });
  return showNew ? <NewCheckout /> : <OldCheckout />;
}
```

### `useValue(flagKey, user?, defaultValue?): T`

Returns the resolved value of any flag type (string, number, JSON). Re-renders when the value changes. Returns `defaultValue` until the first config loads or if the flag doesn't exist.

```tsx
import { useValue } from '@switchbox/react';

function Dashboard() {
  const theme = useValue('theme', { user_id: '42' }, 'light');
  return <div className={theme}>...</div>;
}
```

### `useClient(): Switchbox`

Returns the underlying `switchbox-js` client from context — for `getAllFlags`, `onEvaluation`, or any imperative use. Throws if called outside a `<SwitchboxProvider>`.

```tsx
import { useClient } from '@switchbox/react';

function Advanced() {
  const client = useClient();
  // client.getAllFlags({ user_id: '42' }), client.onConfigChange(...), etc.
}
```

## Components

### `<Feature>`

Declarative flag-based rendering. Renders `children` when the flag is on, otherwise `fallback` (default: nothing).

```tsx
import { Feature } from '@switchbox/react';

function Dashboard() {
  return (
    <Feature flag="new_dashboard" user={{ user_id: '42' }} fallback={<OldDashboard />}>
      <NewDashboard />
    </Feature>
  );
}
```

| Prop       | Type                       | Description                                    |
|------------|----------------------------|------------------------------------------------|
| `flag`     | `string`                   | The flag key to check                          |
| `user`     | `UserContext \| undefined` | User context for targeting/rollouts            |
| `children` | `ReactNode`                | Rendered when the flag is on                   |
| `fallback` | `ReactNode`                | Rendered when the flag is off (default: `null`)|

## Targeting & rollouts

The `user` object passed to any hook or `<Feature>` carries the attributes rules target on (`equals`, `not_equals`, `contains`, `ends_with`, `in_list`, `gt`, `lt`) and the `user_id` used for deterministic percentage rollouts. The evaluation semantics are identical to every other Switchbox SDK — see [switchbox-js](https://www.npmjs.com/package/switchbox-js#targeting-rules) for the full reference.

## License

MIT
