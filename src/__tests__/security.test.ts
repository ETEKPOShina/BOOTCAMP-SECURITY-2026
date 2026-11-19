import { beforeEach, describe, expect, it } from 'vitest';
import { createSeed } from '../data/seed';
import { getDb, replaceDb } from '../data/store';
import * as api from '../services/api';
import * as q from '../services/queries';
import { can, workspaceOf } from '../domain/permissions';
import { simulateScreening } from '../domain/screening';
import { computeRegistrationStatus } from '../domain/passenger';
import { busAvailability, expiryState } from '../domain/documents';
import { dateOffset } from '../lib/dates';
import type { User } from '../domain/types';

const u = (id: string): User => getDb().users.find((x) => x.id === id)!;

beforeEach(() => replaceDb(createSeed()));

describe('cloisonnement des données', () => {
  it("l'agence ne lit que ses propres voyages et passagers", () => {
    const db = getDb();
    const a1 = u('u-ag1-admin');
    expect(q.agencyTrips(db, a1).every((t) => t.agencyId === 'org-ag-1')).toBe(true);
    expect(q.agencyPassengers(db, a1).every((p) => p.agencyId === 'org-ag-1')).toBe(true);
    expect(q.agencyTrip(db, a1, 't-3')).toBeUndefined(); // voyage de l'agence 2
  });

  it('les statuts police ne sont accessibles ni aux agences, ni aux douanes, ni au chauffeur', () => {
    const db = getDb();
    for (const id of ['u-ag1-admin', 'u-ag1-counter', 'u-cus-bj', 'u-drv-1', 'u-admin']) {
      expect(q.policeReviews(db, u(id))).toEqual([]);
      expect(q.borderStatusView(db, u(id), 'pt-9')).toBeNull();
    }
  });

  it("chaque service de police ne voit que les dossiers de son autorité", () => {
    const db = getDb();
    expect(q.policeReviews(db, u('u-pol-tg')).every((r) => r.authority === 'police_tg')).toBe(true);
    expect(q.policeReviews(db, u('u-pol-bj')).every((r) => r.authority === 'police_bj')).toBe(true);
  });

  it("le journal d'audit ne renvoie le détail police qu'à la police", () => {
    const db = getDb();
    expect(q.auditFor(db, u('u-admin')).some((l) => l.policeDetail)).toBe(false);
    expect(q.auditFor(db, u('u-pol-tg')).some((l) => l.policeDetail)).toBe(true);
    expect(q.auditFor(db, u('u-ag1-admin')).every((l) => l.organizationId === 'org-ag-1')).toBe(true);
  });

  it("l'administration centrale ne reçoit que des totaux agrégés", () => {
    const agg = q.policeAggregate(getDb(), u('u-admin'), new Set(['t-2']));
    expect(agg).toEqual({ orange: expect.any(Number), red: expect.any(Number) });
    expect(q.policeAggregate(getDb(), u('u-ag1-admin'), new Set(['t-2']))).toBeNull();
  });
});

describe('habilitations côté service', () => {
  it('refuse et journalise une action non autorisée', () => {
    expect(() => api.createTrip(u('u-ag1-counter'), {} as api.TripInput, 'X')).toThrow(api.FORBIDDEN_MESSAGE);
    expect(getDb().auditLogs[0].outcome).toBe('denied');
    expect(() => api.policeConfirmReview(u('u-ag1-admin'), 'pr-police_tg-pt-9')).toThrow(api.ApiError);
    expect(() => api.customsRecordHandling(u('u-pol-tg'), 't-3', '')).toThrow(api.ApiError);
  });

  it('un compte suspendu perd ses habilitations', () => {
    api.updateAccount(u('u-admin'), 'u-ag1-counter', { status: 'suspended' });
    expect(can(u('u-ag1-counter'), 'agency.passenger.register')).toBe(false);
    expect(() => api.login('tle.guichet', api.DEMO_PASSWORD)).toThrow(/suspendu/);
  });

  it('la police ne peut signaler à l’agence que des anomalies administratives (orange)', () => {
    expect(() => api.policeNotifyAgencyIssue(u('u-pol-tg'), 'pr-police_tg-pt-9', 'document_expired')).toThrow(/corrigeable/);
  });

  it('le poste ne valide que le contrôle de son propre pays, sortie avant entrée', () => {
    const bj = u('u-bp-bj');
    // t-2 : Togo → Bénin. L'entrée au Bénin exige la sortie du Togo.
    api.borderRecordCount(bj, 't-2', 6);
    expect(() => api.borderCompleteControl(bj, 't-2')).toThrow(/sortie/);
    const tg = u('u-bp-tg');
    api.borderRecordCount(tg, 't-2', 6);
    api.borderCompleteControl(tg, 't-2');
    expect(getDb().trips.find((t) => t.id === 't-2')!.border.TG.completedAt).not.toBeNull();
    expect(getDb().trips.find((t) => t.id === 't-2')!.border.BJ.completedAt).toBeNull();
  });

  it('chaque espace correspond à un seul rôle', () => {
    expect(workspaceOf('agency_boarding')).toBe('agency');
    expect(workspaceOf('driver')).toBe('driver');
  });
});

describe('règles métier', () => {
  it('empêche le double embarquement', () => {
    const b = u('u-ag1-board');
    expect(api.boardByTicket(b, 't-4', 'TKT-' + getDb().passengerTrips.find((x) => x.id === 'pt-17')!.ticketReference.slice(4)).ok).toBe(true);
    const again = api.boardByTicket(b, 't-4', getDb().passengerTrips.find((x) => x.id === 'pt-17')!.ticketReference);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('already');
  });

  it("clôturer l'embarquement crée une liste définitive sans les voyageurs ayant refusé", () => {
    const m = api.closeBoarding(u('u-ag1-board'), 't-4');
    expect(m.type).toBe('final');
    expect(m.passengerTripIds).not.toContain('pt-19'); // p-19 a refusé la pré-inscription
    expect(getDb().trips.find((t) => t.id === 't-4')!.status).toBe('boarding_closed');
  });

  it('la transmission échoue proprement en cas de panne simulée', () => {
    api.updateSettings(u('u-admin'), { simulateTransmissionFailure: true });
    const m = api.closeBoarding(u('u-ag1-board'), 't-4');
    const r = api.transmitManifest(u('u-ag1-board'), m.id);
    expect(r.failed).toEqual(['police_bj']);
  });

  it("les événements chauffeur sont idempotents", () => {
    const d = u('u-drv-1');
    const e = { tripId: 't-2', type: 'border_arrival' as const, locationLabel: '', note: '', clientEventId: 'ce-test', timestamp: new Date().toISOString() };
    expect(api.recordDriverEvent(d, e).duplicate).toBe(false);
    expect(api.recordDriverEvent(d, e).duplicate).toBe(true);
    expect(getDb().tripEvents.filter((x) => x.clientEventId === 'ce-test')).toHaveLength(1);
  });

  it("un chauffeur ne peut agir que sur son propre voyage", () => {
    expect(() => api.recordDriverEvent(u('u-drv-1'), { tripId: 't-3', type: 'departure', locationLabel: '', note: '', clientEventId: 'x', timestamp: new Date().toISOString() })).toThrow();
  });

  it('documents : avertissement à 30 jours et indisponibilité si expiré', () => {
    expect(expiryState(dateOffset(10))).toBe('expiring');
    expect(expiryState(dateOffset(-1))).toBe('expired');
    expect(busAvailability(getDb().buses.find((b) => b.id === 'b-3')!).available).toBe(false);
  });

  it('statut d’enregistrement et vérification simulée', () => {
    const p = getDb().passengers.find((x) => x.id === 'p-17')!;
    expect(computeRegistrationStatus(p)).toBe('document_check');
    const t = getDb().trips.find((x) => x.id === 't-2')!;
    expect(simulateScreening(getDb().passengers.find((x) => x.id === 'p-9')!, t).status).toBe('red');
    expect(simulateScreening(getDb().passengers.find((x) => x.id === 'p-5')!, t).status).toBe('green');
  });

  it('le QR code ne contient que la référence du billet', () => {
    const ref = getDb().passengerTrips[0].ticketReference;
    expect(api.parseTicketInput(`https://exemple.test/billet/${ref}`)).toBe(ref);
  });
});
