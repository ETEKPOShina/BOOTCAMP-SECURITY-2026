import { useSyncExternalStore } from 'react';
import { createSeed, SCHEMA_VERSION } from './seed';
import type { DbState } from '../domain/types';

/**
 * Persistance locale de DÉMONSTRATION (localStorage du navigateur).
 * Ce n'est pas une base de données sécurisée : elle ne contient que des données fictives
 * et ne doit jamais recevoir de données personnelles réelles.
 */
const KEY = 'wezonpass-demo-db';

function load(): DbState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as DbState;
      if (parsed.schemaVersion === SCHEMA_VERSION) return parsed;
    }
  } catch {
    /* données corrompues : on repart du jeu de démonstration */
  }
  return createSeed();
}

let state: DbState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : la démonstration reste en mémoire */
  }
}

function emit() {
  for (const l of listeners) l();
}

export function getDb(): DbState {
  return state;
}

/** Applique une mutation sur une copie de l'état, puis notifie les écrans. */
export function mutate(fn: (draft: DbState) => void): void {
  const draft = structuredClone(state);
  fn(draft);
  state = draft;
  persist();
  emit();
}

export function resetDb(): void {
  state = createSeed();
  persist();
  emit();
}

/** Remplace l'état (tests). */
export function replaceDb(next: DbState): void {
  state = next;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Synchronisation entre onglets du même navigateur (démonstration multi-rôles).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue) as DbState;
      emit();
    } catch {
      /* ignoré */
    }
  });
}

export function useDb(): DbState {
  return useSyncExternalStore(subscribe, getDb, getDb);
}
