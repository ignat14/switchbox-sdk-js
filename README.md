# Switchbox JavaScript SDKs

Feature flag SDKs for the browser. Zero dependencies.

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| `switchbox-js` | Core browser SDK | `npm install switchbox-js` |
| `@switchbox/react` | React hooks & components | `npm install switchbox-js @switchbox/react` |

## Quick Start (vanilla JS)

```js
import { createClient } from 'switchbox-js';

const client = await createClient({
  cdnUrl: 'https://cdn.switchbox.dev/<sdk_key>/flags.json',
});

if (await client.enabled('new_checkout', { user_id: '42' })) {
  showNewCheckout();
}

client.destroy();
```

## Quick Start (React)

```tsx
import { SwitchboxProvider, useFlag, Feature } from '@switchbox/react';
import { createClient } from 'switchbox-js';

// Initialize once
const client = await createClient({ cdnUrl: '...' });

// Wrap your app
function App() {
  return (
    <SwitchboxProvider client={client}>
      <MyApp />
    </SwitchboxProvider>
  );
}

// Use in any component
function Checkout() {
  const showNew = useFlag('new_checkout', { user_id: '42' });
  return showNew ? <NewCheckout /> : <OldCheckout />;
}

// Or use the declarative component
function Dashboard() {
  return (
    <Feature flag="new_dashboard" user={{ user_id: '42' }} fallback={<OldDashboard />}>
      <NewDashboard />
    </Feature>
  );
}
```

## Analytics Integration

Switchbox doesn't track flag evaluations. Wire into your own analytics:

```js
const client = await createClient({
  cdnUrl: '...',
  onEvaluation: (flagKey, result, user) => {
    analytics.track('flag_evaluated', { flag: flagKey, result });
  },
});
```

## License

MIT
