import { daysUntil } from '../lib/dates';
import type { Bus, Driver } from './types';

export type DocState = 'valid' | 'expiring' | 'expired' | 'to_check';

export const docStateLabel: Record<DocState, string> = {
  valid: 'Valide',
  expiring: 'Expire bientôt',
  expired: 'Expiré',
  to_check: 'À vérifier',
};

export const EXPIRY_WARNING_DAYS = 30;

export function expiryState(date: string | null | undefined): DocState {
  if (!date) return 'to_check';
  const d = daysUntil(date);
  if (d < 0) return 'expired';
  if (d <= EXPIRY_WARNING_DAYS) return 'expiring';
  return 'valid';
}

export function worst(states: DocState[]): DocState {
  const order: DocState[] = ['expired', 'to_check', 'expiring', 'valid'];
  for (const s of order) if (states.includes(s)) return s;
  return 'valid';
}

export function busDocuments(b: Bus) {
  return [
    { label: "Certificat d'immatriculation", ref: b.registrationDocumentRef, expiry: null as string | null, state: b.registrationDocumentStatus === 'valid' ? ('valid' as DocState) : ('to_check' as DocState) },
    { label: 'Visite technique', ref: '', expiry: b.inspectionExpiry, state: expiryState(b.inspectionExpiry) },
    { label: 'Assurance', ref: '', expiry: b.insuranceExpiry, state: expiryState(b.insuranceExpiry) },
    { label: 'Carte brune CEDEAO', ref: '', expiry: b.brownCardExpiry, state: expiryState(b.brownCardExpiry) },
  ];
}

export function driverDocuments(d: Driver) {
  return [
    { label: "Pièce d'identité", ref: d.identityDocumentRef, expiry: d.identityDocumentExpiry, state: expiryState(d.identityDocumentExpiry) },
    { label: 'Permis de conduire', ref: d.licenceReference, expiry: d.licenceExpiry, state: expiryState(d.licenceExpiry) },
    { label: 'Carte professionnelle', ref: d.professionalCardReference, expiry: d.professionalCardExpiry, state: expiryState(d.professionalCardExpiry) },
  ];
}

export function busDocState(b: Bus): DocState {
  return worst(busDocuments(b).map((d) => d.state));
}

export function driverDocState(d: Driver): DocState {
  return worst(driverDocuments(d).map((x) => x.state));
}

/** Un bus est indisponible si un document obligatoire est expiré ou s'il est en maintenance. */
export function busAvailability(b: Bus): { available: boolean; reason: string } {
  if (b.status === 'maintenance') return { available: false, reason: 'En maintenance' };
  const expired = busDocuments(b).filter((d) => d.state === 'expired');
  if (expired.length) return { available: false, reason: `${expired.map((d) => d.label).join(', ')} expiré(e)` };
  return { available: true, reason: '' };
}

export function driverAvailability(d: Driver): { available: boolean; reason: string } {
  if (d.status !== 'active') return { available: false, reason: 'Inactif' };
  const expired = driverDocuments(d).filter((x) => x.state === 'expired');
  if (expired.length) return { available: false, reason: `${expired.map((x) => x.label).join(', ')} expiré(e)` };
  return { available: true, reason: '' };
}
