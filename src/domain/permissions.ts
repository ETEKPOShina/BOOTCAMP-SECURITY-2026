import type { Role, User, Workspace } from './types';

export type Permission =
  | 'agency.trip.view' | 'agency.trip.create' | 'agency.passenger.register' | 'agency.passenger.view'
  | 'agency.boarding.operate' | 'agency.manifest.prepare' | 'agency.manifest.transmit'
  | 'agency.fleet.view' | 'agency.fleet.manage' | 'agency.team.view' | 'agency.stats.view'
  | 'agency.audit.view' | 'agency.settings.manage' | 'agency.tracking.view'
  | 'police.manifest.view' | 'police.review.record' | 'police.review.correct' | 'police.status.view'
  | 'police.reason.view' | 'police.audit.view'
  | 'border.trip.view' | 'border.count.record' | 'border.control.record'
  | 'customs.trip.view' | 'customs.handling.record'
  | 'admin.overview' | 'admin.agency.approve' | 'admin.account.manage' | 'admin.audit.view'
  | 'admin.settings.manage' | 'admin.stats.police_aggregate'
  | 'driver.trip.view' | 'driver.event.record';

const AGENCY_BASE: Permission[] = [
  'agency.trip.view', 'agency.passenger.view', 'agency.fleet.view', 'agency.tracking.view',
];

const MATRIX: Record<Role, Permission[]> = {
  agency_admin: [
    ...AGENCY_BASE, 'agency.trip.create', 'agency.passenger.register', 'agency.boarding.operate',
    'agency.manifest.prepare', 'agency.manifest.transmit', 'agency.fleet.manage', 'agency.team.view',
    'agency.stats.view', 'agency.audit.view', 'agency.settings.manage',
  ],
  agency_counter: [...AGENCY_BASE, 'agency.passenger.register', 'agency.manifest.prepare', 'agency.manifest.transmit'],
  agency_boarding: [...AGENCY_BASE, 'agency.boarding.operate', 'agency.manifest.transmit'],
  police_officer: [
    'police.manifest.view', 'police.review.record', 'police.review.correct', 'police.status.view',
    'police.reason.view', 'police.audit.view',
  ],
  // Les agents du poste frontalier relèvent de la police aux frontières : statut visible, motif non visible.
  border_officer: ['border.trip.view', 'border.count.record', 'border.control.record', 'police.status.view'],
  customs_officer: ['customs.trip.view', 'customs.handling.record'],
  central_admin: [
    'admin.overview', 'admin.agency.approve', 'admin.account.manage', 'admin.audit.view',
    'admin.settings.manage', 'admin.stats.police_aggregate',
  ],
  driver: ['driver.trip.view', 'driver.event.record'],
};

export const ALL_PERMISSIONS = Array.from(new Set(Object.values(MATRIX).flat()));

export const permissionLabel: Record<Permission, string> = {
  'agency.trip.view': 'Consulter les voyages de son agence',
  'agency.trip.create': 'Créer un voyage',
  'agency.passenger.register': 'Enregistrer un passager',
  'agency.passenger.view': 'Consulter les passagers de son agence',
  'agency.boarding.operate': "Gérer l'embarquement",
  'agency.manifest.prepare': 'Préparer une liste provisoire',
  'agency.manifest.transmit': 'Transmettre un manifeste',
  'agency.fleet.view': 'Consulter le parc automobile',
  'agency.fleet.manage': 'Gérer bus et chauffeurs',
  'agency.team.view': "Consulter l'équipe de l'agence",
  'agency.stats.view': "Consulter les statistiques de l'agence",
  'agency.audit.view': "Consulter l'historique de l'agence",
  'agency.settings.manage': "Modifier les paramètres de l'agence",
  'agency.tracking.view': 'Suivre les trajets de son agence',
  'police.manifest.view': 'Consulter les manifestes reçus',
  'police.review.record': 'Enregistrer une révision manuelle',
  'police.review.correct': 'Corriger un résultat de vérification',
  'police.status.view': 'Voir le statut de vérification police',
  'police.reason.view': 'Voir le motif réservé police',
  'police.audit.view': 'Consulter le journal police',
  'border.trip.view': 'Consulter les bus attendus et arrivés',
  'border.count.record': 'Enregistrer le comptage',
  'border.control.record': 'Enregistrer le contrôle (sortie / entrée)',
  'customs.trip.view': 'Consulter bagages et déclarations',
  'customs.handling.record': 'Enregistrer la prise en charge douanière',
  'admin.overview': 'Vue globale de la plateforme',
  'admin.agency.approve': 'Agréer ou suspendre une agence',
  'admin.account.manage': 'Créer, suspendre et révoquer des comptes',
  'admin.audit.view': "Consulter le journal global",
  'admin.settings.manage': 'Configurer la plateforme',
  'admin.stats.police_aggregate': 'Voir les totaux agrégés orange / rouge',
  'driver.trip.view': 'Consulter le voyage assigné',
  'driver.event.record': 'Enregistrer les événements du trajet',
};

export function permissionsOf(role: Role): Permission[] {
  return MATRIX[role];
}

export function can(user: Pick<User, 'role' | 'status'> | null | undefined, p: Permission): boolean {
  if (!user || user.status !== 'active') return false;
  return MATRIX[user.role].includes(p);
}

export function workspaceOf(role: Role): Workspace {
  switch (role) {
    case 'agency_admin':
    case 'agency_counter':
    case 'agency_boarding': return 'agency';
    case 'police_officer': return 'police';
    case 'border_officer': return 'border';
    case 'customs_officer': return 'customs';
    case 'central_admin': return 'admin';
    case 'driver': return 'driver';
  }
}

export const workspaceLabel: Record<Workspace, string> = {
  agency: 'Agence de transport',
  police: 'Police — Opérations',
  border: 'Poste frontalier',
  customs: 'Douanes',
  admin: 'Administration centrale',
  driver: 'Espace chauffeur',
};

export const workspaceHome: Record<Workspace, string> = {
  agency: '/agency/dashboard',
  police: '/police/dashboard',
  border: '/border/dashboard',
  customs: '/customs/dashboard',
  admin: '/admin/dashboard',
  driver: '/driver/home',
};

/** Rôles qu'il est possible d'attribuer selon le type d'organisation. */
export const rolesForOrgType: Record<string, Role[]> = {
  agency: ['agency_admin', 'agency_counter', 'agency_boarding', 'driver'],
  police: ['police_officer'],
  border_post: ['border_officer'],
  customs: ['customs_officer'],
  central: ['central_admin'],
};
