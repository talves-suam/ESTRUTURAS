import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  type AppUser,
  isLocalHost,
  signInLocalBypass,
  signInWithUnisuamGoogle,
  signOutApp,
  subscribeAuth,
} from './authService';
import { isSiteAdminEmail, type AppRole, roleForEmail } from './adminConfig';

type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  isLocalHost: boolean;
  isAdmin: boolean;
  role: AppRole;
  signInGoogle: () => Promise<void>;
  signInLocal: (userOrEmail: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const local = isLocalHost();

  useEffect(() => {
    const unsub = subscribeAuth((next) => {
      setUser(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  const role = roleForEmail(user?.email);
  const isAdmin = role === 'admin';

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isLocalHost: local,
      isAdmin,
      role,
      signInGoogle: async () => {
        const next = await signInWithUnisuamGoogle();
        setUser(next);
      },
      signInLocal: async (userOrEmail, password) => {
        const next = await signInLocalBypass(userOrEmail, password);
        setUser(next);
      },
      signOut: async () => {
        await signOutApp();
        setUser(null);
      },
    }),
    [user, loading, local, isAdmin, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}

export { isSiteAdminEmail };
