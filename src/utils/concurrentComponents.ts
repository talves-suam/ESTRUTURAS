import type {
  ConcurrentComponent,
  ConcurrentComponentKind,
  CurriculumStructure,
  DeliveryModalityFlag,
  Discipline,
  ModuleData,
} from '../types/curriculum';
import { getDisciplineChBreakdown, normalizeModuleCompetences } from '../types/curriculum';
import { formatModuleName, toRoman } from './roman';

/** Cabeçalho de bloco concomitante na planilha (sem “Módulo N”). */
export function parseConcurrentSectionHeader(
  line: string
): { title: string; kind: ConcurrentComponentKind } | null {
  const raw = String(line || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw || raw.length < 3) return null;
  if (/^m[oó]dulo\b/i.test(raw)) return null;
  if (
    /^(c[oó]digo|unidade\s+curricular|totais?|subtotais?|resumo|estrutura\s+curricular|carga\s+hor|m[ií]nimo|m[aá]ximo|identifica|tipo|presencial|a\s+dist)/i.test(
      raw
    )
  ) {
    return null;
  }

  if (/^est[aá]gio\b/i.test(raw) || /\best[aá]gio\s+supervisionado\b/i.test(raw)) {
    return { title: raw, kind: 'internship' };
  }
  if (
    /\bprojeto\s+final\b/i.test(raw) ||
    /\bprojeto\s+de\s+conclus/i.test(raw) ||
    /\btrabalho\s+de\s+conclus/i.test(raw) ||
    /\btcc\b/i.test(raw) ||
    /\bpr[eé]\s*projeto\b/i.test(raw)
  ) {
    return { title: raw, kind: 'finalPaper' };
  }
  return null;
}

export function concurrentKindLabel(kind: ConcurrentComponentKind): string {
  if (kind === 'internship') return 'Estágio';
  if (kind === 'finalPaper') return 'Projeto / TCC';
  return 'Concomitante';
}

/** Sugestão de módulos concomitantes após importar (últimos N do tronco). */
export function defaultConcurrentModuleNumbers(
  kind: ConcurrentComponentKind,
  modules: Pick<ModuleData, 'number' | 'branch'>[]
): number[] {
  const trunk = modules
    .filter((m) => !m.branch)
    .map((m) => m.number)
    .filter((n) => n > 0);
  const nums = [...new Set(trunk.length > 0 ? trunk : modules.map((m) => m.number))].sort(
    (a, b) => a - b
  );
  if (nums.length === 0) return [];
  if (kind === 'internship') return nums.slice(-3);
  if (kind === 'finalPaper') return nums.slice(-2);
  return nums.slice(-2);
}

export function formatConcurrentModuleList(
  numbers: number[],
  modules?: Pick<ModuleData, 'number' | 'title' | 'branch'>[]
): string {
  const sorted = [...new Set((numbers || []).filter((n) => n > 0))].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  return sorted
    .map((n) => {
      if (modules?.length) {
        const mod =
          modules.find((m) => m.number === n && !m.branch) ||
          modules.find((m) => m.number === n);
        if (mod) return formatModuleName(mod.number, '', mod.branch);
      }
      return `Módulo ${toRoman(n)}`;
    })
    .join(', ');
}

/** @deprecated use formatConcurrentModuleList */
export function formatConcurrentModuleRange(
  numbers: number[],
  modules?: Pick<ModuleData, 'number' | 'title' | 'branch'>[]
): string {
  return formatConcurrentModuleList(numbers, modules);
}

/** Legenda sob o nome do concomitante (uma vez, com um dos módulos permitidos). */
export function formatConcurrentWithCaption(
  numbers: number[],
  modules?: Pick<ModuleData, 'number' | 'title' | 'branch'>[]
): string {
  const list = formatConcurrentModuleList(numbers, modules);
  if (!list) {
    return 'Cursado concomitantemente com um dos módulos a seguir: (selecione)';
  }
  return `Cursado concomitantemente com um dos módulos a seguir: ${list}`;
}

export function concurrentToDiscipline(c: ConcurrentComponent): Discipline {
  const presential = Number(c.chPresential) || 0;
  const asyncH = Number(c.chAsync) || 0;
  const syncMed = Number(c.chSyncMediated) || 0;
  const hours = Number(c.hours) || presential + asyncH + syncMed;
  let modalityDelivery: DeliveryModalityFlag = c.modalityDelivery || 'presencial';
  if (!c.modalityDelivery) {
    if (presential > 0 && asyncH === 0 && syncMed === 0) modalityDelivery = 'presencial';
    else if (asyncH > 0 && presential === 0) modalityDelivery = 'assincrono';
    else if (presential > 0) modalityDelivery = 'presencial';
  }
  return {
    id: c.id,
    code: c.code || '',
    name: c.name || c.title,
    type: c.type || 'Obrigatória',
    credits: 0,
    hours,
    modalityDelivery,
    chPresential: presential || undefined,
    chSyncMediated: syncMed || undefined,
    chAsync: asyncH || undefined,
    isInternship: c.kind === 'internship' || undefined,
    isFinalPaper: c.kind === 'finalPaper' || undefined,
  };
}

export function getConcurrentChBreakdown(c: ConcurrentComponent) {
  return getDisciplineChBreakdown(concurrentToDiscipline(c));
}

export function createConcurrentComponent(
  partial?: Partial<ConcurrentComponent>
): ConcurrentComponent {
  return {
    id: partial?.id || `conc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: (partial?.title || '').trim() || 'Componente concomitante',
    kind: partial?.kind || 'other',
    code: partial?.code || '',
    name: (partial?.name || partial?.title || '').trim(),
    type: partial?.type || 'Obrigatória',
    hours: Number(partial?.hours) || 0,
    modalityDelivery: partial?.modalityDelivery,
    chPresential: partial?.chPresential,
    chSyncMediated: partial?.chSyncMediated,
    chAsync: partial?.chAsync,
    concurrentWithModuleNumbers: [...(partial?.concurrentWithModuleNumbers || [])],
    competences: partial?.competences ? [...partial.competences] : [],
    competencies: partial?.competencies ? [...partial.competencies] : [],
  };
}

/** Espelha concomitante como módulo sintético (mapas de competências / saberes). */
export function concurrentAsModuleData(c: ConcurrentComponent): ModuleData {
  return {
    id: c.id,
    number: 0,
    code: c.code || '',
    title: c.title || c.name,
    hours: Number(c.hours) || 0,
    disciplines: [concurrentToDiscipline(c)],
    competencies: [...(c.competencies || [])],
    competences: normalizeModuleCompetences({
      competences: c.competences,
    }),
    knowledges: [],
  };
}

export function assignDefaultConcurrentModules(
  items: ConcurrentComponent[],
  modules: ModuleData[]
): ConcurrentComponent[] {
  return items.map((c) => {
    if ((c.concurrentWithModuleNumbers || []).length > 0) return c;
    return {
      ...c,
      concurrentWithModuleNumbers: defaultConcurrentModuleNumbers(c.kind, modules),
    };
  });
}

export function structureConcurrentComponents(
  structure: Pick<CurriculumStructure, 'concurrentComponents'>
): ConcurrentComponent[] {
  return structure.concurrentComponents || [];
}
