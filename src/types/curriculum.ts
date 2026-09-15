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
  chPresential?: number; // Carga Horária Presencial
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
  presential: number;
  sync: number;
  syncMediated: number;
  async: number;
  total: number;
}

export function getDisciplineChBreakdown(disc: Discipline): DisciplineChBreakdown {
  const hasExplicit =
    disc.chPresential !== undefined ||
    disc.chSync !== undefined ||
    disc.chSyncMediated !== undefined ||
    disc.chAsync !== undefined;

  if (hasExplicit) {
    const presential = Number(disc.chPresential) || 0;
    const sync = Number(disc.chSync) || 0;
    const syncMediated = Number(disc.chSyncMediated) || 0;
    const async = Number(disc.chAsync) || 0;
    const total = disc.hours || presential + sync + syncMediated + async;
    return { presential, sync, syncMediated, async, total };
  }

  const hours = Number(disc.hours) || Number(disc.credits || 0) * 20 || 0;
  switch (disc.modalityDelivery) {
    case 'presencial':
      return { presential: hours, sync: 0, syncMediated: 0, async: 0, total: hours };
    case 'sincrono':
      return { presential: 0, sync: hours, syncMediated: 0, async: 0, total: hours };
    case 'sincrono-mediado':
      return { presential: 0, sync: 0, syncMediated: hours, async: 0, total: hours };
    case 'assincrono':
      return { presential: 0, sync: 0, syncMediated: 0, async: hours, total: hours };
    default:
      return { presential: hours, sync: 0, syncMediated: 0, async: 0, total: hours };
  }
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
  chPresential?: number;
  chSyncMediated?: number;
  chAsync?: number;
  description?: string;
  competencyId?: string; // Opcional: vínculo com competência
}

export interface ModuleData {
  id: string;
  number: number;
  code: string;
  branch?: string; // Ex: "" (tronco comum), "A", "B", "C" para ramificações como 9A, 9B, 10A, 10B
  branchName?: string; // Ex: "Trilha Psicologia Clínica e Saúde", "Trilha Gestão e Trabalho"
  competence?: string; // Competência do módulo (exibida como subtítulo, só o valor)
  parentModuleId?: string; // ID do módulo que antecede na árvore
  title: string;
  hours: number;
  disciplines: Discipline[];
  competencies: CompetencyCHA[];
  knowledges?: KnowledgeItem[]; // Conhecimentos com regras de Presencial, Síncrono-Mediado e Assíncrono
  summary?: string;
  flags?: ComponentDeliveryFlags;
}

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
  fileName?: string;
  fileSize?: string;
  isMain?: boolean;
  uploadedAt?: string;
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
  authorizationAct?: string; // Ato autorizativo do curso
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
  hideCompetenciesInReport?: boolean; // Ocultar competências/saberes nos relatórios
  hideKnowledgesInReport?: boolean; // Ocultar conhecimentos nos relatórios
  hideWorkloadSummaryInReport?: boolean; // Ocultar quadro de resumo de carga horária

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
  authorizationAct?: string; // Ato autorizativo do curso/estrutura
  dcnRef?: string;
  dcns?: DcnDocument[]; // Documentos DCNs vinculados com visualização em PDF
  cineBrasilRef?: string;
  notes?: string;

  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  pedagogicalNomenclature: PedagogicalNomenclature;
  hideValidityStartDefault: boolean;
  defaultEadPercentLimit: number;
  defaultPresentialPercentMin: number;
  defaultExtensionPercentMin: number;
  institutionName: string;
  campusDefault: string;
}
