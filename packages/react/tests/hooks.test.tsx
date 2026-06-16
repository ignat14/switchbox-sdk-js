import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SwitchboxProvider } from '../src/provider';
import { useFlag, useValue, useClient } from '../src/hooks';
import type { Switchbox } from 'switchbox-js';

function createMockClient(overrides: Partial<Switchbox> = {}): Switchbox {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    enabled: vi.fn().mockResolvedValue(false),
    getValue: vi.fn().mockResolvedValue(undefined),
    getAllFlags: vi.fn().mockResolvedValue({}),
    onConfigChange: vi.fn().mockReturnValue(() => {}),
    destroy: vi.fn(),
    ...overrides,
  } as unknown as Switchbox;
}

function createWrapper(client: Switchbox) {
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

  it('re-evaluates when the config changes (SEC-3)', async () => {
    // Capture the listener the hook registers, then fire it to simulate a new
    // config landing — the mounted hook must pick up the new value.
    let fireConfigChange: () => void = () => {};
    const enabledFn = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const client = createMockClient({
      enabled: enabledFn,
      onConfigChange: vi.fn().mockImplementation((cb: () => void) => {
        fireConfigChange = cb;
        return () => {};
      }),
    });

    const { result } = renderHook(() => useFlag('test_flag'), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    // A poll brings a new config version → SyncWorker fires onUpdate → listener.
    act(() => {
      fireConfigChange();
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('unsubscribes from config changes on unmount', async () => {
    const unsubscribe = vi.fn();
    const client = createMockClient({
      onConfigChange: vi.fn().mockReturnValue(unsubscribe),
    });
    const { unmount } = renderHook(() => useFlag('test_flag'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(client.onConfigChange).toHaveBeenCalled();
    });
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
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
