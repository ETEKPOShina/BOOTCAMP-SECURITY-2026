import { useSyncExternalStore } from 'react';
import { recordDriverEvent, type DriverEventInput } from './api';
import type { User } from '../domain/types';

/**
 * File d'attente locale des événements chauffeur saisis hors ligne (localStorage de l'appareil).
 * Limite du prototype : stockage non chiffré du navigateur. Une application Android dédiée
 * devra utiliser un stockage sécurisé. Chaque événement porte un identifiant client unique
 * afin d'éviter tout doublon lors de la synchronisation.
 */
const KEY = 'wezonpass-driver-queue';
export interface QueuedEvent extends DriverEventInput { userId: string; queuedAt: string }

const listeners = new Set<() => void>();
let cache: QueuedEvent[] = read();

function read(): QueuedEvent[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedEvent[]; } catch { return []; }
}

function write(q: QueuedEvent[]) {
  cache = q;
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* ignoré */ }
  for (const l of listeners) l();
}

export function enqueue(e: QueuedEvent) {
  if (cache.some((x) => x.clientEventId === e.clientEventId)) return;
  write([...cache, e]);
}

export function flushQueue(actor: User): { synced: number; failed: number } {
  let synced = 0;
  let failed = 0;
  const remaining: QueuedEvent[] = [];
  for (const e of cache) {
    if (e.userId !== actor.id) { remaining.push(e); continue; }
    try {
      recordDriverEvent(actor, e);
      synced++;
    } catch {
      failed++;
    }
  }
  write(remaining);
  return { synced, failed };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useQueue(userId: string): QueuedEvent[] {
  const all = useSyncExternalStore(subscribe, () => cache, () => cache);
  return all.filter((e) => e.userId === userId);
}
