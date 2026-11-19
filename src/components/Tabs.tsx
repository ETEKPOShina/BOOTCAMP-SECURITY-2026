import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export function Tabs<K extends string>({ tabs, value, onChange, label }: { tabs: { key: K; label: ReactNode }[]; value: K; onChange: (k: K) => void; label: string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (n >= 0) { e.preventDefault(); onChange(tabs[n].key); refs.current[n]?.focus(); }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${id}-${t.key}`}
          aria-selected={value === t.key} tabIndex={value === t.key ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
