import { FlagCache } from './cache';
import { evaluate } from './evaluator';
import { SyncWorker } from './sync';
import type { SwitchboxOptions, UserContext } from './types';

const DEFAULT_CDN_BASE_URL = 'https://cdn.switchbox.dev';

export class Client {
  private cache: FlagCache;
  private sync: SyncWorker;
  private onEvaluation?: SwitchboxOptions['onEvaluation'];
  private listeners = new Set<() => void>();

  constructor(options: SwitchboxOptions) {
    this.cache = new FlagCache();
    this.onEvaluation = options.onEvaluation;
    const base = options.cdnBaseUrl ?? DEFAULT_CDN_BASE_URL;
    const cdnUrl = `${base}/${options.sdkKey}/flags.json`;
    this.sync = new SyncWorker(
      cdnUrl,
      this.cache,
      options.pollInterval ?? 30,
      options.onError,
      () => this.notifyConfigChange(),
    );
  }

  async init(): Promise<void> {
    await this.sync.start();
  }

  /**
   * Subscribe to config updates. The callback fires whenever the polled config
   * version changes. Returns an unsubscribe function.
   *
   * The React hooks subscribe through this so mounted components re-evaluate
   * when a new config arrives — without it, hook values stay frozen at mount
   * even though the cache keeps refreshing (SEC-3).
   */
  onConfigChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyConfigChange(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Shared eval path: look up the flag, evaluate (or use `fallback` when absent),
   * fire the onEvaluation hook, return the result.
   */
  private async evalFlag(
    flagKey: string,
    user: UserContext | undefined,
    fallback: any,
  ): Promise<any> {
    const flag = this.cache.getFlag(flagKey);
    const result = flag ? await evaluate(flag, flagKey, user) : fallback;
    this.onEvaluation?.(flagKey, result, user);
    return result;
  }

  async enabled(flagKey: string, user?: UserContext): Promise<boolean> {
    return Boolean(await this.evalFlag(flagKey, user, false));
  }

  async getValue(
    flagKey: string,
    user?: UserContext,
    defaultValue?: any,
  ): Promise<any> {
    return this.evalFlag(flagKey, user, defaultValue);
  }

  async getAllFlags(user?: UserContext): Promise<Record<string, any>> {
    const config = this.cache.getConfig();
    if (!config) return {};
    const results: Record<string, any> = {};
    for (const [key, flag] of Object.entries(config.flags)) {
      results[key] = await evaluate(flag, key, user);
    }
    return results;
  }

  destroy(): void {
    this.sync.stop();
    this.listeners.clear();
  }
}

export async function createClient(
  options: SwitchboxOptions,
): Promise<Client> {
  const client = new Client(options);
  await client.init();
  return client;
}
