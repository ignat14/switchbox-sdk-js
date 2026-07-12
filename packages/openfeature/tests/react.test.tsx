import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
// End-to-end through the OFFICIAL OpenFeature React SDK — the marketing-visible
// demo (plan Phase 1.5): an app written only against OpenFeature, with Switchbox
// as the one registered provider, sees a flag flip within one poll interval.
import {
  OpenFeature,
  OpenFeatureProvider,
  useFlag,
} from '@openfeature/react-sdk';
import { SwitchboxProvider } from '../src/provider';

const DOMAIN = 'openfeature-e2e';

function configWith(greeting: string, version: string) {
  return {
    version,
    flags: {
      greeting: {
        enabled: true,
        rollout_pct: 100,
        flag_type: 'string',
        default_value: 'Shop',
        enabled_value: greeting,
        rules: [],
      },
    },
  };
}

function Banner() {
  const { value } = useFlag('greeting', 'fallback');
  return <span data-testid="greeting">{value}</span>;
}

afterEach(async () => {
  cleanup();
  await OpenFeature.close();
  vi.restoreAllMocks();
});

describe('OpenFeature React SDK + SwitchboxProvider, end to end', () => {
  it('a flag flip reaches a mounted useFlag within one poll interval', async () => {
    let served = configWith('Buy now', 'v1');
    globalThis.fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(served) }),
      );

    await OpenFeature.setContext(DOMAIN, { targetingKey: 'user-42' });
    await OpenFeature.setProviderAndWait(
      DOMAIN,
      new SwitchboxProvider({ sdkKey: 'test-key', pollInterval: 0.05 }),
    );

    render(
      <OpenFeatureProvider domain={DOMAIN}>
        <Banner />
      </OpenFeatureProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('greeting').textContent).toBe('Buy now');
    });

    // Operator flips the flag value: the CDN serves a new config version.
    served = configWith('New hotness', 'v2');

    // ConfigurationChanged → react-sdk re-renders the mounted hook, no remount.
    await waitFor(
      () => {
        expect(screen.getByTestId('greeting').textContent).toBe('New hotness');
      },
      { timeout: 2000 },
    );
  });
});
