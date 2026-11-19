// JEU DE DONNÉES DE DÉMONSTRATION — entièrement fictif.
// Aucun nom, numéro de document ou numéro de téléphone ne correspond à une personne réelle.
// Les numéros de document commencent par « DEMO » et les téléphones par « 00 » (format non attribuable).

import { addMinutes, dateOffset, nowIso, todayAt } from '../lib/dates';
import { endpoints } from '../domain/corridor';
import { simulateScreening } from '../domain/screening';
import { computeRegistrationStatus } from '../domain/passenger';
import type {
  AppNotification, AuditLog, Baggage, Bus, Country, DbState, Direction, Driver, Manifest,
  ManifestRecipient, ManifestType, Organization, Passenger, PassengerTrip, PoliceReview,
  RecipientState, Trip, TripEvent, TripEventType, TripStatus, User,
} from '../domain/types';

export const SCHEMA_VERSION = 3;

const created = todayAt(6, 0, -60);

function org(o: Partial<Organization> & Pick<Organization, 'id' | 'name' | 'type' | 'country'>): Organization {
  return { approvalStatus: 'approved', createdAt: created, ...o };
}

const organizations: Organization[] = [
  org({
    id: 'org-ag-1', name: 'Trans-Littoral Express', type: 'agency', country: 'TG', city: 'Lomé',
    contactName: 'Direction des opérations', contactPhone: '+228 00 00 10 01', contactEmail: 'operations@trans-littoral.demo',
    documents: [
      { label: "Licence d'exploitation de transport", status: 'provided' },
      { label: 'Registre du commerce', status: 'provided' },
      { label: "Attestation d'assurance flotte", status: 'provided' },
    ],
    provisionalDeadlineMinutes: 60,
  }),
  org({
    id: 'org-ag-2', name: 'Golfe Mono Voyages', type: 'agency', country: 'BJ', city: 'Cotonou',
    contactName: "Responsable d'exploitation", contactPhone: '+229 00 00 20 01', contactEmail: 'exploitation@golfe-mono.demo',
    documents: [
      { label: "Licence d'exploitation de transport", status: 'provided' },
      { label: 'Registre du commerce', status: 'provided' },
      { label: "Attestation d'assurance flotte", status: 'provided' },
    ],
    provisionalDeadlineMinutes: 45,
  }),
  org({
    id: 'org-ag-3', name: 'Corridor Sud Transport', type: 'agency', country: 'TG', city: 'Aného', approvalStatus: 'pending',
    createdAt: todayAt(10, 15, -2),
    contactName: 'Gérance', contactPhone: '+228 00 00 30 01', contactEmail: 'contact@corridor-sud.demo',
    documents: [
      { label: "Licence d'exploitation de transport", status: 'provided' },
      { label: 'Registre du commerce', status: 'to_check' },
      { label: "Attestation d'assurance flotte", status: 'missing' },
    ],
    provisionalDeadlineMinutes: 60,
  }),
  org({ id: 'org-pol-tg', name: 'Service de police — Togo (démo)', type: 'police', country: 'TG' }),
  org({ id: 'org-pol-bj', name: 'Service de police — Bénin (démo)', type: 'police', country: 'BJ' }),
  org({ id: 'org-bp-tg', name: 'Poste frontalier de Sanvee-Condji (démo)', type: 'border_post', country: 'TG' }),
  org({ id: 'org-bp-bj', name: 'Poste frontalier de Hillacondji (démo)', type: 'border_post', country: 'BJ' }),
  org({ id: 'org-cus-tg', name: 'Douanes — Togo (démo)', type: 'customs', country: 'TG' }),
  org({ id: 'org-cus-bj', name: 'Douanes — Bénin (démo)', type: 'customs', country: 'BJ' }),
  org({ id: 'org-central', name: 'Administration centrale WeZonPass', type: 'central', country: null }),
];

function user(id: string, name: string, login: string, role: User['role'], organizationId: string, extra: Partial<User> = {}): User {
  return {
    id, name, login, email: `${login}@wezonpass.demo`, role, organizationId, status: 'active',
    lastLoginAt: todayAt(7, 5, -1), createdAt: created, ...extra,
  };
}

const users: User[] = [
  user('u-ag1-admin', 'Afi Lawson', 'tle.direction', 'agency_admin', 'org-ag-1'),
  user('u-ag1-counter', 'Kodjo Amegah', 'tle.guichet', 'agency_counter', 'org-ag-1'),
  user('u-ag1-board', 'Essi Dossou', 'tle.embarquement', 'agency_boarding', 'org-ag-1'),
  user('u-ag2-admin', 'Fifamè Ahouansou', 'gmv.direction', 'agency_admin', 'org-ag-2'),
  user('u-ag2-counter', 'Bienvenu Tchibozo', 'gmv.guichet', 'agency_counter', 'org-ag-2'),
  user('u-pol-tg', 'Officier Démo Togo', 'police.tg', 'police_officer', 'org-pol-tg'),
  user('u-pol-bj', 'Officier Démo Bénin', 'police.bj', 'police_officer', 'org-pol-bj'),
  user('u-bp-tg', 'Agent Démo Sanvee-Condji', 'poste.sanvee', 'border_officer', 'org-bp-tg'),
  user('u-bp-bj', 'Agent Démo Hillacondji', 'poste.hilla', 'border_officer', 'org-bp-bj'),
  user('u-cus-tg', 'Agent Douanes Démo Togo', 'douanes.tg', 'customs_officer', 'org-cus-tg'),
  user('u-cus-bj', 'Agent Douanes Démo Bénin', 'douanes.bj', 'customs_officer', 'org-cus-bj'),
  user('u-admin', 'Administrateur Démo', 'admin.central', 'central_admin', 'org-central'),
  user('u-drv-1', 'Komlan Adjété', 'chauffeur.adjete', 'driver', 'org-ag-1', { driverId: 'd-1' }),
  user('u-drv-2', 'Yawo Mensah', 'chauffeur.mensah', 'driver', 'org-ag-1', { driverId: 'd-2' }),
  user('u-drv-4', 'Sèdjro Hounkpè', 'chauffeur.hounkpe', 'driver', 'org-ag-2', { driverId: 'd-4' }),
  user('u-ag1-old', 'Ancien agent (démo)', 'tle.ancien', 'agency_counter', 'org-ag-1', { status: 'suspended' }),
];

const buses: Bus[] = [
  { id: 'b-1', agencyId: 'org-ag-1', registration: 'TG 4821 DM', vehicleIdentifier: 'TLE-01', capacity: 56, registrationDocumentRef: 'DEMO-CG-4821', registrationDocumentStatus: 'valid', inspectionExpiry: dateOffset(140), insuranceExpiry: dateOffset(200), brownCardExpiry: dateOffset(180), status: 'active' },
  { id: 'b-2', agencyId: 'org-ag-1', registration: 'TG 5530 DM', vehicleIdentifier: 'TLE-02', capacity: 60, registrationDocumentRef: 'DEMO-CG-5530', registrationDocumentStatus: 'valid', inspectionExpiry: dateOffset(95), insuranceExpiry: dateOffset(12), brownCardExpiry: dateOffset(160), status: 'active' },
  { id: 'b-3', agencyId: 'org-ag-1', registration: 'TG 6102 DM', vehicleIdentifier: 'TLE-03', capacity: 70, registrationDocumentRef: 'DEMO-CG-6102', registrationDocumentStatus: 'valid', inspectionExpiry: dateOffset(60), insuranceExpiry: dateOffset(120), brownCardExpiry: dateOffset(-4), status: 'active' },
  { id: 'b-4', agencyId: 'org-ag-2', registration: 'BJ 7703 RB', vehicleIdentifier: 'GMV-01', capacity: 56, registrationDocumentRef: 'DEMO-CG-7703', registrationDocumentStatus: 'valid', inspectionExpiry: dateOffset(110), insuranceExpiry: dateOffset(150), brownCardExpiry: dateOffset(210), status: 'active' },
  { id: 'b-5', agencyId: 'org-ag-2', registration: 'BJ 7718 RB', vehicleIdentifier: 'GMV-02', capacity: 50, registrationDocumentRef: 'DEMO-CG-7718', registrationDocumentStatus: 'to_check', inspectionExpiry: dateOffset(20), insuranceExpiry: dateOffset(170), brownCardExpiry: dateOffset(90), status: 'active' },
];

function driver(id: string, agencyId: string, name: string, phone: string, n: string, lic: number, pro: number, bus: string | null): Driver {
  return {
    id, agencyId, name, phone, email: `${id}@chauffeurs.demo`, identityDocumentRef: `DEMO-ID-${n}`, identityDocumentExpiry: dateOffset(700),
    licenceReference: `DEMO-PC-${n}`, licenceExpiry: dateOffset(lic), professionalCardReference: `DEMO-CP-${n}`,
    professionalCardExpiry: dateOffset(pro), assignedBusId: bus, status: 'active',
  };
}

const drivers: Driver[] = [
  driver('d-1', 'org-ag-1', 'Komlan Adjété', '+228 00 00 11 01', 'T101', 400, 250, 'b-1'),
  driver('d-2', 'org-ag-1', 'Yawo Mensah', '+228 00 00 11 02', 'T102', 300, 25, 'b-2'),
  driver('d-3', 'org-ag-1', 'Edem Kpodar', '+228 00 00 11 03', 'T103', -10, 200, null),
  driver('d-4', 'org-ag-2', 'Sèdjro Hounkpè', '+229 00 00 21 01', 'B201', 500, 320, 'b-4'),
  driver('d-5', 'org-ag-2', 'Rodrigue Agossou', '+229 00 00 21 02', 'B202', 260, 280, 'b-5'),
];

type PSeed = [id: string, agency: string, last: string, first: string, dob: string, nat: string, docType: Passenger['documentType'], docNo: string, expiryDays: number, extra?: Partial<Passenger>];

const pSeeds: PSeed[] = [
  ['p-1', 'org-ag-1', 'AKAKPO', 'Délali', '1988-04-12', 'Togolaise', 'national_id', 'DEMO-TG-100231', 900],
  ['p-2', 'org-ag-1', 'GBEDEMAH', 'Mawuli', '1975-09-30', 'Togolaise', 'passport', 'DEMO-TG-P20117', 1300],
  ['p-3', 'org-ag-1', 'ADJOVI', 'Rachida', '1993-01-05', 'Béninoise', 'ecowas_id', 'DEMO-BJ-300488', 640],
  ['p-4', 'org-ag-1', 'OKONKWO', 'Chidi', '1990-07-19', 'Nigériane', 'passport', 'DEMO-NG-A55120', 1000],
  ['p-5', 'org-ag-1', 'TSOGBE', 'Akouvi', '1984-11-02', 'Togolaise', 'national_id', 'DEMO-TG-100877', 1200],
  ['p-6', 'org-ag-1', 'HOUNSOU', 'Gildas', '1979-03-23', 'Béninoise', 'national_id', 'DEMO-BJ-301102', 400],
  ['p-7', 'org-ag-1', 'MÜLLER', 'Anna', '1996-06-14', 'Allemande', 'passport', 'DEMO-DE-C91X22', 2000, { visaRequired: true }],
  ['p-8', 'org-ag-1', 'ASANTE', 'Kwabena', '1987-12-08', 'Ghanéenne', 'ecowas_id', 'DEMO-GH-700213', 850],
  ['p-9', 'org-ag-1', 'DEMO', 'Signalement', '1982-02-17', 'Autre', 'passport', 'ZZ-DEMO-000913', 900, { visaRequired: true, visaNumber: 'DEMO-VISA-0913', visaExpiry: dateOffset(40) }],
  ['p-10', 'org-ag-1', 'KOUASSI', 'Aya', '2001-08-27', 'Ivoirienne', 'national_id', 'DEMO-CI-501144', 520],
  ['p-11', 'org-ag-2', 'DOSSA', 'Hermione', '1991-05-03', 'Béninoise', 'national_id', 'DEMO-BJ-302215', 760],
  ['p-12', 'org-ag-2', 'ZINSOU', 'Marcellin', '1970-10-11', 'Béninoise', 'passport', 'DEMO-BJ-P40031', 1500],
  ['p-13', 'org-ag-2', 'AMOUZOU', 'Kafui', '1999-01-29', 'Togolaise', 'ecowas_id', 'DEMO-TG-101390', 980],
  ['p-14', 'org-ag-2', 'BELLO', 'Ibrahim', '1986-09-15', 'Nigérienne', 'passport', 'DEMO-NE-B70021', 15],
  ['p-15', 'org-ag-1', 'AGBEKO', 'Sitsofe', '1994-02-10', 'Togolaise', 'national_id', 'DEMO-TG-101552', 1100],
  ['p-16', 'org-ag-1', 'FAGLA', 'Christelle', '1989-07-07', 'Béninoise', 'national_id', 'DEMO-BJ-302740', 700],
  ['p-17', 'org-ag-1', 'NOMENYO', 'Kossivi', '1972-12-30', 'Togolaise', 'passport', 'DEMO-TG-P20899', -6],
  ['p-18', 'org-ag-1', 'LI', 'Wei', '1985-04-21', 'Chinoise', 'passport', 'DEMO-CN-E77310', 1600, { visaRequired: true, visaNumber: 'DEMO-VISA-7310', visaExpiry: dateOffset(25) }],
  ['p-19', 'org-ag-1', 'ATTIOGBE', 'Yao', '1968-08-08', 'Togolaise', 'national_id', 'DEMO-TG-101903', 300, { consentStatus: 'declined' }],
  ['p-20', 'org-ag-1', 'SOSSOU', 'Edwige', '1990-03-18', 'Béninoise', 'national_id', 'DEMO-BJ-303011', 820, { consentStatus: 'pending', registrationStatus: 'consent_pending' }],
  ['p-21', 'org-ag-1', 'SOSSOU', 'Léa', '2017-06-02', 'Béninoise', 'birth_certificate', 'DEMO-BJ-AN-0412', 3650, { guardianPassengerId: 'p-20', consentStatus: 'pending', registrationStatus: 'consent_pending' }],
  ['p-22', 'org-ag-2', 'HOUNGBO', 'Ulrich', '1983-11-25', 'Béninoise', 'national_id', 'DEMO-BJ-303377', 610],
  ['p-23', 'org-ag-2', 'LATEVI', 'Ablavi', '1997-05-09', 'Togolaise', 'national_id', 'DEMO-TG-102004', 890],
];

const passengers: Passenger[] = pSeeds.map(([id, agencyId, lastName, firstName, dob, nationality, documentType, documentNumber, exp, extra], i) => {
  const country = agencyId === 'org-ag-1' ? '228' : '229';
  const consent = extra?.consentStatus ?? 'given';
  const meta = (name: string) => ({ fileName: `${name}-${id}.jpg`, sizeKb: 180 + i * 3, capturedAt: todayAt(8, 0, -3), simulated: true });
  return {
    id, agencyId, firstName, lastName, dateOfBirth: dob, nationality,
    phone: documentType === 'birth_certificate' ? '' : `+${country} 00 00 ${String(40 + i).padStart(2, '0')} ${String(10 + i).padStart(2, '0')}`,
    documentType, documentNumber, documentExpiry: dateOffset(exp),
    documentFront: consent === 'given' ? meta('recto') : null,
    documentBack: consent === 'given' && documentType !== 'passport' ? meta('verso') : null,
    face: consent === 'given' ? meta('visage') : null,
    visaRequired: false, visaNumber: '', visaExpiry: '', guardianPassengerId: null,
    consentStatus: consent, consentAt: consent === 'given' ? todayAt(8, 0, -3) : null,
    consentRecordedBy: consent === 'given' ? 'u-ag1-counter' : null,
    registrationStatus: 'registered', createdAt: todayAt(8, 0, -3), rightsRequests: [],
    ...extra,
  } as Passenger;
}).map((p) => ({ ...p, registrationStatus: computeRegistrationStatus(p) }));

function emptyBorder(): Trip['border'] {
  const side = (country: Country) => ({ country, arrivedAt: null, actualCount: null, countRecordedAt: null, completedAt: null, completedBy: null, checks: {} });
  return { TG: side('TG'), BJ: side('BJ') };
}

function trip(id: string, code: string, agencyId: string, direction: Direction, departAt: string, busId: string, driverId: string, status: TripStatus, stops: string[], extra: Partial<Trip> = {}): Trip {
  const d = new Date(departAt);
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return {
    id, reference: `WZP-${yymmdd}-${direction === 'TG-BJ' ? 'LC' : 'CL'}${code}`, agencyId, direction, ...endpoints(direction),
    scheduledDeparture: departAt, actualDeparture: null, estimatedArrival: addMinutes(departAt, 240), borderArrival: null, actualArrival: null,
    busId, driverId, convoyeur: '', stops, status, lastPosition: null, border: emptyBorder(), customs: [], createdAt: addMinutes(departAt, -60 * 24),
    ...extra,
  };
}

const t1Dep = todayAt(6, 30);
const t2Dep = todayAt(9, 0);
const t3Dep = todayAt(8, 0);
const t4Dep = todayAt(14, 0);
const t5Dep = todayAt(7, 0, 1);
const t6Dep = todayAt(15, 0, 1);
const t7Dep = todayAt(7, 0, -1);
const t8Dep = todayAt(13, 0, -1);

function processedBorder(dep: string, dir: Direction, count: number, firstOffset: number, durA: number, durB: number): Trip['border'] {
  const b = emptyBorder();
  const first: Country = dir === 'TG-BJ' ? 'TG' : 'BJ';
  const second: Country = first === 'TG' ? 'BJ' : 'TG';
  const a1 = addMinutes(dep, firstOffset);
  b[first] = { ...b[first], arrivedAt: a1, actualCount: count, countRecordedAt: addMinutes(a1, 3), completedAt: addMinutes(a1, durA), completedBy: first === 'TG' ? 'u-bp-tg' : 'u-bp-bj' };
  const a2 = addMinutes(a1, durA + 4);
  b[second] = { ...b[second], arrivedAt: a2, actualCount: count, countRecordedAt: addMinutes(a2, 3), completedAt: addMinutes(a2, durB), completedBy: second === 'TG' ? 'u-bp-tg' : 'u-bp-bj' };
  return b;
}

const trips: Trip[] = [
  trip('t-1', '01', 'org-ag-1', 'TG-BJ', t1Dep, 'b-2', 'd-2', 'arrived', ['Ouidah'], {
    actualDeparture: addMinutes(t1Dep, 8), borderArrival: addMinutes(t1Dep, 62), actualArrival: addMinutes(t1Dep, 215),
    border: processedBorder(t1Dep, 'TG-BJ', 4, 62, 18, 21), lastPosition: { label: 'Cotonou', km: 155, at: addMinutes(t1Dep, 215) },
    customs: [{ country: 'BJ', handledAt: addMinutes(t1Dep, 100), handledBy: 'u-cus-bj', note: 'Prise en charge enregistrée.' }],
  }),
  trip('t-2', '02', 'org-ag-1', 'TG-BJ', t2Dep, 'b-1', 'd-1', 'approaching_border', ['Aného', 'Ouidah'], {
    actualDeparture: addMinutes(t2Dep, 12), lastPosition: { label: 'Aného', km: 45, at: addMinutes(t2Dep, 55) },
  }),
  trip('t-3', '03', 'org-ag-2', 'BJ-TG', t3Dep, 'b-4', 'd-4', 'at_border', ['Ouidah', 'Comè'], {
    actualDeparture: addMinutes(t3Dep, 5), borderArrival: addMinutes(t3Dep, 110), lastPosition: { label: 'Frontière Sanvee-Condji / Hillacondji', km: 100, at: addMinutes(t3Dep, 110) },
    border: (() => { const b = emptyBorder(); b.BJ = { ...b.BJ, arrivedAt: addMinutes(t3Dep, 110), actualCount: 4, countRecordedAt: addMinutes(t3Dep, 114), checks: {} }; return b; })(),
  }),
  trip('t-4', '04', 'org-ag-1', 'TG-BJ', t4Dep, 'b-2', 'd-2', 'boarding', ['Grand-Popo']),
  trip('t-5', '05', 'org-ag-1', 'BJ-TG', t5Dep, 'b-1', 'd-1', 'preparing', ['Ouidah']),
  trip('t-6', '06', 'org-ag-2', 'TG-BJ', t6Dep, 'b-5', 'd-5', 'planned', []),
  trip('t-7', '07', 'org-ag-2', 'BJ-TG', t7Dep, 'b-4', 'd-4', 'arrived', ['Comè'], {
    actualDeparture: addMinutes(t7Dep, 4), borderArrival: addMinutes(t7Dep, 105), actualArrival: addMinutes(t7Dep, 230),
    border: processedBorder(t7Dep, 'BJ-TG', 2, 105, 14, 16), lastPosition: { label: 'Lomé', km: 155, at: addMinutes(t7Dep, 230) },
  }),
  trip('t-8', '08', 'org-ag-1', 'TG-BJ', t8Dep, 'b-1', 'd-1', 'arrived', [], {
    actualDeparture: addMinutes(t8Dep, 15), borderArrival: addMinutes(t8Dep, 70), actualArrival: addMinutes(t8Dep, 225),
    border: processedBorder(t8Dep, 'TG-BJ', 2, 70, 22, 19), lastPosition: { label: 'Cotonou', km: 155, at: addMinutes(t8Dep, 225) },
  }),
];

type PtSeed = [id: string, passengerId: string, tripId: string, bags: number, boarding: PassengerTrip['boardingStatus'], goods?: string];

const ptSeeds: PtSeed[] = [
  ['pt-1', 'p-1', 't-1', 1, 'boarded'], ['pt-2', 'p-2', 't-1', 2, 'boarded'], ['pt-3', 'p-3', 't-1', 1, 'boarded'], ['pt-4', 'p-4', 't-1', 3, 'boarded', 'Tissus — 2 ballots'],
  ['pt-5', 'p-5', 't-2', 1, 'boarded'], ['pt-6', 'p-6', 't-2', 2, 'boarded'], ['pt-7', 'p-7', 't-2', 1, 'boarded'], ['pt-8', 'p-8', 't-2', 2, 'boarded', 'Cosmétiques — 1 carton'],
  ['pt-9', 'p-9', 't-2', 1, 'boarded'], ['pt-10', 'p-10', 't-2', 0, 'boarded'],
  ['pt-11', 'p-11', 't-3', 1, 'boarded'], ['pt-12', 'p-12', 't-3', 4, 'boarded', 'Pagnes wax — 3 ballots'], ['pt-13', 'p-13', 't-3', 1, 'boarded'], ['pt-14', 'p-14', 't-3', 2, 'boarded', 'Pièces détachées de moto — 1 carton'],
  ['pt-15', 'p-15', 't-4', 1, 'boarded'], ['pt-16', 'p-16', 't-4', 2, 'boarded'], ['pt-17', 'p-17', 't-4', 1, 'pending'], ['pt-18', 'p-18', 't-4', 2, 'pending'], ['pt-19', 'p-19', 't-4', 1, 'pending'],
  ['pt-20', 'p-20', 't-5', 2, 'pending'], ['pt-21', 'p-21', 't-5', 0, 'pending'],
  ['pt-22', 'p-22', 't-7', 1, 'boarded'], ['pt-23', 'p-23', 't-7', 2, 'boarded', 'Produits agricoles — 2 sacs'],
  ['pt-24', 'p-1', 't-8', 1, 'boarded'], ['pt-25', 'p-5', 't-8', 1, 'boarded'],
];

const tripById = (id: string) => trips.find((t) => t.id === id)!;
const passengerById = (id: string) => passengers.find((p) => p.id === id)!;

const passengerTrips: PassengerTrip[] = ptSeeds.map(([id, passengerId, tripId, bags, boarding, goods], i) => {
  const t = tripById(tripId);
  const p = passengerById(passengerId);
  return {
    id, passengerId, tripId, ticketReference: `TKT-${t.reference.slice(4)}-${String(i + 1).padStart(3, '0')}`,
    baggageCount: bags, commercialGoods: goods ?? '', boardingStatus: boarding,
    boardingTimestamp: boarding === 'boarded' ? addMinutes(t.scheduledDeparture, -25 + (i % 5) * 3) : null,
    faceConfirmDemo: boarding === 'boarded' ? 'match_demo' : 'not_done', preRegistered: p.consentStatus !== 'declined',
    createdAt: addMinutes(t.scheduledDeparture, -60 * 20), removedAt: null,
  };
});

const baggage: Baggage[] = passengerTrips.flatMap((pt) =>
  Array.from({ length: pt.baggageCount }, (_, i) => ({ id: `bg-${pt.id}-${i + 1}`, passengerTripId: pt.id, labelReference: `${pt.ticketReference}-B${i + 1}`, index: i + 1, printedAt: pt.createdAt })),
);

function recips(sentAt: string, tg: RecipientState, bj: RecipientState, ackDelay = 2, procDelay = 35): ManifestRecipient[] {
  const r = (authority: 'police_tg' | 'police_bj', state: RecipientState): ManifestRecipient => ({
    authority, state,
    sentAt: state === 'to_send' ? null : sentAt,
    acknowledgedAt: ['received', 'verifying', 'processed'].includes(state) ? addMinutes(sentAt, ackDelay) : null,
    processedAt: state === 'processed' ? addMinutes(sentAt, procDelay) : null,
  });
  return [r('police_tg', tg), r('police_bj', bj)];
}

function manifest(id: string, tripId: string, version: number, type: ManifestType, at: string, recipients: ManifestRecipient[], by = 'u-ag1-counter'): Manifest {
  const t = tripById(tripId);
  const pts = passengerTrips.filter((pt) => pt.tripId === tripId && (type === 'provisional' || pt.boardingStatus === 'boarded'));
  return {
    id, reference: `MAN-${t.reference.slice(4)}-V${version}`, tripId, version, type, passengerCount: pts.filter((pt) => pt.preRegistered).length,
    incompleteCount: pts.filter((pt) => pt.preRegistered && passengerById(pt.passengerId).registrationStatus !== 'registered').length,
    conventionalCount: pts.filter((pt) => !pt.preRegistered).length,
    passengerTripIds: pts.filter((pt) => pt.preRegistered).map((pt) => pt.id), createdAt: at, createdBy: by, note: '', recipients,
  };
}

const manifests: Manifest[] = [
  manifest('m-1a', 't-1', 1, 'provisional', addMinutes(t1Dep, -60), recips(addMinutes(t1Dep, -59), 'received', 'received')),
  manifest('m-1b', 't-1', 2, 'final', addMinutes(t1Dep, 2), recips(addMinutes(t1Dep, 3), 'processed', 'processed', 1, 28), 'u-ag1-board'),
  manifest('m-2a', 't-2', 1, 'provisional', addMinutes(t2Dep, -60), recips(addMinutes(t2Dep, -59), 'received', 'received')),
  manifest('m-2b', 't-2', 2, 'final', addMinutes(t2Dep, 5), recips(addMinutes(t2Dep, 6), 'verifying', 'received'), 'u-ag1-board'),
  manifest('m-3a', 't-3', 1, 'final', addMinutes(t3Dep, -2), recips(addMinutes(t3Dep, -1), 'received', 'processed', 2, 40), 'u-ag2-counter'),
  manifest('m-4a', 't-4', 1, 'provisional', addMinutes(t4Dep, -60), recips(addMinutes(t4Dep, -59), 'received', 'failed')),
  manifest('m-7a', 't-7', 1, 'final', addMinutes(t7Dep, 1), recips(addMinutes(t7Dep, 2), 'processed', 'processed', 2, 31), 'u-ag2-counter'),
  manifest('m-8a', 't-8', 1, 'final', addMinutes(t8Dep, 4), recips(addMinutes(t8Dep, 5), 'processed', 'processed', 1, 26), 'u-ag1-board'),
];
// Le manifeste provisoire de t-4 a échoué vers la police du Bénin (démonstration de l'état d'échec).
manifests.find((m) => m.id === 'm-4a')!.recipients[1].sentAt = addMinutes(t4Dep, -59);

// Révisions police simulées pour chaque manifeste reçu (la dernière version reçue par autorité).
const policeReviews: PoliceReview[] = [];
for (const m of manifests) {
  for (const r of m.recipients) {
    if (!['received', 'verifying', 'processed'].includes(r.state)) continue;
    for (const ptId of m.passengerTripIds) {
      const already = policeReviews.find((x) => x.passengerTripId === ptId && x.authority === r.authority);
      if (already) { already.manifestId = m.id; continue; }
      const pt = passengerTrips.find((x) => x.id === ptId)!;
      if (!pt.preRegistered) continue;
      const res = simulateScreening(passengerById(pt.passengerId), tripById(m.tripId));
      const done = r.state === 'processed';
      const officer = r.authority === 'police_tg' ? 'u-pol-tg' : 'u-pol-bj';
      policeReviews.push({
        id: `pr-${r.authority}-${ptId}`, authority: r.authority, passengerTripId: ptId, tripId: m.tripId, manifestId: m.id,
        autoStatus: res.status, status: res.status, internalReason: res.reason, reviewState: done ? 'confirmed' : 'pending',
        reviewedBy: done ? officer : null, reviewedAt: done ? r.processedAt : null, notes: [], createdAt: r.acknowledgedAt ?? m.createdAt,
      });
    }
  }
}
// Quelques révisions déjà effectuées par la police du Togo sur t-2.
for (const id of ['pr-police_tg-pt-5', 'pr-police_tg-pt-6']) {
  const r = policeReviews.find((x) => x.id === id);
  if (r) { r.reviewState = 'confirmed'; r.reviewedBy = 'u-pol-tg'; r.reviewedAt = addMinutes(t2Dep, 20); }
}
const redNote = policeReviews.find((x) => x.id === 'pr-police_tg-pt-9');
if (redNote) redNote.notes.push({ by: 'u-pol-tg', at: addMinutes(t2Dep, 25), text: 'Prise en charge discrète prévue au poste. Note interne de démonstration.' });

let evCounter = 0;
function ev(tripId: string, eventType: TripEventType, timestamp: string, recordedBy: string, locationLabel = '', note = ''): TripEvent {
  evCounter++;
  return { id: `ev-${evCounter}`, clientEventId: `seed-${evCounter}`, tripId, eventType, timestamp, recordedBy, locationLabel, note, synchronizationStatus: 'synced' };
}

const tripEvents: TripEvent[] = [];
for (const t of trips) tripEvents.push(ev(t.id, 'created', t.createdAt, t.agencyId === 'org-ag-1' ? 'u-ag1-admin' : 'u-ag2-admin', t.departure));
function journey(t: Trip, driverUser: string, opts: { upTo: TripEventType; borderMin: number; arriveMin: number }) {
  const s = t.scheduledDeparture;
  const seq: [TripEventType, number, string][] = [
    ['provisional_manifest', -60, t.departure],
    ['boarding_opened', -45, t.departure],
    ['boarding_closed', 2, t.departure],
    ['departure', 8, t.departure],
    ['approaching_border', opts.borderMin - 10, t.direction === 'TG-BJ' ? 'Aného' : 'Grand-Popo'],
    ['border_arrival', opts.borderMin, 'Frontière Sanvee-Condji / Hillacondji'],
    ['border_processed', opts.borderMin + 40, 'Frontière Sanvee-Condji / Hillacondji'],
    ['border_departure', opts.borderMin + 44, 'Frontière Sanvee-Condji / Hillacondji'],
    ['destination_arrival', opts.arriveMin, t.destination],
  ];
  for (const [type, off, loc] of seq) {
    const by = ['provisional_manifest', 'boarding_opened', 'boarding_closed'].includes(type) ? 'u-ag1-board' : type === 'border_processed' ? 'u-bp-bj' : driverUser;
    tripEvents.push(ev(t.id, type, addMinutes(s, off), by, loc));
    if (type === opts.upTo) break;
  }
}
journey(tripById('t-1'), 'u-drv-2', { upTo: 'destination_arrival', borderMin: 62, arriveMin: 215 });
journey(tripById('t-2'), 'u-drv-1', { upTo: 'approaching_border', borderMin: 65, arriveMin: 0 });
journey(tripById('t-3'), 'u-drv-4', { upTo: 'border_arrival', borderMin: 110, arriveMin: 0 });
journey(tripById('t-7'), 'u-drv-4', { upTo: 'destination_arrival', borderMin: 105, arriveMin: 230 });
journey(tripById('t-8'), 'u-drv-1', { upTo: 'destination_arrival', borderMin: 70, arriveMin: 225 });
tripEvents.push(ev('t-2', 'stop_arrival', addMinutes(t2Dep, 50), 'u-drv-1', 'Aného', 'Arrêt autorisé — 5 min'));
tripEvents.push(ev('t-3', 'incident', addMinutes(t3Dep, 70), 'u-drv-4', 'Comè', 'Ralentissement important sur la route (démonstration).'));
tripEvents.push(ev('t-4', 'provisional_manifest', addMinutes(t4Dep, -60), 'u-ag1-counter', 'Lomé'));
tripEvents.push(ev('t-4', 'boarding_opened', addMinutes(t4Dep, -40), 'u-ag1-board', 'Lomé'));

function notif(id: string, audience: AppNotification['audience'], title: string, body: string, link: string | null, createdAt: string, severity: AppNotification['severity'] = 'info'): AppNotification {
  return { id, audience, title, body, link, createdAt, readBy: [], severity };
}

const notifications: AppNotification[] = [
  notif('n-1', { kind: 'org', organizationId: 'org-ag-1' }, 'Manifeste reçu par la police', 'Liste définitive du voyage WZP-…LC02 : accusé de réception simulé de la Police — Togo.', '/agency/trips/t-2/manifest', addMinutes(t2Dep, 8), 'success'),
  notif('n-2', { kind: 'org', organizationId: 'org-ag-1' }, 'Échec de transmission', 'La liste provisoire du voyage LC04 n’a pas pu être transmise à la Police — Bénin (simulation). Relancez la transmission.', '/agency/trips/t-4/manifest', addMinutes(t4Dep, -58), 'attention'),
  notif('n-3', { kind: 'org', organizationId: 'org-ag-1' }, 'Document du véhicule bientôt expiré', "L'assurance du bus TG 5530 DM expire dans moins de 30 jours.", '/agency/fleet/buses', todayAt(6, 0), 'attention'),
  notif('n-4', { kind: 'org', organizationId: 'org-ag-1' }, 'Document du chauffeur expiré', 'Le permis de conduire de Edem Kpodar est expiré. Chauffeur indisponible pour l’affectation.', '/agency/fleet/drivers', todayAt(6, 0), 'critical'),
  notif('n-5', { kind: 'orgType', orgType: 'police' }, 'Nouveau manifeste reçu', 'Liste définitive — voyage LC02 (Trans-Littoral Express), 6 passagers.', '/police/manifests', addMinutes(t2Dep, 8)),
  notif('n-6', { kind: 'orgType', orgType: 'police' }, 'Bus à l’approche de la frontière', 'TG 4821 DM — voyage LC02, Togo → Bénin.', '/police/arrivals', addMinutes(t2Dep, 55), 'attention'),
  notif('n-7', { kind: 'orgType', orgType: 'border_post' }, 'Bus à l’approche de la frontière', 'TG 4821 DM — voyage LC02, 6 passagers attendus.', '/border/trips/t-2', addMinutes(t2Dep, 55), 'attention'),
  notif('n-8', { kind: 'orgType', orgType: 'border_post' }, 'Bus arrivé au poste frontalier', 'BJ 7703 RB — voyage CL03, Bénin → Togo.', '/border/trips/t-3', addMinutes(t3Dep, 110)),
  notif('n-9', { kind: 'orgType', orgType: 'customs' }, 'Bus arrivé au poste frontalier', 'BJ 7703 RB — 4 passagers, 8 bagages, 2 déclarations de marchandises.', '/customs/trips/t-3', addMinutes(t3Dep, 110)),
  notif('n-10', { kind: 'orgType', orgType: 'customs' }, 'Bus à l’approche de la frontière', 'TG 4821 DM — 6 passagers, 7 bagages.', '/customs/trips/t-2', addMinutes(t2Dep, 55)),
  notif('n-11', { kind: 'orgType', orgType: 'central' }, 'Nouvelle demande d’agrément', 'Corridor Sud Transport (Aného) a déposé une demande. Pièces à vérifier.', '/admin/agencies/org-ag-3', todayAt(10, 15, -2), 'attention'),
  notif('n-12', { kind: 'orgType', orgType: 'central' }, 'Échec de transmission', 'Voyage LC04 : liste provisoire non reçue par la Police — Bénin (simulation).', '/admin/trips', addMinutes(t4Dep, -58), 'attention'),
  notif('n-13', { kind: 'org', organizationId: 'org-ag-2' }, 'Incident signalé par le chauffeur', 'Voyage CL03 : ralentissement important à Comè.', '/agency/tracking', addMinutes(t3Dep, 70), 'attention'),
  notif('n-14', { kind: 'org', organizationId: 'org-ag-2' }, 'Document du véhicule bientôt expiré', 'La visite technique du bus BJ 7718 RB expire dans moins de 30 jours.', '/agency/fleet/buses', todayAt(6, 0), 'attention'),
];

function audit(id: string, userId: string, action: string, entityType: string, entityId: string, timestamp: string, outcome: AuditLog['outcome'] = 'success', policeDetail?: string): AuditLog {
  const u = users.find((x) => x.id === userId)!;
  const o = organizations.find((x) => x.id === u.organizationId)!;
  return { id, userId, userName: u.name, organizationId: o.id, organizationName: o.name, role: u.role, action, entityType, entityId, timestamp, outcome, policeDetail };
}

const auditLogs: AuditLog[] = [
  audit('a-1', 'u-ag1-admin', 'Création du voyage', 'Voyage', 't-4', tripById('t-4').createdAt),
  audit('a-2', 'u-ag1-counter', 'Enregistrement du passager', 'Passager', 'p-18', addMinutes(t4Dep, -60 * 20)),
  audit('a-3', 'u-ag1-counter', 'Transmission simulée de la liste provisoire', 'Manifeste', 'm-4a', addMinutes(t4Dep, -59)),
  audit('a-4', 'u-ag1-board', 'Clôture de l’embarquement', 'Voyage', 't-2', addMinutes(t2Dep, 2)),
  audit('a-5', 'u-pol-tg', 'Révision manuelle enregistrée', 'Dossier passager', 'pt-5', addMinutes(t2Dep, 20), 'success', 'Résultat confirmé : Vert.'),
  audit('a-6', 'u-pol-tg', 'Note interne ajoutée', 'Dossier passager', 'pt-9', addMinutes(t2Dep, 25), 'success', 'Note sur un dossier Rouge.'),
  audit('a-7', 'u-bp-bj', 'Comptage enregistré', 'Voyage', 't-3', addMinutes(t3Dep, 114)),
  audit('a-8', 'u-admin', 'Création de compte', 'Compte', 'u-drv-4', todayAt(9, 0, -5)),
  audit('a-9', 'u-admin', 'Suspension de compte', 'Compte', 'u-ag1-old', todayAt(11, 30, -3)),
  audit('a-10', 'u-ag1-counter', 'Tentative d’accès à un espace non autorisé', 'Route', '/admin/dashboard', todayAt(12, 4, -1), 'denied'),
];

export function createSeed(): DbState {
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    seededAt: nowIso(),
    organizations, users, passengers, passengerTrips, baggage, trips, manifests, policeReviews, tripEvents,
    buses, drivers, auditLogs, notifications,
    accessRequests: [
      {
        id: 'ar-1', organizationName: 'Mono Express Liaisons', organizationType: 'Agence de transport', country: 'Bénin',
        contactName: 'Contact démo', contactFunction: 'Directeur', email: 'contact@mono-liaisons.demo', phone: '+229 00 00 50 01',
        message: 'Souhaite participer à la phase pilote sur Cotonou – Lomé.', status: 'new', createdAt: todayAt(16, 20, -1),
      },
    ],
    agencyNotices: [
      { id: 'an-1', agencyId: 'org-ag-1', passengerTripId: 'pt-17', issue: 'document_expired', createdAt: addMinutes(t4Dep, -50), resolvedAt: null },
    ],
    settings: {
      simulateOffline: false, simulateTransmissionFailure: false,
      retentionManifestHours: 72, retentionProfileMonths: 12, retentionAuditYears: 3, privacyPolicyVersion: 'Projet — non validé',
    },
  });
}
