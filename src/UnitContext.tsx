import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from '@/src/api/SessionContext';
import { getSettings, saveSettings, saveTechniques, type Technique } from './db/queries';
import type { Unit } from './utils/format';

/** Account settings (stored on the server): weight unit, rest-timer length, training techniques. */
type Ctx = {
  unit: Unit;
  setUnit: (u: Unit) => Promise<void>;
  /** Rest timer after a ticked set, in seconds; 0 = off. */
  restSeconds: number;
  setRestSeconds: (s: number) => Promise<void>;
  /** Techniques (warm-up, drop set, the user's own…) with their YouTube videos (Exercises tab). */
  techniques: Technique[];
  setTechniques: (list: Technique[]) => Promise<void>;
};

const UnitContext = createContext<Ctx>({
  unit: 'kg',
  setUnit: async () => {},
  restSeconds: 60,
  setRestSeconds: async () => {},
  techniques: [],
  setTechniques: async () => {},
});

export function UnitProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [unit, setUnitState] = useState<Unit>('kg');
  const [restSeconds, setRestState] = useState(60);
  const [techniques, setTechniquesState] = useState<Technique[]>([]);

  useEffect(() => {
    getSettings(api)
      .then((s) => {
        setUnitState(s.unit);
        setRestState(s.rest_seconds);
        setTechniquesState(s.techniques);
      })
      .catch(() => {});
  }, [api]);

  // Shown at once; saved in the background.
  const setUnit = useCallback(
    async (u: Unit) => {
      setUnitState(u);
      await saveSettings(api, { unit: u });
    },
    [api]
  );

  const setRestSeconds = useCallback(
    async (s: number) => {
      setRestState(s);
      await saveSettings(api, { rest_seconds: s });
    },
    [api]
  );

  // Saved first (the server checks names and YouTube links), then shown everywhere.
  const setTechniques = useCallback(
    async (list: Technique[]) => {
      await saveTechniques(api, list);
      setTechniquesState(list);
    },
    [api]
  );

  return (
    <UnitContext.Provider value={{ unit, setUnit, restSeconds, setRestSeconds, techniques, setTechniques }}>
      {children}
    </UnitContext.Provider>
  );
}

export const useUnit = () => useContext(UnitContext);
