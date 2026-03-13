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

export interface Flag {
  enabled: boolean;
  rollout_pct: number;
  flag_type: 'boolean' | 'string' | 'number' | 'json';
  default_value: any;
  rules: Rule[];
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
  cdnUrl: string;
  pollInterval?: number;
  onError?: (error: Error) => void;
  onEvaluation?: (flagKey: string, result: any, user?: UserContext) => void;
}
