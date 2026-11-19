import { ageOn, daysUntil } from '../lib/dates';
import { ecowasNationalities } from './labels';
import type { Passenger, RegistrationStatus } from './types';

export const fullName = (p: Pick<Passenger, 'firstName' | 'lastName'>) => `${p.lastName.toUpperCase()} ${p.firstName}`;

export const isMinor = (p: Pick<Passenger, 'dateOfBirth'>) => !!p.dateOfBirth && ageOn(p.dateOfBirth) < 18;

export function visaLikelyRequired(nationality: string): boolean {
  return !!nationality && !ecowasNationalities.has(nationality);
}

/** Problèmes administratifs que l'agence peut faire corriger par le voyageur. */
export function administrativeIssues(p: Passenger): string[] {
  const issues: string[] = [];
  if (p.consentStatus === 'declined') return issues;
  if (!p.documentNumber) issues.push('Numéro de document manquant');
  if (p.documentExpiry && daysUntil(p.documentExpiry) < 0) issues.push('Le document est arrivé à expiration.');
  if (p.visaRequired && !p.visaNumber) issues.push('Visa requis non renseigné');
  if (!p.documentFront) issues.push('Recto du document non capturé');
  if (!p.face) issues.push('Photo du visage non capturée');
  if (isMinor(p) && !p.guardianPassengerId) issues.push('Adulte responsable non renseigné pour un mineur');
  return issues;
}

export function computeRegistrationStatus(p: Passenger): RegistrationStatus {
  if (p.consentStatus === 'pending') return 'consent_pending';
  if (p.consentStatus === 'declined') return 'registered';
  if (!p.documentNumber || !p.documentExpiry || !p.documentFront || !p.face) return 'incomplete';
  if (isMinor(p) && !p.guardianPassengerId) return 'incomplete';
  if (daysUntil(p.documentExpiry) < 0 || (p.visaRequired && !p.visaNumber)) return 'document_check';
  return 'registered';
}

export function maskDocument(n: string): string {
  if (n.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}`;
}
