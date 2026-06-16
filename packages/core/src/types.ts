export interface Rule {
  attribute: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'ends_with'
    | 'in_list'
    | 'gt'
    | 'lt';
  value: any;
}

/**
 * An AND-group of conditions. Groups are OR'd by the evaluator — two-level DNF
 * (ADR-015): a flag matches if any group matches; a group matches if all its
 * conditions match.
 */
export interface RuleGroup {
  conditions: Rule[];
}

export interface Flag {
  enabled: boolean;
  rollout_pct: number;
  flag_type: 'boolean' | 'string' | 'number' | 'json';
  default_value: any;
  rules: RuleGroup[];
}

export interface FlagConfig {
  version: string;
  flags: Record<string, Flag>;
}

export interface UserContext {
  user_id?: string;
  id?: string;
  [key: string]: any;
}

export interface SwitchboxOptions {
  /** Per-environment SDK key from the dashboard. Used to build the CDN URL. */
  sdkKey: string;
  /** Override the CDN origin. Defaults to https://cdn.switchbox.dev. */
  cdnBaseUrl?: string;
  pollInterval?: number;
  onError?: (error: Error) => void;
  onEvaluation?: (flagKey: string, result: any, user?: UserContext) => void;
}
