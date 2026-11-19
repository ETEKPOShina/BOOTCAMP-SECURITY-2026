import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './ui';

/** Boîte de dialogue modale accessible : focus piégé, Échap pour fermer, retour du focus. */
export function Dialog({ open, title, onClose, children, footer, wide, description }: { open: boolean; title: string; onClose: () => void; children?: ReactNode; footer?: ReactNode; wide?: boolean; description?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const tid = useId();
  const did = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((e) => !e.hasAttribute('disabled'));
    const first = focusables().find((e) => !e.classList.contains('icon-btn')) ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={tid} aria-describedby={description ? did : undefined} ref={ref}>
        <div className="dialog-head">
          <h2 id={tid}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dialog-body">
          {description && <p id={did} className="muted">{description}</p>}
          {children}
        </div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmationDialog({ open, title, message, confirmLabel, onConfirm, onClose, loading, danger, children }: { open: boolean; title: string; message: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; loading?: boolean; danger?: boolean; children?: ReactNode }) {
  return (
    <Dialog
      open={open} title={title} onClose={onClose} description={message}
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}
    >
      {children}
    </Dialog>
  );
}
