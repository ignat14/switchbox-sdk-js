import { createContext } from 'react';
import type { Client } from 'switchbox-js';

export const SwitchboxContext = createContext<Client | null>(null);

interface SwitchboxProviderProps {
  client: Client;
  children: React.ReactNode;
}

export function SwitchboxProvider({
  client,
  children,
}: SwitchboxProviderProps) {
  return (
    <SwitchboxContext.Provider value={client}>
      {children}
    </SwitchboxContext.Provider>
  );
}
