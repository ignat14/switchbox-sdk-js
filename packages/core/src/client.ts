import { FlagCache } from './cache';
import { evaluate } from './evaluator';
import { SyncWorker } from './sync';
import type { SwitchboxOptions, UserContext } from './types';

export class Client {
  private cache: FlagCache;
  private sync: SyncWorker;
  private onEvaluation?: SwitchboxOptions['onEvaluation'];

  constructor(options: SwitchboxOptions) {
    this.cache = new FlagCache();
    this.onEvaluation = options.onEvaluation;
    this.sync = new SyncWorker(
      options.cdnUrl,
      this.cache,
      options.pollInterval ?? 30,
      options.onError,
    );
  }

  async init(): Promise<void> {
    await this.sync.start();
  }

  async enabled(flagKey: string, user?: UserContext): Promise<boolean> {
    const flag = this.cache.getFlag(flagKey);
    if (!flag) {
      this.onEvaluation?.(flagKey, false, user);
      return false;
    }
    const result = await evaluate(flag, flagKey, user);
    this.onEvaluation?.(flagKey, result, user);
    return Boolean(result);
  }

  async getValue(
    flagKey: string,
    user?: UserContext,
    defaultValue?: any,
  ): Promise<any> {
    const flag = this.cache.getFlag(flagKey);
    if (!flag) {
      this.onEvaluation?.(flagKey, defaultValue, user);
      return defaultValue;
    }
    const result = await evaluate(flag, flagKey, user);
    this.onEvaluation?.(flagKey, result, user);
    return result;
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
  }
}

export async function createClient(
  options: SwitchboxOptions,
): Promise<Client> {
  const client = new Client(options);
  await client.init();
  return client;
}
