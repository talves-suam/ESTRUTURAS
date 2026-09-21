import { initializeApp, getApps, deleteApp, type FirebaseOptions } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Configuração Firebase: variáveis VITE_* e/ou o que a pessoa colar em Configurações.
 * A API Key web do Firebase é pública por design — o que protege os dados são as regras do Firestore.
 */
export const FIREBASE_RUNTIME_CONFIG_KEY = 'unisuam_firebase_config';
export const FIREBASE_CHANGED_EVENT = 'unisuam-firebase-changed';

export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId?: string;
};

/** Regras abertas para o time interno. Publique isto no Console do Firebase. */
export const FIRESTORE_TEST_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;

function readEnv(name: string): string {
  const value = (import.meta.env[name] as string | undefined)?.trim() ?? '';
  if (!value || value.startsWith('YOUR_')) return '';
  return value;
}

function isCompleteConfig(config: Partial<FirebaseClientConfig> | null | undefined): config is FirebaseClientConfig {
  return Boolean(config?.apiKey && config?.projectId && config?.appId);
}

function configFromEnv(): FirebaseClientConfig | null {
  const config: FirebaseClientConfig = {
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || undefined,
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || undefined,
    appId: readEnv('VITE_FIREBASE_APP_ID'),
    firestoreDatabaseId: readEnv('VITE_FIREBASE_FIRESTORE_DATABASE_ID') || undefined,
  };
  return isCompleteConfig(config) ? config : null;
}

function configFromStorage(): FirebaseClientConfig | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FIREBASE_RUNTIME_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirebaseClientConfig;
    return isCompleteConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getFirebaseClientConfig(): FirebaseClientConfig | null {
  return configFromStorage() || configFromEnv();
}

export function hasRuntimeFirebaseConfig(): boolean {
  return configFromStorage() !== null;
}

export function parseFirebaseConfigPaste(text: string): FirebaseClientConfig {
  const raw = text.trim();
  if (!raw) {
    throw new Error('Cole o bloco firebaseConfig que o Google mostrou.');
  }

  const parsed: Record<string, string> = {};
  try {
    Object.assign(parsed, JSON.parse(raw) as Record<string, string>);
  } catch {
    const objMatch = raw.match(/\{[\s\S]*\}/);
    const src = objMatch ? objMatch[0] : raw;
    const keys = [
      'apiKey',
      'authDomain',
      'projectId',
      'storageBucket',
      'messagingSenderId',
      'appId',
      'measurementId',
    ];
    for (const key of keys) {
      const match = src.match(new RegExp(`${key}['"]?\\s*[:=]\\s*['"]([^'"]+)['"]`));
      if (match?.[1]) parsed[key] = match[1];
    }
  }

  const apiKey = String(parsed.apiKey || '').trim();
  const projectId = String(parsed.projectId || '').trim();
  const appId = String(parsed.appId || '').trim();
  if (!apiKey || !projectId || !appId) {
    throw new Error('Faltou apiKey, projectId ou appId. Copie o objeto firebaseConfig inteiro.');
  }

  return {
    apiKey,
    authDomain: String(parsed.authDomain || `${projectId}.firebaseapp.com`).trim(),
    projectId,
    storageBucket: String(parsed.storageBucket || '').trim() || undefined,
    messagingSenderId: String(parsed.messagingSenderId || '').trim() || undefined,
    appId,
  };
}

export function toEnvLocalContents(config: FirebaseClientConfig): string {
  return [
    'VITE_FIREBASE_API_KEY=' + config.apiKey,
    'VITE_FIREBASE_AUTH_DOMAIN=' + (config.authDomain || `${config.projectId}.firebaseapp.com`),
    'VITE_FIREBASE_PROJECT_ID=' + config.projectId,
    'VITE_FIREBASE_STORAGE_BUCKET=' + (config.storageBucket || ''),
    'VITE_FIREBASE_MESSAGING_SENDER_ID=' + (config.messagingSenderId || ''),
    'VITE_FIREBASE_APP_ID=' + config.appId,
    'VITE_FIREBASE_FIRESTORE_DATABASE_ID=' + (config.firestoreDatabaseId || ''),
    '',
  ].join('\n');
}

function toFirebaseOptions(config: FirebaseClientConfig): FirebaseOptions {
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  };
}

function bootFirebase(config: FirebaseClientConfig | null): { db: Firestore | null; configured: boolean } {
  if (!config) {
    return { db: null, configured: false };
  }
  try {
    const app = getApps().find((item) => item.name === '[DEFAULT]') ?? initializeApp(toFirebaseOptions(config));
    const instance = config.firestoreDatabaseId
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);
    return { db: instance, configured: true };
  } catch (err) {
    console.error('[Firebase] falha ao iniciar', err);
    return { db: null, configured: false };
  }
}

const initialBoot = bootFirebase(getFirebaseClientConfig());

export let db: Firestore | null = initialBoot.db;
export let isFirebaseConfigured = initialBoot.configured;

function emitFirebaseChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(FIREBASE_CHANGED_EVENT));
  }
}

async function resetFirebaseApp(): Promise<void> {
  const existing = getApps()[0];
  if (existing) {
    await deleteApp(existing);
  }
  db = null;
  isFirebaseConfigured = false;
}

export async function applyRuntimeFirebaseConfig(config: FirebaseClientConfig): Promise<void> {
  localStorage.setItem(FIREBASE_RUNTIME_CONFIG_KEY, JSON.stringify(config));
  await resetFirebaseApp();
  const next = bootFirebase(config);
  db = next.db;
  isFirebaseConfigured = next.configured;
  if (!isFirebaseConfigured) {
    throw new Error('Não foi possível ligar o Firebase com esses dados. Confira o que foi colado.');
  }
}

export function notifyFirebaseChanged(): void {
  emitFirebaseChanged();
}

export async function clearRuntimeFirebaseConfig(): Promise<void> {
  localStorage.removeItem(FIREBASE_RUNTIME_CONFIG_KEY);
  await resetFirebaseApp();
  const next = bootFirebase(configFromEnv());
  db = next.db;
  isFirebaseConfigured = next.configured;
  emitFirebaseChanged();
}

if (!isFirebaseConfigured && import.meta.env.DEV) {
  console.info(
    '[Firebase] Não configurado — cadastros ficam só neste navegador. Use Configurações → Servidor compartilhado.'
  );
}
