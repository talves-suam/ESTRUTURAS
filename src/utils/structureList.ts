/**
 * Helpers de ano / status para listagem de estruturas.
 */
import type { CurriculumStructure, StructureStatus } from '../types/curriculum';

/** Extrai o ano de "2023.1", "2024.2", etc. */
export function structureCalendarYear(
  structure: Pick<CurriculumStructure, 'activeYearSemester'>
): number | null {
  const raw = String(structure.activeYearSemester || '').trim();
  const match = raw.match(/(20\d{2}|19\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

const STATUS_SORT_RANK: Record<StructureStatus, number> = {
  Ativa: 0,
  'Em Desativação': 1,
  'Em Elaboração': 2,
  Inativa: 3,
};

export function compareStructureStatus(a: StructureStatus, b: StructureStatus): number {
  return (STATUS_SORT_RANK[a] ?? 9) - (STATUS_SORT_RANK[b] ?? 9);
}
