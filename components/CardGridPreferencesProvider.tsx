"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_GRID_PREFERENCES,
  GRID_PREFERENCES_LOCAL_STORAGE_KEY,
  normalizeGridPreferences,
  type GridPreferences,
} from "@/lib/gridPreferences";

const PERSIST_DEBOUNCE_MS = 450;

type CardGridPreferencesContextValue = {
  preferences: GridPreferences;
  isLoggedIn: boolean;
  updatePreferences: (patch: Partial<GridPreferences>) => void;
  pending: boolean;
};

const CardGridPreferencesContext = createContext<CardGridPreferencesContextValue | null>(null);

export function useCardGridPreferences(): CardGridPreferencesContextValue {
  const ctx = useContext(CardGridPreferencesContext);
  if (!ctx) {
    return {
      preferences: { ...DEFAULT_GRID_PREFERENCES },
      isLoggedIn: false,
      updatePreferences: () => {},
      pending: false,
    };
  }
  return ctx;
}

type Props = {
  children: ReactNode;
  initial: GridPreferences | null;
  isLoggedIn: boolean;
};

export function CardGridPreferencesProvider({ children, initial, isLoggedIn }: Props) {
  const [preferences, setPreferences] = useState<GridPreferences>(() =>
    normalizeGridPreferences(initial ?? undefined),
  );
  const [pending, setPending] = useState(false);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<GridPreferences>(normalizeGridPreferences(initial ?? undefined));

  useEffect(() => {
    latestRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  const persistToApi = useCallback(async () => {
    if (!isLoggedIn) return;
    const payload = latestRef.current;
    setPending(true);
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gridColumnsMobile: payload.gridColumnsMobile,
          gridColumnsDesktop: payload.gridColumnsDesktop,
        }),
      });
      const data = (await res.json()) as { preferences?: GridPreferences; error?: string };
      if (!res.ok || !data.preferences) return;
      const saved = normalizeGridPreferences(data.preferences);
      setPreferences(saved);
      latestRef.current = saved;
      try {
        localStorage.setItem(GRID_PREFERENCES_LOCAL_STORAGE_KEY, JSON.stringify(saved));
      } catch {
        /* ignore */
      }
    } catch {
      /* keep optimistic UI; next change will retry */
    } finally {
      setPending(false);
    }
  }, [isLoggedIn]);

  const schedulePersist = useCallback(() => {
    if (!isLoggedIn) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void persistToApi();
    }, PERSIST_DEBOUNCE_MS);
  }, [isLoggedIn, persistToApi]);

  const updatePreferences = useCallback(
    (patch: Partial<GridPreferences>) => {
      const next = normalizeGridPreferences({ ...latestRef.current, ...patch });
      latestRef.current = next;
      setPreferences(next);
      schedulePersist();
    },
    [schedulePersist],
  );

  const value = useMemo(
    () => ({
      preferences,
      isLoggedIn,
      updatePreferences,
      pending,
    }),
    [preferences, isLoggedIn, updatePreferences, pending],
  );

  return (
    <CardGridPreferencesContext.Provider value={value}>{children}</CardGridPreferencesContext.Provider>
  );
}
