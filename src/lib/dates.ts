const pad = (n: number) => String(n).padStart(2, '0');

export const nowIso = () => new Date().toISOString();

export function todayAt(h: number, m = 0, dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInput(d.toISOString());
}

export function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

export function fmtLongDate(d = new Date()): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function isSameDay(iso: string, ref = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

export function daysUntil(dateStr: string): number {
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / 86400000);
}

export function ageOn(dob: string, ref = new Date()): number {
  const d = new Date(`${dob}T00:00:00`);
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age;
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export function fmtDuration(min: number | null): string {
  if (min === null || Number.isNaN(min)) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${pad(min % 60)}`;
}

export function relative(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "à l'instant";
  if (diff < 60) return `il y a ${diff} min`;
  if (diff < 1440) return `il y a ${Math.floor(diff / 60)} h`;
  return fmtDateTime(iso);
}
