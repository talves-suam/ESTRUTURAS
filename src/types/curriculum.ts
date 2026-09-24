export type ModalityType = 'Presencial' | 'Semipresencial' | 'EAD';
export type StructureType = 'disciplinar' | 'modular';
export type StructureStatus = 'Ativa' | 'Em Desativação' | 'Em Elaboração' | 'Inativa';

export type DeliveryModalityFlag = 'presencial' | 'sincrono' | 'sincrono-mediado' | 'assincrono';

export interface ComponentDeliveryFlags {
  classroom: DeliveryModalityFlag;
  internship: DeliveryModalityFlag;
  complementaryActivity: DeliveryModalityFlag;
  extension: DeliveryModalityFlag;
}

export type PedagogicalNomenclature = 'cha' | 'zabala'; // 'cha' = Conhecimentos, Habilidades e Atitudes | 'zabala' = Conceitual, Procedimental e Atitudinal

export interface CompetencyCHA {
  id: string;
  name: string;
  category: 'conhecimento' | 'habilidade' | 'atitude' | 'conceitual' | 'procedimental' | 'atitudinal';
  hours?: number; // Carga horária opcional para cada competência
  description?: string;
}

export interface Discipline {
  id: string;
  code: string;
  name: string;
  type: 'Obrigatória' | 'Eletiva' | 'Optativa';
  evaluationForm?: string; // ex: "Resultado Final", "Nota (EAD)", "Avaliação Integrada"
  credits: number;
  minCreditsRequirement?: number; // C.R. Min
  minHoursRequirement?: number; // C.H. Min
  hours: number; // Carga Horária em horas-relógio (60 min) ou créditos * 20h
  modalityDelivery: DeliveryModalityFlag; // 'presencial' | 'sincrono' | 'sincrono-mediado' | 'assincrono'
  pedagogicalNature?: 'teorica' | 'pratica' | 'teorico-pratica';
  /** Marca divisão da CH presencial em Laboratório */
  hasLaboratory?: boolean;
  /** Marca divisão da CH presencial em Clínica */
  hasClinical?: boolean;
  /** Fração teórica da CH presencial (sempre presente quando presencial) */
  chTheoretical?: number;
  /** Fração laboratorial da CH presencial */
  chLaboratory?: number;
  /** Fração clínica da CH presencial */
  chClinical?: number;
  chPresential?: number; // Carga Horária Presencial (total = teórico + lab + clínica)
  chSync?: number; // Carga Horária Síncrona
  chSyncMediated?: number; // Carga Horária Síncrona-Mediada
  chAsync?: number; // Carga Horária Assíncrona
  isExtension?: boolean;
  isInternship?: boolean;
  isComplementary?: boolean;
  isFinalPaper?: boolean; // Trabalho de Conclusão de Curso
  flags?: ComponentDeliveryFlags;
  syllabus?: string;
}

export interface DisciplineChBreakdown {
  /** Total presencial (teórico + laboratório + clínica) — usado em % MEC */
  presential: number;
  theoretical: number;
  laboratory: number;
  clinical: number;
  sync: number;
  syncMediated: number;
  async: number;
  total: number;
}

function resolvePresentialSplit(
  presentialTotal: number,
  disc: Pick<Discipline, 'hasLaboratory' | 'hasClinical' | 'chTheoretical' | 'chLaboratory' | 'chClinical'>
): { theoretical: number; laboratory: number; clinical: number; presential: number } {
  const hasLab = !!disc.hasLaboratory;
  const hasClin = !!disc.hasClinical;
  const hasAnySplit = hasLab || hasClin;

  if (!hasAnySplit) {
    return {
      theoretical: presentialTotal,
      laboratory: 0,
      clinical: 0,
      presential: presentialTotal,
    };
  }

  const laboratory = hasLab ? Number(disc.chLaboratory) || 0 : 0;
  const clinical = hasClin ? Number(disc.chClinical) || 0 : 0;
  const theoreticalExplicit = disc.chTheoretical;
  const theoretical =
    theoreticalExplicit !== undefined
      ? Number(theoreticalExplicit) || 0
      : Math.max(0, presentialTotal - laboratory - clinical);

  const presential = theoretical + laboratory + clinical;
  return { theoretical, laboratory, clinical, presential };
}

/**
 * Redistribui a CH presencial ao marcar/desmarcar Lab e/ou Clínica.
 * Sem flags: tudo em teórico. Com flags: mantém partes ativas e o restante em teórico.
 */
export function applyPresentialSplitFlags(
  disc: Discipline,
  flags: { hasLaboratory?: boolean; hasClinical?: boolean }
): Discipline {
  const hasLaboratory = flags.hasLaboratory ?? !!disc.hasLaboratory;
  const hasClinical = flags.hasClinical ?? !!disc.hasClinical;
  const hours = Number(disc.hours) || 0;
  const isPresencial = disc.modalityDelivery === 'presencial';

  const prevLab = Number(disc.chLaboratory) || 0;
  const prevClin = Number(disc.chClinical) || 0;
  const prevTheo =
    disc.chTheoretical !== undefined
      ? Number(disc.chTheoretical) || 0
      : Math.max(0, hours - prevLab - prevClin);

  if (!hasLaboratory && !hasClinical) {
    const theoretical = isPresencial ? hours : prevTheo + prevLab + prevClin;
    return {
      ...disc,
      hasLaboratory: false,
      hasClinical: false,
      chTheoretical: theoretical || undefined,
      chLaboratory: undefined,
      chClinical: undefined,
      chPresential: isPresencial ? hours : theoretical || disc.chPresential,
    };
  }

  let theoretical = prevTheo;
  let laboratory = hasLaboratory ? prevLab : 0;
  let clinical = hasClinical ? prevClin : 0;

  // Horas de partes desmarcadas voltam para teórico
  if (!hasLaboratory && prevLab > 0) theoretical += prevLab;
  if (!hasClinical && prevClin > 0) theoretical += prevClin;

  // Ao marcar pela primeira vez sem valores, teórico absorve o total presencial
  if (hasLaboratory && disc.chLaboratory === undefined && !disc.hasLaboratory) {
    laboratory = 0;
  }
  if (hasClinical && disc.chClinical === undefined && !disc.hasClinical) {
    clinical = 0;
  }
  if (disc.chTheoretical === undefined && !disc.hasLaboratory && !disc.hasClinical) {
    theoretical = Math.max(0, hours - laboratory - clinical);
  }

  const sum = theoretical + laboratory + clinical;
  return {
    ...disc,
    hasLaboratory,
    hasClinical,
    chTheoretical: theoretical,
    chLaboratory: hasLaboratory ? laboratory : undefined,
    chClinical: hasClinical ? clinical : undefined,
    hours: isPresencial ? sum : disc.hours,
    chPresential: sum,
  };
}

/** Atualiza uma fração presencial e recalcula hours/chPresential. */
export function setPresentialPart(
  disc: Discipline,
  part: 'theoretical' | 'laboratory' | 'clinical',
  value: number
): Discipline {
  return applyExplicitChBreakdown(disc, {
    hasLaboratory: part === 'laboratory' ? true : !!disc.hasLaboratory,
    hasClinical: part === 'clinical' ? true : !!disc.hasClinical,
  }, { [part]: Math.max(0, Number(value) || 0) });
}

export type ExplicitChPart = 'theoretical' | 'laboratory' | 'clinical' | 'syncMediated' | 'async';

/**
 * Grava as frações de CH (como no relatório) e recalcula total/hours.
 * Sem valores explícitos, parte do breakdown atual.
 */
export function applyExplicitChBreakdown(
  disc: Discipline,
  flags: { hasLaboratory: boolean; hasClinical: boolean },
  patch: Partial<Record<ExplicitChPart, number>> = {}
): Discipline {
  const current = getDisciplineChBreakdown({
    ...disc,
    hasLaboratory: flags.hasLaboratory,
    hasClinical: flags.hasClinical,
  });
  const theoretical = patch.theoretical !== undefined ? Math.max(0, Number(patch.theoretical) || 0) : current.theoretical;
  const laboratory = flags.hasLaboratory
    ? patch.laboratory !== undefined
      ? Math.max(0, Number(patch.laboratory) || 0)
      : current.laboratory
    : 0;
  const clinical = flags.hasClinical
    ? patch.clinical !== undefined
      ? Math.max(0, Number(patch.clinical) || 0)
      : current.clinical
    : 0;
  const syncMediated =
    patch.syncMediated !== undefined
      ? Math.max(0, Number(patch.syncMediated) || 0)
      : current.syncMediated + (current.sync || 0);
  const asyncH =
    patch.async !== undefined ? Math.max(0, Number(patch.async) || 0) : current.async;

  const presential = theoretical + laboratory + clinical;
  const total = presential + syncMediated + asyncH;

  let modalityDelivery: DeliveryModalityFlag = disc.modalityDelivery;
  if (presential > 0 && syncMediated === 0 && asyncH === 0) modalityDelivery = 'presencial';
  else if (syncMediated > 0 && presential === 0 && asyncH === 0) modalityDelivery = 'sincrono-mediado';
  else if (asyncH > 0 && presential === 0 && syncMediated === 0) modalityDelivery = 'assincrono';
  else if (presential > 0) modalityDelivery = 'presencial';
  else if (syncMediated > 0) modalityDelivery = 'sincrono-mediado';
  else modalityDelivery = 'assincrono';

  return {
    ...disc,
    hasLaboratory: flags.hasLaboratory,
    hasClinical: flags.hasClinical,
    chTheoretical: theoretical,
    chLaboratory: flags.hasLaboratory ? laboratory : undefined,
    chClinical: flags.hasClinical ? clinical : undefined,
    chPresential: presential,
    chSync: 0,
    chSyncMediated: syncMediated,
    chAsync: asyncH,
    hours: total,
    modalityDelivery,
  };
}

export function getDisciplineChBreakdown(disc: Discipline): DisciplineChBreakdown {
  const hasExplicitModality =
    disc.chPresential !== undefined ||
    disc.chSync !== undefined ||
    disc.chSyncMediated !== undefined ||
    disc.chAsync !== undefined;

  const hasPresentialParts =
    disc.chTheoretical !== undefined ||
    disc.chLaboratory !== undefined ||
    disc.chClinical !== undefined;

  if (hasExplicitModality || hasPresentialParts) {
    const sync = Number(disc.chSync) || 0;
    const syncMediated = Number(disc.chSyncMediated) || 0;
    const async = Number(disc.chAsync) || 0;

    let presentialBase =
      disc.chPresential !== undefined
        ? Number(disc.chPresential) || 0
        : disc.modalityDelivery === 'presencial'
        ? Number(disc.hours) || Number(disc.credits || 0) * 20 || 0
        : 0;

    if (hasPresentialParts && disc.chPresential === undefined) {
      const theo = Number(disc.chTheoretical) || 0;
      const lab = disc.hasLaboratory ? Number(disc.chLaboratory) || 0 : 0;
      const clin = disc.hasClinical ? Number(disc.chClinical) || 0 : 0;
      if (theo + lab + clin > 0) presentialBase = theo + lab + clin;
    }

    const split = resolvePresentialSplit(presentialBase, disc);
    // Total SEMPRE = soma das modalidades explícitas (não preferir hours desatualizado).
    const partsTotal = split.presential + sync + syncMediated + async;
    const hoursFallback = Number(disc.hours) || 0;
    const total = partsTotal > 0 ? partsTotal : hoursFallback;

    return {
      presential: split.presential,
      theoretical: split.theoretical,
      laboratory: split.laboratory,
      clinical: split.clinical,
      sync,
      syncMediated,
      async,
      total,
    };
  }

  const hours = Number(disc.hours) || Number(disc.credits || 0) * 20 || 0;
  switch (disc.modalityDelivery) {
    case 'presencial': {
      const split = resolvePresentialSplit(hours, disc);
      return {
        presential: split.presential,
        theoretical: split.theoretical,
        laboratory: split.laboratory,
        clinical: split.clinical,
        sync: 0,
        syncMediated: 0,
        async: 0,
        total: hours,
      };
    }
    case 'sincrono':
      return {
        presential: 0,
        theoretical: 0,
        laboratory: 0,
        clinical: 0,
        sync: hours,
        syncMediated: 0,
        async: 0,
        total: hours,
      };
    case 'sincrono-mediado':
      return {
        presential: 0,
        theoretical: 0,
        laboratory: 0,
        clinical: 0,
        sync: 0,
        syncMediated: hours,
        async: 0,
        total: hours,
      };
    case 'assincrono':
      return {
        presential: 0,
        theoretical: 0,
        laboratory: 0,
        clinical: 0,
        sync: 0,
        syncMediated: 0,
        async: hours,
        total: hours,
      };
    default: {
      const split = resolvePresentialSplit(hours, disc);
      return {
        presential: split.presential,
        theoretical: split.theoretical,
        laboratory: split.laboratory,
        clinical: split.clinical,
        sync: 0,
        syncMediated: 0,
        async: 0,
        total: hours,
      };
    }
  }
}

/** Flags de divisão da CH presencial herdadas do curso / gravadas na estrutura. */
export function getPresentialSplitFlags(structure: Pick<CurriculumStructure, 'hasLaboratory' | 'hasClinical'>): {
  enabled: boolean;
  hasLaboratory: boolean;
  hasClinical: boolean;
} {
  const hasLaboratory = !!structure.hasLaboratory;
  const hasClinical = !!structure.hasClinical;
  return {
    enabled: hasLaboratory || hasClinical,
    hasLaboratory,
    hasClinical,
  };
}

/** True se o curso/estrutura marca Laboratório e/ou Clínica. */
export function structureHasPresentialSplit(
  structure: Pick<CurriculumStructure, 'hasLaboratory' | 'hasClinical'>
): boolean {
  return getPresentialSplitFlags(structure).enabled;
}

export function isFilledComponentCode(code?: string | null): boolean {
  return !!(code && String(code).trim());
}

/** Coluna de código do componente: só no disciplinar, e só se houver ao menos um código preenchido. */
export function showsComponentCodeColumn(
  structure: Pick<CurriculumStructure, 'structureType' | 'periods'>
): boolean {
  if (structure.structureType !== 'disciplinar') return false;
  return (structure.periods || []).some((period) =>
    (period.disciplines || []).some((disc) => isFilledComponentCode(disc.code))
  );
}

/** Aplica as flags do curso/estrutura no componente para o breakdown de CH. */
export function withStructurePresentialFlags(
  disc: Discipline,
  structure: Pick<CurriculumStructure, 'hasLaboratory' | 'hasClinical'>
): Discipline {
  const flags = getPresentialSplitFlags(structure);
  return {
    ...disc,
    hasLaboratory: flags.hasLaboratory,
    hasClinical: flags.hasClinical,
  };
}

export interface PeriodData {
  id: string;
  number: number;
  disciplines: Discipline[];
  totalCredits: number;
  totalHours: number;
}

export interface KnowledgeItem {
  id: string;
  name: string;
  category: 'saber-conceitual' | 'saber-procedimental' | 'saber-atitudinal' | 'conceitual' | 'procedimental' | 'atitudinal' | 'conhecimento' | 'habilidade' | 'atitude';
  hours: number;
  modalityDelivery: DeliveryModalityFlag; // 'presencial' | 'sincrono-mediado' | 'assincrono'
  hasLaboratory?: boolean;
  hasClinical?: boolean;
  chTheoretical?: number;
  chLaboratory?: number;
  chClinical?: number;
  chPresential?: number;
  chSyncMediated?: number;
  chAsync?: number;
  description?: string;
  competencyId?: string; // Opcional: vínculo com competência
  type?: Discipline['type'];
}

export interface ModuleData {
  id: string;
  number: number;
  code: string;
  branch?: string; // Ex: "" (tronco comum), "A", "B", "C" para ramificações como 9A, 9B, 10A, 10B
  branchName?: string; // Ex: "Trilha Psicologia Clínica e Saúde", "Trilha Gestão e Trabalho"
  /**
   * Competências pedagógicas do módulo (mapa de competências + impressão da estrutura).
   * Cada item pode vincular um ou mais aspectos do perfil do egresso.
   */
  competences?: ModuleCompetenceItem[];
  /** @deprecated use competences[] — mantido para leitura de dados legados (string[]) */
  competence?: string;
  parentModuleId?: string; // ID do módulo que antecede na árvore
  title: string;
  hours: number;
  /** Quantidade de encontros do módulo (estrutura modular). */
  meetings?: number;
  disciplines: Discipline[];
  competencies: CompetencyCHA[];
  knowledges?: KnowledgeItem[]; // Conhecimentos com regras de Presencial, Síncrono-Mediado e Assíncrono
  summary?: string;
  flags?: ComponentDeliveryFlags;
}

/** Trecho/aspecto do Perfil do Egresso (cadastrado separadamente). */
export interface GraduateProfileAspect {
  id: string;
  /** Rótulo curto (ex.: “Atuação ética”). */
  title?: string;
  /** Texto do trecho do perfil. */
  text: string;
}

/** Competência do módulo vinculada a aspectos do perfil do egresso. */
export interface ModuleCompetenceItem {
  id: string;
  text: string;
  /** IDs de GraduateProfileAspect. */
  aspectIds: string[];
}

function newCompetenceId(): string {
  return `mcomp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newAspectId(): string {
  return `asp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createGraduateProfileAspect(
  partial?: Partial<GraduateProfileAspect>
): GraduateProfileAspect {
  return {
    id: partial?.id || newAspectId(),
    title: (partial?.title || '').trim(),
    text: (partial?.text || '').trim(),
  };
}

export function createModuleCompetenceItem(
  partial?: Partial<ModuleCompetenceItem>
): ModuleCompetenceItem {
  return {
    id: partial?.id || newCompetenceId(),
    text: (partial?.text || '').trim(),
    aspectIds: [...(partial?.aspectIds || [])],
  };
}

/**
 * Normaliza competências do módulo (aceita legado string[] / competence string).
 * @param keepEmpty — no formulário, mantém rascunhos com texto vazio (botão Adicionar).
 */
export function normalizeModuleCompetences(
  mod: Pick<ModuleData, 'competences' | 'competence'>,
  options?: { keepEmpty?: boolean }
): ModuleCompetenceItem[] {
  const keepEmpty = !!options?.keepEmpty;
  const raw = mod.competences as unknown;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((item) => {
        if (typeof item === 'string') {
          const text = item.trim();
          return text ? createModuleCompetenceItem({ text }) : null;
        }
        if (item && typeof item === 'object') {
          const text = String((item as ModuleCompetenceItem).text || '').trim();
          const id = (item as ModuleCompetenceItem).id;
          const aspectIds = Array.isArray((item as ModuleCompetenceItem).aspectIds)
            ? (item as ModuleCompetenceItem).aspectIds.filter(Boolean)
            : [];
          if (!text) {
            // Rascunho do cadastro: só preserva se já tiver id
            if (!keepEmpty || !id) return null;
            return createModuleCompetenceItem({ id, text: '', aspectIds });
          }
          return createModuleCompetenceItem({ id, text, aspectIds });
        }
        return null;
      })
      .filter((x): x is ModuleCompetenceItem => !!x);
  }
  const legacy = (mod.competence || '').trim();
  return legacy ? [createModuleCompetenceItem({ text: legacy })] : [];
}

/** Textos das competências (compatibilidade com código que só precisa do texto). */
export function getModuleCompetences(
  mod: Pick<ModuleData, 'competences' | 'competence'>
): string[] {
  return normalizeModuleCompetences(mod).map((c) => c.text);
}

/** Aspectos do perfil: lista nova ou migração do texto único legado. */
export function getGraduateProfileAspects(
  structure: Pick<CurriculumStructure, 'graduateProfileAspects' | 'graduateProfile'>
): GraduateProfileAspect[] {
  const list = (structure.graduateProfileAspects || [])
    .map((a) => ({
      id: a.id || newAspectId(),
      title: (a.title || '').trim(),
      text: (a.text || '').trim(),
    }))
    .filter((a) => a.title || a.text);
  if (list.length > 0) return list;
  const legacy = (structure.graduateProfile || '').trim();
  return legacy ? [createGraduateProfileAspect({ title: 'Perfil do Egresso', text: legacy })] : [];
}

/** Texto corrido do perfil (junção dos aspectos) — impressão da estrutura. */
export function getGraduateProfilePlainText(
  structure: Pick<CurriculumStructure, 'graduateProfileAspects' | 'graduateProfile'>
): string {
  const aspects = getGraduateProfileAspects(structure);
  if (aspects.length === 0) return '';
  return aspects
    .map((a) => {
      const title = (a.title || '').trim();
      const text = (a.text || '').trim();
      if (title && text) return `${title}\n${text}`;
      return title || text;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Rótulo curto do aspecto para selos no mapa. */
export function aspectShortLabel(aspect: GraduateProfileAspect, index: number): string {
  const title = (aspect.title || '').trim();
  if (title) return title.length > 28 ? `${title.slice(0, 26)}…` : title;
  const text = (aspect.text || '').trim();
  if (text) return text.length > 28 ? `${text.slice(0, 26)}…` : text;
  return `Aspecto ${index + 1}`;
}

/** Paleta de cores para selos de aspectos (cíclica). */
export const ASPECT_BADGE_COLORS = [
  { bg: 'bg-sky-100', text: 'text-sky-900', border: 'border-sky-300', hex: '#0369a1' },
  { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300', hex: '#b45309' },
  { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300', hex: '#047857' },
  { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-300', hex: '#6d28d9' },
  { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300', hex: '#be123c' },
  { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-300', hex: '#0f766e' },
] as const;

export interface ComplementaryCategoryRule {
  groupCode: string;
  groupName: string;
  activities: {
    code: string;
    description: string;
    maxHours: number;
  }[];
}

export type RequirementLevel = 'Obrigatório' | 'Opcional' | 'Não Informado';

export interface DcnDocument {
  id: string;
  title: string; // Ex: "Resolução CNE/CES nº 4/2005 - DCN Administração"
  resolutionNumber: string; // Ex: "Resolução CNE/CES nº 4/2005"
  year?: string | number; // Ex: "2005"
  description?: string; // Ex: "Institui as Diretrizes Curriculares Nacionais do Curso de Graduação em Administração"
  pdfUrl: string; // Data URL (base64) ou URL direta para o PDF
  /** true quando o PDF ficou só no navegador (não enviamos data:URL ao Firestore). */
  pdfHostedLocally?: boolean;
  fileName?: string;
  fileSize?: string;
  isMain?: boolean;
  uploadedAt?: string;
}

/** Ato autorizativo vinculado a uma unidade/campus. */
export interface CampusAuthorizationAct {
  id: string;
  unitName: string; // ex.: "Bangu", "Bonsucesso", "Campo Grande" ou outra
  act: string; // texto do ato (Portaria…)
}

export interface Course {
  id: string;
  code: string;
  name: string;
  modality: ModalityType;
  cineBrasilCode: string;
  cineBrasilArea: string;
  activeDcn: string;
  dcnLink?: string; // URL / link oficial da DCN ativa
  authorizationAct?: string; // Espelho do ato ativo (compatibilidade)
  authorizationActs?: CampusAuthorizationAct[];
  activeAuthorizationActId?: string;
  dcns?: DcnDocument[]; // Suporte a múltiplas DCNs vinculadas com PDF
  minTotalHours: number;
  minPresentialPercent: number; // Ex: 60%
  maxEadPercent: number; // Ex: 40%
  minExtensionPercent: number; // Ex: 10%
  minInternshipHours?: number; // CH mínima de estágio (ausente = Não Informado)
  complementaryTotalHours?: number; // ausente = Não Informado
  complementaryModality?: DeliveryModalityFlag;
  extensionTotalHours?: number;
  extensionModality?: DeliveryModalityFlag;
  degrees?: 'Bacharelado' | 'Licenciatura' | 'Tecnológico' | 'Tecnólogo';
  internshipRequirement?: RequirementLevel;
  complementaryRequirement?: RequirementLevel;
  finalPaperRequirement?: RequirementLevel;
  coordinatorName?: string;
  coordinatorEmail?: string;
  totalSemesters?: number;
  /** Curso usa CH presencial de Laboratório (vale para toda estrutura) */
  hasLaboratory?: boolean;
  /** Curso usa CH presencial de Clínica (vale para toda estrutura) */
  hasClinical?: boolean;
  /** ISO — usado no merge local/remoto para não perder CH/DCN no sync */
  updatedAt?: string;
  createdAt?: string;
}

export interface CurriculumStructure {
  id: string;
  code: string; // Ex: TAM242, PAD231, PSI251
  courseId: string;
  courseName: string;
  modality: ModalityType;
  activeYearSemester: string; // Ex: "2024.2", "2025.1"
  structureType: StructureType; // 'disciplinar' ou 'modular'
  status: StructureStatus;
  hideStatus?: boolean; // Ocultar status (Ativa / Em Desativação) no relatório
  validityStart: string; // Data ou ano/semestre de vigência
  hideValidity: boolean; // Permitir ocultar vigência no relatório/impressão
  hideCompetenciesInReport?: boolean; // Ocultar saberes (CHA/Zabala) nos relatórios
  hideKnowledgesInReport?: boolean; // Ocultar conhecimentos nos relatórios
  /** Ocultar competências do módulo (PPC / perfil do egresso) nos relatórios. */
  hideModuleCompetencesInReport?: boolean;
  hideWorkloadSummaryInReport?: boolean; // Ocultar quadro de resumo de carga horária
  /** Ocultar quantidade de encontros nos módulos, no mapa e no quadro de encontros. */
  hideMeetings?: boolean;

  // Parâmetros de Carga Horária e Validação
  requiredTotalHours: number; // Carga horária total exigida
  minPresentialHoursPercent: number; // percentual de presencialidade mínimo informado (slider ou input)
  maxEadHoursPercent: number; // percentual de EAD informado (slider ou input)
  minExtensionPercent?: number; // Padrão 10%
  complementaryTotalHours?: number;
  complementaryModality?: DeliveryModalityFlag;
  extensionTotalHours?: number;
  extensionModality?: DeliveryModalityFlag;
  minInternshipHours?: number;
  internshipRequirement?: RequirementLevel;
  complementaryRequirement?: RequirementLevel;
  finalPaperRequirement?: RequirementLevel;
  degrees?: Course['degrees'];
  coordinatorName?: string;
  coordinatorEmail?: string;
  /** Herdado do curso: estrutura usa Laboratório na CH presencial */
  hasLaboratory?: boolean;
  /** Herdado do curso: estrutura usa Clínica na CH presencial */
  hasClinical?: boolean;
  /**
   * Inclui “Libras (Optativa)” no resumo de CH e no mapa (20h).
   * Não entra na CH total do curso.
   */
  hasLibrasOptativa?: boolean;

  // Totais Calculados em Tempo Real
  calculatedTotalHours: number;
  calculatedCoreHours?: number; // CH Obrigatória + Eletiva (conta para CH mínima do curso)
  calculatedPresentialHours: number;
  calculatedEadHours: number;
  calculatedExtensionHours: number;
  calculatedComplementaryHours: number;
  calculatedInternshipHours: number;
  totalCredits: number;

  // Coleções de Dados conforme o tipo
  periods?: PeriodData[]; // Preenchido se estrutura disciplinar
  modules?: ModuleData[]; // Preenchido se estrutura modular

  // Complementary activities setup
  complementaryActivities?: ComplementaryCategoryRule[];

  // Metadados adicionais
  institutionName?: string;
  campusName?: string;
  habilitation?: string;
  /** @deprecated use authorizationAct */
  recognitionPortaria?: string;
  /** Espelho do ato ativo (compatibilidade com exports/lote). */
  authorizationAct?: string;
  /** Atos autorizativos por unidade/campus. */
  authorizationActs?: CampusAuthorizationAct[];
  /** Id do ato que aparece no documento. */
  activeAuthorizationActId?: string;
  dcnRef?: string;
  dcns?: DcnDocument[]; // Documentos DCNs vinculados com visualização em PDF
  cineBrasilRef?: string;
  notes?: string;
  /**
   * @deprecated use graduateProfileAspects — texto único legado do perfil do egresso.
   */
  graduateProfile?: string;
  /** Trechos/aspectos do Perfil do Egresso (cada competência do módulo vincula a estes). */
  graduateProfileAspects?: GraduateProfileAspect[];

  createdAt: string;
  updatedAt: string;
}

/** Bloco de conteúdo da página de observações dos relatórios (título + texto). */
export interface ReportNoteBlock {
  id: string;
  title: string;
  text: string;
}

export interface AppSettings {
  pedagogicalNomenclature: PedagogicalNomenclature;
  hideValidityStartDefault: boolean;
  defaultEadPercentLimit: number;
  defaultPresentialPercentMin: number;
  defaultExtensionPercentMin: number;
  institutionName: string;
  campusDefault: string;
  /** Título da 3ª página (observações, regras e explicações da estrutura). */
  reportNotesTitle?: string;
  reportNotesDisciplinar?: ReportNoteBlock[];
  reportNotesModular?: ReportNoteBlock[];
}
