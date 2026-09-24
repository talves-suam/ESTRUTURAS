/**
 * Cliente HTTP da API PHP (MySQL no servidor interno).
 * Em localhost sem Apache/PHP, as chamadas falham e o app usa só o cache do navegador.
 */
const API_CHANGED_EVENT = 'unisuam-api-changed';

export type ApiUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isLocalBypass: boolean;
};

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

let serverReachable: boolean | null = null;

export function getApiBaseUrl(): string {
  // Relativo ao site (./api/ com base './' do Vite)
  if (typeof window === 'undefined') return './api/';
  const custom = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (custom) return custom.endsWith('/') ? custom : `${custom}/`;
  return new URL('api/', window.location.href).href;
}

export function isServerOnline(): boolean {
  return serverReachable === true;
}

export function notifyApiChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(API_CHANGED_EVENT));
  }
}

export function onApiStatusChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(API_CHANGED_EVENT, handler);
  return () => window.removeEventListener(API_CHANGED_EVENT, handler);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseJson<T>(res: Response): Promise<ApiEnvelope<T>> {
  const text = await res.text();
  if (!text) {
    return { ok: res.ok, data: undefined, error: res.ok ? undefined : `HTTP ${res.status}` };
  }
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(
      `Resposta inválida da API (${res.status}). Confira se o PHP está no ar em /api/.`,
      res.status
    );
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = new URL(path.replace(/^\//, ''), getApiBaseUrl()).href;
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    serverReachable = false;
    notifyApiChanged();
    throw new ApiError('Não foi possível alcançar a API do servidor interno.');
  }

  const envelope = await parseJson<T>(res);
  if (!res.ok || envelope.ok === false) {
    if (res.status >= 500) {
      serverReachable = false;
      notifyApiChanged();
    }
    throw new ApiError(envelope.error || `Erro HTTP ${res.status}`, res.status);
  }
  return envelope.data as T;
}

export async function probeServerHealth(): Promise<boolean> {
  try {
    const data = await apiRequest<{ ok?: boolean; tables?: Record<string, boolean> }>('health.php');
    const tables = data?.tables;
    const ready =
      !tables ||
      (tables.curriculum_structures && tables.curriculum_courses && tables.app_settings);
    serverReachable = Boolean(ready);
  } catch {
    serverReachable = false;
  }
  notifyApiChanged();
  return serverReachable;
}

export async function fetchStructuresList<T>(): Promise<T[] | null> {
  try {
    const data = await apiRequest<T[]>('structures.php');
    serverReachable = true;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw err;
    console.warn('API structures indisponível, usando cache local', err);
    return null;
  }
}

export async function upsertStructure<T extends { id: string }>(item: T): Promise<T> {
  return apiRequest<T>('structures.php', {
    method: 'PUT',
    body: JSON.stringify(item),
  });
}

export async function deleteStructureRemote(id: string): Promise<void> {
  await apiRequest(`structures.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchCoursesList<T>(): Promise<T[] | null> {
  try {
    const data = await apiRequest<T[]>('courses.php');
    serverReachable = true;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw err;
    console.warn('API courses indisponível, usando cache local', err);
    return null;
  }
}

export async function upsertCourse<T extends { id: string }>(item: T): Promise<T> {
  return apiRequest<T>('courses.php', {
    method: 'PUT',
    body: JSON.stringify(item),
  });
}

export async function deleteCourseRemote(id: string): Promise<void> {
  await apiRequest(`courses.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchSettingsRemote<T>(): Promise<T | null> {
  try {
    const data = await apiRequest<T | null>('settings.php');
    serverReachable = true;
    return data ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw err;
    console.warn('API settings indisponível, usando cache local', err);
    return null;
  }
}

export async function upsertSettingsRemote<T extends object>(item: T): Promise<T> {
  return apiRequest<T>('settings.php', {
    method: 'PUT',
    body: JSON.stringify(item),
  });
}

export async function fetchAuthPublicConfig(): Promise<{
  googleClientId: string;
  allowedEmailDomain: string;
  allowLocalLogin: boolean;
}> {
  try {
    return await apiRequest('auth/public_config.php');
  } catch {
    return {
      googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '',
      allowedEmailDomain: 'unisuam.edu.br',
      allowLocalLogin: true,
    };
  }
}

export async function apiLoginLocal(email: string, password: string): Promise<ApiUser> {
  return apiRequest<ApiUser>('auth/login_local.php', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiLoginGoogle(credential: string): Promise<ApiUser> {
  return apiRequest<ApiUser>('auth/login_google.php', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export async function apiLogout(): Promise<void> {
  try {
    await apiRequest('auth/logout.php', { method: 'POST', body: '{}' });
  } catch {
    /* ignore */
  }
}

export async function apiMe(): Promise<ApiUser | null> {
  try {
    return await apiRequest<ApiUser | null>('auth/me.php');
  } catch {
    return null;
  }
}
