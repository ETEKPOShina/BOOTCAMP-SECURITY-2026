/**
 * Couche « service » du prototype. Elle joue le rôle d'un serveur de démonstration :
 * chaque opération vérifie l'habilitation et l'organisation de l'utilisateur, applique la
 * mutation et écrit le journal d'audit. En production, ces contrôles doivent être faits côté serveur.
 */
import { getDb, mutate } from '../data/store';
import { can, type Permission } from '../domain/permissions';
import { authorityCountry, authorityLabel, borderPostName, countryAuthority, directionLabel } from '../domain/labels';
import { exitEntry } from '../domain/corridor';
import { computeRegistrationStatus, fullName } from '../domain/passenger';
import { simulateScreening } from '../domain/screening';
import { busAvailability, driverAvailability } from '../domain/documents';
import { uid, shortCode } from '../lib/ids';
import { nowIso, addMinutes } from '../lib/dates';
import { isDeviceOffline } from '../lib/network';
import type {
  AgencyNotice, AppNotification, AuditLog, Authority, Bus, Country, DbState, Direction, Driver,
  Manifest, ManifestType, Organization, Passenger, PassengerTrip, PoliceStatus, Role, Trip,
  TripEvent, TripEventType, User, AccessRequest, PlatformSettings,
} from '../domain/types';

export class ApiError extends Error {
  code: 'forbidden' | 'not_found' | 'invalid' | 'conflict';
  constructor(code: ApiError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export const FORBIDDEN_MESSAGE = 'Cette action nécessite une habilitation spécifique.';

// ---------------------------------------------------------------- helpers

function orgOf(db: DbState, user: User): Organization {
  const o = db.organizations.find((x) => x.id === user.organizationId);
  if (!o) throw new ApiError('not_found', 'Organisation introuvable.');
  return o;
}

function pushAudit(db: DbState, actor: User | null, action: string, entityType: string, entityId: string, outcome: AuditLog['outcome'] = 'success', policeDetail?: string) {
  const org = actor ? db.organizations.find((o) => o.id === actor.organizationId) : null;
  db.auditLogs.unshift({
    id: uid('a'), userId: actor?.id ?? 'system', userName: actor?.name ?? 'Système (simulation)',
    organizationId: org?.id ?? 'system', organizationName: org?.name ?? 'Plateforme', role: actor?.role ?? 'system',
    action, entityType, entityId, timestamp: nowIso(), outcome, policeDetail,
  });
}

function pushNotif(db: DbState, audience: AppNotification['audience'], title: string, body: string, link: string | null, severity: AppNotification['severity'] = 'info') {
  db.notifications.unshift({ id: uid('n'), audience, title, body, link, createdAt: nowIso(), readBy: [], severity });
}

function pushEvent(db: DbState, tripId: string, eventType: TripEventType, actor: User, locationLabel = '', note = '', clientEventId = uid('ce'), timestamp = nowIso()) {
  const e: TripEvent = { id: uid('ev'), clientEventId, tripId, eventType, timestamp, recordedBy: actor.id, locationLabel, note, synchronizationStatus: 'synced' };
  db.tripEvents.push(e);
  return e;
}

/** Vérifie une habilitation ; en cas de refus, le refus est journalisé. */
function authorize(actor: User, p: Permission, entity = '') {
  const fresh = getDb().users.find((u) => u.id === actor.id);
  if (!fresh || !can(fresh, p)) {
    mutate((db) => pushAudit(db, actor, `Action refusée (${p})`, 'Habilitation', entity, 'denied'));
    throw new ApiError('forbidden', FORBIDDEN_MESSAGE);
  }
}

function ownTrip(db: DbState, actor: User, tripId: string): Trip {
  const t = db.trips.find((x) => x.id === tripId);
  if (!t || t.agencyId !== actor.organizationId) throw new ApiError('not_found', 'Voyage introuvable.');
  return t;
}

function busOf(db: DbState, t: Trip) {
  return db.buses.find((b) => b.id === t.busId);
}

// ---------------------------------------------------------------- authentification (démo)

export const DEMO_PASSWORD = 'demo2026';

export function login(loginId: string, password: string): User {
  const db = getDb();
  const u = db.users.find((x) => x.login.toLowerCase() === loginId.trim().toLowerCase());
  if (!u || password !== DEMO_PASSWORD) throw new ApiError('invalid', 'Identifiant ou mot de passe incorrect.');
  if (u.status !== 'active') throw new ApiError('forbidden', u.status === 'suspended' ? 'Ce compte est suspendu. Contactez l’administration centrale.' : 'Ce compte a été révoqué.');
  const org = db.organizations.find((o) => o.id === u.organizationId);
  if (org?.type === 'agency' && org.approvalStatus !== 'approved') throw new ApiError('forbidden', "L'agence n'est pas agréée ou est suspendue.");
  mutate((d) => {
    const x = d.users.find((y) => y.id === u.id)!;
    x.lastLoginAt = nowIso();
    pushAudit(d, x, 'Connexion (démonstration)', 'Session', x.id);
  });
  return getDb().users.find((x) => x.id === u.id)!;
}

export function logAccessDenied(actor: User, path: string) {
  mutate((db) => pushAudit(db, actor, 'Tentative d’accès à un espace non autorisé', 'Route', path, 'denied'));
}

export function submitAccessRequest(input: Omit<AccessRequest, 'id' | 'status' | 'createdAt'>): AccessRequest {
  const req: AccessRequest = { ...input, id: uid('ar'), status: 'new', createdAt: nowIso() };
  mutate((db) => {
    db.accessRequests.unshift(req);
    pushNotif(db, { kind: 'orgType', orgType: 'central' }, "Nouvelle demande d'accès", `${req.organizationName} (${req.organizationType}, ${req.country}).`, '/admin/agencies', 'attention');
    pushAudit(db, null, "Demande d'accès reçue (démonstration)", 'Demande', req.id);
  });
  return req;
}

// ---------------------------------------------------------------- agence : voyages

export interface TripInput {
  direction: Direction;
  date: string;
  time: string;
  departure: string;
  destination: string;
  busId: string;
  driverId: string;
  convoyeur: string;
  stops: string[];
}

export function generateTripReference(direction: Direction, date: string): string {
  const [y, m, d] = date.split('-');
  return `WZP-${y.slice(2)}${m}${d}-${direction === 'TG-BJ' ? 'LC' : 'CL'}${shortCode(3)}`;
}

export function createTrip(actor: User, input: TripInput, reference: string): Trip {
  authorize(actor, 'agency.trip.create');
  const db = getDb();
  const bus = db.buses.find((b) => b.id === input.busId && b.agencyId === actor.organizationId);
  const driver = db.drivers.find((d) => d.id === input.driverId && d.agencyId === actor.organizationId);
  if (!bus || !driver) throw new ApiError('invalid', 'Bus ou chauffeur invalide.');
  if (!busAvailability(bus).available) throw new ApiError('invalid', `Bus indisponible : ${busAvailability(bus).reason}.`);
  if (!driverAvailability(driver).available) throw new ApiError('invalid', `Chauffeur indisponible : ${driverAvailability(driver).reason}.`);
  if (db.trips.some((t) => t.reference === reference)) throw new ApiError('conflict', 'Cette référence existe déjà.');
  const dep = new Date(`${input.date}T${input.time}:00`).toISOString();
  const side = (country: Country) => ({ country, arrivedAt: null, actualCount: null, countRecordedAt: null, completedAt: null, completedBy: null, checks: {} });
  const trip: Trip = {
    id: uid('t'), reference, agencyId: actor.organizationId, direction: input.direction, departure: input.departure,
    destination: input.destination, scheduledDeparture: dep, actualDeparture: null, estimatedArrival: addMinutes(dep, 240),
    borderArrival: null, actualArrival: null, busId: bus.id, driverId: driver.id, convoyeur: input.convoyeur.trim(),
    stops: input.stops, status: 'preparing', lastPosition: null, border: { TG: side('TG'), BJ: side('BJ') }, customs: [], createdAt: nowIso(),
  };
  mutate((d) => {
    d.trips.push(trip);
    pushEvent(d, trip.id, 'created', actor, trip.departure);
    pushAudit(d, actor, 'Création du voyage', 'Voyage', trip.reference);
    const driverUser = d.users.find((u) => u.driverId === driver.id);
    if (driverUser) pushNotif(d, { kind: 'user', userId: driverUser.id }, 'Nouveau voyage assigné', `${trip.reference} — ${directionLabel[trip.direction]}, bus ${bus.registration}.`, '/driver/trip');
  });
  return trip;
}

export function cancelTrip(actor: User, tripId: string) {
  authorize(actor, 'agency.trip.create', tripId);
  mutate((db) => {
    const t = ownTrip(db, actor, tripId);
    if (!['planned', 'preparing', 'boarding'].includes(t.status)) throw new ApiError('invalid', 'Ce voyage ne peut plus être annulé.');
    t.status = 'cancelled';
    pushAudit(db, actor, 'Annulation du voyage', 'Voyage', t.reference);
  });
}

// ---------------------------------------------------------------- agence : passagers

export interface PassengerInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  phone: string;
  documentType: Passenger['documentType'];
  documentNumber: string;
  documentExpiry: string;
  documentFront: Passenger['documentFront'];
  documentBack: Passenger['documentBack'];
  face: Passenger['face'];
  visaRequired: boolean;
  visaNumber: string;
  visaExpiry: string;
  guardianPassengerId: string | null;
  consentStatus: Passenger['consentStatus'];
}

export interface TravelInput {
  tripId: string;
  baggageCount: number;
  commercialGoods: string;
}

export function nextTicketReference(db: DbState, trip: Trip): string {
  const existing = db.passengerTrips.filter((pt) => pt.tripId === trip.id).length;
  let n = existing + 1;
  let ref = '';
  do {
    ref = `TKT-${trip.reference.slice(4)}-${String(n).padStart(3, '0')}`;
    n++;
  } while (db.passengerTrips.some((pt) => pt.ticketReference === ref));
  return ref;
}

export function registerPassenger(actor: User, input: PassengerInput, travel: TravelInput, existingPassengerId: string | null): { passenger: Passenger; passengerTrip: PassengerTrip } {
  authorize(actor, 'agency.passenger.register');
  let result!: { passenger: Passenger; passengerTrip: PassengerTrip };
  mutate((db) => {
    const trip = ownTrip(db, actor, travel.tripId);
    if (['arrived', 'cancelled'].includes(trip.status)) throw new ApiError('invalid', "Ce voyage n'accepte plus de passagers.");
    const consentAt = input.consentStatus === 'given' ? nowIso() : null;
    let p: Passenger;
    if (existingPassengerId) {
      const found = db.passengers.find((x) => x.id === existingPassengerId && x.agencyId === actor.organizationId);
      if (!found) throw new ApiError('not_found', 'Passager introuvable.');
      if (db.passengerTrips.some((pt) => pt.passengerId === found.id && pt.tripId === trip.id && !pt.removedAt)) {
        throw new ApiError('conflict', 'Ce passager est déjà inscrit sur ce voyage.');
      }
      Object.assign(found, input, { consentAt: consentAt ?? found.consentAt, consentRecordedBy: actor.id });
      found.registrationStatus = computeRegistrationStatus(found);
      p = found;
    } else {
      p = {
        id: uid('p'), agencyId: actor.organizationId, ...input, consentAt, consentRecordedBy: input.consentStatus === 'pending' ? null : actor.id,
        registrationStatus: 'incomplete', createdAt: nowIso(), rightsRequests: [],
      };
      if (input.consentStatus === 'declined') {
        // Refus : seules les données nécessaires au billet nominatif sont conservées.
        p.documentFront = null; p.documentBack = null; p.face = null;
      }
      p.registrationStatus = computeRegistrationStatus(p);
      db.passengers.push(p);
    }
    // Ajout après clôture (arrêt autorisé) : le voyageur monte immédiatement à bord.
    const lateAdd = ['boarding_closed', 'en_route', 'approaching_border'].includes(trip.status);
    const pt: PassengerTrip = {
      id: uid('pt'), passengerId: p.id, tripId: trip.id, ticketReference: nextTicketReference(db, trip),
      baggageCount: Math.max(0, Math.floor(travel.baggageCount)), commercialGoods: travel.commercialGoods.trim(),
      boardingStatus: lateAdd ? 'boarded' : 'pending', boardingTimestamp: lateAdd ? nowIso() : null, faceConfirmDemo: 'not_done',
      preRegistered: p.consentStatus !== 'declined', createdAt: nowIso(), removedAt: null,
    };
    db.passengerTrips.push(pt);
    for (let i = 1; i <= pt.baggageCount; i++) {
      db.baggage.push({ id: uid('bg'), passengerTripId: pt.id, labelReference: `${pt.ticketReference}-B${i}`, index: i, printedAt: null });
    }
    if (trip.status === 'planned') trip.status = 'preparing';
    pushAudit(db, actor, existingPassengerId ? 'Inscription d’un passager existant au voyage' : 'Enregistrement du passager', 'Passager', pt.ticketReference);
    if (input.consentStatus !== 'pending') pushAudit(db, actor, input.consentStatus === 'given' ? 'Consentement recueilli' : 'Refus de pré-inscription enregistré (contrôle classique)', 'Consentement', pt.ticketReference);
    result = { passenger: structuredClone(p), passengerTrip: structuredClone(pt) };
  });
  return result;
}

export function updateBaggage(actor: User, passengerTripId: string, count: number, goods: string) {
  authorize(actor, 'agency.passenger.register');
  mutate((db) => {
    const pt = db.passengerTrips.find((x) => x.id === passengerTripId);
    if (!pt) throw new ApiError('not_found', 'Billet introuvable.');
    ownTrip(db, actor, pt.tripId);
    const c = Math.max(0, Math.min(20, Math.floor(count)));
    pt.baggageCount = c;
    pt.commercialGoods = goods.trim();
    db.baggage = db.baggage.filter((b) => b.passengerTripId !== pt.id);
    for (let i = 1; i <= c; i++) db.baggage.push({ id: uid('bg'), passengerTripId: pt.id, labelReference: `${pt.ticketReference}-B${i}`, index: i, printedAt: null });
    pushAudit(db, actor, 'Mise à jour des bagages', 'Billet', pt.ticketReference);
  });
}

export function markBaggagePrinted(actor: User, passengerTripId: string) {
  authorize(actor, 'agency.passenger.view');
  mutate((db) => {
    const pt = db.passengerTrips.find((x) => x.id === passengerTripId);
    if (!pt) throw new ApiError('not_found', 'Billet introuvable.');
    ownTrip(db, actor, pt.tripId);
    for (const b of db.baggage.filter((x) => x.passengerTripId === pt.id)) b.printedAt = nowIso();
    pushAudit(db, actor, 'Impression des étiquettes bagages (simulation)', 'Billet', pt.ticketReference);
  });
}

export function updateConsent(actor: User, passengerId: string, status: 'given' | 'declined') {
  authorize(actor, 'agency.passenger.register');
  mutate((db) => {
    const p = db.passengers.find((x) => x.id === passengerId && x.agencyId === actor.organizationId);
    if (!p) throw new ApiError('not_found', 'Passager introuvable.');
    p.consentStatus = status;
    p.consentAt = nowIso();
    p.consentRecordedBy = actor.id;
    if (status === 'declined') { p.face = null; p.documentFront = null; p.documentBack = null; }
    p.registrationStatus = computeRegistrationStatus(p);
    for (const pt of db.passengerTrips.filter((x) => x.passengerId === p.id && !x.removedAt)) {
      const t = db.trips.find((x) => x.id === pt.tripId);
      if (t && !['arrived', 'cancelled'].includes(t.status)) pt.preRegistered = status === 'given';
    }
    pushAudit(db, actor, status === 'given' ? 'Consentement recueilli' : 'Refus de pré-inscription enregistré (contrôle classique)', 'Passager', p.id);
  });
}

export function updatePassengerCaptures(actor: User, passengerId: string, patch: Partial<Pick<Passenger, 'documentFront' | 'documentBack' | 'face' | 'visaNumber' | 'visaExpiry' | 'documentExpiry' | 'documentNumber' | 'phone'>>) {
  authorize(actor, 'agency.passenger.register');
  mutate((db) => {
    const p = db.passengers.find((x) => x.id === passengerId && x.agencyId === actor.organizationId);
    if (!p) throw new ApiError('not_found', 'Passager introuvable.');
    if (p.consentStatus !== 'given' && (patch.face || patch.documentFront || patch.documentBack)) {
      throw new ApiError('invalid', 'Le consentement est requis avant toute capture.');
    }
    Object.assign(p, patch);
    p.registrationStatus = computeRegistrationStatus(p);
    for (const n of db.agencyNotices.filter((x) => !x.resolvedAt && db.passengerTrips.find((pt) => pt.id === x.passengerTripId)?.passengerId === p.id)) {
      n.resolvedAt = nowIso();
    }
    pushAudit(db, actor, 'Correction du dossier passager', 'Passager', p.id);
  });
}

export function recordRightsRequest(actor: User, passengerId: string, type: 'access' | 'rectification' | 'deletion') {
  authorize(actor, 'agency.passenger.register');
  mutate((db) => {
    const p = db.passengers.find((x) => x.id === passengerId && x.agencyId === actor.organizationId);
    if (!p) throw new ApiError('not_found', 'Passager introuvable.');
    p.rightsRequests.push({ type, at: nowIso(), by: actor.id });
    const label = type === 'access' ? "Demande d'accès" : type === 'rectification' ? 'Demande de rectification' : 'Demande de suppression';
    pushAudit(db, actor, `${label} enregistrée`, 'Passager', p.id);
    pushNotif(db, { kind: 'orgType', orgType: 'central' }, `${label} d'un voyageur`, 'Demande enregistrée par une agence. Traitement à organiser selon la procédure validée.', '/admin/audit');
  });
}

export function removePassengerFromTrip(actor: User, passengerTripId: string) {
  authorize(actor, 'agency.passenger.register');
  mutate((db) => {
    const pt = db.passengerTrips.find((x) => x.id === passengerTripId);
    if (!pt) throw new ApiError('not_found', 'Billet introuvable.');
    const t = ownTrip(db, actor, pt.tripId);
    if (t.status === 'arrived') throw new ApiError('invalid', 'Voyage terminé.');
    pt.removedAt = nowIso();
    pushAudit(db, actor, 'Retrait du passager du voyage', 'Billet', pt.ticketReference);
  });
}

// ---------------------------------------------------------------- agence : embarquement

export function openBoarding(actor: User, tripId: string) {
  authorize(actor, 'agency.boarding.operate', tripId);
  mutate((db) => {
    const t = ownTrip(db, actor, tripId);
    if (!['planned', 'preparing'].includes(t.status)) return;
    t.status = 'boarding';
    pushEvent(db, t.id, 'boarding_opened', actor, t.departure);
    pushAudit(db, actor, "Ouverture de l'embarquement", 'Voyage', t.reference);
  });
}

export type BoardResult =
  | { ok: true; passengerTripId: string; name: string; conventional: boolean }
  | { ok: false; reason: 'not_found' | 'other_trip' | 'already' | 'closed'; message: string; name?: string };

/** Extrait une référence de billet d'une saisie libre ou d'une URL de QR code. */
export function parseTicketInput(raw: string): string {
  const s = raw.trim();
  const m = s.match(/TKT-[A-Z0-9-]+/i);
  return (m ? m[0] : s).toUpperCase();
}

export function boardByTicket(actor: User, tripId: string, rawRef: string): BoardResult {
  authorize(actor, 'agency.boarding.operate', tripId);
  const ref = parseTicketInput(rawRef);
  let res!: BoardResult;
  mutate((db) => {
    const t = ownTrip(db, actor, tripId);
    if (t.status !== 'boarding') {
      res = { ok: false, reason: 'closed', message: "L'embarquement n'est pas ouvert pour ce voyage." };
      return;
    }
    const pt = db.passengerTrips.find((x) => x.ticketReference === ref && !x.removedAt);
    if (!pt) { res = { ok: false, reason: 'not_found', message: 'Billet introuvable. Vérifiez la référence saisie.' }; return; }
    const p = db.passengers.find((x) => x.id === pt.passengerId)!;
    if (pt.tripId !== t.id) { res = { ok: false, reason: 'other_trip', message: "Ce billet correspond à un autre voyage.", name: fullName(p) }; return; }
    if (pt.boardingStatus === 'boarded') {
      res = { ok: false, reason: 'already', message: "Ce billet a déjà été utilisé pour l'embarquement.", name: fullName(p) };
      pushAudit(db, actor, 'Tentative de double embarquement', 'Billet', pt.ticketReference, 'failure');
      return;
    }
    pt.boardingStatus = 'boarded';
    pt.boardingTimestamp = nowIso();
    pushAudit(db, actor, "Confirmation de l'embarquement", 'Billet', pt.ticketReference);
    res = { ok: true, passengerTripId: pt.id, name: fullName(p), conventional: !pt.preRegistered };
  });
  return res;
}

export function setBoardingStatus(actor: User, passengerTripId: string, status: PassengerTrip['boardingStatus']) {
  authorize(actor, 'agency.boarding.operate', passengerTripId);
  mutate((db) => {
    const pt = db.passengerTrips.find((x) => x.id === passengerTripId);
    if (!pt) throw new ApiError('not_found', 'Billet introuvable.');
    const t = ownTrip(db, actor, pt.tripId);
    if (t.status !== 'boarding') throw new ApiError('invalid', "L'embarquement n'est pas ouvert pour ce voyage.");
    pt.boardingStatus = status;
    pt.boardingTimestamp = status === 'boarded' ? nowIso() : null;
    const label = status === 'absent' ? 'Absence signalée' : status === 'manual_review' ? 'Vérification manuelle demandée' : status === 'boarded' ? "Confirmation de l'embarquement" : 'Statut réinitialisé';
    pushAudit(db, actor, label, 'Billet', pt.ticketReference);
  });
}

export function setFaceDemo(actor: User, passengerTripId: string, value: PassengerTrip['faceConfirmDemo']) {
  authorize(actor, 'agency.boarding.operate', passengerTripId);
  mutate((db) => {
    const pt = db.passengerTrips.find((x) => x.id === passengerTripId);
    if (!pt) throw new ApiError('not_found', 'Billet introuvable.');
    ownTrip(db, actor, pt.tripId);
    pt.faceConfirmDemo = value;
    pushAudit(db, actor, 'Confirmation visuelle (démonstration)', 'Billet', pt.ticketReference);
  });
}

function buildManifest(db: DbState, actor: User, t: Trip, type: ManifestType, note = ''): Manifest {
  const pts = db.passengerTrips.filter((pt) => pt.tripId === t.id && !pt.removedAt && (type === 'provisional' || pt.boardingStatus === 'boarded'));
  const version = db.manifests.filter((m) => m.tripId === t.id).length + 1;
  const pre = pts.filter((pt) => pt.preRegistered);
  const m: Manifest = {
    id: uid('m'), reference: `MAN-${t.reference.slice(4)}-V${version}`, tripId: t.id, version, type,
    passengerCount: pre.length,
    incompleteCount: pre.filter((pt) => db.passengers.find((p) => p.id === pt.passengerId)?.registrationStatus !== 'registered').length,
    conventionalCount: pts.length - pre.length,
    passengerTripIds: pre.map((pt) => pt.id), createdAt: nowIso(), createdBy: actor.id, note,
    recipients: (['police_tg', 'police_bj'] as Authority[]).map((authority) => ({ authority, state: 'to_send', sentAt: null, acknowledgedAt: null, processedAt: null })),
  };
  db.manifests.push(m);
  return m;
}

export function prepareProvisionalManifest(actor: User, tripId: string): Manifest {
  authorize(actor, 'agency.manifest.prepare', tripId);
  let m!: Manifest;
  mutate((db) => {
    const t = ownTrip(db, actor, tripId);
    if (!['planned', 'preparing', 'boarding'].includes(t.status)) throw new ApiError('invalid', 'La liste provisoire ne peut être préparée qu’avant la clôture de l’embarquement.');
    m = buildManifest(db, actor, t, 'provisional');
    pushEvent(db, t.id, 'provisional_manifest', actor, t.departure);
    pushAudit(db, actor, 'Préparation de la liste provisoire', 'Manifeste', m.reference);
  });
  return m;
}

export function closeBoarding(actor: User, tripId: string): Manifest {
  authorize(actor, 'agency.boarding.operate', tripId);
  let m!: Manifest;
  mutate((db) => {
    const t = ownTrip(db, actor, tripId);
    if (t.status !== 'boarding') throw new ApiError('invalid', "L'embarquement n'est pas ouvert pour ce voyage.");
    for (const pt of db.passengerTrips.filter((x) => x.tripId === t.id && !x.removedAt && x.boardingStatus === 'pending')) {
      pt.boardingStatus = 'absent';
    }
    t.status = 'boarding_closed';
    m = buildManifest(db, actor, t, 'final');
    pushEvent(db, t.id, 'boarding_closed', actor, t.departure);
    pushAudit(db, actor, "Clôture de l'embarquement", 'Voyage', t.reference);
    pushAudit(db, actor, 'Préparation de la liste définitive', 'Manifeste', m.reference);
  });
  return m;
}

export function prepareJourneyUpdate(actor: User, tripId: string, note: string): Manifest {
  authorize(actor, 'agency.manifest.prepare', tripId);
  let m!: Manifest;
  mutate((db) => {
    const t = ownTrip(db, actor, tripId);
    if (!['boarding_closed', 'en_route', 'approaching_border'].includes(t.status)) throw new ApiError('invalid', 'Une mise à jour ne peut être préparée qu’après la clôture et avant la frontière.');
    m = buildManifest(db, actor, t, 'update', note.trim());
    pushAudit(db, actor, 'Préparation d’une mise à jour du voyage', 'Manifeste', m.reference);
  });
  return m;
}

/** Mutation exécutée par le « récepteur police » simulé : accusé de réception et vérification simulée. */
function simulateReception(manifestId: string, authority: Authority) {
  mutate((db) => {
    const m = db.manifests.find((x) => x.id === manifestId);
    if (!m) return;
    const r = m.recipients.find((x) => x.authority === authority)!;
    if (r.state !== 'pending') return;
    r.state = 'received';
    r.acknowledgedAt = nowIso();
    const t = db.trips.find((x) => x.id === m.tripId)!;
    for (const ptId of m.passengerTripIds) {
      const pt = db.passengerTrips.find((x) => x.id === ptId)!;
      const p = db.passengers.find((x) => x.id === pt.passengerId)!;
      const existing = db.policeReviews.find((x) => x.passengerTripId === ptId && x.authority === authority);
      if (existing) { existing.manifestId = m.id; continue; }
      const res = simulateScreening(p, t);
      db.policeReviews.push({
        id: uid('pr'), authority, passengerTripId: ptId, tripId: t.id, manifestId: m.id, autoStatus: res.status, status: res.status,
        internalReason: res.reason, reviewState: 'pending', reviewedBy: null, reviewedAt: null, notes: [], createdAt: nowIso(),
      });
    }
    const country = authorityCountry[authority];
    const policeOrg = db.organizations.find((o) => o.type === 'police' && o.country === country);
    if (policeOrg) pushNotif(db, { kind: 'org', organizationId: policeOrg.id }, 'Nouveau manifeste reçu', `${m.reference} — ${t.reference}, ${m.passengerCount} passager(s).`, `/police/manifests/${m.id}`);
    pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Manifeste reçu par la police', `${m.reference} : accusé de réception simulé — ${authorityLabel[authority]}.`, `/agency/trips/${t.id}/manifest`, 'success');
    pushAudit(db, null, `Accusé de réception simulé — ${authorityLabel[authority]}`, 'Manifeste', m.reference);
  });
}

export const SIMULATED_ACK_DELAY_MS = 1800;

export function transmitManifest(actor: User, manifestId: string, only?: Authority): { failed: Authority[] } {
  authorize(actor, 'agency.manifest.transmit', manifestId);
  const offline = isDeviceOffline();
  const failRequested = getDb().settings.simulateTransmissionFailure;
  const failed: Authority[] = [];
  const sentTo: Authority[] = [];
  mutate((db) => {
    const m = db.manifests.find((x) => x.id === manifestId);
    if (!m) throw new ApiError('not_found', 'Manifeste introuvable.');
    const t = ownTrip(db, actor, m.tripId);
    for (const r of m.recipients) {
      if (only && r.authority !== only) continue;
      if (!['to_send', 'failed'].includes(r.state)) continue;
      r.sentAt = nowIso();
      if (offline || (failRequested && r.authority === 'police_bj')) {
        r.state = 'failed';
        failed.push(r.authority);
      } else {
        r.state = 'pending';
        sentTo.push(r.authority);
      }
    }
    pushAudit(db, actor, failed.length ? 'Échec de transmission simulée' : 'Transmission simulée du manifeste', 'Manifeste', m.reference, failed.length ? 'failure' : 'success');
    if (failed.length) {
      pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Échec de transmission', `${m.reference} : impossible de transmettre le manifeste pour le moment. Le contrôle classique reste disponible.`, `/agency/trips/${t.id}/manifest`, 'attention');
      pushNotif(db, { kind: 'orgType', orgType: 'central' }, 'Échec de transmission', `${t.reference} — ${m.reference}.`, '/admin/trips', 'attention');
    }
  });
  for (const a of sentTo) setTimeout(() => simulateReception(manifestId, a), SIMULATED_ACK_DELAY_MS + (a === 'police_bj' ? 600 : 0));
  return { failed };
}

// ---------------------------------------------------------------- agence : flotte, équipe, paramètres

export function upsertBus(actor: User, bus: Omit<Bus, 'agencyId' | 'id'> & { id?: string }): Bus {
  authorize(actor, 'agency.fleet.manage');
  let saved!: Bus;
  mutate((db) => {
    if (db.buses.some((b) => b.registration.toUpperCase() === bus.registration.toUpperCase() && b.id !== bus.id)) {
      throw new ApiError('conflict', 'Cette immatriculation est déjà enregistrée.');
    }
    if (bus.id) {
      const b = db.buses.find((x) => x.id === bus.id && x.agencyId === actor.organizationId);
      if (!b) throw new ApiError('not_found', 'Bus introuvable.');
      Object.assign(b, bus);
      saved = b;
      pushAudit(db, actor, 'Modification du bus', 'Bus', b.registration);
    } else {
      saved = { ...bus, id: uid('b'), agencyId: actor.organizationId };
      db.buses.push(saved);
      pushAudit(db, actor, 'Ajout du bus', 'Bus', saved.registration);
    }
    saved = structuredClone(saved);
  });
  return saved;
}

export function upsertDriver(actor: User, driver: Omit<Driver, 'agencyId' | 'id'> & { id?: string }): Driver {
  authorize(actor, 'agency.fleet.manage');
  let saved!: Driver;
  mutate((db) => {
    if (driver.id) {
      const d = db.drivers.find((x) => x.id === driver.id && x.agencyId === actor.organizationId);
      if (!d) throw new ApiError('not_found', 'Chauffeur introuvable.');
      Object.assign(d, driver);
      saved = d;
      pushAudit(db, actor, 'Modification du chauffeur', 'Chauffeur', d.name);
    } else {
      saved = { ...driver, id: uid('d'), agencyId: actor.organizationId };
      db.drivers.push(saved);
      pushAudit(db, actor, 'Ajout du chauffeur', 'Chauffeur', saved.name);
    }
    saved = structuredClone(saved);
  });
  return saved;
}

export function updateAgencySettings(actor: User, provisionalDeadlineMinutes: number) {
  authorize(actor, 'agency.settings.manage');
  mutate((db) => {
    const o = orgOf(db, actor);
    o.provisionalDeadlineMinutes = Math.max(15, Math.min(240, Math.round(provisionalDeadlineMinutes)));
    pushAudit(db, actor, 'Modification des paramètres de l’agence', 'Organisation', o.name);
  });
}

export function requestAccount(actor: User, name: string, role: Role, note: string) {
  authorize(actor, 'agency.team.view');
  mutate((db) => {
    const o = orgOf(db, actor);
    pushNotif(db, { kind: 'orgType', orgType: 'central' }, 'Demande de création de compte', `${o.name} demande un compte « ${name} » (${role}). ${note}`.trim(), `/admin/accounts?org=${o.id}`, 'attention');
    pushAudit(db, actor, 'Demande de création de compte adressée à l’administration centrale', 'Compte', name);
  });
}

// ---------------------------------------------------------------- police

function policeAuthority(db: DbState, actor: User): Authority {
  const o = orgOf(db, actor);
  if (!o.country) throw new ApiError('forbidden', FORBIDDEN_MESSAGE);
  return countryAuthority[o.country];
}

export function policeOpenManifest(actor: User, manifestId: string) {
  authorize(actor, 'police.manifest.view', manifestId);
  mutate((db) => {
    const auth = policeAuthority(db, actor);
    const m = db.manifests.find((x) => x.id === manifestId);
    const r = m?.recipients.find((x) => x.authority === auth);
    if (!m || !r || !['received', 'verifying', 'processed'].includes(r.state)) throw new ApiError('not_found', 'Manifeste introuvable.');
    if (r.state === 'received') {
      r.state = 'verifying';
      pushAudit(db, actor, 'Ouverture du manifeste — vérification en cours', 'Manifeste', m.reference);
    }
  });
}

function maybeProcessed(db: DbState, actor: User, auth: Authority, tripId: string) {
  const pending = db.policeReviews.some((r) => r.authority === auth && r.tripId === tripId && r.reviewState === 'pending');
  if (pending) return;
  for (const m of db.manifests.filter((x) => x.tripId === tripId)) {
    const r = m.recipients.find((x) => x.authority === auth)!;
    if (['received', 'verifying'].includes(r.state)) {
      r.state = 'processed';
      r.processedAt = nowIso();
      const t = db.trips.find((x) => x.id === tripId)!;
      pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Manifeste traité', `${m.reference} : traitement terminé — ${authorityLabel[auth]}.`, `/agency/trips/${t.id}/manifest`, 'success');
      pushAudit(db, actor, 'Manifeste traité', 'Manifeste', m.reference);
    }
  }
}

function ownReview(db: DbState, actor: User, reviewId: string) {
  const auth = policeAuthority(db, actor);
  const r = db.policeReviews.find((x) => x.id === reviewId && x.authority === auth);
  if (!r) throw new ApiError('not_found', 'Dossier introuvable.');
  return { r, auth };
}

export function policeConfirmReview(actor: User, reviewId: string) {
  authorize(actor, 'police.review.record', reviewId);
  mutate((db) => {
    const { r, auth } = ownReview(db, actor, reviewId);
    r.reviewState = r.status === r.autoStatus ? 'confirmed' : 'corrected';
    r.reviewedBy = actor.id;
    r.reviewedAt = nowIso();
    pushAudit(db, actor, 'Révision manuelle enregistrée', 'Dossier passager', r.passengerTripId, 'success', `Résultat confirmé après vérification : ${r.status}.`);
    maybeProcessed(db, actor, auth, r.tripId);
  });
}

export function policeCorrectResult(actor: User, reviewId: string, status: PoliceStatus, reason: string) {
  authorize(actor, 'police.review.correct', reviewId);
  if (reason.trim().length < 5) throw new ApiError('invalid', 'Indiquez le motif de la correction.');
  mutate((db) => {
    const { r, auth } = ownReview(db, actor, reviewId);
    const before = r.status;
    r.status = status;
    r.reviewState = 'corrected';
    r.reviewedBy = actor.id;
    r.reviewedAt = nowIso();
    r.notes.push({ by: actor.id, at: nowIso(), text: `Correction ${before} → ${status} : ${reason.trim()}` });
    pushAudit(db, actor, 'Correction du résultat', 'Dossier passager', r.passengerTripId, 'success', `${before} → ${status}`);
    maybeProcessed(db, actor, auth, r.tripId);
  });
}

export function policeAddNote(actor: User, reviewId: string, text: string) {
  authorize(actor, 'police.review.record', reviewId);
  if (!text.trim()) throw new ApiError('invalid', 'Ce champ est obligatoire.');
  mutate((db) => {
    const { r } = ownReview(db, actor, reviewId);
    r.notes.push({ by: actor.id, at: nowIso(), text: text.trim() });
    pushAudit(db, actor, 'Note interne ajoutée', 'Dossier passager', r.passengerTripId, 'success', 'Note interne police.');
  });
}

/** Seule une anomalie administrative corrigeable peut être signalée à l'agence, et uniquement pour un dossier orange. */
export function policeNotifyAgencyIssue(actor: User, reviewId: string, issue: AgencyNotice['issue']) {
  authorize(actor, 'police.review.record', reviewId);
  mutate((db) => {
    const { r } = ownReview(db, actor, reviewId);
    if (r.status !== 'orange') throw new ApiError('invalid', 'Seule une anomalie administrative corrigeable peut être signalée à l’agence.');
    const t = db.trips.find((x) => x.id === r.tripId)!;
    db.agencyNotices.push({ id: uid('an'), agencyId: t.agencyId, passengerTripId: r.passengerTripId, issue, createdAt: nowIso(), resolvedAt: null });
    const pt = db.passengerTrips.find((x) => x.id === r.passengerTripId)!;
    pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Anomalie administrative à corriger', `Billet ${pt.ticketReference} : ${noticeLabel[issue]}.`, `/agency/trips/${t.id}/passengers`, 'attention');
    pushAudit(db, actor, 'Anomalie administrative signalée à l’agence', 'Dossier passager', r.passengerTripId);
  });
}

export const noticeLabel: Record<AgencyNotice['issue'], string> = {
  document_expired: 'document de voyage expiré',
  visa_missing: 'visa manquant',
  document_unreadable: 'document illisible — nouvelle capture nécessaire',
};

// ---------------------------------------------------------------- poste frontalier

function borderCountry(db: DbState, actor: User): Country {
  const o = orgOf(db, actor);
  if (o.type !== 'border_post' || !o.country) throw new ApiError('forbidden', FORBIDDEN_MESSAGE);
  return o.country;
}

export function borderRecordArrival(actor: User, tripId: string) {
  authorize(actor, 'border.trip.view', tripId);
  mutate((db) => {
    const c = borderCountry(db, actor);
    const t = db.trips.find((x) => x.id === tripId);
    if (!t) throw new ApiError('not_found', 'Voyage introuvable.');
    if (t.border[c].arrivedAt) return;
    t.border[c].arrivedAt = nowIso();
    if (['en_route', 'approaching_border', 'boarding_closed'].includes(t.status)) {
      t.status = 'at_border';
      t.borderArrival = t.borderArrival ?? nowIso();
    }
    pushEvent(db, t.id, 'border_arrival', actor, borderPostName[c], 'Arrivée constatée par le poste');
    pushAudit(db, actor, 'Arrivée du bus constatée au poste', 'Voyage', t.reference);
    pushNotif(db, { kind: 'orgType', orgType: 'customs', country: c }, 'Bus arrivé au poste frontalier', `${busOf(db, t)?.registration} — ${t.reference}.`, `/customs/trips/${t.id}`);
  });
}

export function borderRecordCount(actor: User, tripId: string, count: number) {
  authorize(actor, 'border.count.record', tripId);
  if (!Number.isFinite(count) || count < 0) throw new ApiError('invalid', 'Saisissez un nombre valide.');
  mutate((db) => {
    const c = borderCountry(db, actor);
    const t = db.trips.find((x) => x.id === tripId);
    if (!t) throw new ApiError('not_found', 'Voyage introuvable.');
    if (!t.border[c].arrivedAt) t.border[c].arrivedAt = nowIso();
    t.border[c].actualCount = Math.floor(count);
    t.border[c].countRecordedAt = nowIso();
    const expected = expectedOnBoard(db, t);
    const diff = Math.floor(count) !== expected;
    pushAudit(db, actor, diff ? 'Comptage enregistré — écart détecté' : 'Comptage enregistré', 'Voyage', t.reference);
    if (diff) {
      pushNotif(db, { kind: 'orgType', orgType: 'central' }, 'Écart de comptage détecté', `${t.reference} : ${count} compté(s) pour ${expected} attendu(s) — ${borderPostName[c]}.`, '/admin/trips', 'attention');
      pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Écart de comptage détecté', `${t.reference} : écart signalé au ${borderPostName[c]}.`, `/agency/trips/${t.id}`, 'attention');
    }
  });
}

export function borderRecordPassengerCheck(actor: User, tripId: string, passengerTripId: string, state: 'confirmed' | 'conventional' | 'discrepancy' | null) {
  authorize(actor, 'border.control.record', tripId);
  mutate((db) => {
    const c = borderCountry(db, actor);
    const t = db.trips.find((x) => x.id === tripId);
    if (!t) throw new ApiError('not_found', 'Voyage introuvable.');
    if (t.border[c].completedAt) throw new ApiError('invalid', 'Le contrôle de ce poste est déjà enregistré.');
    if (state) t.border[c].checks[passengerTripId] = state;
    else delete t.border[c].checks[passengerTripId];
    const pt = db.passengerTrips.find((x) => x.id === passengerTripId);
    const label = state === 'confirmed' ? 'Identité confirmée' : state === 'conventional' ? 'Passager orienté vers le contrôle classique' : state === 'discrepancy' ? 'Écart passager signalé' : 'Vérification annulée';
    pushAudit(db, actor, label, 'Billet', pt?.ticketReference ?? passengerTripId);
  });
}

export function borderCompleteControl(actor: User, tripId: string) {
  authorize(actor, 'border.control.record', tripId);
  mutate((db) => {
    const c = borderCountry(db, actor);
    const t = db.trips.find((x) => x.id === tripId);
    if (!t) throw new ApiError('not_found', 'Voyage introuvable.');
    const side = t.border[c];
    if (side.actualCount === null) throw new ApiError('invalid', 'Enregistrez d’abord le comptage des passagers.');
    if (side.completedAt) return;
    const { exit } = exitEntry(t.direction);
    if (c !== exit && !t.border[exit].completedAt) {
      throw new ApiError('invalid', 'Le contrôle de sortie du pays de départ doit être enregistré avant le contrôle d’entrée.');
    }
    side.completedAt = nowIso();
    side.completedBy = actor.id;
    const label = c === exit ? 'Contrôle de sortie enregistré' : "Contrôle d'entrée enregistré";
    pushEvent(db, t.id, 'border_processed', actor, borderPostName[c], label);
    pushAudit(db, actor, label, 'Voyage', t.reference);
    pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Contrôle frontalier enregistré', `${t.reference} : ${label.toLowerCase()} — ${borderPostName[c]}.`, `/agency/trips/${t.id}`, 'success');
  });
}

export function expectedOnBoard(db: DbState, t: Trip): number {
  return db.passengerTrips.filter((pt) => pt.tripId === t.id && !pt.removedAt && pt.boardingStatus === 'boarded').length;
}

// ---------------------------------------------------------------- douanes

export function customsRecordHandling(actor: User, tripId: string, note: string) {
  authorize(actor, 'customs.handling.record', tripId);
  mutate((db) => {
    const o = orgOf(db, actor);
    const t = db.trips.find((x) => x.id === tripId);
    if (!t || !o.country) throw new ApiError('not_found', 'Voyage introuvable.');
    if (t.customs.some((c) => c.country === o.country)) throw new ApiError('conflict', 'La prise en charge est déjà enregistrée pour ce poste.');
    t.customs.push({ country: o.country, handledAt: nowIso(), handledBy: actor.id, note: note.trim() });
    pushEvent(db, t.id, 'customs_handled', actor, borderPostName[o.country]);
    pushAudit(db, actor, 'Prise en charge douanière enregistrée', 'Voyage', t.reference);
  });
}

// ---------------------------------------------------------------- chauffeur

export const DRIVER_EVENTS: TripEventType[] = [
  'boarding_confirmed_driver', 'departure', 'stop_arrival', 'approaching_border', 'border_arrival',
  'border_departure', 'destination_arrival', 'incident',
];

export interface DriverEventInput {
  tripId: string;
  type: TripEventType;
  locationLabel: string;
  note: string;
  clientEventId: string;
  timestamp: string;
}

/** Enregistre un événement chauffeur. Idempotent : un même clientEventId n'est jamais enregistré deux fois. */
export function recordDriverEvent(actor: User, input: DriverEventInput): { duplicate: boolean } {
  authorize(actor, 'driver.event.record', input.tripId);
  if (!DRIVER_EVENTS.includes(input.type)) throw new ApiError('forbidden', FORBIDDEN_MESSAGE);
  let duplicate = false;
  mutate((db) => {
    const t = db.trips.find((x) => x.id === input.tripId);
    if (!t || t.driverId !== actor.driverId) throw new ApiError('not_found', 'Voyage introuvable.');
    if (db.tripEvents.some((e) => e.clientEventId === input.clientEventId)) { duplicate = true; return; }
    pushEvent(db, t.id, input.type, actor, input.locationLabel, input.note, input.clientEventId, input.timestamp);
    const bus = busOf(db, t);
    const pos = (label: string, km: number) => { t.lastPosition = { label, km, at: input.timestamp }; };
    switch (input.type) {
      case 'departure':
        t.actualDeparture = t.actualDeparture ?? input.timestamp;
        if (['planned', 'preparing', 'boarding', 'boarding_closed'].includes(t.status)) t.status = 'en_route';
        pos(t.departure, 0);
        pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Départ confirmé', `${t.reference} — bus ${bus?.registration}.`, `/agency/tracking`, 'info');
        break;
      case 'stop_arrival':
        pos(input.locationLabel, t.lastPosition?.km ?? 0);
        break;
      case 'approaching_border':
        if (['en_route', 'boarding_closed'].includes(t.status)) t.status = 'approaching_border';
        pos(t.direction === 'TG-BJ' ? 'Aného' : 'Grand-Popo', t.direction === 'TG-BJ' ? 45 : 80);
        for (const ot of ['police', 'border_post', 'customs'] as const) {
          pushNotif(db, { kind: 'orgType', orgType: ot }, 'Bus à l’approche de la frontière', `${bus?.registration} — ${t.reference}, ${directionLabel[t.direction]}.`, ot === 'police' ? '/police/arrivals' : ot === 'border_post' ? `/border/trips/${t.id}` : `/customs/trips/${t.id}`, 'attention');
        }
        break;
      case 'border_arrival': {
        t.status = 'at_border';
        t.borderArrival = t.borderArrival ?? input.timestamp;
        const { exit } = exitEntry(t.direction);
        if (!t.border[exit].arrivedAt) t.border[exit].arrivedAt = input.timestamp;
        pos('Frontière Sanvee-Condji / Hillacondji', t.direction === 'TG-BJ' ? 55 : 100);
        for (const ot of ['police', 'border_post', 'customs'] as const) {
          pushNotif(db, { kind: 'orgType', orgType: ot }, 'Bus arrivé au poste frontalier', `${bus?.registration} — ${t.reference}.`, ot === 'police' ? '/police/arrivals' : ot === 'border_post' ? `/border/trips/${t.id}` : `/customs/trips/${t.id}`);
        }
        break;
      }
      case 'border_departure':
        t.status = 'en_route';
        pos('Frontière Sanvee-Condji / Hillacondji', t.direction === 'TG-BJ' ? 56 : 101);
        break;
      case 'destination_arrival':
        t.status = 'arrived';
        t.actualArrival = input.timestamp;
        pos(t.destination, 155);
        pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Arrivée à destination', `${t.reference} est arrivé à ${t.destination}.`, `/agency/trips/${t.id}`, 'success');
        break;
      case 'incident':
        pushNotif(db, { kind: 'org', organizationId: t.agencyId }, 'Incident signalé par le chauffeur', `${t.reference} : ${input.note}`, '/agency/tracking', 'critical');
        pushNotif(db, { kind: 'orgType', orgType: 'central' }, 'Incident signalé par le chauffeur', `${t.reference} : ${input.note}`, '/admin/live-tracking', 'attention');
        break;
      default:
        break;
    }
    pushAudit(db, actor, `Événement chauffeur : ${input.type}`, 'Voyage', t.reference);
  });
  return { duplicate };
}

// ---------------------------------------------------------------- administration centrale

export function setAgencyApproval(actor: User, orgId: string, status: Organization['approvalStatus']) {
  authorize(actor, 'admin.agency.approve', orgId);
  mutate((db) => {
    const o = db.organizations.find((x) => x.id === orgId);
    if (!o) throw new ApiError('not_found', 'Organisation introuvable.');
    o.approvalStatus = status;
    const label = { approved: 'Agrément accordé', suspended: 'Suspension de l’organisation', rejected: 'Demande refusée', in_review: 'Vérification du dossier engagée', pending: 'Remise en attente' }[status];
    pushAudit(db, actor, label, 'Organisation', o.name);
    if (o.type === 'agency') pushNotif(db, { kind: 'org', organizationId: o.id }, 'Statut de votre agence', `${label}.`, '/agency/settings', status === 'approved' ? 'success' : 'attention');
  });
}

export function createOrganization(actor: User, input: Pick<Organization, 'name' | 'type' | 'country' | 'city' | 'contactName' | 'contactEmail' | 'contactPhone'>): Organization {
  authorize(actor, 'admin.account.manage');
  if (!input.name.trim()) throw new ApiError('invalid', 'Ce champ est obligatoire.');
  const o: Organization = { ...input, id: uid('org'), approvalStatus: input.type === 'agency' ? 'in_review' : 'approved', createdAt: nowIso(), documents: input.type === 'agency' ? [] : undefined, provisionalDeadlineMinutes: input.type === 'agency' ? 60 : undefined };
  mutate((db) => {
    db.organizations.push(o);
    pushAudit(db, actor, 'Création d’une entité', 'Organisation', o.name);
  });
  return o;
}

export function createAccount(actor: User, input: { name: string; login: string; email: string; role: Role; organizationId: string; driverId?: string }): User {
  authorize(actor, 'admin.account.manage');
  let created!: User;
  mutate((db) => {
    if (db.users.some((u) => u.login.toLowerCase() === input.login.toLowerCase())) throw new ApiError('conflict', 'Cet identifiant est déjà utilisé.');
    const org = db.organizations.find((o) => o.id === input.organizationId);
    if (!org) throw new ApiError('invalid', 'Organisation invalide.');
    created = { id: uid('u'), ...input, status: 'active', lastLoginAt: null, createdAt: nowIso() };
    db.users.push(created);
    pushAudit(db, actor, 'Création de compte', 'Compte', created.login);
    created = structuredClone(created);
  });
  return created;
}

export function updateAccount(actor: User, userId: string, patch: Partial<Pick<User, 'role' | 'status' | 'organizationId' | 'driverId'>>) {
  authorize(actor, 'admin.account.manage', userId);
  mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new ApiError('not_found', 'Compte introuvable.');
    if (u.id === actor.id && patch.status && patch.status !== 'active') throw new ApiError('invalid', 'Vous ne pouvez pas suspendre votre propre compte.');
    if (u.status === 'revoked') throw new ApiError('invalid', 'Un compte révoqué ne peut plus être modifié.');
    Object.assign(u, patch);
    const action = patch.status === 'suspended' ? 'Suspension de compte' : patch.status === 'revoked' ? 'Révocation de compte' : patch.status === 'active' ? 'Réactivation de compte' : 'Attribution de rôle';
    pushAudit(db, actor, action, 'Compte', u.login);
  });
}

export function updateAccessRequest(actor: User, id: string, status: AccessRequest['status']) {
  authorize(actor, 'admin.agency.approve', id);
  mutate((db) => {
    const r = db.accessRequests.find((x) => x.id === id);
    if (!r) throw new ApiError('not_found', 'Demande introuvable.');
    r.status = status;
    pushAudit(db, actor, status === 'closed' ? 'Demande d’accès clôturée' : 'Demande d’accès prise en charge', 'Demande', r.organizationName);
  });
}

export function updateSettings(actor: User, patch: Partial<PlatformSettings>) {
  authorize(actor, 'admin.settings.manage');
  mutate((db) => {
    Object.assign(db.settings, patch);
    pushAudit(db, actor, 'Modification de la configuration', 'Paramètres', Object.keys(patch).join(', '));
  });
}

// ---------------------------------------------------------------- notifications

export function markNotificationRead(actor: User, id: string) {
  mutate((db) => {
    const n = db.notifications.find((x) => x.id === id);
    if (n && !n.readBy.includes(actor.id)) n.readBy.push(actor.id);
  });
}

export function markAllRead(actor: User, ids: string[]) {
  mutate((db) => {
    for (const n of db.notifications) if (ids.includes(n.id) && !n.readBy.includes(actor.id)) n.readBy.push(actor.id);
  });
}

export function resolveNotice(actor: User, noticeId: string) {
  authorize(actor, 'agency.passenger.register', noticeId);
  mutate((db) => {
    const n = db.agencyNotices.find((x) => x.id === noticeId && x.agencyId === actor.organizationId);
    if (!n) throw new ApiError('not_found', 'Signalement introuvable.');
    n.resolvedAt = nowIso();
    pushAudit(db, actor, 'Anomalie administrative traitée', 'Billet', n.passengerTripId);
  });
}
