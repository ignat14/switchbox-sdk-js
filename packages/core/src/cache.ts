import type { Flag, FlagConfig } from './types';

export class FlagCache {
  private config: FlagConfig | null = null;

  getConfig(): FlagConfig | null {
    return this.config;
  }

  setConfig(config: FlagConfig): void {
    this.config = config;
  }

  getFlag(key: string): Flag | null {
    if (!this.config) return null;
    return this.config.flags[key] ?? null;
  }

  getVersion(): string | null {
    if (!this.config) return null;
    return this.config.version;
  }
}
