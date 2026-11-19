// Modèle de données WeZonPass (prototype). Identifiants de code en anglais, libellés en français.

export type Country = 'TG' | 'BJ';
export type Direction = 'TG-BJ' | 'BJ-TG';

export type OrgType = 'agency' | 'police' | 'border_post' | 'customs' | 'central';
export type ApprovalStatus = 'approved' | 'pending' | 'in_review' | 'suspended' | 'rejected';

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  country: Country | null;
  approvalStatus: ApprovalStatus;
  createdAt: string;
  city?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  /** Pièces du dossier d'agrément (références fictives). */
  documents?: { label: string; status: 'provided' | 'missing' | 'to_check' }[];
  /** Délai de la liste provisoire, en minutes avant le départ. */
  provisionalDeadlineMinutes?: number;
}

export type Role =
  | 'agency_admin'
  | 'agency_counter'
  | 'agency_boarding'
  | 'police_officer'
  | 'border_officer'
  | 'customs_officer'
  | 'central_admin'
  | 'driver';

export type Workspace = 'agency' | 'police' | 'border' | 'customs' | 'admin' | 'driver';

export type UserStatus = 'active' | 'suspended' | 'revoked';

export interface User {
  id: string;
  name: string;
  login: string;
  email: string;
  role: Role;
  organizationId: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  /** Pour le rôle chauffeur : fiche chauffeur liée. */
  driverId?: string;
}

export type DocumentType = 'passport' | 'national_id' | 'ecowas_id' | 'travel_card' | 'birth_certificate';
export type ConsentStatus = 'given' | 'declined' | 'pending';
export type RegistrationStatus = 'incomplete' | 'registered' | 'document_check' | 'consent_pending';

export interface CaptureMeta {
  /** Nom de fichier et taille uniquement : aucune image n'est conservée dans la démonstration. */
  fileName: string;
  sizeKb: number;
  capturedAt: string;
  simulated: boolean;
}

export interface Passenger {
  id: string;
  agencyId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  phone: string;
  documentType: DocumentType;
  documentNumber: string;
  documentExpiry: string;
  documentFront: CaptureMeta | null;
  documentBack: CaptureMeta | null;
  face: CaptureMeta | null;
  visaRequired: boolean;
  visaNumber: string;
  visaExpiry: string;
  guardianPassengerId: string | null;
  consentStatus: ConsentStatus;
  consentAt: string | null;
  consentRecordedBy: string | null;
  registrationStatus: RegistrationStatus;
  createdAt: string;
  rightsRequests: { type: 'access' | 'rectification' | 'deletion'; at: string; by: string }[];
}

export type BoardingStatus = 'pending' | 'boarded' | 'absent' | 'manual_review';

export interface PassengerTrip {
  id: string;
  passengerId: string;
  tripId: string;
  ticketReference: string;
  baggageCount: number;
  commercialGoods: string;
  boardingStatus: BoardingStatus;
  boardingTimestamp: string | null;
  faceConfirmDemo: 'not_done' | 'match_demo' | 'manual';
  /** Faux si le voyageur a refusé la pré-inscription : contrôle classique. */
  preRegistered: boolean;
  createdAt: string;
  removedAt: string | null;
}

export interface Baggage {
  id: string;
  passengerTripId: string;
  labelReference: string;
  index: number;
  printedAt: string | null;
}

export type TripStatus =
  | 'planned'
  | 'preparing'
  | 'boarding'
  | 'boarding_closed'
  | 'en_route'
  | 'approaching_border'
  | 'at_border'
  | 'arrived'
  | 'cancelled';

export interface BorderSide {
  country: Country;
  arrivedAt: string | null;
  actualCount: number | null;
  countRecordedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  checks: Record<string, 'confirmed' | 'conventional' | 'discrepancy'>;
}

export interface CustomsHandling {
  country: Country;
  handledAt: string;
  handledBy: string;
  note: string;
}

export interface Trip {
  id: string;
  reference: string;
  agencyId: string;
  direction: Direction;
  departure: string;
  destination: string;
  scheduledDeparture: string;
  actualDeparture: string | null;
  estimatedArrival: string;
  borderArrival: string | null;
  actualArrival: string | null;
  busId: string;
  driverId: string;
  convoyeur: string;
  stops: string[];
  status: TripStatus;
  lastPosition: { label: string; km: number; at: string } | null;
  border: Record<Country, BorderSide>;
  customs: CustomsHandling[];
  createdAt: string;
}

export type ManifestType = 'provisional' | 'final' | 'update';
export type ManifestStatus = 'draft' | 'ready' | 'sent' | 'received' | 'verifying' | 'processed' | 'failed';
export type Authority = 'police_tg' | 'police_bj';
export type RecipientState = 'to_send' | 'pending' | 'received' | 'verifying' | 'processed' | 'failed';

export interface ManifestRecipient {
  authority: Authority;
  state: RecipientState;
  sentAt: string | null;
  acknowledgedAt: string | null;
  processedAt: string | null;
}

export interface Manifest {
  id: string;
  reference: string;
  tripId: string;
  version: number;
  type: ManifestType;
  passengerCount: number;
  incompleteCount: number;
  /** Voyageurs ayant refusé la pré-inscription : contrôle classique, non transmis. */
  conventionalCount: number;
  passengerTripIds: string[];
  createdAt: string;
  createdBy: string;
  note: string;
  recipients: ManifestRecipient[];
}

export type PoliceStatus = 'green' | 'orange' | 'red';

/** Données réservées aux services de police. Jamais exposées aux agences ni aux douanes. */
export interface PoliceReview {
  id: string;
  authority: Authority;
  passengerTripId: string;
  tripId: string;
  manifestId: string;
  autoStatus: PoliceStatus;
  status: PoliceStatus;
  internalReason: string;
  reviewState: 'pending' | 'confirmed' | 'corrected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: { by: string; at: string; text: string }[];
  createdAt: string;
}

export type TripEventType =
  | 'created'
  | 'provisional_manifest'
  | 'boarding_opened'
  | 'boarding_closed'
  | 'boarding_confirmed_driver'
  | 'departure'
  | 'stop_arrival'
  | 'approaching_border'
  | 'border_arrival'
  | 'border_processed'
  | 'border_departure'
  | 'destination_arrival'
  | 'incident'
  | 'customs_handled';

export interface TripEvent {
  id: string;
  clientEventId: string;
  tripId: string;
  eventType: TripEventType;
  timestamp: string;
  recordedBy: string;
  locationLabel: string;
  note: string;
  synchronizationStatus: 'synced' | 'pending';
}

export interface Bus {
  id: string;
  agencyId: string;
  registration: string;
  vehicleIdentifier: string;
  capacity: number;
  registrationDocumentRef: string;
  registrationDocumentStatus: 'valid' | 'to_check';
  inspectionExpiry: string;
  insuranceExpiry: string;
  brownCardExpiry: string;
  status: 'active' | 'maintenance';
}

export interface Driver {
  id: string;
  agencyId: string;
  name: string;
  phone: string;
  email: string;
  identityDocumentRef: string;
  identityDocumentExpiry: string;
  licenceReference: string;
  licenceExpiry: string;
  professionalCardReference: string;
  professionalCardExpiry: string;
  assignedBusId: string | null;
  status: 'active' | 'inactive';
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  role: Role | 'system';
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  outcome: 'success' | 'denied' | 'failure';
  /** Détail réservé aux services de police (jamais montré ailleurs). */
  policeDetail?: string;
}

export type NotificationAudience =
  | { kind: 'org'; organizationId: string }
  | { kind: 'orgType'; orgType: OrgType; country?: Country }
  | { kind: 'user'; userId: string };

export interface AppNotification {
  id: string;
  audience: NotificationAudience;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readBy: string[];
  severity: 'info' | 'attention' | 'critical' | 'success';
}

export interface AccessRequest {
  id: string;
  organizationName: string;
  organizationType: string;
  country: string;
  contactName: string;
  contactFunction: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'in_review' | 'closed';
  createdAt: string;
}

export interface AgencyNotice {
  id: string;
  agencyId: string;
  passengerTripId: string;
  issue: 'document_expired' | 'visa_missing' | 'document_unreadable';
  createdAt: string;
  resolvedAt: string | null;
}

export interface PlatformSettings {
  simulateOffline: boolean;
  simulateTransmissionFailure: boolean;
  retentionManifestHours: number;
  retentionProfileMonths: number;
  retentionAuditYears: number;
  privacyPolicyVersion: string;
}

export interface DbState {
  schemaVersion: number;
  seededAt: string;
  organizations: Organization[];
  users: User[];
  passengers: Passenger[];
  passengerTrips: PassengerTrip[];
  baggage: Baggage[];
  trips: Trip[];
  manifests: Manifest[];
  policeReviews: PoliceReview[];
  tripEvents: TripEvent[];
  buses: Bus[];
  drivers: Driver[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  accessRequests: AccessRequest[];
  agencyNotices: AgencyNotice[];
  settings: PlatformSettings;
}
