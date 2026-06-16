import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
// Import the REAL core Client (from source) — not a mock — so this exercises the
// full SEC-3 path end to end: SyncWorker polls → version changes → onUpdate →
// Client.onConfigChange listeners → useFlag/useValue re-evaluate → re-render.
import { Client } from '../../core/src/client';
import { SwitchboxProvider } from '../src/provider';
import { useFlag, useValue } from '../src/hooks';

function configWith(enabled: boolean, version: string) {
  return {
    version,
    flags: {
      my_flag: {
        enabled,
        rollout_pct: 100,
        flag_type: 'boolean',
        default_value: false,
        rules: [],
      },
    },
  };
}

// Mirrors playground/react_test.html's <Demo>: a mounted component reading the
// flag through the hooks, never remounted across the config change.
function Demo({ renders }: { renders: { count: number } }) {
  renders.count += 1;
  const enabled = useFlag('my_flag', { user_id: '42' });
  const value = useValue('my_flag', { user_id: '42' }, false);
  return (
    <div>
      <span data-testid="enabled">{enabled ? 'ON' : 'OFF'}</span>
      <span data-testid="value">{String(value)}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SEC-3 — playground React page picks up config changes live', () => {
  it('a flag toggle reaches a mounted hook within one poll interval (no remount)', async () => {
    // The "CDN": serves v1 (flag off), then v2 (flag on) after we flip it.
    let served = configWith(false, 'v1');
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(served) }),
    );

    // Real client, fast poll so the test stays quick (50ms instead of 30s).
    const client = new Client({ sdkKey: 'test-key', pollInterval: 0.05 });
    await client.init(); // loads v1

    const renders = { count: 0 };
    render(
      <SwitchboxProvider client={client}>
        <Demo renders={renders} />
      </SwitchboxProvider>,
    );

    // Initial state: flag is off.
    await waitFor(() => {
      expect(screen.getByTestId('enabled').textContent).toBe('OFF');
    });
    const rendersBeforeToggle = renders.count;

    // Operator toggles the flag on — the CDN now serves a new version.
    served = configWith(true, 'v2');

    // Without the fix the value would stay frozen at OFF forever; with it, the
    // next poll fires onConfigChange and the mounted hook re-evaluates to ON.
    await waitFor(
      () => {
        expect(screen.getByTestId('enabled').textContent).toBe('ON');
        expect(screen.getByTestId('value').textContent).toBe('true');
      },
      { timeout: 2000 },
    );

    // It updated by re-rendering the SAME mounted component, not by remounting.
    expect(renders.count).toBeGreaterThan(rendersBeforeToggle);

    client.destroy();
  });

  it('stops updating after the client is destroyed (listeners cleared)', async () => {
    let served = configWith(false, 'v1');
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(served) }),
    );
    const client = new Client({ sdkKey: 'test-key', pollInterval: 0.05 });
    await client.init();

    render(
      <SwitchboxProvider client={client}>
        <Demo renders={{ count: 0 }} />
      </SwitchboxProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('enabled').textContent).toBe('OFF');
    });

    client.destroy(); // stops polling + clears listeners
    served = configWith(true, 'v2');

    // Give it well over a poll interval; the value must remain OFF.
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getByTestId('enabled').textContent).toBe('OFF');
  });
});
