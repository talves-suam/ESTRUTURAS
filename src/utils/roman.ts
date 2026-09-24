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

/** Rótulo de ênfase a partir da chave interna A/B/C… → "Ênfase I", "Ênfase II". */
export function formatBranchLabel(branch?: string | null): string {
  const key = String(branch || '')
    .trim()
    .toUpperCase();
  if (!key) return '';
  if (/^[A-Z]$/.test(key)) {
    const n = key.charCodeAt(0) - 64;
    return `Ênfase ${toRoman(n)}`;
  }
  return `Ênfase ${key}`;
}

/** Rótulo de módulo com número romano (ex.: "Módulo III") — sem sufixo A/B. */
export function formatModuleLabel(number: number, _branch?: string, prefix = 'Módulo'): string {
  return `${prefix} ${toRoman(number)}`;
}

/** Conectores que ficam em minúsculas no meio do título (pt-BR). */
const MODULE_TITLE_SMALL_WORDS = new Set([
  'a',
  'as',
  'o',
  'os',
  'e',
  'ou',
  'de',
  'da',
  'do',
  'das',
  'dos',
  'em',
  'na',
  'no',
  'nas',
  'nos',
  'ao',
  'aos',
  'à',
  'às',
  'por',
  'para',
  'com',
  'sem',
  'sob',
  'sobre',
  'entre',
  'um',
  'uma',
  'uns',
  'umas',
]);

/**
 * Título de módulo em formato legível: primeira letra de cada palavra maiúscula.
 * Corrige textos vindos de PDF/planilha em CAIXA ALTA.
 * Ex.: "IDENTIDADE VISUAL E CULTURA" → "Identidade Visual e Cultura"
 */
export function normalizeModuleTitle(title?: string | null): string {
  const raw = String(title || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  return raw
    .split(' ')
    .map((word, wordIndex) => {
      if (!word) return word;
      return word
        .split('-')
        .map((chunk, chunkIndex) => {
          if (!chunk) return chunk;
          const lower = chunk.toLocaleLowerCase('pt-BR');
          const keepSmall =
            wordIndex > 0 && chunkIndex === 0 && MODULE_TITLE_SMALL_WORDS.has(lower);
          if (keepSmall) return lower;
          return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
        })
        .join('-');
    })
    .join(' ');
}

/**
 * Nome completo do módulo para UI e relatórios.
 * Ex.: "Módulo I - Identidade Visual"
 * Com ênfase: "Ênfase I - Módulo VIII - Avaliação Psicológica"
 */
export function formatModuleName(
  number: number,
  title?: string,
  branch?: string,
  prefix = 'Módulo'
): string {
  const modLabel = formatModuleLabel(number, undefined, prefix);
  const cleanTitle = normalizeModuleTitle(title);
  const enfase = formatBranchLabel(branch);
  if (enfase && cleanTitle) return `${enfase} - ${modLabel} - ${cleanTitle}`;
  if (enfase) return `${enfase} - ${modLabel}`;
  if (cleanTitle) return `${modLabel} - ${cleanTitle}`;
  return modLabel;
}
