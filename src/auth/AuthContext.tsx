import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useDb } from '../data/store';
import { login as apiLogin } from '../services/api';
import type { User } from '../domain/types';

/**
 * Authentification de DÉMONSTRATION. La session est conservée dans sessionStorage.
 * Ce mécanisme n'est pas une authentification de production (pas de serveur, pas de jeton signé).
 */
const SESSION_KEY = 'wezonpass-session';

interface AuthValue {
  user: User | null;
  signIn: (login: string, password: string) => User;
  signOut: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [userId, setUserId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  // L'utilisateur est relu à chaque changement : une suspension prend effet immédiatement.
  const user = useMemo(() => {
    const u = userId ? db.users.find((x) => x.id === userId) ?? null : null;
    return u && u.status === 'active' ? u : null;
  }, [db, userId]);

  const signIn = useCallback((login: string, password: string) => {
    const u = apiLogin(login, password);
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch { /* stockage indisponible : session en mémoire */ }
    setUserId(u.id);
    return u;
  }, []);

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignoré */ }
    setUserId(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider manquant');
  return v;
}

/** Utilisateur connecté (à n'utiliser que sous une route protégée). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('Utilisateur non connecté');
  return user;
}
