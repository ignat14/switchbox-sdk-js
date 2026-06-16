import { createContext } from 'react';
import type { Switchbox } from 'switchbox-js';

export const SwitchboxContext = createContext<Switchbox | null>(null);

interface SwitchboxProviderProps {
  client: Switchbox;
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
