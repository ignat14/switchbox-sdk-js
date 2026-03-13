import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SwitchboxProvider } from '../src/provider';
import { useFlag, useValue, useClient } from '../src/hooks';
import type { Client } from 'switchbox-js';

function createMockClient(overrides: Partial<Client> = {}): Client {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    enabled: vi.fn().mockResolvedValue(false),
    getValue: vi.fn().mockResolvedValue(undefined),
    getAllFlags: vi.fn().mockResolvedValue({}),
    destroy: vi.fn(),
    ...overrides,
  } as unknown as Client;
}

function createWrapper(client: Client) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SwitchboxProvider client={client}>{children}</SwitchboxProvider>
    );
  };
}

describe('useClient', () => {
  it('throws when used outside Provider', () => {
    expect(() => {
      renderHook(() => useClient());
    }).toThrow('useClient must be used within a <SwitchboxProvider>');
  });
});

describe('useFlag', () => {
  it('returns false when flag does not exist', async () => {
    const client = createMockClient({
      enabled: vi.fn().mockResolvedValue(false),
    });
    const { result } = renderHook(() => useFlag('nonexistent'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('returns true when flag is enabled at 100%', async () => {
    const client = createMockClient({
      enabled: vi.fn().mockResolvedValue(true),
    });
    const { result } = renderHook(() => useFlag('enabled_flag'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('re-evaluates when user context changes', async () => {
    const enabledFn = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const client = createMockClient({ enabled: enabledFn });

    const { result, rerender } = renderHook(
      ({ user }) => useFlag('test_flag', user),
      {
        wrapper: createWrapper(client),
        initialProps: { user: { user_id: '1' } },
      },
    );

    await waitFor(() => {
      expect(enabledFn).toHaveBeenCalledTimes(1);
    });

    rerender({ user: { user_id: '2' } });

    await waitFor(() => {
      expect(enabledFn).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useValue', () => {
  it('returns default when flag does not exist', async () => {
    const client = createMockClient({
      getValue: vi.fn().mockResolvedValue('fallback'),
    });
    const { result } = renderHook(
      () => useValue('nonexistent', undefined, 'fallback'),
      { wrapper: createWrapper(client) },
    );
    await waitFor(() => {
      expect(result.current).toBe('fallback');
    });
  });

  it('returns flag value when flag exists', async () => {
    const client = createMockClient({
      getValue: vi.fn().mockResolvedValue('dark'),
    });
    const { result } = renderHook(() => useValue('theme'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current).toBe('dark');
    });
  });
});
