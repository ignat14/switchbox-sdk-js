import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TelemetryAggregator,
  TelemetryReporter,
  valueRepr,
  MAX_VALUES_PER_FLAG,
  OTHER_BUCKET,
} from '../src/telemetry';
import { Switchbox } from '../src/client';
import type { FlagConfig } from '../src/types';
// Canonical fixtures/telemetry/value_reprs.json (workspace root), synced by
// `python3 fixtures/sync.py`; the Python suite runs the same bytes. Both SDKs'
// value-repr must match (MEASUREMENT Phase 1 / ADR-055). Edit the canonical and
// re-sync — never hand-edit this copy.
import fixture from './fixtures/telemetry/value_reprs.json';

describe('valueRepr — cross-SDK contract (shared fixture)', () => {
  it('matches the canonical constants', () => {
    expect(fixture.max_values_per_flag).toBe(MAX_VALUES_PER_FLAG);
    expect(fixture.other_bucket).toBe(OTHER_BUCKET);
  });
  for (const c of fixture.cases) {
    it(`${JSON.stringify(c.value)} -> ${c.repr}`, () => {
      expect(valueRepr(c.value)).toBe(c.repr);
    });
  }
});

describe('TelemetryAggregator', () => {
  it('counts and drains', () => {
    const agg = new TelemetryAggregator();
    agg.record('f', true);
    agg.record('f', true);
    agg.record('f', false);
    agg.record('g', 'A');
    expect(agg.drain()).toEqual({ f: { true: 2, false: 1 }, g: { '"A"': 1 } });
    expect(agg.drain()).toEqual({}); // drain resets the window
  });

  it('caps distinct values into $other', () => {
    const agg = new TelemetryAggregator();
    for (let i = 0; i < MAX_VALUES_PER_FLAG; i++) agg.record('f', `v${i}`);
    agg.record('f', 'overflow_a');
    agg.record('f', 'overflow_b');
    const counts = agg.drain().f;
    expect(Object.keys(counts).filter((k) => k !== OTHER_BUCKET)).toHaveLength(
      MAX_VALUES_PER_FLAG,
    );
    expect(counts[OTHER_BUCKET]).toBe(2);
  });

  it('a "constructor" flag key is safe (null-prototype maps)', () => {
    const agg = new TelemetryAggregator();
    agg.record('constructor', true);
    expect(agg.drain()).toEqual({ constructor: { true: 1 } });
  });
});

describe('TelemetryReporter', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('flushes the expected payload, then nothing when drained', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;
    const agg = new TelemetryAggregator();
    agg.record('f', true);
    const reporter = new TelemetryReporter(
      'https://cdn/key/telemetry',
      agg,
      'switchbox-js',
      '9.9.9',
    );
    await reporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cdn/key/telemetry');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      sdk_name: 'switchbox-js',
      sdk_version: '9.9.9',
      flags: { f: { true: 1 } },
    });

    await reporter.flush(); // window drained → no second request
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is fail-open (a rejected flush never throws)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('down'));
    const agg = new TelemetryAggregator();
    agg.record('f', true);
    const reporter = new TelemetryReporter('https://x/telemetry', agg, 'js', '1');
    await expect(reporter.flush()).resolves.toBeUndefined();
  });
});

describe('Switchbox telemetry integration', () => {
  const config: FlagConfig = {
    version: 'v1',
    flags: {
      new_dashboard: {
        enabled: true,
        rollout_pct: 100,
        flag_type: 'boolean',
        default_value: false,
        rules: [],
      },
    },
  };
  const mockFetch = () =>
    vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve(config),
    });

  beforeEach(() => vi.restoreAllMocks());

  it('is on by default and records real evaluations', async () => {
    globalThis.fetch = mockFetch();
    const client = new Switchbox({ sdkKey: 'k', cdnBaseUrl: 'https://cdn' });
    await client.init();
    await client.enabled('new_dashboard', { user_id: '1' });
    // @ts-expect-error — reach into the private aggregator for the assertion
    expect(client.telemetry.drain()).toEqual({ new_dashboard: { true: 1 } });
    client.destroy();
  });

  it('opt-out disables the aggregator', async () => {
    globalThis.fetch = mockFetch();
    const client = new Switchbox({
      sdkKey: 'k',
      cdnBaseUrl: 'https://cdn',
      telemetry: false,
    });
    await client.init();
    await client.enabled('new_dashboard', { user_id: '1' }); // must not blow up
    // @ts-expect-error — private
    expect(client.telemetry).toBeNull();
    client.destroy();
  });
});
