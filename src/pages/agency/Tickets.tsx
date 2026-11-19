import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer, MessageSquare, ArrowRight, Tag } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { fullName } from '../../domain/passenger';
import { fmtDate, fmtDateTime, fmtTime } from '../../lib/dates';
import { agencyTrips, orgById, passengerOf } from '../../services/queries';
import { markBaggagePrinted } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { useToast } from '../../components/Toast';
import { DataTable } from '../../components/DataTable';
import { BoardingBadge, DirectionLabel } from '../../components/status';
import { QrImage, ticketUrl } from '../../components/domain';
import { Alert, Button, ErrorState, FilterBar, FilterSelect, PageTitle, Panel, SearchField, SimTag } from '../../components/ui';

export function TicketView() {
  const { ref = '' } = useParams();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const toast = useToast();
  // L'impression est bloquée par le cadre sécurisé de la version hébergée.
  const print = () => { if (import.meta.env.VITE_ROUTER === 'memory') toast("L'impression n'est pas disponible dans la version en ligne de démonstration.", 'error'); else window.print(); };
  const [sms, setSms] = useState(false);
  const pt = db.passengerTrips.find((x) => x.ticketReference === ref);
  const trip = pt ? agencyTrips(db, user).find((t) => t.id === pt.tripId) : undefined;
  if (!pt || !trip) return <ErrorState title="Billet introuvable" action={<Link to="/agency/tickets" className="btn btn-secondary">Retour aux billets</Link>}>Ce billet n'existe pas ou n'appartient pas à votre agence.</ErrorState>;
  const p = passengerOf(db, pt);
  const agency = orgById(db, trip.agencyId);
  const labels = db.baggage.filter((b) => b.passengerTripId === pt.id).sort((a, b) => a.index - b.index);

  return (
    <>
      <PageTitle
        title="Billet nominatif"
        crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: trip.reference, to: `/agency/trips/${trip.id}` }, { label: pt.ticketReference }]}
        actions={
          <>
            <Button variant="primary" icon={<Printer size={16} aria-hidden />} onClick={print}>Imprimer le billet</Button>
            <Button icon={<MessageSquare size={16} aria-hidden />} onClick={() => setSms(true)} disabled={!p.phone}>Simuler l'envoi par SMS</Button>
            <Link to={`/agency/trips/${trip.id}/passengers`} className="btn btn-secondary">Passagers du voyage</Link>
          </>
        }
      />
      {pt.removedAt && <Alert kind="error" title="Billet désactivé">Ce passager a été retiré du voyage le {fmtDateTime(pt.removedAt)}.</Alert>}
      {sms && <div className="no-print" style={{ marginBottom: 16 }}><Alert kind="info" title="SMS non envoyé — simulation">Aucune passerelle SMS n'est configurée. Message qui serait adressé au {p.phone} : « WeZonPass — Billet {pt.ticketReference}, voyage {trip.reference}, départ {fmtDate(trip.scheduledDeparture)} à {fmtTime(trip.scheduledDeparture)}. »</Alert></div>}
      <article className="ticket" aria-label={`Billet ${pt.ticketReference}`}>
        <div className="ticket-head">
          <img src={`${import.meta.env.BASE_URL}brand/wezonpass-logo-couleur.png`} alt="WeZonPass" width={123} height={44} />
          <div style={{ textAlign: 'right' }}>
            <div className="small muted">Billet nominatif</div>
            <div className="mono strong">{pt.ticketReference}</div>
          </div>
        </div>
        <div className="ticket-body">
          <div className="stack-sm">
            <div className="small muted">Passager</div>
            <div className="ticket-name">{fullName(p)}</div>
            <div className="ticket-route">{trip.departure} <ArrowRight size={18} aria-hidden /> {trip.destination}</div>
            <dl className="dl">
              <dt>Voyage</dt><dd className="mono">{trip.reference}</dd>
              <dt>Agence</dt><dd>{agency?.name}</dd>
              <dt>Date de voyage</dt><dd>{fmtDate(trip.scheduledDeparture)} · départ {fmtTime(trip.scheduledDeparture)}</dd>
              <dt>Sens</dt><dd><DirectionLabel d={trip.direction} /></dd>
              <dt>Bagages</dt><dd>{pt.baggageCount}</dd>
              <dt>Contrôle</dt><dd>{pt.preRegistered ? 'Pré-inscription WeZonPass' : 'Contrôle classique au poste frontalier'}</dd>
            </dl>
          </div>
          <div className="ticket-qr">
            <QrImage value={ticketUrl(pt.ticketReference)} label={`QR code du billet ${pt.ticketReference}`} />
            <span>Le QR code ne contient que la référence du billet.</span>
          </div>
        </div>
        <div className="ticket-foot">Présentez ce billet à l'embarquement. Document de démonstration — données fictives. L'utilisation de WeZonPass n'est pas obligatoire pour franchir la frontière.</div>
      </article>
      <div style={{ height: 16 }} />
      <Panel title="Étiquettes bagages" hint={`${labels.length} étiquette(s) associée(s) au billet`} actions={labels.length > 0 && <Button size="sm" icon={<Tag size={14} aria-hidden />} loading={busy === 'print'} onClick={async () => { await run('print', () => markBaggagePrinted(user, pt.id), 'Impression simulée des étiquettes enregistrée.'); print(); }}>Imprimer les étiquettes</Button>}>
        {labels.length ? (
          <div className="labels-grid">
            {labels.map((b) => (
              <div className="bag-label" key={b.id}>
                <QrImage value={b.labelReference} size={76} label={`QR code de l'étiquette ${b.labelReference}`} />
                <div className="small">
                  <div className="strong mono">{b.labelReference}</div>
                  <div>{fullName(p)}</div>
                  <div className="muted">Bagage {b.index}/{labels.length} · {trip.reference}</div>
                  <div className="muted">{b.printedAt ? `Imprimée le ${fmtDateTime(b.printedAt)}` : 'Non imprimée'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="muted">Aucun bagage déclaré.</p>}
      </Panel>
      <p className="small muted no-print" style={{ marginTop: 12 }}><SimTag>Impression</SimTag> L'impression utilise l'imprimante du navigateur ; aucune imprimante d'étiquettes n'est connectée.</p>
    </>
  );
}

export function TicketsList() {
  const user = useUser();
  const db = useDb();
  const [q, setQ] = useState('');
  const [tripId, setTripId] = useState('all');
  const trips = agencyTrips(db, user);
  const rows = useMemo(() => db.passengerTrips
    .filter((pt) => !pt.removedAt && trips.some((t) => t.id === pt.tripId) && (tripId === 'all' || pt.tripId === tripId))
    .filter((pt) => { const s = q.trim().toLowerCase(); if (!s) return true; const p = passengerOf(db, pt); return `${pt.ticketReference} ${p.lastName} ${p.firstName} ${p.phone}`.toLowerCase().includes(s); })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db, trips, q, tripId]);
  return (
    <>
      <PageTitle title="Billets" lead="Billets nominatifs émis par votre agence." />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher un billet" value={q} onChange={setQ} placeholder="Référence, nom, téléphone…" />
          <FilterSelect label="Voyage" value={tripId} onChange={setTripId} options={[{ value: 'all', label: 'Tous les voyages' }, ...trips.map((t) => ({ value: t.id, label: t.reference }))]} />
        </FilterBar>
        <DataTable
          rows={rows} rowKey={(pt) => pt.id} caption="Billets émis" empty="Aucun billet trouvé."
          columns={[
            { key: 'r', header: 'Billet', render: (pt) => <Link to={`/agency/tickets/${pt.ticketReference}`} className="mono">{pt.ticketReference}</Link> },
            { key: 'n', header: 'Passager', render: (pt) => fullName(passengerOf(db, pt)) },
            { key: 't', header: 'Voyage', render: (pt) => { const t = trips.find((x) => x.id === pt.tripId)!; return <span><span className="mono">{t.reference}</span><br /><span className="small muted">{fmtDate(t.scheduledDeparture)} {fmtTime(t.scheduledDeparture)}</span></span>; } },
            { key: 'bg', header: 'Bagages', render: (pt) => pt.baggageCount, className: 'num' },
            { key: 'b', header: 'Embarquement', render: (pt) => <BoardingBadge s={pt.boardingStatus} /> },
            { key: 'e', header: 'Émis le', render: (pt) => <span className="mono">{fmtDateTime(pt.createdAt)}</span> },
          ]}
        />
      </Panel>
    </>
  );
}
