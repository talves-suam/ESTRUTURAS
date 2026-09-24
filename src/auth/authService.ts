/**
 * Auth: Google Workspace @unisuam.edu.br via Firebase Auth.
 * Bypass local (localhost): suam / 123456 — só neste navegador.
 */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';

export const UNISUAM_EMAIL_DOMAIN = 'unisuam.edu.br';
const LOCAL_SESSION_KEY = 'unisuam_local_auth_session';
const LOCAL_DEV_PASSWORD = '123456';

export type AppUser = {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  isLocalBypass?: boolean;
};

export function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function isUnisuamEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${UNISUAM_EMAIL_DOMAIN}`);
}

function mapFirebaseUser(user: User): AppUser {
  return {
    uid: user.uid,
    email: (user.email || '').trim().toLowerCase(),
    displayName: user.displayName || undefined,
    photoURL: user.photoURL || undefined,
  };
}

export function readLocalBypassSession(): AppUser | null {
  if (!isLocalHost()) return null;
  try {
    const raw = sessionStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUser;
    if (!parsed?.email || !isUnisuamEmail(parsed.email)) return null;
    return { ...parsed, isLocalBypass: true };
  } catch {
    return null;
  }
}

export function clearLocalBypassSession(): void {
  try {
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function storeLocalBypass(user: AppUser): AppUser {
  const next = { ...user, isLocalBypass: true };
  sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
  return next;
}

/**
 * Bypass só em localhost: e-mail @unisuam.edu.br + senha 123456.
 * Aceita também usuário "suam". Não grava no Firebase Auth.
 */
export async function signInLocalBypass(userOrEmail: string, password: string): Promise<AppUser> {
  if (!isLocalHost()) {
    throw new Error('Login com senha local só funciona em localhost (desenvolvimento).');
  }
  let email = userOrEmail.trim().toLowerCase();
  if (email === 'suam') email = `suam@${UNISUAM_EMAIL_DOMAIN}`;
  if (!email.includes('@')) email = `${email}@${UNISUAM_EMAIL_DOMAIN}`;
  if (!isUnisuamEmail(email)) {
    throw new Error(`Use um e-mail @${UNISUAM_EMAIL_DOMAIN}.`);
  }
  if (password !== LOCAL_DEV_PASSWORD) {
    throw new Error('Senha incorreta. Em localhost a senha de desenvolvimento é 123456.');
  }

  return storeLocalBypass({
    uid: `local:${email}`,
    email,
    displayName: email.split('@')[0],
    isLocalBypass: true,
  });
}

export async function signInWithUnisuamGoogle(): Promise<AppUser> {
  if (!auth || !isFirebaseConfigured) {
    throw new Error(
      'Firebase não configurado. Confira src/firebase/projectConfig.ts ou Configurações.'
    );
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    hd: UNISUAM_EMAIL_DOMAIN,
    prompt: 'select_account',
  });
  provider.addScope('email');
  provider.addScope('profile');

  const result = await signInWithPopup(auth, provider);
  const user = mapFirebaseUser(result.user);
  if (!isUnisuamEmail(user.email)) {
    await signOut(auth);
    throw new Error(`Acesso restrito a contas @${UNISUAM_EMAIL_DOMAIN}.`);
  }
  clearLocalBypassSession();
  return user;
}

export async function signOutApp(): Promise<void> {
  clearLocalBypassSession();
  if (auth) {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeAuth(callback: (user: AppUser | null) => void): () => void {
  const local = readLocalBypassSession();
  if (local) {
    callback(local);
  }

  if (!auth || !isFirebaseConfigured) {
    if (!local) callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      clearLocalBypassSession();
      const mapped = mapFirebaseUser(firebaseUser);
      if (!isUnisuamEmail(mapped.email)) {
        void signOut(auth!);
        callback(null);
        return;
      }
      callback(mapped);
      return;
    }

    const bypass = readLocalBypassSession();
    callback(bypass);
  });
}
