import { useState, useEffect } from 'react';

const STORAGE_PREFIX = 'erp-';

/**
 * useState that persists to localStorage.
 * Loads initial value from localStorage; falls back to defaultValue if parse fails or key is missing.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = STORAGE_PREFIX + key;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored != null) {
        return JSON.parse(stored) as T;
      }
    } catch (_) {}
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {}
  }, [storageKey, state]);

  return [state, setState];
}
