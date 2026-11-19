import { useCallback, useState } from 'react';
import { useToast } from '../components/Toast';
import { ApiError } from '../services/api';

/** Latence simulée, pour rendre visibles les états de chargement. */
const LATENCY = 350;

/**
 * Exécute une action de service : état de chargement, message de réussite, message d'erreur.
 */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => T, success?: string | ((r: T) => string | null)): Promise<T | undefined> => {
      setBusy(key);
      await new Promise((r) => setTimeout(r, LATENCY));
      try {
        const r = fn();
        const msg = typeof success === 'function' ? success(r) : success;
        if (msg) toast(msg);
        return r;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Une erreur est survenue. Réessayez.', 'error');
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { run, busy };
}
