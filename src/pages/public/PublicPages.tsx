import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Hourglass, Send } from 'lucide-react';
import { submitAccessRequest } from '../../services/api';
import { Alert, Button, SelectField, TextAreaField, TextField } from '../../components/ui';
import { DemoBar } from '../../layouts/AppShell';

function PublicFrame({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => { document.title = `${title} — WeZonPass`; }, [title]);
  return (
    <>
      <DemoBar />
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px' }}>
          <Link to="/login" aria-label="WeZonPass — connexion"><img src={`${import.meta.env.BASE_URL}brand/wezonpass-logo-couleur.png`} alt="WeZonPass" width={113} height={40} /></Link>
        </header>
        <main id="contenu" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }} className="stack">
          <Link to="/login" className="row small" style={{ gap: 6 }}><ArrowLeft size={16} aria-hidden />Retour à la connexion</Link>
          {children}
        </main>
      </div>
    </>
  );
}

const ORG_TYPES = ['Agence de transport', 'Service de police', 'Poste frontalier', 'Douanes', 'Autre entité partenaire'];

export function AccessRequestPage() {
  const [f, setF] = useState({ organizationName: '', organizationType: '', country: '', contactName: '', contactFunction: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    for (const k of ['organizationName', 'organizationType', 'country', 'contactName', 'contactFunction', 'email', 'phone'] as const) if (!f[k].trim()) e[k] = 'Ce champ est obligatoire.';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Adresse e-mail invalide.';
    setErrors(e);
    if (Object.keys(e).length) { document.getElementById(`ar-${Object.keys(e)[0]}`)?.focus(); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    const req = submitAccessRequest(f);
    setLoading(false);
    setDone(req.id);
  };

  return (
    <PublicFrame title="Demander un accès à WeZonPass">
      <div>
        <h1 style={{ fontSize: 28 }}>Demander un accès à WeZonPass</h1>
        <p className="muted" style={{ marginTop: 6 }}>Les agences de transport et les entités partenaires peuvent solliciter un accès à la plateforme auprès de l'administration centrale. Chaque demande fait l'objet d'une vérification préalable.</p>
      </div>
      {done ? (
        <Alert kind="success" title="Votre demande de démonstration a été enregistrée.">
          Elle est conservée dans ce navigateur et apparaît dans l'espace Administration centrale de démonstration. Aucun e-mail n'est envoyé et aucun compte n'est créé automatiquement.
          <div style={{ marginTop: 10 }}><Link to="/access-pending" className="btn btn-secondary btn-sm">Suivre l'état de la demande</Link></div>
        </Alert>
      ) : (
        <form className="panel" onSubmit={onSubmit} noValidate>
          <div className="panel-body form-grid">
            <TextField id="ar-organizationName" label="Nom de l'organisation" required value={f.organizationName} onChange={set('organizationName')} error={errors.organizationName} />
            <SelectField id="ar-organizationType" label="Type d'organisation" required value={f.organizationType} onChange={set('organizationType')} error={errors.organizationType}>
              <option value="">Sélectionner…</option>
              {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
            </SelectField>
            <SelectField id="ar-country" label="Pays" required value={f.country} onChange={set('country')} error={errors.country}>
              <option value="">Sélectionner…</option><option>Togo</option><option>Bénin</option>
            </SelectField>
            <TextField id="ar-contactName" label="Nom du contact" required value={f.contactName} onChange={set('contactName')} error={errors.contactName} />
            <TextField id="ar-contactFunction" label="Fonction" required value={f.contactFunction} onChange={set('contactFunction')} error={errors.contactFunction} />
            <TextField id="ar-email" label="Adresse e-mail professionnelle" required type="email" value={f.email} onChange={set('email')} error={errors.email} />
            <TextField id="ar-phone" label="Téléphone" required type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} />
            <TextAreaField className="span-2" label="Message complémentaire" value={f.message} onChange={set('message')} />
            <div className="span-2 form-actions">
              <Link to="/login" className="btn btn-secondary">Annuler</Link>
              <Button type="submit" variant="primary" loading={loading} icon={<Send size={16} aria-hidden />}>Envoyer la demande</Button>
            </div>
          </div>
        </form>
      )}
    </PublicFrame>
  );
}

export function AccessPendingPage() {
  return (
    <PublicFrame title="Demande en cours de vérification">
      <div className="panel"><div className="panel-body stack">
        <div className="row"><Hourglass size={22} color="var(--wz-orange-ink)" aria-hidden /><h1 style={{ fontSize: 24 }}>Demande en cours de vérification</h1></div>
        <p>L'administration centrale vérifie les informations et les pièces de votre organisation. Les comptes sont ensuite créés et attribués nominativement à chaque personne habilitée.</p>
        <ol className="timeline">
          <li><span className="tl-dot ok" aria-hidden /><div className="tl-title">Demande reçue</div></li>
          <li><span className="tl-dot pending" aria-hidden /><div className="tl-title">Vérification des pièces</div><div className="tl-meta">Licence, registre du commerce, assurance…</div></li>
          <li><span className="tl-dot pending" aria-hidden /><div className="tl-title">Agrément et création des comptes</div></li>
        </ol>
        <Alert kind="neutral">Démonstration : l'état réel de la demande est visible dans l'espace Administration centrale.</Alert>
      </div></div>
    </PublicFrame>
  );
}

export function ForgotPasswordPage() {
  const [login, setLogin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  return (
    <PublicFrame title="Mot de passe oublié">
      <h1 style={{ fontSize: 28 }}>Mot de passe oublié</h1>
      {sent ? (
        <Alert kind="info" title="Aucun message n'a été envoyé (démonstration).">
          En production, la réinitialisation sera traitée selon la procédure de l'administration centrale. Dans cette démonstration, le mot de passe commun est indiqué sur la page de connexion.
        </Alert>
      ) : (
        <form className="panel" noValidate onSubmit={(e) => { e.preventDefault(); if (!login.trim()) { setError('Ce champ est obligatoire.'); return; } setSent(true); }}>
          <div className="panel-body stack">
            <p className="muted">Indiquez votre identifiant professionnel. La réinitialisation des accès est contrôlée par l'administration centrale.</p>
            <TextField label="Identifiant professionnel" required value={login} onChange={(e) => { setLogin(e.target.value); setError(null); }} error={error} />
            <div className="form-actions"><Button type="submit" variant="primary" icon={<CheckCircle2 size={16} aria-hidden />}>Demander la réinitialisation</Button></div>
          </div>
        </form>
      )}
    </PublicFrame>
  );
}

export function NotFoundPage() {
  return (
    <PublicFrame title="Page introuvable">
      <h1 style={{ fontSize: 28 }}>Page introuvable</h1>
      <p className="muted">L'adresse demandée n'existe pas ou n'est plus disponible.</p>
      <div><Link to="/" className="btn btn-primary">Retour à mon espace</Link></div>
    </PublicFrame>
  );
}
