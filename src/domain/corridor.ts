import type { Country, Direction, TripStatus } from './types';

/** Points du corridor Lomé – Cotonou. Distances approximatives : données de démonstration. */
export interface RoutePoint { label: string; km: number; kind: 'city' | 'border'; country: Country }

const TG_TO_BJ: RoutePoint[] = [
  { label: 'Lomé', km: 0, kind: 'city', country: 'TG' },
  { label: 'Aného', km: 45, kind: 'city', country: 'TG' },
  { label: 'Frontière Sanvee-Condji / Hillacondji', km: 55, kind: 'border', country: 'TG' },
  { label: 'Grand-Popo', km: 75, kind: 'city', country: 'BJ' },
  { label: 'Comè', km: 92, kind: 'city', country: 'BJ' },
  { label: 'Ouidah', km: 118, kind: 'city', country: 'BJ' },
  { label: 'Cotonou', km: 155, kind: 'city', country: 'BJ' },
];

export function routeFor(direction: Direction): RoutePoint[] {
  if (direction === 'TG-BJ') return TG_TO_BJ;
  const total = TG_TO_BJ[TG_TO_BJ.length - 1].km;
  return [...TG_TO_BJ].reverse().map((p) => ({ ...p, km: total - p.km }));
}

export const ROUTE_LENGTH_KM = 155;

export const AUTHORIZED_STOP_OPTIONS = ['Aného', 'Grand-Popo', 'Comè', 'Ouidah'];

export function endpoints(direction: Direction) {
  return direction === 'TG-BJ'
    ? { departure: 'Lomé', destination: 'Cotonou' }
    : { departure: 'Cotonou', destination: 'Lomé' };
}

/** Pays de sortie puis d'entrée selon le sens. */
export function exitEntry(direction: Direction): { exit: Country; entry: Country } {
  return direction === 'TG-BJ' ? { exit: 'TG', entry: 'BJ' } : { exit: 'BJ', entry: 'TG' };
}

export const STAGES = ['Préparation', 'Enregistrement', 'Embarquement', 'En route', 'Frontière', 'Arrivée'] as const;

export function stageIndex(status: TripStatus): number {
  switch (status) {
    case 'planned': return 0;
    case 'preparing': return 1;
    case 'boarding':
    case 'boarding_closed': return 2;
    case 'en_route': return 3;
    case 'approaching_border':
    case 'at_border': return 4;
    case 'arrived': return 5;
    case 'cancelled': return -1;
  }
}
