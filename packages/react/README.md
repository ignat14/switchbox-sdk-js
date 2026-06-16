# @switchbox/react

React hooks and components for Switchbox feature flags.

Thin wrapper over [switchbox-js](https://www.npmjs.com/package/switchbox-js) — no evaluation logic, no networking, just React primitives.

## Install

```bash
npm install switchbox-js @switchbox/react
```

## Setup

```tsx
import { Switchbox } from 'switchbox-js';
import { SwitchboxProvider } from '@switchbox/react';

const client = await Switchbox.create({
  sdkKey: '<your-sdk-key>',
});

function App() {
  return (
    <SwitchboxProvider client={client}>
      <MyApp />
    </SwitchboxProvider>
  );
}
```

## Hooks

### useFlag

```tsx
import { useFlag } from '@switchbox/react';

function Checkout() {
  const showNew = useFlag('new_checkout', { user_id: '42' });
  return showNew ? <NewCheckout /> : <OldCheckout />;
}
```

### useValue

```tsx
import { useValue } from '@switchbox/react';

function Dashboard() {
  const theme = useValue('theme', { user_id: '42' }, 'light');
  return <div className={theme}>...</div>;
}
```

### useClient

```tsx
import { useClient } from '@switchbox/react';

function Advanced() {
  const client = useClient();
  // Access the underlying switchbox-js client directly
}
```

## Components

### Feature

Declarative flag-based rendering:

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

## License

MIT
