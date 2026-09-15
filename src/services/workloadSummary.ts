import {
  CurriculumStructure,
  Discipline,
  getDisciplineChBreakdown,
} from '../types/curriculum';

export interface WorkloadSummaryRow {
  id: string;
  label: string;
  hours: number;
  percent: number;
  emphasize?: boolean;
}

function collectDisciplines(structure: CurriculumStructure): Discipline[] {
  if (structure.structureType === 'disciplinar' && structure.periods) {
    return structure.periods.flatMap((p) => p.disciplines || []);
  }
  if (structure.structureType === 'modular' && structure.modules) {
    const fromDisc = structure.modules.flatMap((m) => m.disciplines || []);
    if (fromDisc.length > 0) return fromDisc;

    // Fallback: conhecimentos do módulo como componentes de CH
    return structure.modules.flatMap((m) =>
      (m.knowledges || []).map(
        (k): Discipline => ({
          id: k.id,
          code: m.code || '',
          name: k.name,
          type: 'Obrigatória',
          credits: 0,
          hours: k.hours || 0,
          modalityDelivery: k.modalityDelivery,
          chPresential: k.chPresential,
          chSyncMediated: k.chSyncMediated,
          chAsync: k.chAsync,
        })
      )
    );
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

  let presential = 0;
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

    presential += bd.presential;
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

  const complementaryMod = structure.complementaryModality || 'assincrono';
  if (complementary > 0) {
    if (complementaryMod === 'presencial') presential += complementary;
    else if (complementaryMod === 'sincrono' || complementaryMod === 'sincrono-mediado') {
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

  const rows: WorkloadSummaryRow[] = [
    { id: 'presencial', label: 'Presencial', hours: presential, percent: pct(presential) },
    {
      id: 'sincrono-mediado',
      label: 'Síncrono-Mediado',
      hours: syncMediatedShown,
      percent: pct(syncMediatedShown),
    },
    { id: 'assincrono', label: 'Assíncrono', hours: asyncH, percent: pct(asyncH) },
    {
      id: 'estagio',
      label: 'Estágio Supervisionado',
      hours: internship,
      percent: pct(internship),
    },
    { id: 'extensao', label: 'Extensão', hours: extensionShown, percent: pct(extensionShown) },
    {
      id: 'tcc',
      label: 'Trabalho de Conclusão de Curso',
      hours: finalPaper,
      percent: pct(finalPaper),
    },
    {
      id: 'complementares',
      label: 'Atividades Complementares',
      hours: complementary,
      percent: pct(complementary),
    },
    {
      id: 'total',
      label: 'Total',
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
