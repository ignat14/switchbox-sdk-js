import { useContext, useState, useEffect } from 'react';
import { SwitchboxContext } from './provider';
import type { Client, UserContext } from 'switchbox-js';

export function useClient(): Client {
  const client = useContext(SwitchboxContext);
  if (!client) {
    throw new Error('useClient must be used within a <SwitchboxProvider>');
  }
  return client;
}

export function useFlag(flagKey: string, user?: UserContext): boolean {
  const client = useClient();
  const [value, setValue] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    client.enabled(flagKey, user).then((result) => {
      if (mounted) setValue(result);
    });
    return () => {
      mounted = false;
    };
  }, [client, flagKey, JSON.stringify(user)]);

  return value;
}

export function useValue<T = any>(
  flagKey: string,
  user?: UserContext,
  defaultValue?: T,
): T {
  const client = useClient();
  const [value, setValue] = useState<T>(defaultValue as T);

  useEffect(() => {
    let mounted = true;
    client.getValue(flagKey, user, defaultValue).then((result) => {
      if (mounted) setValue(result);
    });
    return () => {
      mounted = false;
    };
  }, [client, flagKey, JSON.stringify(user), defaultValue]);

  return value;
}
