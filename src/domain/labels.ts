import type {
  ApprovalStatus, Authority, BoardingStatus, ConsentStatus, Country, Direction, DocumentType,
  ManifestStatus, ManifestType, OrgType, PoliceStatus, RecipientState, RegistrationStatus, Role,
  TripEventType, TripStatus, UserStatus,
} from './types';

// Libellés de l'interface. Le français est la langue par défaut ; la structure permet d'ajouter l'anglais plus tard.

export const tripStatusLabel: Record<TripStatus, string> = {
  planned: 'Prévu',
  preparing: 'En préparation',
  boarding: 'Embarquement en cours',
  boarding_closed: 'Embarquement clôturé',
  en_route: 'En route',
  approaching_border: "À l'approche de la frontière",
  at_border: 'À la frontière',
  arrived: 'Arrivé à destination',
  cancelled: 'Annulé',
};

export const manifestStatusLabel: Record<ManifestStatus, string> = {
  draft: 'Brouillon',
  ready: 'Prêt à transmettre',
  sent: 'Transmis',
  received: 'Reçu',
  verifying: 'En cours de vérification',
  processed: 'Traité',
  failed: 'Échec de transmission',
};

export const recipientStateLabel: Record<RecipientState, string> = {
  to_send: 'À transmettre',
  pending: 'En attente',
  received: 'Reçu',
  verifying: 'En cours de vérification',
  processed: 'Traité',
  failed: 'Échec de transmission',
};

export const manifestTypeLabel: Record<ManifestType, string> = {
  provisional: 'Liste provisoire',
  final: 'Liste définitive',
  update: 'Mise à jour du voyage',
};

export const registrationLabel: Record<RegistrationStatus, string> = {
  incomplete: 'À compléter',
  registered: 'Enregistré',
  document_check: 'Document à vérifier',
  consent_pending: 'Consentement en attente',
};

export const boardingLabel: Record<BoardingStatus, string> = {
  pending: "En attente d'embarquement",
  boarded: 'Embarqué',
  absent: 'Absent',
  manual_review: 'Vérification manuelle',
};

export const consentLabel: Record<ConsentStatus, string> = {
  given: 'Consentement recueilli',
  declined: 'Pré-inscription refusée',
  pending: 'Consentement en attente',
};

export const docTypeLabel: Record<DocumentType, string> = {
  passport: 'Passeport',
  national_id: "Carte nationale d'identité",
  ecowas_id: "Carte d'identité CEDEAO",
  travel_card: 'Carte de voyage / laissez-passer',
  birth_certificate: 'Acte de naissance (mineur)',
};

export const directionLabel: Record<Direction, string> = {
  'TG-BJ': 'Togo → Bénin',
  'BJ-TG': 'Bénin → Togo',
};

export const countryLabel: Record<Country, string> = { TG: 'Togo', BJ: 'Bénin' };

export const borderPostName: Record<Country, string> = {
  TG: 'Sanvee-Condji (Togo)',
  BJ: 'Hillacondji (Bénin)',
};

export const authorityLabel: Record<Authority, string> = {
  police_tg: 'Police — Togo',
  police_bj: 'Police — Bénin',
};

export const authorityCountry: Record<Authority, Country> = { police_tg: 'TG', police_bj: 'BJ' };
export const countryAuthority: Record<Country, Authority> = { TG: 'police_tg', BJ: 'police_bj' };

export const policeStatusLabel: Record<PoliceStatus, { short: string; long: string }> = {
  green: { short: 'Vert', long: 'Vert — Aucune anomalie détectée' },
  orange: { short: 'Orange', long: 'Orange — Vérification complémentaire' },
  red: { short: 'Rouge', long: 'Rouge — Signalement nécessitant une prise en charge' },
};

export const roleLabel: Record<Role, string> = {
  agency_admin: "Administrateur d'agence",
  agency_counter: 'Agent de guichet',
  agency_boarding: "Agent d'embarquement",
  police_officer: 'Officier de police — opérations',
  border_officer: 'Agent du poste frontalier',
  customs_officer: 'Agent des douanes',
  central_admin: 'Administrateur central',
  driver: 'Chauffeur',
};

export const orgTypeLabel: Record<OrgType, string> = {
  agency: 'Agence de transport',
  police: 'Service de police',
  border_post: 'Poste frontalier',
  customs: 'Douanes',
  central: 'Administration centrale',
};

export const approvalLabel: Record<ApprovalStatus, string> = {
  approved: 'Agréée',
  pending: 'Demande reçue',
  in_review: 'En cours de vérification',
  suspended: 'Suspendue',
  rejected: 'Refusée',
};

export const userStatusLabel: Record<UserStatus, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  revoked: 'Révoqué',
};

export const eventTypeLabel: Record<TripEventType, string> = {
  created: 'Voyage créé',
  provisional_manifest: 'Liste provisoire préparée',
  boarding_opened: 'Embarquement ouvert',
  boarding_closed: 'Embarquement clôturé',
  boarding_confirmed_driver: "Fin d'embarquement confirmée par le chauffeur",
  departure: 'Départ confirmé',
  stop_arrival: 'Arrêt autorisé',
  approaching_border: 'Approche de la frontière',
  border_arrival: 'Arrivée au poste frontalier',
  border_processed: 'Contrôle frontalier enregistré',
  border_departure: 'Départ du poste frontalier',
  destination_arrival: 'Arrivée à destination',
  incident: 'Incident signalé',
  customs_handled: 'Prise en charge douanière enregistrée',
};

export const nationalities = [
  'Togolaise', 'Béninoise', 'Nigériane', 'Ghanéenne', 'Ivoirienne', 'Burkinabè', 'Nigérienne',
  'Malienne', 'Sénégalaise', 'Française', 'Allemande', 'Américaine', 'Chinoise', 'Libanaise', 'Autre',
];

/** Nationalités dispensées de visa sur le corridor (règle de démonstration simplifiée, à valider). */
export const ecowasNationalities = new Set([
  'Togolaise', 'Béninoise', 'Nigériane', 'Ghanéenne', 'Ivoirienne', 'Burkinabè', 'Nigérienne', 'Malienne', 'Sénégalaise',
]);
