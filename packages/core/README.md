# switchbox-js

Feature flag SDK for the browser. Zero dependencies.

Fetches flag configs from a CDN and evaluates rules locally. No API calls at runtime.

## Install

```bash
npm install switchbox-js
```

## Usage

```js
import { createClient } from 'switchbox-js';

const client = await createClient({
  cdnUrl: 'https://cdn.switchbox.dev/<sdk_key>/flags.json',
});

// Boolean flag
if (await client.enabled('new_checkout', { user_id: '42' })) {
  showNewCheckout();
}

// String/number/JSON flag
const theme = await client.getValue('theme', { user_id: '42' }, 'light');

// All flags at once
const flags = await client.getAllFlags({ user_id: '42' });

// Clean up when done
client.destroy();
```

## Options

```js
const client = await createClient({
  cdnUrl: 'https://cdn.switchbox.dev/<sdk_key>/flags.json',
  pollInterval: 30,  // seconds (default: 30)
  onError: (error) => console.error(error),
  onEvaluation: (flagKey, result, user) => {
    analytics.track('flag_evaluated', { flag: flagKey, result });
  },
});
```

## How it works

1. Fetches a static JSON config from your CDN on init
2. Polls for updates every 30 seconds (configurable)
3. Evaluates all flag rules locally in the browser
4. Rollout percentages use deterministic SHA-256 hashing — same user always gets the same result

## React

For React hooks and components, see [@switchbox/react](https://www.npmjs.com/package/@switchbox/react).

## License

MIT
