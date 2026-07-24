export { Switchbox } from './client';
export { evaluate, enabledValue, matchRule, toRuleGroups } from './evaluator';
export { FlagCache } from './cache';
export { sha256Hex, rolloutBucket } from './hash';
export {
  TelemetryAggregator,
  TelemetryReporter,
  valueRepr,
  MAX_VALUES_PER_FLAG,
  OTHER_BUCKET,
} from './telemetry';
export { SDK_NAME, SDK_VERSION } from './version';
export type {
  Rule,
  RuleGroup,
  Flag,
  FlagConfig,
  UserContext,
  SwitchboxOptions,
} from './types';
