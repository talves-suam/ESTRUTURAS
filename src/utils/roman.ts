/** Converte inteiro positivo em algarismo romano (até 39 — suficiente para módulos). */
export function toRoman(num: number): string {
  const n0 = Math.floor(Number(num) || 0);
  if (n0 <= 0) return '';
  const vals = [10, 9, 5, 4, 1];
  const syms = ['X', 'IX', 'V', 'IV', 'I'];
  let n = Math.min(39, n0);
  let out = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      out += syms[i];
      n -= vals[i];
    }
  }
  return out;
}

/** Aceita romano (I, II, IV…) ou arábico ("3") e devolve o inteiro. */
export function fromRoman(value: string | number): number {
  if (typeof value === 'number') {
    return Math.max(1, Math.floor(value) || 1);
  }
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 1;
  if (/^\d+$/.test(raw)) return Math.max(1, parseInt(raw, 10) || 1);

  const map: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  let prev = 0;
  for (let i = raw.length - 1; i >= 0; i--) {
    const cur = map[raw[i]];
    if (!cur) continue;
    if (cur < prev) total -= cur;
    else total += cur;
    prev = cur;
  }
  return Math.max(1, total || 1);
}

/** Rótulo de módulo com número romano (ex.: "Módulo III", "Módulo IIA"). */
export function formatModuleLabel(number: number, branch?: string, prefix = 'Módulo'): string {
  return `${prefix} ${toRoman(number)}${branch || ''}`;
}

/**
 * Nome completo do módulo para UI e relatórios.
 * Ex.: "Módulo I - Identidade Visual"
 */
export function formatModuleName(
  number: number,
  title?: string,
  branch?: string,
  prefix = 'Módulo'
): string {
  const label = formatModuleLabel(number, branch, prefix);
  const cleanTitle = (title || '').trim();
  return cleanTitle ? `${label} - ${cleanTitle}` : label;
}
