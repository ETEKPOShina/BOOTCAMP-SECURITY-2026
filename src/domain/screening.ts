import { daysUntil } from '../lib/dates';
import type { Passenger, PoliceStatus, Trip } from './types';

/**
 * SIMULATION — Réponse de vérification police.
 * Dans le dispositif cible, la vérification est réalisée dans l'infrastructure de la police,
 * avec ses propres systèmes. Ce prototype n'est connecté à aucun fichier de police ni à aucune base
 * gouvernementale ou internationale. Les règles ci-dessous ne servent qu'à produire des exemples.
 */
export const DEMO_RED_PREFIX = 'ZZ';

export function simulateScreening(p: Passenger, trip: Trip): { status: PoliceStatus; reason: string } {
  if (p.documentNumber.toUpperCase().startsWith(DEMO_RED_PREFIX)) {
    return {
      status: 'red',
      reason: "Correspondance simulée avec une liste de démonstration (règle « ZZ »). À confirmer par l'officier selon les procédures du service.",
    };
  }
  const travelDate = trip.scheduledDeparture.slice(0, 10);
  if (daysUntil(p.documentExpiry) < daysUntil(travelDate)) {
    return { status: 'orange', reason: 'Document de voyage expiré à la date du voyage (contrôle simulé).' };
  }
  if (p.visaRequired && !p.visaNumber) {
    return { status: 'orange', reason: 'Visa requis non renseigné (contrôle simulé).' };
  }
  if (p.registrationStatus === 'document_check') {
    return { status: 'orange', reason: 'Lisibilité du document à confirmer au guichet (contrôle simulé).' };
  }
  return { status: 'green', reason: 'Aucune anomalie dans la réponse simulée.' };
}
