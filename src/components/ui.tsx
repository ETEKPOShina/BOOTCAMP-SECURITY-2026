import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Inbox, Loader2, Search, Upload, X, FlaskConical, Trash2 } from 'lucide-react';
import type { CaptureMeta } from '../domain/types';

// ------------------------------------------------ titres

export interface Crumb { label: string; to?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Fil d'Ariane">
      <ol>
        {items.map((c, i) => (
          <li key={i}>{c.to && i < items.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

export function PageTitle({ title, lead, crumbs, actions, badge }: { title: string; lead?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; badge?: ReactNode }) {
  useEffect(() => { document.title = `${title} — WeZonPass`; }, [title]);
  return (
    <>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 12 }}>
            <h1>{title}</h1>
            {badge}
          </div>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </>
  );
}

// ------------------------------------------------ boutons

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; size?: 'sm' | 'lg'; block?: boolean };

export function Button({ loading, icon, variant = 'secondary', size, block, children, className = '', disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export const PrimaryButton = (p: BtnProps) => <Button variant="primary" {...p} />;
export const SecondaryButton = (p: BtnProps) => <Button variant="secondary" {...p} />;

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

// ------------------------------------------------ panneaux

export function Panel({ title, hint, actions, children, flush, id, as = 'section' }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string; as?: 'section' | 'div' }) {
  const Tag = as;
  const hid = useId();
  return (
    <Tag className="panel" id={id} aria-labelledby={title ? hid : undefined}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h2 id={hid}>{title}</h2>}
            {hint && <div className="hint">{hint}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
    </Tag>
  );
}

export function Kpi({ label, value, note, to, tone, icon }: { label: string; value: ReactNode; note?: ReactNode; to?: string; tone?: 'attention' | 'critical'; icon?: ReactNode }) {
  const inner = (
    <>
      <div className="kpi-label">{icon}{label}</div>
      <div className="kpi-value mono">{value}</div>
      {note && <div className="kpi-note">{note}</div>}
    </>
  );
  return to ? <Link className={`kpi ${tone ?? ''}`} to={to}>{inner}</Link> : <div className={`kpi ${tone ?? ''}`}>{inner}</div>;
}

// ------------------------------------------------ alertes et états

export function Alert({ kind = 'info', title, children, action }: { kind?: 'info' | 'warning' | 'error' | 'success' | 'neutral'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = kind === 'error' ? AlertCircle : kind === 'warning' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div className="alert-title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function SimTag({ children = 'Simulation' }: { children?: ReactNode }) {
  return <span className="sim-tag"><FlaskConical size={12} aria-hidden />{children}</span>;
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={32} aria-hidden />}
      <strong>{title}</strong>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return <div className="loading" role="status"><Loader2 size={18} className="spin" aria-hidden />{label}</div>;
}

export function ErrorState({ title = 'Élément introuvable', children, action }: { title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel"><h1 className="sr-only">{title}</h1><EmptyState title={title} icon={<AlertCircle size={32} aria-hidden />} action={action}>{children}</EmptyState></div>
  );
}

// ------------------------------------------------ formulaires

interface FieldShell { label: string; required?: boolean; help?: ReactNode; error?: string | null; className?: string }

export function FormField({ label, required, help, error, className = '', children, htmlFor }: FieldShell & { children: ReactNode; htmlFor: string }) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden>*</span>}</label>
      {children}
      {help && !error && <div className="help" id={`${htmlFor}-help`}>{help}</div>}
      {error && <div className="error" id={`${htmlFor}-err`}><AlertCircle size={14} aria-hidden />{error}</div>}
    </div>
  );
}

function describedBy(id: string, help?: ReactNode, error?: string | null) {
  return [error ? `${id}-err` : null, help && !error ? `${id}-help` : null].filter(Boolean).join(' ') || undefined;
}

export function TextField({ label, required, help, error, className, id, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const gen = useId();
  const fid = id ?? gen;
  return (
    <FormField label={label} required={required} help={help} error={error} className={className} htmlFor={fid}>
      <input id={fid} className="input" aria-invalid={error ? true : undefined} aria-required={required || undefined} aria-describedby={describedBy(fid, help, error)} {...rest} />
    </FormField>
  );
}

export const DateField = (p: FieldShell & InputHTMLAttributes<HTMLInputElement>) => <TextField type="date" {...p} />;

export function SelectField({ label, required, help, error, className, id, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const gen = useId();
  const fid = id ?? gen;
  return (
    <FormField label={label} required={required} help={help} error={error} className={className} htmlFor={fid}>
      <select id={fid} className="select" aria-invalid={error ? true : undefined} aria-required={required || undefined} aria-describedby={describedBy(fid, help, error)} {...rest}>{children}</select>
    </FormField>
  );
}

export function TextAreaField({ label, required, help, error, className, id, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const gen = useId();
  const fid = id ?? gen;
  return (
    <FormField label={label} required={required} help={help} error={error} className={className} htmlFor={fid}>
      <textarea id={fid} className="textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, help, error)} {...rest} />
    </FormField>
  );
}

export function SearchField({ label = 'Rechercher', value, onChange, placeholder, className = 'search', id }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; id?: string }) {
  const gen = useId();
  const fid = id ?? gen;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={fid} className="sr-only">{label}</label>
      <div style={{ position: 'relative' }}>
        <Search size={16} aria-hidden style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-2)' }} />
        <input id={fid} type="search" className="input" style={{ paddingLeft: 36 }} value={value} placeholder={placeholder ?? label} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="small muted">{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 150 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="toolbar" role="search">{children}</div>;
}

/** Capture ou import d'image. Le fichier n'est pas conservé : seules ses métadonnées le sont (démonstration). */
export function FileUpload({ label, value, onChange, error, disabled, capture, required }: { label: string; value: CaptureMeta | null; onChange: (v: CaptureMeta | null) => void; error?: string | null; disabled?: boolean; capture?: 'user' | 'environment'; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="field">
      <span className="label" id={`${id}-l`}>{label}{required && <span className="req" aria-hidden>*</span>}</span>
      <div className={`upload ${value ? 'done' : ''}`}>
        {value ? <CheckCircle2 size={22} color="var(--wz-green-ink)" aria-hidden /> : <Upload size={22} color="var(--text-2)" aria-hidden />}
        <div className="upload-meta">
          {value ? (
            <>
              <strong>{value.simulated ? 'Capture simulée enregistrée' : 'Fichier sélectionné'}</strong>
              <span className="muted">{value.fileName} · {value.sizeKb} Ko — image non conservée dans la démonstration</span>
            </>
          ) : (
            <>
              <strong>Aucune image</strong>
              <span className="muted">JPG ou PNG. Utilisez uniquement des images fictives.</span>
            </>
          )}
        </div>
        <input
          ref={ref} type="file" accept="image/*" capture={capture} className="sr-only" id={id} aria-labelledby={`${id}-l`} disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange({ fileName: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)), capturedAt: new Date().toISOString(), simulated: false });
            e.target.value = '';
          }}
        />
        <div className="row" style={{ gap: 4 }}>
          {value ? (
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => onChange(null)} disabled={disabled}>Retirer</Button>
          ) : (
            <>
              <Button size="sm" onClick={() => ref.current?.click()} disabled={disabled} aria-describedby={`${id}-l`}>Importer</Button>
              <Button size="sm" variant="ghost" disabled={disabled} aria-describedby={`${id}-l`} onClick={() => onChange({ fileName: `capture-demo-${Date.now().toString(36)}.jpg`, sizeKb: 210, capturedAt: new Date().toISOString(), simulated: true })}>Capture simulée</Button>
            </>
          )}
        </div>
      </div>
      {error && <div className="error"><AlertCircle size={14} aria-hidden />{error}</div>}
    </div>
  );
}

export function CloseIcon() {
  return <X size={18} aria-hidden />;
}
