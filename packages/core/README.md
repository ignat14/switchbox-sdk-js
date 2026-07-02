# switchbox-js

Feature flags served from a CDN. Zero dependencies. Sub-millisecond evaluation.

[![npm](https://img.shields.io/npm/v/switchbox-js)](https://www.npmjs.com/package/switchbox-js)
[![bundle size](https://img.shields.io/bundlephobia/minzip/switchbox-js)](https://bundlephobia.com/package/switchbox-js)
[![License](https://img.shields.io/npm/l/switchbox-js)](https://github.com/ignat14/switchbox-sdk-js/blob/main/LICENSE)

## What is this?

Switchbox is a feature flag SDK that reads configs from a CDN instead of an API server. Flag configs are static JSON files on the edge — your app fetches them directly. Rules and rollouts are evaluated locally in the browser, not on a server.

This is the core browser SDK. For React hooks and components, see [@switchbox/react](https://www.npmjs.com/package/@switchbox/react).

## Install

```bash
npm install switchbox-js
```

## Quick Start

```js
import { Switchbox } from 'switchbox-js';

const client = await Switchbox.create({ sdkKey: 'your-sdk-key-from-dashboard' });

if (await client.enabled('new_checkout', { user_id: '42' })) {
  showNewCheckout();
}

client.destroy();
```

> **Evaluation is async.** `enabled()`, `getValue()`, and `getAllFlags()` return promises — rollout bucketing uses the Web Crypto `subtle.digest` API, which is async. Always `await` them.

## Features

- **CDN-first** — fetches flag configs from static JSON on a CDN, served from the edge, never from our API
- **Zero dependencies** — browser APIs only (`fetch`, Web Crypto); `npm install switchbox-js` pulls in nothing else
- **Sub-millisecond evaluation** — rules and rollouts evaluated locally in the browser, no network call per flag check
- **Background polling** — syncs configs every 30 seconds (configurable)
- **Offline resilient** — keeps working on the last fetched config if the CDN is unreachable
- **Live updates** — subscribe to config changes so a flag toggle reaches your UI within one poll interval
- **Tiny** — a few KB, tree-shakeable ESM

## Usage

### Boolean flags

```js
const client = await Switchbox.create({ sdkKey: 'your-sdk-key-from-dashboard' });

if (await client.enabled('dark_mode')) {
  enableDarkMode();
}
```

### String / number / JSON flags

```js
const version = await client.getValue('search_algorithm', { user_id: '42' }, 'v1');

const maxResults = await client.getValue('max_search_results', { user_id: '42' }, 10);
```

The third argument is the default returned when the flag doesn't exist.

### All flags at once

```js
const flags = await client.getAllFlags({ user_id: '42' });
// { dark_mode: true, search_algorithm: 'v2', max_search_results: 50 }
```

### Targeting rules

Pass a `user` object with attributes you want to target on. Rules are configured in the dashboard.

```js
const user = {
  user_id: '42',
  email: 'alice@company.com',
  plan: 'enterprise',
  age: '30',
};

// Flag with rule: email ends_with "@company.com"
await client.enabled('internal_tools', user); // true

// Flag with rule: plan equals "enterprise"
await client.enabled('advanced_analytics', user); // true

// Flag with rule: plan in_list ["pro", "enterprise"]
await client.enabled('export_csv', user); // true
```

Supported operators: `equals`, `not_equals`, `contains`, `ends_with`, `in_list`, `gt`, `lt`.

Rules use OR logic — if any rule group matches, the flag is on for that user.

### Percentage rollouts

Rollouts use deterministic hashing (`sha256(user_id:flag_key) % 100`). The same user always gets the same result for a given flag — no flickering between renders — and the **same bucket in every SDK language** (a user who's in for a flag in the JS SDK is also in for it in the Python SDK).

```js
// Flag with rollout_pct=25 — 25% of users get this flag
await client.enabled('new_onboarding', { user_id: '42' }); // deterministic true/false
```

A `user_id` (or `id`) key is required in the user object for percentage rollouts.

### Offline / fail-safe behavior

If the CDN is unreachable, the SDK keeps using the last successfully fetched config. Your flags keep working.

If the SDK has never successfully fetched a config (e.g. the CDN is down on first load), `enabled()` returns `false` and `getValue()` returns the default you pass in. Fetch errors are **never thrown** — they're routed to the `onError` callback instead, so a flag check never crashes your app.

### Blocking vs. non-blocking startup

`Switchbox.create(options)` **awaits the first fetch**, so the client already sees live config when it resolves — the recommended entry point. The trade-off is that it waits on the network before resolving.

To start without waiting, construct with `new Switchbox(options)` and call `init()` without awaiting it. The client fetches in the background; flag checks fall back to your supplied defaults until the first config lands:

```js
const client = new Switchbox({ sdkKey: '...' });
client.init(); // fetches in the background — not awaited
// checks use defaults until the first config arrives
if (await client.enabled('new_checkout', { user_id: '42' })) {
  // ...
}
```

(The Python SDK makes the same choice with a `block_on_init` flag: `block_on_init=True` blocks on the first fetch, `False` fetches in the background.)

### Live updates

`onConfigChange(callback)` fires whenever the polled config version changes, and returns an unsubscribe function. This is how [@switchbox/react](https://www.npmjs.com/package/@switchbox/react)'s hooks re-render on a flag toggle; use it directly for non-React live updates.

```js
const unsubscribe = client.onConfigChange(() => {
  rerenderFeatureToggles();
});
// later: unsubscribe();
```

### Analytics / exposure tracking

Switchbox doesn't track flag evaluations. Wire evaluations into your own analytics with `onEvaluation`:

```js
const client = await Switchbox.create({
  sdkKey: 'your-sdk-key-from-dashboard',
  onEvaluation: (flagKey, result, user) => {
    analytics.track('flag_evaluated', { flag: flagKey, result });
  },
});
```

## Configuration

```js
const client = await Switchbox.create({
  sdkKey: 'your-sdk-key-from-dashboard', // required — get from the Environments tab
  cdnBaseUrl: 'https://cdn.switchbox.dev', // override the CDN origin (default shown)
  pollInterval: 30, // seconds between background polls (default: 30)
  onError: (error) => console.error(error), // called on fetch/parse errors (default: none)
  onEvaluation: (flagKey, result, user) => {}, // called on every evaluation (default: none)
});
```

| Option         | Type                                              | Default                       | Description                                        |
|----------------|---------------------------------------------------|-------------------------------|----------------------------------------------------|
| `sdkKey`       | `string`                                          | —                             | SDK key from the environment in the dashboard      |
| `cdnBaseUrl`   | `string`                                          | `https://cdn.switchbox.dev`   | CDN origin; the URL is `{cdnBaseUrl}/{sdkKey}/flags.json` |
| `pollInterval` | `number`                                          | `30`                          | Seconds between background config refreshes        |
| `onError`      | `(error: Error) => void`                          | `undefined`                   | Callback invoked when a fetch or parse fails       |
| `onEvaluation` | `(flagKey, result, user?) => void`                | `undefined`                   | Callback invoked on every flag evaluation          |

## How It Works

```
┌──────────┐       ┌──────────┐       ┌─────────────┐
│Dashboard │──────>│ API      │──────>│  Postgres   │
│          │ HTTP  │ (Fly.io) │  SQL  │  (Neon)     │
└──────────┘       └────┬─────┘       └─────────────┘
                        │
                        │ publish on every change
                        v
                 ┌─────────────┐       ┌──────────────┐
                 │CDN Publisher│──────>│Cloudflare R2 │
                 │             │  PUT  │(static JSON) │
                 └─────────────┘       └──────┬───────┘
                                              │
                                              │ HTTP GET (SDK polls)
                                              v
                                       ┌──────────────┐
                                       │  Your App    │
                                       │  (this SDK)  │
                                       └──────────────┘
```

1. You create and toggle flags in the dashboard
2. On every change, the API generates a static JSON file and uploads it to the CDN
3. This SDK polls that JSON file from the edge every 30 seconds
4. Flag evaluation (rules, rollouts) happens locally — no network call per flag check

The API server is only in the write path. All read traffic goes to the CDN.

## API Reference

### `Switchbox.create(options): Promise<Switchbox>`

Create a client and await the first config fetch in one call — the recommended entry point. See [Configuration](#configuration) for the options.

### `new Switchbox(options)` + `client.init(): Promise<void>`

Construct without fetching, then start polling with `init()`. Await `init()` to block on the first fetch, or leave it un-awaited to fetch in the background. See [Blocking vs. non-blocking startup](#blocking-vs-non-blocking-startup).

### `client.enabled(flagKey, user?): Promise<boolean>`

Check if a boolean flag is enabled. Resolves to `false` if the flag doesn't exist.

| Parameter | Type                       | Description                         |
|-----------|----------------------------|-------------------------------------|
| `flagKey` | `string`                   | The flag key to check               |
| `user`    | `UserContext \| undefined` | User context for targeting/rollouts |

### `client.getValue(flagKey, user?, defaultValue?): Promise<any>`

Get the resolved value of any flag type (string, number, JSON). Resolves to `defaultValue` if the flag doesn't exist.

| Parameter      | Type                       | Description                          |
|----------------|----------------------------|--------------------------------------|
| `flagKey`      | `string`                   | The flag key to check                |
| `user`         | `UserContext \| undefined` | User context for targeting/rollouts  |
| `defaultValue` | `any`                      | Value returned if the flag is absent |

### `client.getAllFlags(user?): Promise<Record<string, any>>`

Get all flag values resolved for a user. Resolves to an empty object if no config is available.

### `client.onConfigChange(callback): () => void`

Subscribe to config-version changes. Returns an unsubscribe function. See [Live updates](#live-updates).

### `client.destroy(): void`

Stop background polling and clear subscribers. Call this when the client is no longer needed.

## Contributing

```sh
git clone https://github.com/ignat14/switchbox-sdk-js.git
cd switchbox-sdk-js
pnpm install
pnpm -r build
pnpm test
```

## License

MIT
