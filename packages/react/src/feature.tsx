import { useFlag } from './hooks';
import type { UserContext } from 'switchbox-js';

interface FeatureProps {
  flag: string;
  user?: UserContext;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Feature({
  flag,
  user,
  children,
  fallback = null,
}: FeatureProps) {
  const enabled = useFlag(flag, user);
  return <>{enabled ? children : fallback}</>;
}
