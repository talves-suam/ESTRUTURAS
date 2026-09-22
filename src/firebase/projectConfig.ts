/**
 * Configuração oficial do servidor UNISUAM — embutida no código.
 * Todo usuário conecta automaticamente ao abrir o sistema.
 *
 * A API Key web do Firebase é pública por design; a proteção dos dados é
 * feita pelas regras do Firestore.
 */
export type EmbeddedFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId?: string;
};

export const BUILT_IN_FIREBASE_CONFIG: EmbeddedFirebaseConfig = {
  apiKey: 'AIzaSyC0Pc0JKxUEjxnuiv0Zms-f9FCXlfTfKbw',
  authDomain: 'estrutura-ef445.firebaseapp.com',
  projectId: 'estrutura-ef445',
  storageBucket: 'estrutura-ef445.firebasestorage.app',
  messagingSenderId: '260300275198',
  appId: '1:260300275198:web:3b861ba14c5498fa74d4af',
  firestoreDatabaseId: '',
};

export function hasBuiltInFirebaseConfig(): boolean {
  const c = BUILT_IN_FIREBASE_CONFIG;
  return Boolean(c.apiKey?.trim() && c.projectId?.trim() && c.appId?.trim());
}

export function getBuiltInFirebaseConfig(): EmbeddedFirebaseConfig | null {
  if (!hasBuiltInFirebaseConfig()) return null;
  const c = BUILT_IN_FIREBASE_CONFIG;
  return {
    apiKey: c.apiKey.trim(),
    authDomain: (c.authDomain || `${c.projectId}.firebaseapp.com`).trim(),
    projectId: c.projectId.trim(),
    storageBucket: c.storageBucket?.trim() || undefined,
    messagingSenderId: c.messagingSenderId?.trim() || undefined,
    appId: c.appId.trim(),
    firestoreDatabaseId: c.firestoreDatabaseId?.trim() || undefined,
  };
}
