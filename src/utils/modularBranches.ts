/**
 * Trilhas paralelas (A/B/…) são equivalentes: o aluno cursa só uma.
 * No cálculo de CH do curso conta-se o tronco comum + uma trilha representativa (preferência: A).
 */
import { fromRoman } from './roman';

export function normalizeBranchKey(branch?: string | null): string {
  return String(branch || '')
    .trim()
    .toUpperCase();
}

/** Chaves de trilha presentes (sem tronco). */
export function listBranchKeys(modules: { branch?: string | null }[]): string[] {
  const keys = new Set<string>();
  for (const m of modules) {
    const key = normalizeBranchKey(m.branch);
    if (key) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Trilha usada no total regulatório / CH do curso.
 * Preferência: A; senão a primeira em ordem alfabética.
 */
export function getWorkloadBranchKey(
  modules: { branch?: string | null }[]
): string | null {
  const keys = listBranchKeys(modules);
  if (keys.length === 0) return null;
  if (keys.includes('A')) return 'A';
  return keys[0];
}

/** Módulo entra no total de CH/créditos do curso? Tronco sempre; trilha só a representativa. */
export function moduleCountsTowardStructureTotals(
  module: { branch?: string | null },
  modules: { branch?: string | null }[]
): boolean {
  const key = normalizeBranchKey(module.branch);
  if (!key) return true;
  const representative = getWorkloadBranchKey(modules);
  return representative != null && key === representative;
}

/**
 * Converte token de ênfase/trilha em chave A/B/C…
 * Ex.: "I"→A, "II"→B, "1"→A, "A"→A
 */
export function enfaseTokenToBranchKey(token: string): string | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  // Romano ou número (I/II/III… e também I/V/X isolados) → 1º=A, 2º=B…
  if (/^\d+$/i.test(raw) || /^[ivxlcdm]+$/i.test(raw)) {
    const n = fromRoman(raw);
    if (n >= 1 && n <= 26) return String.fromCharCode(64 + n);
    return null;
  }
  if (/^[A-Za-z]$/.test(raw)) return raw.toUpperCase();
  return null;
}

/** Cabeçalho "ÊNFASE I - …" / "ENFASE 2 — …" / "Trilha A - …" */
export const ENFASE_OR_TRILHA_HEADER =
  /^(?:[eê]nfases?|trilhas?)\s+([ivxlcdm]+|\d+|[a-z])\s*[—–:\-.]?\s*(.*)$/i;

export type ParsedEnfaseHeader = {
  branch: string;
  branchName: string;
};

export function parseEnfaseOrTrilhaHeader(line: string): ParsedEnfaseHeader | null {
  // Usa só a 1ª linha (célula pode vir com ênfase + módulo juntos)
  const first = String(line || '')
    .split(/\r?\n/)[0]
    .trim();
  const m = first.match(ENFASE_OR_TRILHA_HEADER);
  if (!m) return null;
  const branch = enfaseTokenToBranchKey(m[1]);
  if (!branch) return null;
  // Se o resto ainda trouxer "MÓDULO…", corta
  let rest = (m[2] || '').replace(/\s+/g, ' ').trim();
  rest = rest.replace(/\s*m[oó]dulo\s+.*$/i, '').trim();
  return {
    branch,
    branchName: rest || `Ênfase ${m[1].toUpperCase()}`,
  };
}

/** Cabeçalho de módulo: "MÓDULO VIII - …" ou "MÓDULO VIIIA - …" / "MÓDULO VIII-A - …" */
export type ParsedModuleHeader = {
  number: number;
  branchSuffix?: string;
  title: string;
};

/** Romano 1–39 no início da string (alternatives do maior para o menor). */
const LEADING_MODULE_NUMBER =
  /^((?:xxxix|xxxviii|xxxvii|xxxvi|xxxv|xxxiv|xxxiii|xxxii|xxxi|xxx|xxix|xxviii|xxvii|xxvi|xxv|xxiv|xxiii|xxii|xxi|xx|xix|xviii|xvii|xvi|xv|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)|\d+)(.*)$/i;

export function parseModuleHeaderLine(line: string): ParsedModuleHeader | null {
  const raw = String(line || '').trim();
  const head = raw.match(/^m[oó]dulo\s+(.+)$/i);
  if (!head) return null;

  let rest = head[1].trim();
  const numMatch = rest.match(LEADING_MODULE_NUMBER);
  if (!numMatch) return null;
  const number = fromRoman(numMatch[1]);
  if (!number) return null;
  rest = (numMatch[2] || '').trim();

  let branchSuffix: string | undefined;

  // VIII-A - título  |  VIII - A - título
  let m = rest.match(/^[-–—]\s*([a-z])(?:\s*[—–:.\-]\s*|\s+|$)(.*)$/i);
  if (m) {
    branchSuffix = m[1].toUpperCase();
    rest = (m[2] || '').trim();
  } else {
    // VIIIA - título  |  VIII A - título (letra isolada + separador/fim)
    m = rest.match(/^([a-z])(?:\s*[—–:.\-]\s*|\s+|$)(.*)$/i);
    if (m) {
      branchSuffix = m[1].toUpperCase();
      rest = (m[2] || '').trim();
    } else {
      // Título comum: " - AVALIAÇÃO…" (não é trilha)
      rest = rest.replace(/^[—–:.\-]\s*/, '').trim();
    }
  }

  return {
    number,
    branchSuffix,
    title: rest.replace(/\s+/g, ' ').trim(),
  };
}

/** Encadeia parentModuleId: tronco linear; cada trilha parte do fim do tronco. */
export function linkModularParents(
  modules: { id: string; number: number; branch?: string; parentModuleId?: string }[]
): void {
  const trunk = modules
    .filter((m) => !normalizeBranchKey(m.branch))
    .sort((a, b) => a.number - b.number);
  trunk.forEach((m, i) => {
    m.parentModuleId = i > 0 ? trunk[i - 1].id : undefined;
  });
  const lastTrunkId = trunk.length > 0 ? trunk[trunk.length - 1].id : undefined;

  const byBranch = new Map<string, typeof modules>();
  for (const m of modules) {
    const key = normalizeBranchKey(m.branch);
    if (!key) continue;
    const list = byBranch.get(key) || [];
    list.push(m);
    byBranch.set(key, list);
  }
  for (const list of byBranch.values()) {
    list.sort((a, b) => a.number - b.number);
    list.forEach((m, i) => {
      m.parentModuleId = i > 0 ? list[i - 1].id : lastTrunkId;
    });
  }
}
