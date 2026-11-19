import type { ReactNode } from 'react';
import {
  LayoutDashboard, Route as RouteIcon, Users, Ticket, ScanLine, Bus, MapPinned, UsersRound, Bell, BarChart3,
  History, Settings, FileStack, ListChecks, UserSearch, ArrowDownToLine, CalendarClock, ShieldAlert, Luggage,
  FileText, Building2, Handshake, KeyRound, ShieldCheck, Radar, Truck,
} from 'lucide-react';
import type { Permission } from '../domain/permissions';
import type { Workspace } from '../domain/types';

export interface NavItem { to: string; label: string; icon: ReactNode; perm?: Permission; group?: string; end?: boolean }

const i = (C: typeof LayoutDashboard) => <C size={18} aria-hidden />;

export const NAV: Record<Exclude<Workspace, 'driver'>, NavItem[]> = {
  agency: [
    { to: '/agency/dashboard', label: 'Tableau de bord', icon: i(LayoutDashboard) },
    { to: '/agency/trips', label: 'Voyages', icon: i(RouteIcon), group: 'Exploitation', end: true },
    { to: '/agency/passengers', label: 'Passagers', icon: i(Users) },
    { to: '/agency/tickets', label: 'Billets', icon: i(Ticket) },
    { to: '/agency/trips?statut=boarding', label: 'Embarquement', icon: i(ScanLine), perm: 'agency.boarding.operate' },
    { to: '/agency/tracking', label: 'Suivi des trajets', icon: i(MapPinned) },
    { to: '/agency/fleet', label: 'Parc automobile', icon: i(Bus), group: 'Ressources' },
    { to: '/agency/team', label: 'Équipe', icon: i(UsersRound), perm: 'agency.team.view' },
    { to: '/agency/notifications', label: 'Notifications', icon: i(Bell), group: 'Suivi' },
    { to: '/agency/statistics', label: 'Statistiques', icon: i(BarChart3), perm: 'agency.stats.view' },
    { to: '/agency/audit', label: 'Historique', icon: i(History), perm: 'agency.audit.view' },
    { to: '/agency/settings', label: 'Paramètres', icon: i(Settings), perm: 'agency.settings.manage' },
  ],
  police: [
    { to: '/police/dashboard', label: 'Tableau de bord', icon: i(LayoutDashboard) },
    { to: '/police/manifests', label: 'Manifestes', icon: i(FileStack), group: 'Vérification' },
    { to: '/police/review-queue', label: 'File de vérification', icon: i(ListChecks) },
    { to: '/police/passengers', label: 'Passagers', icon: i(UserSearch) },
    { to: '/police/arrivals', label: 'Bus à l’approche', icon: i(ArrowDownToLine) },
    { to: '/police/notifications', label: 'Notifications', icon: i(Bell), group: 'Suivi' },
    { to: '/police/audit', label: 'Historique', icon: i(History) },
  ],
  border: [
    { to: '/border/dashboard', label: 'Tableau de bord', icon: i(LayoutDashboard) },
    { to: '/border/expected-buses', label: 'Bus attendus', icon: i(CalendarClock), group: 'Opérations' },
    { to: '/border/arrivals', label: 'Bus arrivés', icon: i(ArrowDownToLine) },
    { to: '/border/passenger-check', label: 'Contrôle des passagers', icon: i(ScanLine) },
    { to: '/border/discrepancies', label: 'Écarts', icon: i(ShieldAlert) },
    { to: '/border/notifications', label: 'Notifications', icon: i(Bell), group: 'Suivi' },
    { to: '/border/history', label: 'Historique', icon: i(History) },
  ],
  customs: [
    { to: '/customs/dashboard', label: 'Tableau de bord', icon: i(LayoutDashboard) },
    { to: '/customs/arrivals', label: 'Arrivées', icon: i(ArrowDownToLine), group: 'Consultation' },
    { to: '/customs/baggage', label: 'Bagages', icon: i(Luggage) },
    { to: '/customs/declarations', label: 'Déclarations', icon: i(FileText) },
    { to: '/customs/notifications', label: 'Notifications', icon: i(Bell), group: 'Suivi' },
    { to: '/customs/history', label: 'Historique', icon: i(History) },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Tableau de bord', icon: i(LayoutDashboard) },
    { to: '/admin/agencies', label: 'Agences', icon: i(Building2), group: 'Administration' },
    { to: '/admin/partners', label: 'Entités partenaires', icon: i(Handshake) },
    { to: '/admin/accounts', label: 'Comptes', icon: i(KeyRound) },
    { to: '/admin/roles', label: 'Rôles et habilitations', icon: i(ShieldCheck) },
    { to: '/admin/trips', label: 'Voyages', icon: i(RouteIcon), group: 'Supervision' },
    { to: '/admin/fleet', label: 'Parc automobile', icon: i(Truck) },
    { to: '/admin/live-tracking', label: 'Suivi des trajets', icon: i(Radar) },
    { to: '/admin/statistics', label: 'Statistiques', icon: i(BarChart3) },
    { to: '/admin/notifications', label: 'Notifications', icon: i(Bell), group: 'Suivi' },
    { to: '/admin/audit', label: 'Journal des activités', icon: i(History) },
    { to: '/admin/settings', label: 'Paramètres', icon: i(Settings) },
  ],
};
