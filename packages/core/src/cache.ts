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
    // Own properties only: "constructor" is a valid flag key per the backend's
    // key regex, and a bare index would resolve it up the prototype chain to
    // `Object` instead of null.
    return Object.hasOwn(this.config.flags, key)
      ? this.config.flags[key]
      : null;
  }

  getVersion(): string | null {
    if (!this.config) return null;
    return this.config.version;
  }
}
