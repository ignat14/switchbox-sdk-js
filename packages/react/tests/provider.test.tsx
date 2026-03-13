import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { SwitchboxProvider } from '../src/provider';
import { Feature } from '../src/feature';
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

describe('SwitchboxProvider', () => {
  it('renders children', () => {
    const client = createMockClient();
    render(
      <SwitchboxProvider client={client}>
        <div>Hello</div>
      </SwitchboxProvider>,
    );
    expect(screen.getByText('Hello')).toBeDefined();
  });
});

describe('Feature', () => {
  it('renders children when flag is enabled', async () => {
    const client = createMockClient({
      enabled: vi.fn().mockResolvedValue(true),
    });
    render(
      <SwitchboxProvider client={client}>
        <Feature flag="enabled_flag">
          <div>New Feature</div>
        </Feature>
      </SwitchboxProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText('New Feature')).toBeDefined();
    });
  });

  it('renders fallback when flag is disabled', async () => {
    const client = createMockClient({
      enabled: vi.fn().mockResolvedValue(false),
    });
    render(
      <SwitchboxProvider client={client}>
        <Feature flag="disabled_flag" fallback={<div>Old Feature</div>}>
          <div>New Feature</div>
        </Feature>
      </SwitchboxProvider>,
    );
    // Initially renders fallback (default state is false)
    expect(screen.getByText('Old Feature')).toBeDefined();
  });

  it('renders nothing when no fallback and flag disabled', async () => {
    const client = createMockClient({
      enabled: vi.fn().mockResolvedValue(false),
    });
    const { container } = render(
      <SwitchboxProvider client={client}>
        <Feature flag="disabled_flag">
          <div>New Feature</div>
        </Feature>
      </SwitchboxProvider>,
    );
    await waitFor(() => {
      expect(screen.queryByText('New Feature')).toBeNull();
    });
  });
});
