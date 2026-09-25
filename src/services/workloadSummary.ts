import {
  CurriculumStructure,
  Discipline,
  getDisciplineChBreakdown,
  getPresentialSplitFlags,
  withStructurePresentialFlags,
} from '../types/curriculum';
import { getModularComponents } from '../utils/modularComponents';
import { moduleCountsTowardStructureTotals } from '../utils/modularBranches';
import { formatModuleName, toRoman, formatBranchLabel } from '../utils/roman';

export interface WorkloadSummaryRow {
  id: string;
  label: string;
  /** Rótulo enxuto para o quadro horizontal (uma coluna por componente). */
  shortLabel?: string;
  hours: number;
  percent: number;
  emphasize?: boolean;
  /** Ex.: Libras — aparece no quadro mas não entra no total regulatório. */
  excludeFromTotal?: boolean;
}

/** CH fixa de Libras (Optativa) quando o flag da estrutura está ativo. */
export const LIBRAS_OPTATIVA_HOURS = 20;
export const LIBRAS_OPTATIVA_LABEL = 'Libras (Optativa)';

/** Rótulo do tipo do componente Libras conforme a organização curricular. */
export function librasOptativaKindLabel(
  structureType: CurriculumStructure['structureType'] | undefined
): string {
  return structureType === 'modular' ? 'Conhecimento' : 'Disciplina';
}

function collectDisciplines(structure: CurriculumStructure): Discipline[] {
  if (structure.structureType === 'disciplinar' && structure.periods) {
    return structure.periods
      .flatMap((p) => p.disciplines || [])
      .map((d) => withStructurePresentialFlags(d, structure));
  }
  if (structure.structureType === 'modular' && structure.modules) {
    const modules = structure.modules;
    return modules
      .filter((m) => moduleCountsTowardStructureTotals(m, modules))
      .flatMap((m) => getModularComponents(m))
      .map((d) => withStructurePresentialFlags(d, structure));
  }
  return [];
}

function isFinalPaper(disc: Discipline): boolean {
  if (disc.isFinalPaper) return true;
  const n = `${disc.name} ${disc.code}`.toLowerCase();
  return (
    /\btrabalho de conclus[aã]o\b/.test(n) ||
    /\bprojeto final de curso\b/.test(n) ||
    /\btcc\b/.test(n)
  );
}

export function inferNature(disc: Discipline): 'teorica' | 'pratica' | 'teorico-pratica' {
  if (disc.pedagogicalNature) return disc.pedagogicalNature;
  if (disc.isInternship) return 'pratica';
  const n = disc.name.toLowerCase();
  if (/te[oó]rico[-\s]?pr[aá]tic/.test(n)) return 'teorico-pratica';
  if (/pr[aá]tica|laborat[oó]rio|est[aá]gio|oficina/.test(n)) return 'pratica';
  return 'teorica';
}

function formatHours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Monta o quadro de resumo de carga horária.
 * Modalidades a distância: Síncrono-Mediado e Assíncrono (sem terminologia EAD).
 */
export function buildWorkloadSummary(structure: CurriculumStructure): {
  rows: WorkloadSummaryRow[];
  totalHours: number;
} {
  const disciplines = collectDisciplines(structure);

  let theoretical = 0;
  let laboratory = 0;
  let clinical = 0;
  let sync = 0;
  let syncMediated = 0;
  let asyncH = 0;
  let internship = 0;
  let extension = 0;
  let finalPaper = 0;
  let componentsTotal = 0;

  disciplines.forEach((disc) => {
    const bd = getDisciplineChBreakdown(disc);
    const hours = bd.total;
    componentsTotal += hours;

    theoretical += bd.theoretical;
    laboratory += bd.laboratory;
    clinical += bd.clinical;
    sync += bd.sync || 0;
    syncMediated += bd.syncMediated;
    asyncH += bd.async;

    if (disc.isInternship) internship += hours;
    if (disc.isExtension) extension += hours;
    if (isFinalPaper(disc)) finalPaper += hours;
  });

  const complementary = Number(structure.complementaryTotalHours) || 0;
  const extensionDeclared = Number(structure.extensionTotalHours) || 0;

  // Evita duplicar extensão se já veio das disciplinas e também do campo da estrutura
  const extensionFromFlags = extension;
  const extensionShown =
    extensionFromFlags > 0
      ? extensionFromFlags
      : extensionDeclared > 0
      ? extensionDeclared
      : 0;

  const complementaryMod = structure.complementaryModality || 'presencial';
  if (complementary > 0) {
    if (complementaryMod === 'presencial') {
      theoretical += complementary;
    } else if (complementaryMod === 'sincrono' || complementaryMod === 'sincrono-mediado') {
      syncMediated += complementary;
    } else asyncH += complementary;
  }

  const totalHours =
    Math.round(
      (componentsTotal +
        complementary +
        (extensionFromFlags > 0 ? 0 : extensionDeclared)) *
        100
    ) / 100 ||
    Number(structure.calculatedTotalHours) ||
    0;

  const pct = (h: number) => (totalHours > 0 ? (h / totalHours) * 100 : 0);

  // Síncrono foi retirado do cadastro — eventuais horas residuais entram em Síncrono-Mediado
  const syncMediatedShown = syncMediated + sync;
  const presentialTotal = theoretical + laboratory + clinical;
  const splitFlags = getPresentialSplitFlags(structure);
  const useSplit = splitFlags.enabled;

  const presentialRows: WorkloadSummaryRow[] = useSplit
    ? [
        {
          id: 'teorico',
          label: 'Presencial — Teórico',
          shortLabel: 'Teórico',
          hours: theoretical,
          percent: pct(theoretical),
        },
        ...(splitFlags.hasLaboratory
          ? [
              {
                id: 'laboratorio',
                label: 'Presencial — Laboratório',
                shortLabel: 'Laboratório',
                hours: laboratory,
                percent: pct(laboratory),
              } as WorkloadSummaryRow,
            ]
          : []),
        ...(splitFlags.hasClinical
          ? [
              {
                id: 'clinica',
                label: 'Presencial — Clínica',
                shortLabel: 'Clínica',
                hours: clinical,
                percent: pct(clinical),
              } as WorkloadSummaryRow,
            ]
          : []),
      ]
    : [
        {
          id: 'presencial',
          label: 'Presencial',
          shortLabel: 'Presencial',
          hours: presentialTotal,
          percent: pct(presentialTotal),
        },
      ];

  const rows: WorkloadSummaryRow[] = [
    ...presentialRows,
    {
      id: 'sincrono-mediado',
      label: 'Síncrono-Mediado',
      shortLabel: 'Sínc.-Mediado',
      hours: syncMediatedShown,
      percent: pct(syncMediatedShown),
    },
    {
      id: 'assincrono',
      label: 'Assíncrono',
      shortLabel: 'Assíncrono',
      hours: asyncH,
      percent: pct(asyncH),
    },
    {
      id: 'estagio',
      label: 'Estágio Supervisionado',
      shortLabel: 'Estágio',
      hours: internship,
      percent: pct(internship),
    },
    {
      id: 'extensao',
      label: 'Extensão',
      shortLabel: 'Extensão',
      hours: extensionShown,
      percent: pct(extensionShown),
    },
    {
      id: 'tcc',
      label: 'Trabalho de Conclusão de Curso',
      shortLabel: 'TCC',
      hours: finalPaper,
      percent: pct(finalPaper),
    },
    {
      id: 'complementares',
      label: 'Atividades Complementares',
      shortLabel: 'Ativ. Comp.',
      hours: complementary,
      percent: pct(complementary),
    },
    ...(structure.hasLibrasOptativa
      ? [
          {
            id: 'libras',
            label: `${librasOptativaKindLabel(structure.structureType)} — ${LIBRAS_OPTATIVA_LABEL}`,
            shortLabel: LIBRAS_OPTATIVA_LABEL,
            hours: LIBRAS_OPTATIVA_HOURS,
            percent: 0,
            excludeFromTotal: true,
          } as WorkloadSummaryRow,
        ]
      : []),
    {
      id: 'total',
      label: 'Total',
      shortLabel: 'Total',
      hours: totalHours,
      percent: 100,
      emphasize: true,
    },
  ];

  return { rows, totalHours };
}

export function formatWorkloadHours(value: number): string {
  return formatHours(value);
}

export function formatWorkloadPercent(value: number): string {
  return formatPercent(value);
}

export interface ModuleMeetingsRow {
  id: string;
  label: string;
  shortLabel: string;
  meetings: number;
  percent: number;
}

/** Quadro horizontal de encontros por módulo. Null se disciplinar, sem módulos ou oculto. */
export function showsModuleMeetings(
  structure: Pick<CurriculumStructure, 'structureType' | 'hideMeetings'>
): boolean {
  return structure.structureType === 'modular' && !structure.hideMeetings;
}

export function buildModuleMeetingsSummary(structure: CurriculumStructure): {
  rows: ModuleMeetingsRow[];
  totalMeetings: number;
} | null {
  if (!showsModuleMeetings(structure) || !structure.modules?.length) return null;

  const modules = [...structure.modules].sort((a, b) => {
    const byNum = a.number - b.number;
    if (byNum !== 0) return byNum;
    return (a.branch || '').localeCompare(b.branch || '', 'pt-BR');
  });

  const raw = modules.map((mod) => ({
    id: mod.id,
    label: formatModuleName(mod.number, mod.title, mod.branch),
    shortLabel: `${mod.branch ? `${formatBranchLabel(mod.branch)} · ` : ''}${toRoman(mod.number) || String(mod.number)}`.trim(),
    meetings: Math.max(0, Number(mod.meetings) || 0),
  }));

  const totalMeetings = raw.reduce((acc, r) => acc + r.meetings, 0);
  const rows: ModuleMeetingsRow[] = raw.map((r) => ({
    ...r,
    percent: totalMeetings > 0 ? (r.meetings / totalMeetings) * 100 : 0,
  }));

  return { rows, totalMeetings };
}

/**
 * Escala tipográfica dos quadros de CH / encontros conforme o nº de colunas
 * (mais módulos → fonte menor para caber lado a lado).
 */
export function summaryTableDensity(columnCount: number): {
  tableText: string;
  headerText: string;
  labelCol: string;
  cellPad: string;
  footerText: string;
  titleText: string;
  subtitleText: string;
} {
  if (columnCount >= 14) {
    return {
      tableText: 'text-[9px]',
      headerText: 'text-[7px]',
      labelCol: 'w-[3.25rem]',
      cellPad: 'px-0 py-1',
      footerText: 'text-[10px]',
      titleText: 'text-[11px]',
      subtitleText: 'text-[9px]',
    };
  }
  if (columnCount >= 11) {
    return {
      tableText: 'text-[10px]',
      headerText: 'text-[8px]',
      labelCol: 'w-[3.75rem]',
      cellPad: 'px-0.5 py-1',
      footerText: 'text-[11px]',
      titleText: 'text-[12px]',
      subtitleText: 'text-[10px]',
    };
  }
  if (columnCount >= 8) {
    return {
      tableText: 'text-[11px]',
      headerText: 'text-[8px]',
      labelCol: 'w-[4.25rem]',
      cellPad: 'px-0.5 py-1.5',
      footerText: 'text-[12px]',
      titleText: 'text-[13px]',
      subtitleText: 'text-[11px]',
    };
  }
  if (columnCount >= 6) {
    return {
      tableText: 'text-[12px]',
      headerText: 'text-[9px]',
      labelCol: 'w-[4.5rem]',
      cellPad: 'px-0.5 py-1.5',
      footerText: 'text-[12px]',
      titleText: 'text-[13px]',
      subtitleText: 'text-[11px]',
    };
  }
  return {
    tableText: 'text-[13px]',
    headerText: 'text-[10px]',
    labelCol: 'w-[7.5rem]',
    cellPad: 'px-1 py-1.5',
    footerText: 'text-[13px]',
    titleText: 'text-[14px]',
    subtitleText: 'text-[12px]',
  };
}

/**
 * Proporção CH × Encontros lado a lado.
 * Em telas xl+ divide em metades iguais; abaixo empilha (evita corte).
 */
export function summaryPairGridClass(_meetingColumnCount: number): string {
  return 'grid-cols-1 xl:grid-cols-2';
}

/**
 * Densidade tipográfica do quadro de CH (só pelas colunas dele).
 */
export function workloadSummaryDensity(
  componentColumnCount: number,
  _meetingColumnCount?: number
) {
  return summaryTableDensity(componentColumnCount);
}
