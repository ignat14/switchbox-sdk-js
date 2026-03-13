import { FlagCache } from './cache';
import type { FlagConfig } from './types';

export class SyncWorker {
  private cdnUrl: string;
  private cache: FlagCache;
  private interval: number;
  private onError?: (error: Error) => void;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    cdnUrl: string,
    cache: FlagCache,
    interval: number,
    onError?: (error: Error) => void,
  ) {
    this.cdnUrl = cdnUrl;
    this.cache = cache;
    this.interval = interval;
    this.onError = onError;
  }

  async start(): Promise<void> {
    await this.fetch();
    this.timer = setInterval(() => {
      this.fetch();
    }, this.interval * 1000);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async fetch(): Promise<void> {
    try {
      const response = await globalThis.fetch(this.cdnUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: FlagConfig = await response.json();

      // Skip update if version hasn't changed
      const currentVersion = this.cache.getVersion();
      if (currentVersion && data.version === currentVersion) {
        return;
      }

      this.cache.setConfig(data);
    } catch (error) {
      if (this.onError) {
        this.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
  }
}
