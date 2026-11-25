import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from '@/src/api/SessionContext';
import { getSettings, saveSettings, type SetKind, type TechniqueLinks } from './db/queries';
import type { Unit } from './utils/format';

/** Account settings (stored on the server): weight unit, rest-timer length, general technique videos. */
type Ctx = {
  unit: Unit;
  setUnit: (u: Unit) => Promise<void>;
  /** Rest timer after a ticked set, in seconds; 0 = off. */
  restSeconds: number;
  setRestSeconds: (s: number) => Promise<void>;
  /** YouTube video per set type (warm-up, drop set…), shown on every set of that type while training. */
  techniqueLinks: TechniqueLinks;
  setTechniqueLink: (kind: SetKind, link: string) => Promise<void>;
};

const UnitContext = createContext<Ctx>({
  unit: 'kg',
  setUnit: async () => {},
  restSeconds: 60,
  setRestSeconds: async () => {},
  techniqueLinks: {},
  setTechniqueLink: async () => {},
});

export function UnitProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [unit, setUnitState] = useState<Unit>('kg');
  const [restSeconds, setRestState] = useState(60);
  const [techniqueLinks, setLinks] = useState<TechniqueLinks>({});

  useEffect(() => {
    getSettings(api)
      .then((s) => {
        setUnitState(s.unit);
        setRestState(s.rest_seconds);
        setLinks(s.technique_links);
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

  // Saved first (the server checks it's a YouTube link), then shown.
  const setTechniqueLink = useCallback(
    async (kind: SetKind, link: string) => {
      const v = link.trim();
      await saveSettings(api, { technique_links: { [kind]: v } });
      setLinks((prev) => ({ ...prev, [kind]: v }));
    },
    [api]
  );

  return (
    <UnitContext.Provider value={{ unit, setUnit, restSeconds, setRestSeconds, techniqueLinks, setTechniqueLink }}>
      {children}
    </UnitContext.Provider>
  );
}

export const useUnit = () => useContext(UnitContext);
