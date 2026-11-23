import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getUnit, setUnit as saveUnit } from './db/queries';
import type { Unit } from './utils/format';

type Ctx = { unit: Unit; setUnit: (u: Unit) => Promise<void> };

const UnitContext = createContext<Ctx>({ unit: 'kg', setUnit: async () => {} });

export function UnitProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [unit, setUnitState] = useState<Unit>('kg');

  useEffect(() => {
    getUnit(db).then(setUnitState);
  }, [db]);

  const setUnit = useCallback(
    async (u: Unit) => {
      setUnitState(u);
      await saveUnit(db, u);
    },
    [db]
  );

  return <UnitContext.Provider value={{ unit, setUnit }}>{children}</UnitContext.Provider>;
}

export const useUnit = () => useContext(UnitContext);
