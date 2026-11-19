import { useMemo, useState, type ReactNode } from 'react';
import { Button, EmptyState } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Afficher dans la vue mobile (liste structurée). Par défaut : oui. */
  mobile?: boolean;
}

/**
 * Tableau opérationnel. Sur mobile, il devient une liste structurée : la première colonne sert de titre,
 * les suivantes sont présentées sous forme de paires libellé / valeur.
 */
export function DataTable<T>({ rows, columns, rowKey, caption, empty = 'Aucun élément à afficher.', emptyHint, pageSize = 12, selectedKey, onRowClick, mobileAside }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; caption: string; empty?: string; emptyHint?: ReactNode;
  pageSize?: number; selectedKey?: string | null; onRowClick?: (r: T) => void; mobileAside?: (r: T) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(current * pageSize, current * pageSize + pageSize), [rows, current, pageSize]);
  if (!rows.length) return <EmptyState title={empty}>{emptyHint}</EmptyState>;
  const [first, ...rest] = columns;
  return (
    <div className="responsive-table">
      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.className}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} className={`${selectedKey === k ? 'selected' : ''} ${onRowClick ? 'row-link' : ''}`} onClick={onRowClick ? (e) => { if ((e.target as HTMLElement).closest('a,button,input,select,label')) return; onRowClick(r); } : undefined}>
                  {columns.map((c, i) => (i === 0 ? <th key={c.key} scope="row" className={c.className} style={{ fontWeight: 'inherit', background: 'transparent', fontSize: 'inherit', color: 'inherit', borderBottom: 'inherit', whiteSpace: 'normal' }}>{c.render(r)}</th> : <td key={c.key} className={c.className}>{c.render(r)}</td>))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mobile-list" aria-label={caption}>
        {slice.map((r) => (
          <li key={rowKey(r)}>
            <div className="ml-title"><div>{first.render(r)}</div>{mobileAside?.(r)}</div>
            <dl className="ml-meta">
              {rest.filter((c) => c.mobile !== false).map((c) => (
                <div key={c.key} style={{ display: 'contents' }}><dt>{c.header}</dt><dd>{c.render(r)}</dd></div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="pagination">
          <span>{current * pageSize + 1}–{Math.min(rows.length, (current + 1) * pageSize)} sur {rows.length}</span>
          <div className="row">
            <Button size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Précédent</Button>
            <span aria-live="polite">Page {current + 1} / {pages}</span>
            <Button size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Suivant</Button>
          </div>
        </div>
      )}
    </div>
  );
}
