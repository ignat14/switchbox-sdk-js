import { describe, it, expect, vi, afterEach } from 'vitest';
import { FlagCache } from '../src/cache';
import { SyncWorker, normalizeConfig } from '../src/sync';

function okResponse(body: any, etag?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...(etag ? { ETag: etag } : {}),
    },
  });
}

function notModified(etag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('normalizeConfig', () => {
  it('fills parse defaults: omitted flag_type -> boolean, omitted rollout_pct -> 0 (parity with Python from_dict)', () => {
    const config = normalizeConfig({
      version: 'v1',
      flags: { f: { enabled: true, default_value: false, rules: [] } },
    });
    expect(config.flags.f.flag_type).toBe('boolean');
    expect(config.flags.f.rollout_pct).toBe(0);
  });

  it('wraps legacy flat rules into single-condition groups', () => {
    const config = normalizeConfig({
      version: 'v1',
      flags: {
        f: {
          enabled: true,
          rollout_pct: 0,
          default_value: false,
          rules: [{ attribute: 'plan', operator: 'equals', value: 'pro' }],
        },
      },
    });
    expect(config.flags.f.rules).toEqual([
      { conditions: [{ attribute: 'plan', operator: 'equals', value: 'pro' }] },
    ]);
  });

  it('skips non-object flag entries instead of poisoning the cache (parity with the Python per-flag skip)', () => {
    const config = normalizeConfig({
      version: 'v1',
      flags: {
        good: { enabled: true, rollout_pct: 100, default_value: false, rules: [] },
        bad_null: null,
        bad_string: 'nope',
        bad_array: [1, 2],
      },
    });
    expect(Object.keys(config.flags)).toEqual(['good']);
  });

  it('tolerates a missing flags key and missing version', () => {
    const config = normalizeConfig({});
    expect(config).toEqual({ version: '', flags: {} });
  });
});

describe('SyncWorker fetch behavior', () => {
  it('passes an abort signal so a hung CDN cannot block init for minutes (SEC-9, JS half)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ version: 'v1', flags: {} }));
    const worker = new SyncWorker('http://cdn/x/flags.json', new FlagCache(), 30);
    await worker.start();
    worker.stop();
    const init = fetchMock.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('echoes the CDN ETag back as If-None-Match on the next poll (REF-8)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse({ version: 'v1', flags: {} }, '"abc"'))
      .mockResolvedValue(notModified('"abc"'));

    const worker = new SyncWorker('http://cdn/x/flags.json', new FlagCache(), 10);
    await worker.start();
    // Nothing to validate against on the first fetch.
    expect(
      (fetchMock.mock.calls[0][1]?.headers as Record<string, string>)[
        'If-None-Match'
      ],
    ).toBeUndefined();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      (fetchMock.mock.calls[1][1]?.headers as Record<string, string>)[
        'If-None-Match'
      ],
    ).toBe('"abc"');
    worker.stop();
  });

  it('treats 304 as unchanged: cache kept, no error, no update callback', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse({ version: 'v1', flags: {} }, '"abc"'))
      .mockResolvedValue(notModified('"abc"'));
    const onError = vi.fn();
    const onUpdate = vi.fn();

    const cache = new FlagCache();
    const worker = new SyncWorker(
      'http://cdn/x/flags.json',
      cache,
      10,
      onError,
      onUpdate,
    );
    await worker.start(); // the initial 200 caches v1 and notifies once
    expect(onUpdate).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(cache.getVersion()).toBe('v1');
    expect(onError).not.toHaveBeenCalled();
    // The 304 changed nothing, so subscribers are not woken.
    expect(onUpdate).toHaveBeenCalledTimes(1);
    worker.stop();
  });

  it('does not remember the ETag of a body it failed to parse (no permanent-304 wedge)', async () => {
    vi.useFakeTimers();
    // A truncated/garbage body: the response is a 200 with an ETag, but the
    // config never reaches the cache. Sending that validator back would earn a
    // 304 forever — the client would serve defaults until the next publish.
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('{"version":', {
          status: 200,
          headers: { ETag: '"broken"' },
        }),
      )
      .mockResolvedValue(okResponse({ version: 'v1', flags: {} }, '"abc"'));

    const cache = new FlagCache();
    const worker = new SyncWorker(
      'http://cdn/x/flags.json',
      cache,
      10,
      () => {},
    );
    await worker.start();
    expect(cache.getConfig()).toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      (fetchMock.mock.calls[1][1]?.headers as Record<string, string>)[
        'If-None-Match'
      ],
    ).toBeUndefined();
    // …so the retry is a full fetch and the client recovers.
    expect(cache.getVersion()).toBe('v1');
    worker.stop();
  });

  it('forgets the ETag when a CDN stops sending one (no ETag support)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(okResponse({ version: 'v1', flags: {} }, '"abc"'))
      // e.g. failing over to a plain-file CDN that issues no validator
      .mockResolvedValue(okResponse({ version: 'v2', flags: {} }));

    const worker = new SyncWorker('http://cdn/x/flags.json', new FlagCache(), 10);
    await worker.start();
    await vi.advanceTimersByTimeAsync(10_000); // sends If-None-Match, gets 200 without ETag
    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      (fetchMock.mock.calls[2][1]?.headers as Record<string, string>)[
        'If-None-Match'
      ],
    ).toBeUndefined();
    worker.stop();
  });

  it('skips interval ticks while a poll is in flight (a slow poll must not overlap a newer one)', async () => {
    vi.useFakeTimers();
    let resolveSlow!: (r: Response) => void;
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // initial (awaited) fetch succeeds fast…
      .mockResolvedValueOnce(okResponse({ version: 'v1', flags: {} }))
      // …the first interval poll hangs…
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => (resolveSlow = resolve)),
      )
      // …later polls succeed.
      .mockResolvedValue(okResponse({ version: 'v3', flags: {} }));

    const cache = new FlagCache();
    const worker = new SyncWorker('http://cdn/x/flags.json', cache, 30);
    await worker.start();
    expect(cache.getVersion()).toBe('v1');

    // Tick 1 starts the slow poll; tick 2 fires while it's still in flight
    // and must be skipped by the guard — no concurrent fetch.
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The slow poll finally lands (an older snapshot) — cached sequentially.
    resolveSlow(okResponse({ version: 'v2', flags: {} }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cache.getVersion()).toBe('v2');

    // With the slot free again, the next tick fetches normally.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cache.getVersion()).toBe('v3');
    worker.stop();
  });
});
