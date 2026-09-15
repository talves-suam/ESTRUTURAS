import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Configuração Firebase via variáveis de ambiente (Vite).
 * Só variáveis com prefixo VITE_ entram no bundle do browser.
 * A API Key web do Firebase é pública por design — restrinja por domínio no Console.
 * Nunca use prefixo VITE_ para GEMINI_API_KEY ou outros segredos de servidor.
 */
function readEnv(name: string): string {
  const value = (import.meta.env[name] as string | undefined)?.trim() ?? '';
  if (!value || value.startsWith('YOUR_')) return '';
  return value;
}

const firebaseConfig: FirebaseOptions = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID'),
};

const firestoreDatabaseId = readEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') || undefined;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let dbInstance: Firestore | null = null;

if (isFirebaseConfigured) {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  dbInstance = getFirestore(app, firestoreDatabaseId);
} else if (import.meta.env.DEV) {
  console.info(
    '[Firebase] Não configurado — app usa apenas localStorage. Preencha .env.local (veja .env.example).'
  );
}

export const db: Firestore | null = dbInstance;
