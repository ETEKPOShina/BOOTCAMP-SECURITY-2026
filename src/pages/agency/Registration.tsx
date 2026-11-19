import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ScanText, Camera, UserCheck } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { docTypeLabel, nationalities } from '../../domain/labels';
import { fullName, isMinor, visaLikelyRequired } from '../../domain/passenger';
import { daysUntil, dateOffset, fmtDate, ageOn } from '../../lib/dates';
import { activePts, agencyTrips, passengerOf, searchPassengers } from '../../services/queries';
import { registerPassenger, type PassengerInput } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { useAgencyTrip, TripNotFound } from './TripDetail';
import { Alert, Button, FileUpload, PageTitle, Panel, SelectField, SimTag, TextAreaField, TextField } from '../../components/ui';
import type { DocumentType, Passenger } from '../../domain/types';

const STEPS = ['Information et consentement', 'Identité', 'Document de voyage', 'Vérification visuelle', 'Voyage'];

const empty = (): PassengerInput => ({
  firstName: '', lastName: '', dateOfBirth: '', nationality: '', phone: '', documentType: 'national_id', documentNumber: '', documentExpiry: '',
  documentFront: null, documentBack: null, face: null, visaRequired: false, visaNumber: '', visaExpiry: '', guardianPassengerId: null, consentStatus: 'pending',
});

type Errors = Partial<Record<string, string>>;

function validate(step: number, f: PassengerInput, travel: { tripId: string; baggageCount: string }): Errors {
  const e: Errors = {};
  const full = f.consentStatus === 'given';
  if (step === 0 && f.consentStatus === 'pending') e.consentStatus = 'Indiquez le choix du voyageur avant de poursuivre.';
  if (step === 1) {
    if (!f.lastName.trim()) e.lastName = 'Ce champ est obligatoire.';
    if (!f.firstName.trim()) e.firstName = 'Ce champ est obligatoire.';
    if (full) {
      if (!f.dateOfBirth) e.dateOfBirth = 'Ce champ est obligatoire.';
      else if (f.dateOfBirth > dateOffset(0)) e.dateOfBirth = 'La date de naissance ne peut pas être dans le futur.';
      if (!f.nationality) e.nationality = 'Ce champ est obligatoire.';
    }
    if (f.phone && !/^\+?[0-9 ]{8,16}$/.test(f.phone.trim())) e.phone = 'Format de téléphone invalide (chiffres et espaces, indicatif facultatif).';
  }
  if (step === 2 && full) {
    if (!f.documentNumber.trim()) e.documentNumber = 'Ce champ est obligatoire.';
    if (!f.documentExpiry) e.documentExpiry = 'Ce champ est obligatoire.';
    if (!f.documentFront) e.documentFront = 'Le recto du document est requis.';
    if (!f.documentBack && !['passport', 'birth_certificate'].includes(f.documentType)) e.documentBack = 'Le verso du document est requis pour ce type de document.';
    if (f.visaRequired && f.visaNumber && !f.visaExpiry) e.visaExpiry = "Indiquez la date d'expiration du visa.";
  }
  if (step === 3 && full && !f.face) e.face = 'La photo du visage est requise pour la pré-inscription.';
  if (step === 4) {
    if (!travel.tripId) e.tripId = 'Sélectionnez un voyage.';
    const n = Number(travel.baggageCount);
    if (travel.baggageCount === '' || !Number.isInteger(n) || n < 0 || n > 20) e.baggageCount = 'Saisissez un nombre entre 0 et 20.';
    if (full && f.dateOfBirth && isMinor(f) && !f.guardianPassengerId) e.guardianPassengerId = 'Un mineur doit être rattaché à un adulte responsable inscrit sur le voyage.';
  }
  return e;
}

export function PassengerRegistration() {
  const trip = useAgencyTrip();
  const user = useUser();
  const db = useDb();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<PassengerInput>(empty);
  const [existing, setExisting] = useState<Passenger | null>(null);
  const [travel, setTravel] = useState({ tripId: trip?.id ?? '', baggageCount: '1', commercialGoods: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [visited, setVisited] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [docRead, setDocRead] = useState<'idle' | 'reading' | 'done'>('idle');
  const results = useMemo(() => searchPassengers(db, user, q), [db, user, q]);
  const openTrips = agencyTrips(db, user).filter((t) => ['planned', 'preparing', 'boarding', 'boarding_closed', 'en_route', 'approaching_border'].includes(t.status));
  if (!trip) return <TripNotFound />;
  const selectedTrip = openTrips.find((t) => t.id === travel.tripId);
  const set = (patch: Partial<PassengerInput>) => { setF((x) => ({ ...x, ...patch })); setErrors({}); };
  const full = f.consentStatus === 'given';
  const minor = !!f.dateOfBirth && isMinor(f);
  const guardians = selectedTrip ? activePts(db, selectedTrip.id).map((pt) => passengerOf(db, pt)).filter((p) => !isMinor(p) && p.id !== existing?.id) : [];

  const go = (target: number) => {
    if (target > step) {
      for (let s = step; s < target; s++) {
        const e = validate(s, f, travel);
        if (Object.keys(e).length) { setStep(s); setErrors(e); setTimeout(() => document.getElementById(`reg-${Object.keys(e)[0]}`)?.focus(), 0); return; }
      }
    }
    setErrors({});
    setVisited((v) => Array.from(new Set([...v, step])));
    setStep(target);
  };

  const applyExisting = (p: Passenger) => {
    setExisting(p);
    const { id: _id, agencyId: _a, consentAt: _c, consentRecordedBy: _r, registrationStatus: _s, createdAt: _cr, rightsRequests: _rr, ...rest } = p;
    void _id; void _a; void _c; void _r; void _s; void _cr; void _rr;
    setF({ ...rest, consentStatus: 'pending' });
    setQ('');
  };

  const save = async (again: boolean) => {
    for (let s = 0; s < STEPS.length; s++) {
      const e = validate(s, f, travel);
      if (Object.keys(e).length) { setStep(s); setErrors(e); setTimeout(() => document.getElementById(`reg-${Object.keys(e)[0]}`)?.focus(), 0); return; }
    }
    const payload: PassengerInput = full ? f : { ...f, documentFront: null, documentBack: null, face: null };
    const r = await run('save', () => registerPassenger(user, payload, { tripId: travel.tripId, baggageCount: Number(travel.baggageCount), commercialGoods: travel.commercialGoods }, existing?.id ?? null), (x) => `Passager ajouté au voyage. Billet ${x.passengerTrip.ticketReference}.`);
    if (!r) return;
    if (again) {
      setF(empty()); setExisting(null); setStep(0); setVisited([]); setDocRead('idle');
      setTravel({ ...travel, baggageCount: '1', commercialGoods: '' });
      window.scrollTo({ top: 0 });
    } else nav(`/agency/tickets/${r.passengerTrip.ticketReference}`);
  };

  const simulateDocRead = () => {
    setDocRead('reading');
    setTimeout(() => {
      setDocRead('done');
      set({ documentFront: f.documentFront ?? { fileName: 'lecture-demo-recto.jpg', sizeKb: 240, capturedAt: new Date().toISOString(), simulated: true } });
    }, 900);
  };

  const docExpired = !!f.documentExpiry && daysUntil(f.documentExpiry) < 0;
  const visaHint = full && visaLikelyRequired(f.nationality);

  return (
    <>
      <PageTitle
        title="Enregistrer un passager"
        lead="Renseignez les informations du voyageur pour préparer son dossier de déplacement."
        crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: trip.reference, to: `/agency/trips/${trip.id}` }, { label: 'Enregistrer un passager' }]}
      />
      <Panel title="Rechercher un passager déjà enregistré" hint="Par numéro de document ou de téléphone, pour éviter une nouvelle saisie.">
        <div className="stack-sm">
          <TextField type="search" label="Numéro de document ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. DEMO-TG-100231 ou 00 00 40" help="3 caractères minimum. La recherche est limitée aux passagers de votre agence." />
          {q.trim().length >= 3 && (results.length ? (
            <ul className="notif-list" style={{ border: '1px solid var(--border)', borderRadius: 8 }} aria-live="polite">
              {results.slice(0, 5).map((p) => (
                <li key={p.id} className="row" style={{ padding: '8px 12px', justifyContent: 'space-between' }}>
                  <span><strong>{fullName(p)}</strong> <span className="small muted">· {docTypeLabel[p.documentType]} {p.documentNumber} · {p.phone || 'sans téléphone'}</span></span>
                  <Button size="sm" onClick={() => applyExisting(p)} icon={<UserCheck size={14} aria-hidden />}>Utiliser ce dossier</Button>
                </li>
              ))}
            </ul>
          ) : <p className="small muted" aria-live="polite">Aucun passager trouvé dans votre agence. Poursuivez la saisie d'un nouveau voyageur.</p>)}
          {existing && <Alert kind="info" title={`Dossier existant : ${fullName(existing)}`} action={<Button size="sm" variant="ghost" onClick={() => { setExisting(null); setF(empty()); }}>Nouveau voyageur</Button>}>Vérifiez les informations et recueillez à nouveau le consentement pour ce voyage.</Alert>}
        </div>
      </Panel>
      <div style={{ height: 16 }} />

      <ol className="stepper" aria-label="Étapes de l'enregistrement">
        {STEPS.map((s, i) => (
          <li key={s} className={visited.includes(i) && i !== step ? 'done' : ''}>
            <button type="button" aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
              <span className="num" aria-hidden>{i + 1}</span><span>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <form className="panel" onSubmit={(e) => { e.preventDefault(); if (step < STEPS.length - 1) go(step + 1); else void save(false); }} noValidate>
        <div className="panel-head"><h2>Étape {step + 1} — {STEPS[step]}</h2>{!full && step > 0 && f.consentStatus === 'declined' && <span className="badge badge-outline">Pré-inscription refusée : billet nominatif uniquement</span>}</div>
        <div className="panel-body stack">
          {Object.keys(errors).length > 0 && <Alert kind="error" title="Certains champs sont à corriger.">{Object.values(errors).join(' ')}</Alert>}

          {step === 0 && (
            <>
              <div className="alert alert-neutral" style={{ display: 'block' }}>
                <h3 className="sub" style={{ marginBottom: 8 }}>Information du voyageur</h3>
                <p>WeZonPass permet à votre agence de transmettre, avant l'arrivée du bus, la liste des passagers aux services de police compétents du Togo et du Bénin, afin de réduire l'attente au poste frontalier.</p>
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  <li>Données collectées : identité, document de voyage, photo du visage, nombre de bagages et marchandises déclarées.</li>
                  <li>Destinataires : services de police (vérification) ; douanes (bagages et marchandises uniquement).</li>
                  <li>Conservation proposée : photos et manifestes supprimés {db.settings.retentionManifestHours} h après le passage de la frontière ; profil conservé {db.settings.retentionProfileMonths} mois au plus après le dernier voyage, avec accord.</li>
                  <li>Droits : accès, rectification et suppression auprès de l'agence.</li>
                </ul>
                <p><strong>La pré-inscription est facultative.</strong> Le voyageur qui la refuse conserve l'accès au contrôle classique au guichet du poste frontalier.</p>
                <p className="small muted" style={{ marginTop: 8 }}>Politique de confidentialité : version « {db.settings.privacyPolicyVersion} ». Texte définitif à valider avec l'IPDCP (Togo) et l'APDP (Bénin).</p>
              </div>
              <fieldset style={{ border: 0, margin: 0, padding: 0 }} aria-describedby={errors.consentStatus ? 'reg-consent-err' : undefined}>
                <legend className="label strong" style={{ marginBottom: 8 }}>Choix du voyageur<span className="req" aria-hidden>*</span></legend>
                <div className="radio-cards" id="reg-consentStatus" tabIndex={-1}>
                  <label className="radio-card"><input type="radio" name="consent" checked={f.consentStatus === 'given'} onChange={() => set({ consentStatus: 'given' })} /><span><strong>Le voyageur accepte la pré-inscription</strong><br /><span className="small muted">Collecte des informations et des photos.</span></span></label>
                  <label className="radio-card"><input type="radio" name="consent" checked={f.consentStatus === 'declined'} onChange={() => set({ consentStatus: 'declined' })} /><span><strong>Le voyageur refuse</strong><br /><span className="small muted">Billet nominatif uniquement ; contrôle classique à la frontière.</span></span></label>
                </div>
                {errors.consentStatus && <div className="error" id="reg-consent-err" style={{ marginTop: 6 }}>{errors.consentStatus}</div>}
              </fieldset>
              <p className="small muted">Le choix, l'agent et l'horodatage sont enregistrés dans l'historique lors de l'enregistrement.</p>
            </>
          )}

          {step === 1 && (
            <div className="form-grid">
              <TextField id="reg-lastName" label="Nom" required value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} error={errors.lastName} autoComplete="off" />
              <TextField id="reg-firstName" label="Prénoms" required value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} error={errors.firstName} autoComplete="off" />
              <TextField id="reg-dateOfBirth" label="Date de naissance" type="date" required={full} max={dateOffset(0)} value={f.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} error={errors.dateOfBirth} help={f.dateOfBirth ? `${ageOn(f.dateOfBirth)} ans${minor ? ' — mineur : un adulte responsable sera demandé' : ''}` : undefined} />
              <SelectField id="reg-nationality" label="Nationalité" required={full} value={f.nationality} onChange={(e) => set({ nationality: e.target.value, visaRequired: full && visaLikelyRequired(e.target.value) ? true : f.visaRequired })} error={errors.nationality}>
                <option value="">Sélectionner…</option>
                {nationalities.map((n) => <option key={n}>{n}</option>)}
              </SelectField>
              <TextField id="reg-phone" label="Téléphone" type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} help="Facultatif. Utilisé pour les informations par SMS (non connecté dans la démonstration)." />
            </div>
          )}

          {step === 2 && (full ? (
            <>
              <Alert kind="info" title="Lecture automatique du document : démonstration" action={<Button size="sm" icon={<ScanText size={14} aria-hidden />} loading={docRead === 'reading'} onClick={simulateDocRead}>Simuler la lecture</Button>}>
                Aucune lecture MRZ ou NFC réelle n'est connectée. La simulation ajoute uniquement une capture fictive du recto ; vérifiez et saisissez les informations manuellement.
              </Alert>
              {docRead === 'done' && <p className="small" role="status"><SimTag>Démonstration</SimTag> Lecture simulée terminée — aucune donnée n'a été extraite.</p>}
              <div className="form-grid">
                <SelectField id="reg-documentType" label="Type de document" required value={f.documentType} onChange={(e) => set({ documentType: e.target.value as DocumentType })}>
                  {Object.entries(docTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectField>
                <TextField id="reg-documentNumber" label="Numéro" required value={f.documentNumber} onChange={(e) => set({ documentNumber: e.target.value.toUpperCase() })} error={errors.documentNumber} help="Utilisez un numéro fictif (ex. DEMO-…)." autoComplete="off" />
                <TextField id="reg-documentExpiry" label="Date d'expiration" type="date" required value={f.documentExpiry} onChange={(e) => set({ documentExpiry: e.target.value })} error={errors.documentExpiry} />
                <div>{docExpired && <Alert kind="warning" title="Le document est arrivé à expiration.">Le dossier sera marqué « Document à vérifier ». Le voyageur peut présenter un document valide ou passer au contrôle classique.</Alert>}</div>
                <div id="reg-documentFront" tabIndex={-1}><FileUpload label="Recto du document" required value={f.documentFront} onChange={(v) => set({ documentFront: v })} error={errors.documentFront} capture="environment" /></div>
                <div id="reg-documentBack" tabIndex={-1}><FileUpload label={`Verso du document${['passport', 'birth_certificate'].includes(f.documentType) ? ' (facultatif)' : ''}`} required={!['passport', 'birth_certificate'].includes(f.documentType)} value={f.documentBack} onChange={(v) => set({ documentBack: v })} error={errors.documentBack} capture="environment" /></div>
                <div className="span-2">
                  <label className="check"><input type="checkbox" checked={f.visaRequired} onChange={(e) => set({ visaRequired: e.target.checked })} /><span>Visa nécessaire pour ce voyage{visaHint && <span className="small muted"> — suggéré pour la nationalité {f.nationality} (règle de démonstration à valider)</span>}</span></label>
                </div>
                {f.visaRequired && (
                  <>
                    <TextField id="reg-visaNumber" label="Numéro de visa" value={f.visaNumber} onChange={(e) => set({ visaNumber: e.target.value.toUpperCase() })} help={!f.visaNumber ? 'Sans visa, le dossier sera marqué « Document à vérifier ».' : undefined} />
                    <TextField id="reg-visaExpiry" label="Expiration du visa" type="date" value={f.visaExpiry} onChange={(e) => set({ visaExpiry: e.target.value })} error={errors.visaExpiry} />
                  </>
                )}
              </div>
            </>
          ) : <Alert kind="neutral">Le voyageur a refusé la pré-inscription : aucun document n'est collecté. Il présentera ses documents au guichet du poste frontalier.</Alert>)}

          {step === 3 && (full ? (
            <>
              <Alert kind="info" title="Vérification visuelle : démonstration">Aucun moteur biométrique ni contrôle du vivant n'est connecté. La capture sert uniquement à illustrer le parcours.</Alert>
              <div id="reg-face" tabIndex={-1}><FileUpload label="Photo du visage" required value={f.face} onChange={(v) => set({ face: v })} error={errors.face} capture="user" /></div>
              <dl className="dl">
                <dt>État de la capture</dt><dd>{f.face ? 'Capture enregistrée' : 'En attente de capture'}</dd>
                <dt>Résultat de démonstration</dt><dd>{f.face ? <><SimTag>Simulation</SimTag> Image exploitable (résultat fictif, aucune analyse effectuée)</> : '—'}</dd>
              </dl>
            </>
          ) : <Alert kind="neutral"><Camera size={16} aria-hidden style={{ verticalAlign: -3 }} /> Aucune photo n'est prise pour un voyageur ayant refusé la pré-inscription.</Alert>)}

          {step === 4 && (
            <div className="form-grid">
              <SelectField id="reg-tripId" label="Voyage associé" required value={travel.tripId} onChange={(e) => { setTravel({ ...travel, tripId: e.target.value }); set({ guardianPassengerId: null }); }} error={errors.tripId}>
                <option value="">Sélectionner…</option>
                {openTrips.map((t) => <option key={t.id} value={t.id}>{t.reference} · {t.departure} → {t.destination} · {fmtDate(t.scheduledDeparture)}</option>)}
              </SelectField>
              <TextField id="reg-baggageCount" label="Nombre de bagages" type="number" min={0} max={20} required value={travel.baggageCount} onChange={(e) => { setTravel({ ...travel, baggageCount: e.target.value }); setErrors({}); }} error={errors.baggageCount} />
              <TextAreaField className="span-2" label="Marchandises commerciales déclarées" value={travel.commercialGoods} onChange={(e) => setTravel({ ...travel, commercialGoods: e.target.value })} help="Nature et quantité, si le voyageur transporte des marchandises. Consultable par les douanes." />
              {minor && full && (
                <SelectField id="reg-guardianPassengerId" className="span-2" label="Adulte responsable, si le voyageur est mineur" required value={f.guardianPassengerId ?? ''} onChange={(e) => set({ guardianPassengerId: e.target.value || null })} error={errors.guardianPassengerId} help={guardians.length ? undefined : "Enregistrez d'abord l'adulte responsable sur ce voyage."}>
                  <option value="">Sélectionner…</option>
                  {guardians.map((g) => <option key={g.id} value={g.id}>{fullName(g)} · {g.documentNumber}</option>)}
                </SelectField>
              )}
              {selectedTrip && ['boarding_closed', 'en_route', 'approaching_border'].includes(selectedTrip.status) && (
                <div className="span-2"><Alert kind="warning" title="Embarquement déjà clôturé">Ajout lors d'un arrêt autorisé : pensez à préparer une « Mise à jour du voyage » dans les manifestes.</Alert></div>
              )}
            </div>
          )}
        </div>
        <div className="dialog-foot" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <Link to={`/agency/trips/${trip.id}/passengers`} className="btn btn-secondary">Annuler</Link>
            {step > 0 && <Button icon={<ChevronLeft size={16} aria-hidden />} onClick={() => go(step - 1)}>Précédent</Button>}
          </div>
          <div className="row">
            {step < STEPS.length - 1 ? (
              <Button type="submit" variant="primary">Continuer<ChevronRight size={16} aria-hidden /></Button>
            ) : (
              <>
                <Button loading={busy === 'save'} onClick={() => void save(true)}>Enregistrer et ajouter un autre</Button>
                <Button type="submit" variant="primary" loading={busy === 'save'}>Enregistrer le passager</Button>
              </>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
