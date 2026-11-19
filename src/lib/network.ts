import { useSyncExternalStore } from 'react';

/**
 * État réseau de l'appareil. Combine l'état réel du navigateur (navigator.onLine)
 * et un mode « hors ligne simulé » propre à cet appareil, utile pour la démonstration.
 */
const SIM_KEY = 'wezonpass-net-sim';
const listeners = new Set<() => void>();

function readSim(): boolean {
  try { return localStorage.getItem(SIM_KEY) === '1'; } catch { return false; }
}

let simulated = typeof localStorage !== 'undefined' ? readSim() : false;

export function isDeviceOffline(): boolean {
  const real = typeof navigator !== 'undefined' && navigator.onLine === false;
  return real || simulated;
}

export function setSimulatedOffline(v: boolean) {
  simulated = v;
  try { localStorage.setItem(SIM_KEY, v ? '1' : '0'); } catch { /* ignoré */ }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
}

const snapshot = () => `${isDeviceOffline() ? 1 : 0}${simulated ? 1 : 0}`;

export function useNetwork() {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { offline: s[0] === '1', simulated: s[1] === '1' };
}
