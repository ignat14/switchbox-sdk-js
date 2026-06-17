import { rolloutBucket } from './hash';
import type { Flag, Rule, RuleGroup, UserContext } from './types';

export function enabledValue(flag: Flag): any {
  if (flag.flag_type === 'boolean') return true;
  // Non-boolean: serve enabled_value (variations, ADR-017), falling back to
  // default_value when unset — so configs without it behave as before.
  return flag.enabled_value ?? flag.default_value;
}

/**
 * Normalise a flag's rules into RuleGroups. Accepts the two-level shape
 * (`{conditions: [...]}`) and the legacy flat shape (`{attribute, operator,
 * value}` — a pre-DNF config), wrapping each flat condition as a single-
 * condition group. Idempotent, so it's safe to call on already-normalised
 * config. See ADR-015.
 */
export function toRuleGroups(rules: any): RuleGroup[] {
  if (!Array.isArray(rules)) return [];
  return rules.map((r) =>
    r && Array.isArray(r.conditions)
      ? { conditions: r.conditions }
      : { conditions: [r] },
  );
}

function matchGroup(group: RuleGroup, userContext: UserContext): boolean {
  // AND: every condition must match. An empty group matches no one.
  return (
    group.conditions.length > 0 &&
    group.conditions.every((c) => matchRule(c, userContext))
  );
}

export function matchRule(rule: Rule, userContext: UserContext): boolean {
  if (!(rule.attribute in userContext)) return false;
  const contextValue = userContext[rule.attribute];

  switch (rule.operator) {
    case 'equals':
      return String(contextValue) === String(rule.value);
    case 'not_equals':
      return String(contextValue) !== String(rule.value);
    case 'contains':
      return String(contextValue).includes(String(rule.value));
    case 'ends_with':
      return String(contextValue).endsWith(String(rule.value));
    case 'in_list':
      return (rule.value as any[]).includes(String(contextValue));
    case 'gt': {
      const a = parseFloat(contextValue);
      const b = parseFloat(rule.value);
      return !isNaN(a) && !isNaN(b) && a > b;
    }
    case 'lt': {
      const a = parseFloat(contextValue);
      const b = parseFloat(rule.value);
      return !isNaN(a) && !isNaN(b) && a < b;
    }
    default:
      return false;
  }
}

export async function evaluate(
  flag: Flag,
  flagKey: string,
  userContext?: UserContext,
): Promise<any> {
  // 1. Flag disabled → return default_value
  if (!flag.enabled) {
    return flag.default_value;
  }

  // 2. No user context → if rollout_pct == 100 return enabledValue, else default_value
  if (!userContext) {
    return flag.rollout_pct === 100
      ? enabledValue(flag)
      : flag.default_value;
  }

  // 3. Rule groups: OR across groups, AND within a group (two-level DNF).
  //    Any matching group wins.
  for (const group of toRuleGroups(flag.rules)) {
    if (matchGroup(group, userContext)) {
      return enabledValue(flag);
    }
  }

  // 4. Rollout %. Resolve the id with ?? (null-only): an empty-string user_id
  //    is a real id, not "missing".
  const userId = userContext.user_id ?? userContext.id;
  if (userId !== undefined && userId !== null) {
    const bucket = await rolloutBucket(String(userId), flagKey);
    return bucket < flag.rollout_pct ? enabledValue(flag) : flag.default_value;
  }

  // 5. No usable id to hash → only a full (100%) rollout reaches everyone,
  //    matching the no-user-context branch above (ADR-008 / parity with Python).
  return flag.rollout_pct === 100 ? enabledValue(flag) : flag.default_value;
}
