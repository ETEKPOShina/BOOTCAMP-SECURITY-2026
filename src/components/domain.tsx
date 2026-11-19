import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Bus as BusIcon, Bell, AlertTriangle, CheckCircle2, Info, AlertOctagon } from 'lucide-react';
import { STAGES, routeFor, stageIndex, ROUTE_LENGTH_KM } from '../domain/corridor';
import { eventTypeLabel, authorityLabel, manifestTypeLabel, roleLabel } from '../domain/labels';
import { fmtDateTime, fmtTime, relative } from '../lib/dates';
import type { AppNotification, AuditLog, DbState, Manifest, Trip } from '../domain/types';
import { userName } from '../services/queries';
import { DataTable } from './DataTable';
import { ManifestTypeBadge, RecipientBadge, StatusBadge } from './status';
import { SimTag } from './ui';

export function tripStage(t: Trip): number {
  const i = stageIndex(t.status);
  if (t.status === 'en_route' && (t.border.TG.completedAt || t.border.BJ.completedAt)) return 4;
  return i;
}

/** Préparation → Enregistrement → Embarquement → En route → Frontière → Arrivée */
export function TripProgress({ trip }: { trip: Trip }) {
  const idx = tripStage(trip);
  if (idx < 0) return <StatusBadge tone="outline">Voyage annulé</StatusBadge>;
  return (
    <ol className="trip-progress" aria-label={`Étape du voyage : ${STAGES[idx]}`}>
      {STAGES.map((s, i) => {
        const cls = i < idx || (i === idx && idx === STAGES.length - 1) ? 'done' : i === idx ? 'current' : '';
        return (
          <li key={s} className={cls} aria-current={i === idx ? 'step' : undefined}>
            <span className="bar" />
            <span className="lbl">{s}{cls === 'done' && <span className="sr-only"> (terminé)</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Frise d'itinéraire (aucun fournisseur de cartes configuré). Positions : données de démonstration. */
export function RouteProgress({ trip, compact }: { trip: Trip; compact?: boolean }) {
  const pts = routeFor(trip.direction);
  const km = trip.status === 'arrived' ? ROUTE_LENGTH_KM : trip.lastPosition?.km ?? 0;
  const pct = (k: number) => `${(k / ROUTE_LENGTH_KM) * 100}%`;
  const started = !!trip.actualDeparture || trip.status === 'arrived';
  return (
    <div className="route" aria-label={`Itinéraire ${pts[0].label} – ${pts[pts.length - 1].label}. Dernière position : ${trip.lastPosition?.label ?? 'non communiquée'}`}>
      <div className="route-line">
        <div className="done" style={{ width: pct(km) }} />
        {pts.map((p) => (
          <span key={p.label} className={`route-pt ${p.kind === 'border' ? 'border' : ''} ${km >= p.km && started ? 'passed' : ''}`} style={{ left: pct(p.km) }} title={p.label} />
        ))}
        {started && trip.status !== 'arrived' && (
          <span className="route-bus" style={{ left: pct(km) }} aria-hidden><BusIcon size={20} /></span>
        )}
      </div>
      <div className="route-labels" aria-hidden>
        {pts.map((p, i) => (
          <span key={p.label} className={i !== 0 && i !== pts.length - 1 && p.kind !== 'border' ? 'hide-sm' : ''} style={{ left: pct(p.km) }}>
            {p.kind === 'border' ? 'Frontière' : p.label}
            {trip.stops.includes(p.label) && <><br /><em>arrêt</em></>}
          </span>
        ))}
      </div>
      {!compact && (
        <p className="small muted" style={{ marginTop: 6 }}>
          <SimTag>Positions de démonstration</SimTag> Dernière position : <strong>{trip.lastPosition?.label ?? 'non communiquée'}</strong>
          {trip.lastPosition && <> · {relative(trip.lastPosition.at)}</>}. Aucun suivi GPS en temps réel n'est connecté.
        </p>
      )}
    </div>
  );
}

export function EventTimeline({ db, tripId, hideRecorder }: { db: DbState; tripId: string; hideRecorder?: boolean }) {
  const events = db.tripEvents.filter((e) => e.tripId === tripId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!events.length) return <p className="muted">Aucun événement enregistré.</p>;
  return (
    <ol className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className={`tl-dot ${e.eventType === 'incident' ? 'warn' : e.eventType === 'destination_arrival' || e.eventType === 'border_processed' ? 'ok' : ''} ${e.synchronizationStatus === 'pending' ? 'pending' : ''}`} aria-hidden />
          <div className="tl-title">{eventTypeLabel[e.eventType]}{e.eventType === 'incident' && <AlertTriangle size={14} color="var(--wz-orange-ink)" style={{ marginLeft: 6, verticalAlign: -2 }} aria-label="Incident" />}</div>
          <div className="tl-meta">
            {fmtDateTime(e.timestamp)}{e.locationLabel && ` · ${e.locationLabel}`}{!hideRecorder && ` · ${userName(db, e.recordedBy)}`}
          </div>
          {e.note && <div className="small">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}

/** Résumé des versions de manifeste et des états par destinataire (sans résultat de vérification). */
export function ManifestSummary({ manifests }: { manifests: Manifest[] }) {
  if (!manifests.length) return <p className="muted">Aucun manifeste préparé pour ce voyage.</p>;
  return (
    <div className="stack-sm">
      {[...manifests].reverse().map((m) => (
        <div key={m.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <div className="stack-sm" style={{ gap: 2 }}>
            <div className="row"><ManifestTypeBadge t={m.type} /><span className="small mono">{m.reference}</span></div>
            <span className="small muted">V{m.version} · {fmtDateTime(m.createdAt)} · {m.passengerCount} passager(s)</span>
          </div>
          <div className="row">
            {m.recipients.map((r) => (
              <span key={r.authority} className="row small" style={{ gap: 4 }}>{authorityLabel[r.authority]} <RecipientBadge s={r.state} /></span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function manifestLabel(m: Manifest) {
  return `${manifestTypeLabel[m.type]} — V${m.version}`;
}

export function QrImage({ value, size = 172, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#191923', light: '#FFFFFF' } })
      .then((d) => { if (alive) setSrc(d); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={label} /> : <div style={{ width: size, height: size, background: 'var(--muted)' }} role="img" aria-label={label} />;
}

export function ticketUrl(ref: string) {
  return `${window.location.origin}/billet/${encodeURIComponent(ref)}`;
}

export function AuditTable({ logs, showPoliceDetail }: { logs: AuditLog[]; showPoliceDetail?: boolean }) {
  return (
    <DataTable
      rows={logs}
      rowKey={(l) => l.id}
      caption="Journal des activités"
      pageSize={15}
      columns={[
        { key: 'ts', header: 'Horodatage', render: (l) => <span className="mono nowrap">{fmtDateTime(l.timestamp)}</span> },
        { key: 'user', header: 'Utilisateur', render: (l) => l.userName },
        { key: 'org', header: 'Organisation', render: (l) => l.organizationName },
        { key: 'role', header: 'Rôle', render: (l) => (l.role === 'system' ? 'Système' : roleLabel[l.role]) },
        { key: 'action', header: 'Action', render: (l) => <>{l.action}{showPoliceDetail && l.policeDetail && <div className="small muted">{l.policeDetail}</div>}</> },
        { key: 'entity', header: 'Élément concerné', render: (l) => <span className="small"><span className="muted">{l.entityType} · </span><span className="mono">{l.entityId}</span></span> },
        { key: 'res', header: 'Résultat', render: (l) => <StatusBadge tone={l.outcome === 'success' ? 'green' : l.outcome === 'denied' ? 'red' : 'orange'}>{l.outcome === 'success' ? 'Réussi' : l.outcome === 'denied' ? 'Refusé' : 'Échec'}</StatusBadge> },
      ]}
    />
  );
}

export function NotifIcon({ n }: { n: AppNotification }) {
  const p = { size: 18, 'aria-hidden': true as const };
  if (n.severity === 'critical') return <AlertOctagon {...p} color="var(--wz-red)" />;
  if (n.severity === 'attention') return <AlertTriangle {...p} color="var(--wz-orange-ink)" />;
  if (n.severity === 'success') return <CheckCircle2 {...p} color="var(--wz-green-ink)" />;
  return <Info {...p} color="var(--wz-violet)" />;
}

export function NotificationList({ items, userId, onOpen, limit }: { items: AppNotification[]; userId: string; onOpen: (n: AppNotification) => void; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length) return <div className="empty"><Bell size={28} aria-hidden /><strong>Aucune notification</strong></div>;
  return (
    <ul className="notif-list">
      {list.map((n) => {
        const unread = !n.readBy.includes(userId);
        const inner = (
          <>
            <span className="ni-icon"><NotifIcon n={n} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="ni-title">{n.title}{unread && <span className="sr-only"> (non lue)</span>}</span><br />
              <span className="ni-body">{n.body}</span><br />
              <span className="ni-time">{relative(n.createdAt)} · {fmtTime(n.createdAt)}</span>
            </span>
          </>
        );
        return (
          <li key={n.id}>
            {n.link ? (
              <Link to={n.link} className={`notif-item ${unread ? 'unread' : ''}`} onClick={() => onOpen(n)}>{inner}</Link>
            ) : (
              <button type="button" className={`notif-item ${unread ? 'unread' : ''}`} onClick={() => onOpen(n)}>{inner}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
