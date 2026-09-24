/**
 * Perfis do site. Admin vê alerta de faturamento / métricas Spark.
 * Usuário comum (@unisuam.edu.br) usa o sistema normalmente, sem esses avisos.
 *
 * Edite a lista abaixo com o SEU e-mail corporativo (minúsculas).
 * Também aceita VITE_ADMIN_EMAILS=email1@unisuam.edu.br,email2@...
 */
export const SITE_ADMIN_EMAILS: readonly string[] = [
  'talves@unisuam.edu.br',
];

function envAdminEmails(): string[] {
  const raw = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined)?.trim() ?? '';
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSiteAdminEmail(email: string | null | undefined): boolean {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  const allow = new Set([
    ...SITE_ADMIN_EMAILS.map((e) => e.trim().toLowerCase()),
    ...envAdminEmails(),
  ]);
  return allow.has(normalized);
}

export type AppRole = 'admin' | 'user';

export function roleForEmail(email: string | null | undefined): AppRole {
  return isSiteAdminEmail(email) ? 'admin' : 'user';
}
