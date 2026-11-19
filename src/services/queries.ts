/**
 * Lectures cloisonnées par rôle et par organisation.
 * Règle : les données police (PoliceReview, policeDetail) ne sont lues que par les fonctions « police* »
 * et « border* » autorisées. Les fonctions agence, douanes et administration ne les lisent jamais.
 */
import { can } from '../domain/permissions';
import { countryAuthority } from '../domain/labels';
import type {
  AppNotification, AuditLog, Authority, Country, DbState, Manifest, Organization, Passenger,
  PassengerTrip, PoliceReview, PoliceStatus, Trip, User,
} from '../domain/types';

export const orgById = (db: DbState, id: string) => db.organizations.find((o) => o.id === id);
export const userById = (db: DbState, id: string) => db.users.find((u) => u.id === id);
export const userName = (db: DbState, id: string | null) => (id ? userById(db, id)?.name ?? 'Système (simulation)' : '—');
export const busById = (db: DbState, id: string) => db.buses.find((b) => b.id === id);
export const driverById = (db: DbState, id: string) => db.drivers.find((d) => d.id === id);

export function activePts(db: DbState, tripId: string): PassengerTrip[] {
  return db.passengerTrips.filter((pt) => pt.tripId === tripId && !pt.removedAt);
}

export function passengerOf(db: DbState, pt: PassengerTrip): Passenger {
  return db.passengers.find((p) => p.id === pt.passengerId)!;
}

export function manifestsOfTrip(db: DbState, tripId: string): Manifest[] {
  return db.manifests.filter((m) => m.tripId === tripId).sort((a, b) => a.version - b.version);
}

export function latestManifest(db: DbState, tripId: string): Manifest | undefined {
  const ms = manifestsOfTrip(db, tripId);
  return ms[ms.length - 1];
}

export function tripEvents(db: DbState, tripId: string) {
  return db.tripEvents.filter((e) => e.tripId === tripId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ---------------------------------------------------------------- agence

export function agencyTrips(db: DbState, user: User): Trip[] {
  if (!can(user, 'agency.trip.view')) return [];
  return db.trips.filter((t) => t.agencyId === user.organizationId).sort((a, b) => b.scheduledDeparture.localeCompare(a.scheduledDeparture));
}

export function agencyTrip(db: DbState, user: User, id: string): Trip | undefined {
  return agencyTrips(db, user).find((t) => t.id === id);
}

export function agencyPassengers(db: DbState, user: User): Passenger[] {
  if (!can(user, 'agency.passenger.view')) return [];
  return db.passengers.filter((p) => p.agencyId === user.organizationId);
}

export function agencyBuses(db: DbState, user: User) {
  if (!can(user, 'agency.fleet.view')) return [];
  return db.buses.filter((b) => b.agencyId === user.organizationId);
}

export function agencyDrivers(db: DbState, user: User) {
  if (!can(user, 'agency.fleet.view')) return [];
  return db.drivers.filter((d) => d.agencyId === user.organizationId);
}

export function agencyNotices(db: DbState, user: User) {
  if (!can(user, 'agency.passenger.view')) return [];
  return db.agencyNotices.filter((n) => n.agencyId === user.organizationId);
}

/** Recherche par numéro de document ou téléphone, limitée à l'agence. */
export function searchPassengers(db: DbState, user: User, q: string): Passenger[] {
  const s = q.trim().toLowerCase().replace(/\s+/g, '');
  if (s.length < 3) return [];
  return agencyPassengers(db, user).filter((p) =>
    p.documentNumber.toLowerCase().replace(/\s+/g, '').includes(s) || p.phone.replace(/\s+/g, '').includes(s),
  );
}

// ---------------------------------------------------------------- police

export function authorityOf(db: DbState, user: User): Authority | null {
  const o = orgById(db, user.organizationId);
  return o?.country ? countryAuthority[o.country] : null;
}

export const RECEIVED_STATES = ['received', 'verifying', 'processed'];

export function policeManifests(db: DbState, user: User): Manifest[] {
  if (!can(user, 'police.manifest.view')) return [];
  const auth = authorityOf(db, user);
  return db.manifests
    .filter((m) => m.recipients.some((r) => r.authority === auth && RECEIVED_STATES.includes(r.state)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function policeReviews(db: DbState, user: User): PoliceReview[] {
  if (!can(user, 'police.status.view')) return [];
  const auth = authorityOf(db, user);
  return db.policeReviews.filter((r) => r.authority === auth);
}

/** Statut visible par un agent de poste frontalier : couleur sans motif. */
export function borderStatusView(db: DbState, user: User, passengerTripId: string): PoliceStatus | null {
  if (!can(user, 'police.status.view')) return null;
  const r = policeReviews(db, user).find((x) => x.passengerTripId === passengerTripId);
  return r ? r.status : null;
}

// ---------------------------------------------------------------- poste frontalier / douanes

/** Voyages qui transitent par le corridor : visibles des services frontaliers dès la clôture de l'embarquement. */
export function corridorTrips(db: DbState, user: User): Trip[] {
  if (!can(user, 'border.trip.view') && !can(user, 'customs.trip.view') && !can(user, 'police.manifest.view')) return [];
  return db.trips
    .filter((t) => t.status !== 'cancelled' && t.status !== 'planned' && t.status !== 'preparing')
    .sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture));
}

export function countryOf(db: DbState, user: User): Country | null {
  return orgById(db, user.organizationId)?.country ?? null;
}

export function tripBaggageTotal(db: DbState, tripId: string): number {
  return activePts(db, tripId).filter((pt) => pt.boardingStatus === 'boarded' || pt.boardingStatus === 'pending').reduce((s, pt) => s + pt.baggageCount, 0);
}

// ---------------------------------------------------------------- notifications et audit

export function notificationsFor(db: DbState, user: User): AppNotification[] {
  const org = orgById(db, user.organizationId);
  return db.notifications
    .filter((n) => {
      const a = n.audience;
      if (a.kind === 'user') return a.userId === user.id;
      if (a.kind === 'org') return a.organizationId === user.organizationId && user.role !== 'driver';
      return org?.type === a.orgType && (!a.country || a.country === org.country) && user.role !== 'driver';
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Journal d'audit cloisonné. Le détail police n'est renvoyé qu'aux services de police. */
export function auditFor(db: DbState, user: User): AuditLog[] {
  const org = orgById(db, user.organizationId);
  let logs: AuditLog[] = [];
  if (can(user, 'admin.audit.view')) logs = db.auditLogs;
  else if (can(user, 'agency.audit.view') || can(user, 'police.audit.view') || org?.type === 'border_post' || org?.type === 'customs') {
    logs = db.auditLogs.filter((l) => l.organizationId === user.organizationId);
  }
  const keepDetail = can(user, 'police.reason.view');
  return logs.map((l) => (keepDetail ? l : { ...l, policeDetail: undefined }));
}

export function agencies(db: DbState): Organization[] {
  return db.organizations.filter((o) => o.type === 'agency');
}

// ---------------------------------------------------------------- statistiques

export interface StatsFilter { range: 'today' | '7d' | 'all'; direction: 'all' | 'TG-BJ' | 'BJ-TG'; agencyId?: string }

export function computeStats(db: DbState, trips: Trip[]) {
  const ids = new Set(trips.map((t) => t.id));
  const pts = db.passengerTrips.filter((pt) => ids.has(pt.tripId) && !pt.removedAt);
  const pre = pts.filter((pt) => pt.preRegistered).length;
  const recips = db.manifests.filter((m) => ids.has(m.tripId)).flatMap((m) => m.recipients).filter((r) => r.sentAt);
  const acked = recips.filter((r) => r.acknowledgedAt);
  const processed = recips.filter((r) => r.processedAt && r.sentAt);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const mins = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  const borderTimes = trips
    .filter((t) => t.border.TG.completedAt && t.border.BJ.completedAt && (t.border.TG.arrivedAt || t.border.BJ.arrivedAt))
    .map((t) => {
      const starts = [t.border.TG.arrivedAt, t.border.BJ.arrivedAt].filter(Boolean) as string[];
      const ends = [t.border.TG.completedAt!, t.border.BJ.completedAt!];
      return mins(starts.sort()[0], ends.sort()[1]);
    });
  let discrepancies = 0;
  for (const t of trips) {
    const boarded = pts.filter((pt) => pt.tripId === t.id && pt.boardingStatus === 'boarded').length;
    for (const c of ['TG', 'BJ'] as const) {
      const s = t.border[c];
      if (s.actualCount !== null && s.actualCount !== boarded) discrepancies++;
      discrepancies += Object.values(s.checks).filter((v) => v === 'discrepancy').length;
    }
  }
  return {
    trips: trips.length,
    passengers: pts.length,
    preRate: pts.length ? Math.round((pre / pts.length) * 100) : null,
    receptionRate: recips.length ? Math.round((acked.length / recips.length) * 100) : null,
    policeResponse: avg(processed.map((r) => mins(r.sentAt!, r.processedAt!))),
    borderTime: avg(borderTimes),
    borderSamples: borderTimes.length,
    discrepancies,
    failed: recips.filter((r) => r.state === 'failed').length,
  };
}

export function filterTripsForStats(trips: Trip[], f: StatsFilter): Trip[] {
  const now = Date.now();
  return trips.filter((t) => {
    if (t.status === 'cancelled') return false;
    if (f.direction !== 'all' && t.direction !== f.direction) return false;
    if (f.agencyId && t.agencyId !== f.agencyId) return false;
    const d = new Date(t.scheduledDeparture);
    if (f.range === 'today') return d.toDateString() === new Date().toDateString();
    if (f.range === '7d') return now - d.getTime() <= 7 * 86400000 && d.getTime() - now <= 2 * 86400000;
    return true;
  });
}

/** Totaux agrégés orange / rouge : police (son autorité) ou administration centrale (sans aucun détail). */
export function policeAggregate(db: DbState, user: User, tripIds: Set<string>): { orange: number; red: number } | null {
  let reviews: PoliceReview[];
  if (can(user, 'police.status.view')) reviews = policeReviews(db, user);
  else if (can(user, 'admin.stats.police_aggregate')) reviews = db.policeReviews;
  else return null;
  const r = reviews.filter((x) => tripIds.has(x.tripId));
  return { orange: r.filter((x) => x.status === 'orange').length, red: r.filter((x) => x.status === 'red').length };
}
