import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Clock, FileCheck2, RotateCcw, LogIn, FlaskConical } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useDb, resetDb } from '../../data/store';
import { DEMO_PASSWORD, ApiError } from '../../services/api';
import { workspaceHome, workspaceLabel, workspaceOf } from '../../domain/permissions';
import { roleLabel } from '../../domain/labels';
import { Alert, Button, TextField } from '../../components/ui';
import { DemoBar } from '../../layouts/AppShell';
import { useToast } from '../../components/Toast';
import type { Workspace } from '../../domain/types';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const db = useDb();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ login?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const from = (loc.state as { from?: string } | null)?.from;

  if (user) return <Navigate to={from ?? workspaceHome[workspaceOf(user.role)]} replace />;

  const doLogin = async (l: string, p: string) => {
    const e: typeof errors = {};
    if (!l.trim()) e.login = 'Ce champ est obligatoire.';
    if (!p) e.password = 'Ce champ est obligatoire.';
    setErrors(e);
    if (e.login || e.password) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    try {
      const u = signIn(l, p);
      const target = from && from.startsWith(`/${workspaceOf(u.role)}`) ? from : from?.startsWith('/billet/') ? from : workspaceHome[workspaceOf(u.role)];
      nav(target, { replace: true });
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : 'Connexion impossible.' });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (ev: FormEvent) => { ev.preventDefault(); void doLogin(login, password); };
  const order: Workspace[] = ['agency', 'police', 'border', 'customs', 'admin', 'driver'];
  const demoUsers = db.users.filter((u) => u.status === 'active');

  return (
    <>
      <DemoBar />
      <div className="auth">
        <aside className="auth-side">
          <img src={`${import.meta.env.BASE_URL}brand/wezonpass-logo-blanc.png`} alt="WeZonPass" width={220} height={79} />
          <div>
            <h2>Pré-enregistrement des passagers et suivi des voyages sur le corridor Lomé – Cotonou</h2>
            <p>Les agences transmettent les listes de passagers avant l'arrivée du bus. Les services de police et de douane conservent l'entière maîtrise de leurs contrôles.</p>
            <ul>
              <li><FileCheck2 size={18} aria-hidden />Listes provisoire et définitive, transmises et suivies par service destinataire.</li>
              <li><Clock size={18} aria-hidden />Préparation des contrôles avant l'arrivée au poste de Sanvee-Condji / Hillacondji.</li>
              <li><ShieldCheck size={18} aria-hidden />Espaces cloisonnés : chaque service ne voit que les informations de son rôle.</li>
            </ul>
          </div>
          <p className="small" style={{ color: '#EDE5FC' }}>Phase pilote — Togo ↔ Bénin.</p>
        </aside>
        <main className="auth-main" id="contenu">
          <div className="auth-card">
            <img className="auth-logo-mobile" src={`${import.meta.env.BASE_URL}brand/wezonpass-logo-couleur.png`} alt="WeZonPass" width={124} height={44} />
            <div>
              <h1>Connectez-vous à votre espace</h1>
              <p className="muted" style={{ marginTop: 6 }}>Accédez à votre espace de travail WeZonPass selon les habilitations attribuées à votre organisation.</p>
            </div>
            {errors.form && <Alert kind="error">{errors.form}</Alert>}
            <form onSubmit={onSubmit} noValidate className="stack">
              <TextField label="Identifiant professionnel" required autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} error={errors.login} />
              <TextField label="Mot de passe" required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Link to="/forgot-password">Mot de passe oublié ?</Link>
              </div>
              <Button type="submit" variant="primary" size="lg" block loading={loading} icon={<LogIn size={18} aria-hidden />}>Se connecter</Button>
            </form>
            <Alert kind="neutral">Les accès sont créés et attribués par l'administration centrale. <Link to="/access-request">Demander un accès pour votre organisation</Link></Alert>

            <section className="panel" aria-labelledby="demo-h">
              <div className="panel-head">
                <div>
                  <h2 id="demo-h" className="row" style={{ gap: 8 }}><FlaskConical size={16} aria-hidden />Connexion de démonstration</h2>
                  <div className="hint">Utilitaire réservé au mode démonstration, absent en production. Mot de passe commun : <span className="mono strong">{DEMO_PASSWORD}</span></div>
                </div>
              </div>
              <div className="panel-body stack">
                {order.map((ws) => {
                  const list = demoUsers.filter((u) => workspaceOf(u.role) === ws);
                  if (!list.length) return null;
                  return (
                    <div key={ws} className="stack-sm">
                      <div className="small strong">{workspaceLabel[ws]}</div>
                      <div className="demo-users">
                        {list.map((u) => (
                          <button key={u.id} type="button" onClick={() => { setLogin(u.login); setPassword(DEMO_PASSWORD); void doLogin(u.login, DEMO_PASSWORD); }}>
                            <strong>{u.name}</strong>
                            <span>{roleLabel[u.role]} · {db.organizations.find((o) => o.id === u.organizationId)?.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <Button size="sm" icon={<RotateCcw size={14} aria-hidden />} onClick={() => { resetDb(); toast('Données de démonstration réinitialisées.'); }}>Réinitialiser les données de démonstration</Button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
