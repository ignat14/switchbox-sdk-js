import { rolloutBucket } from './hash';
import type { Flag, Rule, UserContext } from './types';

export function enabledValue(flag: Flag): any {
  if (flag.flag_type === 'boolean') return true;
  return flag.default_value;
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

  // 3. Rules match (OR logic — any match wins) → return enabledValue
  if (flag.rules.length > 0) {
    for (const rule of flag.rules) {
      if (matchRule(rule, userContext)) {
        return enabledValue(flag);
      }
    }
  }

  // 4. Rollout % → hash(user_id + ":" + flag_key) % 100 < rollout_pct
  const userId = userContext.user_id ?? userContext.id;
  if (userId !== undefined) {
    const bucket = await rolloutBucket(String(userId), flagKey);
    if (bucket < flag.rollout_pct) {
      return enabledValue(flag);
    }
  }

  // 5. Nothing matched → return default_value
  return flag.default_value;
}
