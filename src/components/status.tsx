import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, FileWarning, Loader, ShieldAlert, ShieldCheck, ShieldQuestion, XCircle, Ban, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  boardingLabel, consentLabel, directionLabel, manifestTypeLabel, policeStatusLabel, recipientStateLabel,
  registrationLabel, tripStatusLabel, approvalLabel, userStatusLabel,
} from '../domain/labels';
import { docStateLabel, type DocState } from '../domain/documents';
import type {
  ApprovalStatus, BoardingStatus, ConsentStatus, Direction, ManifestType, PoliceStatus, RecipientState,
  RegistrationStatus, TripStatus, UserStatus,
} from '../domain/types';

type Tone = 'neutral' | 'violet' | 'green' | 'orange' | 'red' | 'outline';

export function StatusBadge({ tone, icon, children, title }: { tone: Tone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{icon}{children}</span>;
}

const I = 14;

export function TripStatusBadge({ s }: { s: TripStatus }) {
  const map: Record<TripStatus, [Tone, ReactNode]> = {
    planned: ['neutral', <Circle size={I} aria-hidden />],
    preparing: ['neutral', <Clock size={I} aria-hidden />],
    boarding: ['violet', <Loader size={I} aria-hidden />],
    boarding_closed: ['violet', <CheckCircle2 size={I} aria-hidden />],
    en_route: ['violet', <ArrowRight size={I} aria-hidden />],
    approaching_border: ['orange', <AlertTriangle size={I} aria-hidden />],
    at_border: ['orange', <ShieldQuestion size={I} aria-hidden />],
    arrived: ['green', <CheckCircle2 size={I} aria-hidden />],
    cancelled: ['outline', <Ban size={I} aria-hidden />],
  };
  const [t, ic] = map[s];
  return <StatusBadge tone={t} icon={ic}>{tripStatusLabel[s]}</StatusBadge>;
}

export function RecipientBadge({ s }: { s: RecipientState }) {
  const map: Record<RecipientState, [Tone, ReactNode]> = {
    to_send: ['neutral', <Circle size={I} aria-hidden />],
    pending: ['violet', <Clock size={I} aria-hidden />],
    received: ['green', <CheckCircle2 size={I} aria-hidden />],
    verifying: ['violet', <Loader size={I} aria-hidden />],
    processed: ['green', <ShieldCheck size={I} aria-hidden />],
    failed: ['red', <XCircle size={I} aria-hidden />],
  };
  const [t, ic] = map[s];
  return <StatusBadge tone={t} icon={ic}>{recipientStateLabel[s]}</StatusBadge>;
}

export function ManifestTypeBadge({ t }: { t: ManifestType }) {
  // Distinction nette : provisoire (contour), définitive (violet plein), mise à jour (orange).
  if (t === 'final') return <span className="badge" style={{ background: 'var(--wz-violet)', color: '#fff', fontWeight: 600 }}>{manifestTypeLabel[t]}</span>;
  if (t === 'update') return <StatusBadge tone="orange" icon={<RefreshCw size={I} aria-hidden />}>{manifestTypeLabel[t]}</StatusBadge>;
  return <span className="badge badge-outline" style={{ borderStyle: 'dashed' }}>{manifestTypeLabel[t]}</span>;
}

export function RegistrationBadge({ s }: { s: RegistrationStatus }) {
  const map: Record<RegistrationStatus, [Tone, ReactNode]> = {
    incomplete: ['orange', <FileWarning size={I} aria-hidden />],
    registered: ['green', <CheckCircle2 size={I} aria-hidden />],
    document_check: ['orange', <AlertTriangle size={I} aria-hidden />],
    consent_pending: ['neutral', <Clock size={I} aria-hidden />],
  };
  const [t, ic] = map[s];
  return <StatusBadge tone={t} icon={ic}>{registrationLabel[s]}</StatusBadge>;
}

export function BoardingBadge({ s }: { s: BoardingStatus }) {
  const map: Record<BoardingStatus, [Tone, ReactNode]> = {
    pending: ['neutral', <Clock size={I} aria-hidden />],
    boarded: ['green', <CheckCircle2 size={I} aria-hidden />],
    absent: ['outline', <XCircle size={I} aria-hidden />],
    manual_review: ['orange', <AlertTriangle size={I} aria-hidden />],
  };
  const [t, ic] = map[s];
  return <StatusBadge tone={t} icon={ic}>{boardingLabel[s]}</StatusBadge>;
}

export function ConsentBadge({ s }: { s: ConsentStatus }) {
  const tone: Tone = s === 'given' ? 'green' : s === 'declined' ? 'outline' : 'neutral';
  return <StatusBadge tone={tone} icon={s === 'given' ? <CheckCircle2 size={I} aria-hidden /> : s === 'declined' ? <Ban size={I} aria-hidden /> : <Clock size={I} aria-hidden />}>{consentLabel[s]}</StatusBadge>;
}

/** Statut police — à n'utiliser que dans les vues police autorisées. */
export function PoliceStatusBadge({ s, long }: { s: PoliceStatus; long?: boolean }) {
  const Icon = s === 'green' ? ShieldCheck : s === 'orange' ? ShieldAlert : AlertOctagon;
  return (
    <span className={`badge badge-solid-${s}`}>
      <Icon size={I} aria-hidden />
      {long ? policeStatusLabel[s].long : policeStatusLabel[s].short}
    </span>
  );
}

export function DocBadge({ s }: { s: DocState }) {
  const map: Record<DocState, [Tone, ReactNode]> = {
    valid: ['green', <CheckCircle2 size={I} aria-hidden />],
    expiring: ['orange', <Clock size={I} aria-hidden />],
    expired: ['red', <XCircle size={I} aria-hidden />],
    to_check: ['neutral', <FileWarning size={I} aria-hidden />],
  };
  const [t, ic] = map[s];
  return <StatusBadge tone={t} icon={ic}>{docStateLabel[s]}</StatusBadge>;
}

export function ApprovalBadge({ s }: { s: ApprovalStatus }) {
  const tone: Tone = s === 'approved' ? 'green' : s === 'suspended' || s === 'rejected' ? 'red' : 'orange';
  return <StatusBadge tone={tone}>{approvalLabel[s]}</StatusBadge>;
}

export function UserStatusBadge({ s }: { s: UserStatus }) {
  const tone: Tone = s === 'active' ? 'green' : s === 'suspended' ? 'orange' : 'red';
  return <StatusBadge tone={tone}>{userStatusLabel[s]}</StatusBadge>;
}

export function DirectionLabel({ d }: { d: Direction }) {
  const [a, b] = d === 'TG-BJ' ? ['TG', 'BJ'] : ['BJ', 'TG'];
  return (
    <span className="direction">
      <span className="flag" aria-hidden>{a}</span>
      <ArrowRight size={14} aria-hidden />
      <span className="flag" aria-hidden>{b}</span>
      <span className="small muted">{directionLabel[d]}</span>
    </span>
  );
}

export function NetworkBadge({ offline, pending }: { offline: boolean; pending: number }) {
  if (offline) return <span className="offline-pill off" role="status"><WifiOff size={14} aria-hidden />Hors ligne{pending ? ` · ${pending} en attente` : ''}</span>;
  if (pending) return <span className="offline-pill off" role="status"><RefreshCw size={14} aria-hidden />Synchronisation en attente</span>;
  return <span className="offline-pill on" role="status"><Wifi size={14} aria-hidden />Connecté</span>;
}
