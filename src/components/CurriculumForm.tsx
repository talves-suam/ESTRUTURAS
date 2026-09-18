import React, { useState, useEffect, useRef } from 'react';
import { 
  CurriculumStructure, 
  Course, 
  AppSettings, 
  PeriodData, 
  ModuleData, 
  Discipline, 
  KnowledgeItem,
  CompetencyCHA,
  DeliveryModalityFlag,
  ComponentDeliveryFlags,
  DcnDocument,
  applyExplicitChBreakdown,
  getDisciplineChBreakdown,
  ExplicitChPart,
} from '../types/curriculum';
import { getSaberesLabels, defaultSaberCategory } from '../utils/nomenclature';
import { toRoman, fromRoman, formatModuleName } from '../utils/roman';
import { summarizeCourseDcns, generateCourseCodeFromName, courseSelectOptions, resolveCourseByNameAndModality, courseBaseName, stripAcademicCoursePrefix, findCourseByNameAndModality, findCourseTemplateByName, formatCineBrasilLabel } from '../utils/courseBatch';
import type { RequirementLevel } from '../types/curriculum';
import {
  extractTextFromPdf,
  extractTextFromSpreadsheet,
  parseSagaReportText,
} from '../services/sagaImportService';
import {
  Save, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  GitBranch, 
  BookOpen, 
  Sliders, 
  HelpCircle,
  Clock,
  Layers,
  FileText,
  Eraser,
  Upload,
  Loader2,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';
import { calculateStructureTotals } from '../services/curriculumService';
import { DcnViewerModal } from './DcnViewerModal';
import { syncModuleKnowledgesToDisciplines } from '../utils/modularComponents';

interface CurriculumFormProps {
  initialData?: CurriculumStructure | null;
  courses: Course[];
  settings: AppSettings;
  onSave: (structure: CurriculumStructure) => Promise<void>;
  onCancel: () => void;
  onAddCourse: (newCourse: Course) => Promise<void>;
}

type SplitFlags = { hasLaboratory: boolean; hasClinical: boolean };

type ListDrag =
  | { kind: 'discipline'; periodId: string; from: number }
  | { kind: 'knowledge'; moduleId: string; from: number };

type ListDragOver = {
  kind: ListDrag['kind'];
  parentId: string;
  index: number;
};

function moveItemInList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function knowledgeAsDiscipline(know: KnowledgeItem, flags: SplitFlags): Discipline {
  return {
    id: know.id,
    code: '',
    name: know.name,
    type: 'Obrigatória',
    credits: 0,
    hours: know.hours,
    modalityDelivery: know.modalityDelivery,
    hasLaboratory: flags.hasLaboratory,
    hasClinical: flags.hasClinical,
    chTheoretical: know.chTheoretical,
    chLaboratory: know.chLaboratory,
    chClinical: know.chClinical,
    chPresential: know.chPresential,
    chSyncMediated: know.chSyncMediated,
    chAsync: know.chAsync,
  };
}

function knowledgeFromDiscipline(know: KnowledgeItem, next: Discipline): KnowledgeItem {
  return {
    ...know,
    hours: next.hours,
    modalityDelivery: next.modalityDelivery,
    hasLaboratory: next.hasLaboratory,
    hasClinical: next.hasClinical,
    chTheoretical: next.chTheoretical,
    chLaboratory: next.chLaboratory,
    chClinical: next.chClinical,
    chPresential: next.chPresential,
    chSyncMediated: next.chSyncMediated,
    chAsync: next.chAsync,
  };
}

function ChSplitFields({
  disc,
  flags,
  onChange,
  compact = false,
}: {
  disc: Discipline;
  flags: SplitFlags;
  onChange: (next: Discipline) => void;
  compact?: boolean;
}) {
  const bd = getDisciplineChBreakdown({
    ...disc,
    hasLaboratory: flags.hasLaboratory,
    hasClinical: flags.hasClinical,
  });
  const syncMed = (bd.syncMediated || 0) + (bd.sync || 0);
  const inputCls = compact
    ? 'w-full min-w-[3.25rem] px-1 py-0.5 border rounded text-xs text-center font-bold bg-white'
    : 'w-full px-2 py-1 border rounded text-xs text-center font-bold bg-white';

  const patch = (part: ExplicitChPart, raw: string) => {
    onChange(
      applyExplicitChBreakdown(
        { ...disc, hasLaboratory: flags.hasLaboratory, hasClinical: flags.hasClinical },
        flags,
        { [part]: Number(raw) }
      )
    );
  };

  return (
    <div className="space-y-1">
      {!compact && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#002B49]">
          Carga horária
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        <div className="flex-1 min-w-[7rem] rounded-lg border border-blue-100 bg-blue-50/70 px-2 py-1.5 space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-wide text-[#002B49] block text-center">
            Presencial
          </span>
          <div className={`grid gap-1.5 ${flags.hasLaboratory && flags.hasClinical ? 'grid-cols-3' : flags.hasLaboratory || flags.hasClinical ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <label className="block">
              <span className="text-[9px] text-slate-500 block text-center">Teórico</span>
              <input
                type="number"
                min={0}
                value={bd.theoretical}
                onChange={(e) => patch('theoretical', e.target.value)}
                className={`${inputCls} text-blue-900`}
              />
            </label>
            {flags.hasLaboratory && (
              <label className="block">
                <span className="text-[9px] text-slate-500 block text-center">Laboratório</span>
                <input
                  type="number"
                  min={0}
                  value={bd.laboratory}
                  onChange={(e) => patch('laboratory', e.target.value)}
                  className={`${inputCls} text-teal-800`}
                />
              </label>
            )}
            {flags.hasClinical && (
              <label className="block">
                <span className="text-[9px] text-slate-500 block text-center">Clínica</span>
                <input
                  type="number"
                  min={0}
                  value={bd.clinical}
                  onChange={(e) => patch('clinical', e.target.value)}
                  className={`${inputCls} text-rose-800`}
                />
              </label>
            )}
          </div>
        </div>
        <label className="flex-1 min-w-[5.5rem] rounded-lg border border-indigo-100 bg-indigo-50/70 px-2 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-900 block text-center">
            Síncrono-Mediado
          </span>
          <input
            type="number"
            min={0}
            value={syncMed}
            onChange={(e) => patch('syncMediated', e.target.value)}
            className={`${inputCls} text-indigo-900 mt-1`}
          />
        </label>
        <label className="flex-1 min-w-[5rem] rounded-lg border border-purple-100 bg-purple-50/70 px-2 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-purple-900 block text-center">
            Assíncrono
          </span>
          <input
            type="number"
            min={0}
            value={bd.async}
            onChange={(e) => patch('async', e.target.value)}
            className={`${inputCls} text-purple-900 mt-1`}
          />
        </label>
        <label className="w-[4.75rem] rounded-lg border border-orange-100 bg-orange-50/60 px-2 py-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-600 block text-center">
            Total
          </span>
          <input
            type="number"
            readOnly
            value={bd.total}
            className={`${inputCls} text-[#FF6B00] mt-1 bg-slate-50 cursor-default`}
            title="Total = soma das colunas"
          />
        </label>
      </div>
    </div>
  );
}

export const CurriculumForm: React.FC<CurriculumFormProps> = ({
  initialData,
  courses,
  settings,
  onSave,
  onCancel,
  onAddCourse,
}) => {
  const isZabala = settings.pedagogicalNomenclature === 'zabala';
  const chaLabels = getSaberesLabels(settings.pedagogicalNomenclature);

  // Core Header State — nova estrutura começa vazia (sem curso pré-selecionado)
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialData?.courseId || ''
  );
  const [draftCourseName, setDraftCourseName] = useState<string>(
    initialData ? courseBaseName(initialData.courseName || '') : ''
  );
  const [code, setCode] = useState<string>(initialData?.code || '');
  const [modality, setModality] = useState<'Presencial' | 'Semipresencial' | 'EAD'>(
    initialData?.modality || 'Presencial'
  );
  const [activeYearSemester, setActiveYearSemester] = useState<string>(
    initialData?.activeYearSemester || ''
  );
  const [structureType, setStructureType] = useState<'disciplinar' | 'modular'>(
    initialData?.structureType || 'disciplinar'
  );
  const [status, setStatus] = useState<'Ativa' | 'Em Desativação' | 'Em Elaboração' | 'Inativa'>(
    initialData?.status || 'Em Elaboração'
  );
  const [hideStatus, setHideStatus] = useState<boolean>(initialData?.hideStatus ?? false);
  const [validityStart, setValidityStart] = useState<string>(
    initialData?.validityStart || ''
  );
  const [hideValidity, setHideValidity] = useState<boolean>(
    initialData?.hideValidity ?? settings.hideValidityStartDefault
  );

  // Regulatory — só herda curso se estiver editando estrutura já salva
  const currentCourse = selectedCourseId
    ? courses.find((c) => c.id === selectedCourseId)
    : undefined;
  const [requiredTotalHours, setRequiredTotalHours] = useState<number>(
    initialData?.requiredTotalHours || 0
  );
  const [minPresentialHoursPercent, setMinPresentialHoursPercent] = useState<number>(
    initialData?.minPresentialHoursPercent ?? 0
  );
  const [maxEadHoursPercent, setMaxEadHoursPercent] = useState<number>(
    initialData?.maxEadHoursPercent ?? 100
  );
  const [dcnRef, setDcnRef] = useState<string>(initialData?.dcnRef || '');
  const [cineBrasilRef, setCineBrasilRef] = useState<string>(initialData?.cineBrasilRef || '');
  const [authorizationAct, setAuthorizationAct] = useState<string>(
    initialData?.authorizationAct || initialData?.recognitionPortaria || ''
  );
  const [structureDcns, setStructureDcns] = useState<DcnDocument[]>(initialData?.dcns || []);
  const [isDcnModalOpen, setIsDcnModalOpen] = useState(false);

  const [degrees, setDegrees] = useState<Course['degrees'] | undefined>(initialData?.degrees);
  const [internshipRequirement, setInternshipRequirement] = useState<RequirementLevel>(
    initialData?.internshipRequirement || 'Não Informado'
  );
  const [minInternshipHours, setMinInternshipHours] = useState<number | undefined>(
    initialData?.minInternshipHours
  );
  const [complementaryRequirement, setComplementaryRequirement] = useState<RequirementLevel>(
    initialData?.complementaryRequirement || 'Não Informado'
  );
  const [finalPaperRequirement, setFinalPaperRequirement] = useState<RequirementLevel>(
    initialData?.finalPaperRequirement || 'Não Informado'
  );
  const [coordinatorName, setCoordinatorName] = useState(initialData?.coordinatorName || '');
  const [coordinatorEmail, setCoordinatorEmail] = useState(initialData?.coordinatorEmail || '');

  const [complementaryTotalHours, setComplementaryTotalHours] = useState<number>(
    initialData?.complementaryTotalHours ?? 0
  );
  const [complementaryModality, setComplementaryModality] = useState<DeliveryModalityFlag>(
    initialData?.complementaryModality ?? 'assincrono'
  );
  const [extensionTotalHours, setExtensionTotalHours] = useState<number>(
    initialData?.extensionTotalHours ?? 0
  );
  const [extensionModality, setExtensionModality] = useState<DeliveryModalityFlag>(
    initialData?.extensionModality ?? 'presencial'
  );
  const [hasLaboratory, setHasLaboratory] = useState<boolean>(
    initialData?.hasLaboratory ?? false
  );
  const [hasClinical, setHasClinical] = useState<boolean>(initialData?.hasClinical ?? false);
  const splitFlags: SplitFlags = { hasLaboratory, hasClinical };
  const useChSplit = hasLaboratory || hasClinical;

  // Periods (for disciplinar) — nova estrutura começa vazia (dados do curso vêm da planilha)
  const [periods, setPeriods] = useState<PeriodData[]>(
    initialData?.periods || []
  );

  // Modules (for modular)
  const [modules, setModules] = useState<ModuleData[]>(
    initialData?.modules || []
  );

  const seedFileRef = useRef<HTMLInputElement>(null);
  const [seedImportBusy, setSeedImportBusy] = useState(false);
  const [seedImportMsg, setSeedImportMsg] = useState<{
    type: 'ok' | 'warn' | 'err';
    text: string;
  } | null>(null);

  // State for Add Course Modal
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseHours, setNewCourseHours] = useState(3000);
  const [newCourseDcn, setNewCourseDcn] = useState('');
  const [newCourseCine, setNewCourseCine] = useState('');
  const [newCourseAuthorizationAct, setNewCourseAuthorizationAct] = useState('');
  const [listDrag, setListDrag] = useState<ListDrag | null>(null);
  const [listDragOver, setListDragOver] = useState<ListDragOver | null>(null);

  // Update linked fields when course is explicitly selected
  const clearCourseLinkedFields = () => {
    setRequiredTotalHours(0);
    setDcnRef('');
    setCineBrasilRef('');
    setAuthorizationAct('');
    setStructureDcns([]);
    setDegrees(undefined);
    setInternshipRequirement('Não Informado');
    setMinInternshipHours(undefined);
    setComplementaryRequirement('Não Informado');
    setComplementaryTotalHours(0);
    setComplementaryModality('assincrono');
    setExtensionTotalHours(0);
    setExtensionModality('presencial');
    setFinalPaperRequirement('Não Informado');
    setCoordinatorName('');
    setCoordinatorEmail('');
    setHasLaboratory(false);
    setHasClinical(false);
    setMinPresentialHoursPercent(0);
    setMaxEadHoursPercent(100);
  };

  const applyCourseData = (selected: Course, opts?: { skipModality?: boolean }) => {
    setDraftCourseName(courseBaseName(selected.name));
    setRequiredTotalHours(selected.minTotalHours);
    setDcnRef(selected.activeDcn || '');
    setCineBrasilRef(formatCineBrasilLabel(selected.cineBrasilCode, selected.cineBrasilArea));
    setAuthorizationAct(selected.authorizationAct || '');
    setStructureDcns(selected.dcns || []);
    if (selected.modality && !opts?.skipModality) setModality(selected.modality);
    setDegrees(selected.degrees);
    setInternshipRequirement(selected.internshipRequirement || 'Não Informado');
    setMinInternshipHours(selected.minInternshipHours);
    setComplementaryRequirement(selected.complementaryRequirement || 'Não Informado');
    setComplementaryTotalHours(selected.complementaryTotalHours ?? 0);
    setComplementaryModality(selected.complementaryModality ?? 'assincrono');
    setExtensionTotalHours(selected.extensionTotalHours ?? 0);
    setExtensionModality(selected.extensionModality ?? 'presencial');
    setFinalPaperRequirement(selected.finalPaperRequirement || 'Não Informado');
    setCoordinatorName(selected.coordinatorName || '');
    setCoordinatorEmail(selected.coordinatorEmail || '');
    setHasLaboratory(!!selected.hasLaboratory);
    setHasClinical(!!selected.hasClinical);
    setMinPresentialHoursPercent(
      selected.minPresentialPercent ?? (selected.modality === 'EAD' ? 10 : 60)
    );
    setMaxEadHoursPercent(selected.maxEadPercent ?? (selected.modality === 'EAD' ? 90 : 40));
  };

  const handleCourseChange = (courseId: string) => {
    if (!courseId) {
      setSelectedCourseId('');
      setDraftCourseName('');
      clearCourseLinkedFields();
      return;
    }
    const selected =
      courses.find((c) => c.id === courseId) ||
      resolveCourseByNameAndModality(courses, courseId, modality);
    if (!selected) return;
    setSelectedCourseId(selected.id);
    applyCourseData(selected);
  };

  /** Zera matriz sem forçar curso da lista. */
  const handleClearAndStartFresh = () => {
    setPeriods([]);
    setModules([]);
    setCode('');
    setActiveYearSemester('');
    setValidityStart('');
    setStatus('Em Elaboração');
    setSeedImportMsg(null);
    setSelectedCourseId('');
    setDraftCourseName('');
    clearCourseLinkedFields();
  };

  /** Pré-preenche a matriz a partir de Excel/PDF.
   *  Se o nome do curso do arquivo bater com o cadastro, carrega os dados cadastrados. */
  const handleSeedFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isPdf = file.type.includes('pdf') || name.endsWith('.pdf');
    const isSheet =
      /\.(xlsx|xls|csv|tsv|txt)$/.test(name) || /spreadsheet|excel|csv/.test(file.type);

    if (!isPdf && !isSheet) {
      setSeedImportMsg({
        type: 'err',
        text: 'Use planilha (.xlsx, .xls, .csv) ou PDF no formato do relatório SAGA.',
      });
      return;
    }

    setSeedImportBusy(true);
    setSeedImportMsg(null);

    try {
      let text = '';
      if (isPdf) {
        text = await extractTextFromPdf(await file.arrayBuffer());
      } else if (/\.(xlsx|xls)$/.test(name)) {
        text = await extractTextFromSpreadsheet(await file.arrayBuffer());
      } else {
        text = await file.text();
      }

      const result = parseSagaReportText(text, {
        courseName: '',
        courseId: '',
        modality: 'Presencial',
        code: '',
        activeYearSemester: '',
        structureType: 'disciplinar',
      });

      const parsed = result.structure;
      const hints = result.hints;

      // Matriz / organização do arquivo
      setStructureType(parsed.structureType);
      setStatus('Em Elaboração');
      setPeriods(parsed.periods || []);
      setModules(parsed.modules || []);

      if (hints.structureCode) setCode(hints.structureCode);
      else if (parsed.code) setCode(parsed.code);

      if (hints.semester) setActiveYearSemester(hints.semester);
      else if (parsed.activeYearSemester) setActiveYearSemester(parsed.activeYearSemester);

      const fileModality = hints.modality || 'Presencial';
      if (hints.modality) setModality(hints.modality);

      let matchedCourse: Course | undefined;
      let matchNote = '';

      if (hints.courseName) {
        const cleanName = courseBaseName(stripAcademicCoursePrefix(hints.courseName));
        setDraftCourseName(cleanName);

        matchedCourse =
          findCourseByNameAndModality(courses, cleanName, fileModality) ||
          findCourseTemplateByName(courses, cleanName);

        if (matchedCourse) {
          setSelectedCourseId(matchedCourse.id);
          // Carrega cadastro; mantém modalidade detectada no arquivo quando houver
          applyCourseData(matchedCourse, { skipModality: Boolean(hints.modality) });
          if (hints.modality) setModality(hints.modality);
          matchNote = ` Curso vinculado ao cadastro: “${courseBaseName(matchedCourse.name)}” (${matchedCourse.modality}).`;
        } else {
          setSelectedCourseId('');
          matchNote = ` Curso detectado: “${cleanName}” (ainda não há correspondência no cadastro — selecione ou salve para incluir).`;
        }
      }

      // Valores do arquivo complementam / não apagam o que veio do cadastro quando não informados
      if (hints.totalHours && hints.totalHours > 0) setRequiredTotalHours(hints.totalHours);
      if (hints.complementaryHours != null && hints.complementaryHours > 0) {
        setComplementaryTotalHours(hints.complementaryHours);
      }

      const discCount =
        (parsed.periods || []).reduce((n, p) => n + (p.disciplines?.length || 0), 0) +
        (parsed.modules || []).reduce((n, m) => n + (m.disciplines?.length || 0), 0);
      const unitLabel =
        parsed.structureType === 'modular'
          ? `${(parsed.modules || []).length} módulo(s)`
          : `${(parsed.periods || []).length} período(s)`;

      const warnSuffix = result.warnings.length > 0 ? ` ${result.warnings[0]}` : '';
      setSeedImportMsg({
        type: discCount > 0 ? 'ok' : 'warn',
        text:
          discCount > 0
            ? `Pré-preenchido a partir de “${file.name}”: ${unitLabel}, ${discCount} componente(s).${matchNote}`
            : `Arquivo lido, mas poucos dados de matriz foram reconhecidos.${warnSuffix} Complete manualmente.`,
      });
    } catch (err) {
      console.error(err);
      setSeedImportMsg({
        type: 'err',
        text: isPdf
          ? 'Não foi possível ler o PDF. Se for imagem digitalizada, preencha a estrutura manualmente ou use Importar SAGA.'
          : 'Não foi possível ler a planilha. Verifique o arquivo ou preencha manualmente.',
      });
    } finally {
      setSeedImportBusy(false);
    }
  };

  // Não auto-seleciona curso da lista — só corrige id inválido ao editar estrutura existente
  useEffect(() => {
    if (!initialData?.courseId) return;
    if (courses.length === 0) return;
    const selected = courses.find((c) => c.id === selectedCourseId);
    if (!selected && selectedCourseId) {
      setSelectedCourseId('');
    }
  }, [courses, initialData?.courseId, selectedCourseId]);

  // Quick course modal submit
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName) return;
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      code: generateCourseCodeFromName(newCourseName),
      name: newCourseName,
      modality,
      activeDcn: newCourseDcn || 'Diretriz Curricular Nacional 2026',
      cineBrasilCode: newCourseCine || '0413A01',
      cineBrasilArea: 'Área Acadêmica Geral',
      authorizationAct: newCourseAuthorizationAct || '',
      minTotalHours: newCourseHours,
      minPresentialPercent: 60,
      maxEadPercent: 40,
      minExtensionPercent: 10,
    };
    await onAddCourse(newCourse);
    setSelectedCourseId(newCourse.id);
    applyCourseData(newCourse);
    setShowAddCourseModal(false);
    setNewCourseName('');
    setNewCourseAuthorizationAct('');
  };

  /** CH do módulo = soma das CH dos conhecimentos (ou disciplinas, se não houver conhecimentos). */
  const sumModuleComponentHours = (mod: ModuleData): number => {
    const knows = mod.knowledges || [];
    if (knows.length > 0) {
      return knows.reduce((acc, k) => acc + (Number(k.hours) || 0), 0);
    }
    const discs = mod.disciplines || [];
    if (discs.length > 0) {
      return discs.reduce((acc, d) => acc + (Number(d.hours) || 0), 0);
    }
    return 0;
  };

  /** Espelha knowledges → disciplines para a tabela/totais não perderem itens manuais. */
  const withSyncedModules = (list: ModuleData[]): ModuleData[] =>
    list.map((m) =>
      syncModuleKnowledgesToDisciplines({
        ...m,
        disciplines: (m.disciplines || []).map((d) => ({
          ...d,
          hasLaboratory,
          hasClinical,
        })),
        knowledges: (m.knowledges || []).map((k) => ({
          ...k,
          hasLaboratory,
          hasClinical,
        })),
        hours: sumModuleComponentHours(m),
      })
    );

  // Calculations for current form
  const resolvedCourseName =
    courseBaseName(currentCourse?.name || draftCourseName || '').trim() || '';
  const currentStructurePreview: CurriculumStructure = {
    id: initialData?.id || `struct-${Date.now()}`,
    code,
    courseId: selectedCourseId,
    courseName: resolvedCourseName || 'Curso sem nome',
    modality,
    activeYearSemester,
    structureType,
    status,
    hideStatus,
    validityStart,
    hideValidity,
    // Opções de exibição em relatório são controladas na tela de geração (não no cadastro)
    hideCompetenciesInReport: initialData?.hideCompetenciesInReport ?? false,
    hideKnowledgesInReport: initialData?.hideKnowledgesInReport ?? false,
    requiredTotalHours: Number(requiredTotalHours) || 0,
    minPresentialHoursPercent: Number(minPresentialHoursPercent) || 0,
    maxEadHoursPercent: Number(maxEadHoursPercent) || 0,
    minExtensionPercent: 10,
    complementaryTotalHours: Number(complementaryTotalHours) || 0,
    complementaryModality,
    extensionTotalHours: Number(extensionTotalHours) || 0,
    extensionModality,
    minInternshipHours,
    internshipRequirement,
    complementaryRequirement,
    finalPaperRequirement,
    degrees,
    coordinatorName,
    coordinatorEmail,
    hasLaboratory,
    hasClinical,
    calculatedTotalHours: 0,
    calculatedPresentialHours: 0,
    calculatedEadHours: 0,
    calculatedExtensionHours: 0,
    calculatedComplementaryHours: initialData?.calculatedComplementaryHours || 0,
    calculatedInternshipHours: 0,
    totalCredits: 0,
    periods:
      structureType === 'disciplinar'
        ? periods.map((p) => ({
            ...p,
            disciplines: p.disciplines.map((d) => ({
              ...d,
              hasLaboratory,
              hasClinical,
            })),
          }))
        : undefined,
    modules:
      structureType === 'modular'
        ? withSyncedModules(modules)
        : undefined,
    dcnRef,
    dcns: structureDcns,
    cineBrasilRef,
    authorizationAct,
    recognitionPortaria: authorizationAct,
    createdAt: initialData?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const calculated = calculateStructureTotals(currentStructurePreview);

  // Validation conditions
  const isChTotalValid = calculated.calculatedTotalHours >= calculated.requiredTotalHours;
  const currentPresPct = calculated.calculatedTotalHours > 0 
    ? Math.round((calculated.calculatedPresentialHours / calculated.calculatedTotalHours) * 100) 
    : 0;
  const isPresentialValid = currentPresPct >= minPresentialHoursPercent;
  const currentEadPct = calculated.calculatedTotalHours > 0 
    ? Math.round((calculated.calculatedEadHours / calculated.calculatedTotalHours) * 100) 
    : 0;
  const isEadValid = currentEadPct <= maxEadHoursPercent;

  const canSave =
    isChTotalValid &&
    isPresentialValid &&
    code.trim().length > 0 &&
    resolvedCourseName.length > 0;

  // Period / Module Helpers
  const addPeriod = () => {
    const nextNum = periods.length + 1;
    setPeriods([
      ...periods,
      {
        id: `p-${nextNum}-${Date.now()}`,
        number: nextNum,
        totalCredits: 0,
        totalHours: 0,
        disciplines: [],
      },
    ]);
  };

  const removePeriod = (pId: string) => {
    setPeriods(periods.filter((p) => p.id !== pId));
  };

  const addDisciplineToPeriod = (periodId: string) => {
    setPeriods(
      periods.map((p) => {
        if (p.id !== periodId) return p;
        const newD: Discipline = {
          id: `d-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          code: `DISC${String(p.disciplines.length + 1).padStart(3, '0')}`,
          name: '',
          type: 'Obrigatória',
          credits: 4,
          hours: 0,
          evaluationForm: modality === 'EAD' ? 'Nota (EAD)' : 'Resultado Final',
          modalityDelivery: modality === 'EAD' ? 'assincrono' : 'presencial',
          hasLaboratory,
          hasClinical,
          flags: { classroom: 'presencial', internship: 'presencial', complementaryActivity: 'presencial', extension: 'presencial' },
        };
        return { ...p, disciplines: [...p.disciplines, newD] };
      })
    );
  };

  const clearListDrag = () => {
    setListDrag(null);
    setListDragOver(null);
  };

  const reorderDisciplineInPeriod = (periodId: string, from: number, to: number) => {
    setPeriods((prev) =>
      prev.map((p) =>
        p.id === periodId ? { ...p, disciplines: moveItemInList(p.disciplines, from, to) } : p
      )
    );
  };

  const reorderKnowledgeInModule = (moduleId: string, from: number, to: number) => {
    setModules((prev) =>
      prev.map((m) =>
        m.id === moduleId && m.knowledges
          ? { ...m, knowledges: moveItemInList(m.knowledges, from, to) }
          : m
      )
    );
  };

  const addModule = (branch?: string) => {
    const trunkMods = modules
      .filter((m) => !m.branch)
      .sort((a, b) => a.number - b.number);
    const sameBranch = branch
      ? modules.filter((m) => m.branch === branch).sort((a, b) => a.number - b.number)
      : [];

    const nextNum = branch
      ? sameBranch.length > 0
        ? Math.max(...sameBranch.map((m) => m.number)) + 1
        : trunkMods.length > 0
        ? Math.max(...trunkMods.map((m) => m.number)) + 1
        : modules.length + 1
      : trunkMods.length > 0
      ? Math.max(...trunkMods.map((m) => m.number)) + 1
      : modules.length + 1;

    let parentModuleId: string | undefined;
    if (branch) {
      // Trilha A/B: encadeia no último da mesma trilha, ou no último do tronco
      if (sameBranch.length > 0) {
        parentModuleId = sameBranch[sameBranch.length - 1].id;
      } else if (trunkMods.length > 0) {
        parentModuleId = trunkMods[trunkMods.length - 1].id;
      }
    } else if (trunkMods.length > 0) {
      parentModuleId = trunkMods[trunkMods.length - 1].id;
    }

    const newMod: ModuleData = {
      id: `m-${nextNum}-${Date.now()}`,
      number: nextNum,
      code: `MOD-${String(nextNum).padStart(2, '0')}${branch ? branch : ''}`,
      branch: branch || undefined,
      branchName: undefined,
      competence: '',
      parentModuleId,
      title: branch
        ? `Módulo Específico ${toRoman(nextNum)}${branch}`
        : `Módulo Integrado ${toRoman(nextNum)}`,
      hours: 0,
      meetings: 0,
      disciplines: [],
      competencies: [
        { id: `c-1-${Date.now()}`, category: defaultSaberCategory('c', settings.pedagogicalNomenclature), name: '' },
        { id: `c-2-${Date.now()}`, category: defaultSaberCategory('h', settings.pedagogicalNomenclature), name: '' },
        { id: `c-3-${Date.now()}`, category: defaultSaberCategory('a', settings.pedagogicalNomenclature), name: '' },
      ],
    };
    setModules([...modules, newMod]);
  };

  const removeModule = (mId: string) => {
    setModules(modules.filter((m) => m.id !== mId));
  };

  const [showBlockersModal, setShowBlockersModal] = useState<boolean>(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      setShowBlockersModal(true);
      return;
    }
    await onSave(calculated);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-4 gap-4">
          <div>
            <h2 className="text-xl font-black text-[#002B49]">
              {initialData ? `Editar Estrutura ${initialData.code}` : 'Cadastro de Nova Estrutura Curricular'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Preencha os dados institucionais, selecione a modalidade e configure a matriz disciplinar ou modular com validação regulatória em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={!canSave}
              className="px-5 py-2 rounded-lg bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-black transition flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              Salvar no Firebase
            </button>
          </div>
        </div>

        {/* Validation Warning Alert */}
        {!canSave && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-bold">Atenção aos Requisitos Regulatórios para Finalização:</strong>
              <ul className="list-disc pl-4 space-y-0.5">
                {!isChTotalValid && (
                  <li>
                    A carga horária total preenchida (<strong className="text-amber-950">{calculated.calculatedTotalHours}h</strong>) é menor que a exigida (<strong className="text-amber-950">{requiredTotalHours}h</strong>). O sistema impede a finalização sem a quantidade mínima.
                  </li>
                )}
                {!isPresentialValid && (
                  <li>
                    O percentual de carga horária presencial (<strong className="text-amber-950">{currentPresPct}%</strong>) está abaixo do mínimo exigido de <strong className="text-amber-950">{minPresentialHoursPercent}%</strong>.
                  </li>
                )}
                {code.trim().length === 0 && (
                  <li>Informe um código válido para a estrutura (ex: TAM242, PAD231).</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* Section 1: Dados Gerais e Curso */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#002B49] border-b border-slate-100 pb-2 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#FF6B00]" />
            1. Dados Institucionais do Curso e Vigência
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Curso */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Curso *
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedCourseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                >
                  <option value="">Selecione o curso (opcional)</option>
                  {courseSelectOptions(courses).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddCourseModal(true)}
                  className="px-3 py-2 rounded-lg bg-blue-50 text-blue-900 hover:bg-blue-100 text-xs font-bold border border-blue-200 shrink-0"
                >
                  + Novo Curso
                </button>
              </div>
              {draftCourseName && !selectedCourseId && (
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  Nome a partir do arquivo: <span className="text-[#002B49]">{draftCourseName}</span>
                  {' '}(selecione na lista só se quiser carregar dados cadastrados)
                </p>
              )}
            </div>

            {!initialData && (
              <div className="md:col-span-3 lg:col-span-4">
                <input
                  ref={seedFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleSeedFile(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={seedImportBusy}
                  onClick={() => seedFileRef.current?.click()}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 hover:border-[#002B49]/30 text-left transition disabled:opacity-60"
                >
                  <span className="shrink-0 w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500">
                    {seedImportBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#FF6B00]" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold text-slate-700">
                      {seedImportBusy
                        ? 'Lendo arquivo…'
                        : 'Importar Excel ou PDF para iniciar (opcional)'}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">
                      Mesmo formato do Importar SAGA. Pré-preenche a matriz; o restante você completa aqui.
                    </span>
                  </span>
                </button>
                {seedImportMsg && (
                  <p
                    className={`mt-1.5 text-[10px] font-semibold leading-snug ${
                      seedImportMsg.type === 'ok'
                        ? 'text-emerald-700'
                        : seedImportMsg.type === 'warn'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {seedImportMsg.text}
                  </p>
                )}
              </div>
            )}

            {/* Código da Estrutura */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Código da Estrutura *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ex: TAM242, PAD231"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono font-bold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                required
              />
            </div>

            {/* Modalidade */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Modalidade *
              </label>
              <select
                value={modality}
                onChange={(e) => {
                  const next = e.target.value as 'Presencial' | 'Semipresencial' | 'EAD';
                  setModality(next);
                  // Só troca o vínculo se já houver curso selecionado na lista
                  if (!selectedCourseId) return;
                  const resolved = resolveCourseByNameAndModality(courses, selectedCourseId, next);
                  if (resolved && resolved.id !== selectedCourseId) {
                    setSelectedCourseId(resolved.id);
                    applyCourseData(resolved, { skipModality: true });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
              >
                <option value="Presencial">Presencial</option>
                <option value="Semipresencial">Semipresencial</option>
                <option value="EAD">EAD (A Distância)</option>
              </select>
            </div>

            {/* Ano da Estrutura */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ano da Estrutura *
              </label>
              <input
                type="text"
                value={activeYearSemester}
                onChange={(e) => setActiveYearSemester(e.target.value)}
                placeholder="Ex: 2024.2, 2025.1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                required
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Status da Estrutura
              </label>
              <select
                value={status === 'Ativa' || status === 'Em Desativação' ? status : 'Ativa'}
                onChange={(e) => setStatus(e.target.value as 'Ativa' | 'Em Desativação')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
              >
                <option value="Ativa">Ativa</option>
                <option value="Em Desativação">Em Desativação</option>
              </select>
              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideStatus}
                  onChange={(e) => setHideStatus(e.target.checked)}
                  className="rounded text-[#002B49]"
                />
                <span>Ocultar status nos relatórios</span>
              </label>
            </div>

            {/* Tipo de Estrutura */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tipo de Organização *
              </label>
              <select
                value={structureType}
                onChange={(e) => setStructureType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white text-[#002B49] focus:ring-2 focus:ring-[#002B49]"
              >
                <option value="modular">Modular (com ramificações & CHA)</option>
                <option value="disciplinar">Disciplinar (Períodos Letivos)</option>
              </select>
            </div>

            {/* Ato Autorizativo */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ato Autorizativo *
              </label>
              <input
                type="text"
                value={authorizationAct}
                onChange={(e) => setAuthorizationAct(e.target.value)}
                placeholder="Ex: Portaria SERES/MEC nº 123/2022"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Valor cadastrado no curso (planilha) ou informado nesta estrutura.
              </p>
            </div>

            {/* Início de Vigência */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Início da Vigência
              </label>
              <input
                type="date"
                value={validityStart}
                onChange={(e) => setValidityStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
              />
              <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideValidity}
                  onChange={(e) => setHideValidity(e.target.checked)}
                  className="rounded text-[#002B49]"
                />
                <span>Ocultar vigência nos relatórios/impressão</span>
              </label>
            </div>
          </div>

          {/* Dados do curso — só vêm do cadastro se o usuário selecionar */}
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <p className="text-xs font-bold text-[#002B49] uppercase tracking-wider">
              {selectedCourseId
                ? 'Dados do curso selecionado (editáveis nesta estrutura)'
                : 'Dados do curso (preencha manualmente ou selecione um curso na lista)'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Grau</label>
                <select
                  value={degrees === 'Tecnólogo' ? 'Tecnológico' : degrees || 'Bacharelado'}
                  onChange={(e) => setDegrees(e.target.value as Course['degrees'])}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                >
                  <option value="Bacharelado">Bacharelado</option>
                  <option value="Licenciatura">Licenciatura</option>
                  <option value="Tecnológico">Tecnológico</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Estágio</label>
                <select
                  value={internshipRequirement}
                  onChange={(e) => setInternshipRequirement(e.target.value as RequirementLevel)}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                >
                  <option value="Obrigatório">Obrigatório</option>
                  <option value="Opcional">Opcional</option>
                  <option value="Não Informado">Não Informado</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">CH Estágio</label>
                <input
                  type="text"
                  value={minInternshipHours === undefined ? 'Não Informado' : String(minInternshipHours)}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setMinInternshipHours(
                      /não inform|nao inform|^$/i.test(v)
                        ? undefined
                        : Number(v.replace(/\D/g, '')) || undefined
                    );
                  }}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Ativ. Complementar</label>
                <select
                  value={complementaryRequirement}
                  onChange={(e) => setComplementaryRequirement(e.target.value as RequirementLevel)}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                >
                  <option value="Obrigatório">Obrigatório</option>
                  <option value="Opcional">Opcional</option>
                  <option value="Não Informado">Não Informado</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">TCC / Projeto Final</label>
                <select
                  value={finalPaperRequirement}
                  onChange={(e) => setFinalPaperRequirement(e.target.value as RequirementLevel)}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                >
                  <option value="Obrigatório">Obrigatório</option>
                  <option value="Opcional">Opcional</option>
                  <option value="Não Informado">Não Informado</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">Coordenador</label>
                <input
                  type="text"
                  value={coordinatorName}
                  onChange={(e) => setCoordinatorName(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">E-mail Coordenador</label>
                <input
                  type="email"
                  value={coordinatorEmail}
                  onChange={(e) => setCoordinatorEmail(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border text-xs bg-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 mb-1">DCNs do curso</label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[11px] text-slate-600 bg-slate-50 border rounded px-2 py-1.5 line-clamp-2">
                    {structureDcns.length
                      ? structureDcns.map((d, i) => `${i + 1}. ${d.title}`).join(' · ')
                      : summarizeCourseDcns({
                          ...(currentCourse || ({} as Course)),
                          dcns: structureDcns,
                          activeDcn: dcnRef,
                        } as Course)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsDcnModalOpen(true)}
                    className="px-2 py-1.5 rounded bg-blue-50 text-[#002B49] text-[10px] font-bold border border-blue-200 whitespace-nowrap"
                  >
                    Ver DCNs ({structureDcns.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Regulação, CH Total Mínima e Sliders Presencial/EAD */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#002B49] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#FF6B00]" />
              2. Parâmetros Regulatórios & Carga Horária (MEC / DCN / CINE Brasil)
            </h3>
            <span className="text-xs text-slate-500">Validação limitante obrigatória</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CH Total do Curso */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                CH Total Mínima Exigida (h) *
              </label>
              <input
                type="number"
                value={requiredTotalHours}
                onChange={(e) => setRequiredTotalHours(Number(e.target.value))}
                min={800}
                step={10}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-base font-black text-slate-900 bg-white"
                required
              />
              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>Apurado na estrutura:</span>
                <span className={`font-bold ${isChTotalValid ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {calculated.calculatedTotalHours}h {isChTotalValid ? '(OK)' : '(Insuficiente)'}
                </span>
              </div>
            </div>

            {/* Slider / Input % Presencial */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-800">
                  Mínimo Presencial (%):
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={minPresentialHoursPercent}
                    onChange={(e) => setMinPresentialHoursPercent(Number(e.target.value))}
                    className="w-14 px-2 py-0.5 text-xs font-bold text-center border rounded bg-white"
                  />
                  <span className="text-xs font-bold">%</span>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                value={minPresentialHoursPercent}
                onChange={(e) => setMinPresentialHoursPercent(Number(e.target.value))}
                className="w-full accent-[#002B49] cursor-pointer"
              />

              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>Presencial apurado:</span>
                <span className={`font-bold ${isPresentialValid ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {currentPresPct}% ({calculated.calculatedPresentialHours}h)
                </span>
              </div>
            </div>

            {/* Slider / Input % EAD */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-800">
                  Teto Máximo EAD (%):
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={maxEadHoursPercent}
                    onChange={(e) => setMaxEadHoursPercent(Number(e.target.value))}
                    className="w-14 px-2 py-0.5 text-xs font-bold text-center border rounded bg-white"
                  />
                  <span className="text-xs font-bold">%</span>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                value={maxEadHoursPercent}
                onChange={(e) => setMaxEadHoursPercent(Number(e.target.value))}
                className="w-full accent-[#FF6B00] cursor-pointer"
              />

              <div className="text-[11px] text-slate-500 flex justify-between">
                <span>EAD apurado:</span>
                <span className={`font-bold ${isEadValid ? 'text-emerald-700' : 'text-amber-600'}`}>
                  {currentEadPct}% ({calculated.calculatedEadHours}h)
                </span>
              </div>
            </div>
          </div>

          {/* Complementary & Extension Configuration Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-100">
            {/* Atividades Complementares */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Atividades Complementares (CH & Modalidade)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">Carga Horária (h)</span>
                  <input
                    type="number"
                    value={complementaryTotalHours}
                    onChange={(e) => setComplementaryTotalHours(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border text-xs font-bold bg-white"
                    placeholder="Ex: 100"
                    min={0}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">Modalidade / Oferta</span>
                  <select
                    value={complementaryModality}
                    onChange={(e) => setComplementaryModality(e.target.value as DeliveryModalityFlag)}
                    className="w-full px-2.5 py-2 rounded-lg border text-xs font-medium bg-white"
                  >
                    <option value="presencial">Presencial</option>
                    <option value="sincrono">Síncrono</option>
                    <option value="sincrono-mediado">Síncrono-Mediado</option>
                    <option value="assincrono">Assíncrono</option>
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Deve corresponder à CH mínima de atividades complementares informada no cadastro/lote do curso.
              </p>
            </div>

            {/* Extensão */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Carga Horária de Extensão (CH & Modalidade)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">Carga Horária (h)</span>
                  <input
                    type="number"
                    value={extensionTotalHours}
                    onChange={(e) => setExtensionTotalHours(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg border text-xs font-bold bg-white"
                    placeholder="Ex: 300h"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">Modalidade / Oferta</span>
                  <select
                    value={extensionModality}
                    onChange={(e) => setExtensionModality(e.target.value as DeliveryModalityFlag)}
                    className="w-full px-2.5 py-2 rounded-lg border text-xs font-medium bg-white"
                  >
                    <option value="presencial">Presencial</option>
                    <option value="sincrono">Síncrono</option>
                    <option value="sincrono-mediado">Síncrono-Mediado</option>
                    <option value="assincrono">Assíncrono</option>
                  </select>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">Mínimo legal de 10% da carga horária total. Soma ao cômputo regulatório.</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Divisão da CH Presencial (Laboratório e/ou Clínica)
            </label>
            <p className="text-[10px] text-slate-500">
              Marque o que este curso usa. Vale para toda a estrutura: cada disciplina (ou conhecimento) informa a CH nas mesmas colunas do relatório — Teórico, Laboratório e/ou Clínica, Síncrono-Mediado e Assíncrono.
            </p>
            <div className="flex flex-wrap items-center gap-6 pt-1">
              <label className="text-xs text-slate-800 font-semibold flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasLaboratory}
                  onChange={(e) => setHasLaboratory(e.target.checked)}
                />
                Laboratório
              </label>
              <label className="text-xs text-slate-800 font-semibold flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasClinical}
                  onChange={(e) => setHasClinical(e.target.checked)}
                />
                Clínica
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  DCN Ativa Vinculada (Diretriz Curricular Nacional)
                </label>
                <button
                  type="button"
                  onClick={() => setIsDcnModalOpen(true)}
                  className="text-[11px] font-bold text-[#002B49] hover:text-[#FF6B00] flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition border border-slate-200 shadow-2xs"
                  title="Abrir modal para visualizar e cadastrar arquivos PDF das DCNs"
                >
                  <FileText className="w-3 h-3 text-red-500" />
                  PDFs DCN ({structureDcns.length})
                </button>
              </div>
              <input
                type="text"
                value={dcnRef}
                onChange={(e) => setDcnRef(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Classificação CINE Brasil (Código e Área)
              </label>
              <input
                type="text"
                value={cineBrasilRef}
                onChange={(e) => setCineBrasilRef(e.target.value)}
                placeholder="Ex.: 0211D01 - Produção audiovisual, de mídia e cultural"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Conteúdo Curricular (Modular ou Disciplinar) */}
        {structureType === 'disciplinar' ? (
          /* Editor Disciplinar */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#002B49]">
                  3. Períodos Letivos & Disciplinas
                </h3>
                <p className="text-xs text-slate-500">
                  Gerencie as disciplinas de cada período. Dados regulatórios vêm do curso (planilha em lote).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearAndStartFresh}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold flex items-center gap-1 hover:bg-slate-50"
                  title="Limpa períodos/módulos e reaplica só os dados do curso"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Limpar e começar do zero
                </button>
                <button
                  type="button"
                  onClick={addPeriod}
                  className="px-3.5 py-1.5 rounded-lg bg-[#002B49] text-white text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Período
                </button>
              </div>
            </div>

            {periods.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                Nenhum período cadastrado. Os dados do curso já estão carregados acima — clique em{' '}
                <strong>Adicionar Período</strong> para montar a matriz, ou use{' '}
                <strong>Limpar e começar do zero</strong> para reiniciar.
              </div>
            )}

            <div className="space-y-6">
              {periods.map((period, pIdx) => (
                <div key={period.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  <div className="bg-[#002B49] text-white px-4 py-2.5 flex items-center justify-between">
                    <span className="font-bold text-xs">{period.number}º Período Letivo</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addDisciplineToPeriod(period.id)}
                        className="px-2.5 py-1 rounded bg-[#FF6B00] hover:bg-[#e55e00] text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Nova Disciplina
                      </button>
                      <button
                        type="button"
                        onClick={() => removePeriod(period.id)}
                        className="text-red-300 hover:text-white text-xs p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {period.disciplines.map((disc, dIdx) => {
                      const isDragging =
                        listDrag?.kind === 'discipline' &&
                        listDrag.periodId === period.id &&
                        listDrag.from === dIdx;
                      const isDropTarget =
                        listDragOver?.kind === 'discipline' &&
                        listDragOver.parentId === period.id &&
                        listDragOver.index === dIdx &&
                        listDrag?.from !== dIdx;

                      return (
                      <div
                        key={disc.id}
                        onDragOver={(e) => {
                          if (listDrag?.kind !== 'discipline' || listDrag.periodId !== period.id) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (
                            !listDragOver ||
                            listDragOver.kind !== 'discipline' ||
                            listDragOver.parentId !== period.id ||
                            listDragOver.index !== dIdx
                          ) {
                            setListDragOver({ kind: 'discipline', parentId: period.id, index: dIdx });
                          }
                        }}
                        onDragLeave={() => {
                          if (
                            listDragOver?.kind === 'discipline' &&
                            listDragOver.parentId === period.id &&
                            listDragOver.index === dIdx
                          ) {
                            setListDragOver(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (listDrag?.kind !== 'discipline' || listDrag.periodId !== period.id) return;
                          reorderDisciplineInPeriod(period.id, listDrag.from, dIdx);
                          clearListDrag();
                        }}
                        className={`bg-white p-3 rounded-lg border grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 gap-2 text-xs items-center transition ${
                          isDragging ? 'opacity-40 border-slate-300' : isDropTarget ? 'border-[#FF6B00] ring-2 ring-[#FF6B00]/30' : 'border-slate-200'
                        }`}
                      >
                        <div className="lg:col-span-2 flex items-end gap-1">
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', disc.id);
                              setListDrag({ kind: 'discipline', periodId: period.id, from: dIdx });
                            }}
                            onDragEnd={clearListDrag}
                            className="text-slate-400 hover:text-[#002B49] cursor-grab active:cursor-grabbing p-1 mb-0.5 shrink-0"
                            title="Arrastar para reordenar"
                            aria-label="Arrastar disciplina"
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                          <div className="flex-1 min-w-0">
                          <label className="text-[10px] text-slate-400 block">Código</label>
                          <input
                            type="text"
                            value={disc.code}
                            onChange={(e) => {
                              const updated = [...periods];
                              updated[pIdx].disciplines[dIdx].code = e.target.value;
                              setPeriods(updated);
                            }}
                            className="w-full px-2 py-1 border rounded font-mono font-bold text-xs"
                          />
                          </div>
                        </div>

                        <div className="lg:col-span-3">
                          <label className="text-[10px] text-slate-400 block">Nome da Disciplina</label>
                          <input
                            type="text"
                            value={disc.name}
                            onChange={(e) => {
                              const updated = [...periods];
                              updated[pIdx].disciplines[dIdx].name = e.target.value;
                              setPeriods(updated);
                            }}
                            placeholder="Nova disciplina"
                            className="w-full px-2 py-1 border rounded text-xs"
                          />
                        </div>

                        <div className="lg:col-span-2">
                          <label className="text-[10px] text-slate-400 block">Classificação</label>
                          <select
                            value={disc.type}
                            onChange={(e) => {
                              const updated = [...periods];
                              updated[pIdx].disciplines[dIdx].type = e.target.value as any;
                              setPeriods(updated);
                            }}
                            className="w-full px-2 py-1 border rounded text-xs font-semibold bg-white"
                          >
                            <option value="Obrigatória">Obrigatória</option>
                            <option value="Eletiva">Eletiva</option>
                            <option value="Optativa">Opcional (Não conta CH mínima)</option>
                          </select>
                        </div>

                        <div className="lg:col-span-1">
                          <label className="text-[10px] text-slate-400 block">Créditos</label>
                          <input
                            type="number"
                            value={disc.credits || ''}
                            onChange={(e) => {
                              const updated = [...periods];
                              updated[pIdx].disciplines[dIdx].credits = Number(e.target.value);
                              setPeriods(updated);
                            }}
                            className="w-full px-2 py-1 border rounded text-xs text-center"
                          />
                        </div>

                        {!useChSplit && (
                          <>
                            <div className="lg:col-span-1">
                              <label className="text-[10px] text-slate-400 block">Horas (h)</label>
                              <input
                                type="number"
                                value={disc.hours || ''}
                                onChange={(e) => {
                                  const updated = [...periods];
                                  const hours = Number(e.target.value);
                                  const current = updated[pIdx].disciplines[dIdx];
                                  updated[pIdx].disciplines[dIdx] = {
                                    ...current,
                                    hours,
                                    chPresential:
                                      current.modalityDelivery === 'presencial' ? hours : current.chPresential,
                                    chTheoretical:
                                      current.modalityDelivery === 'presencial' ? hours : current.chTheoretical,
                                  };
                                  setPeriods(updated);
                                }}
                                className="w-full px-2 py-1 border rounded text-xs text-center font-bold text-[#FF6B00]"
                              />
                            </div>

                            <div className="lg:col-span-2">
                              <label className="text-[10px] text-slate-400 block">Oferta</label>
                              <select
                                value={disc.modalityDelivery}
                                onChange={(e) => {
                                  const updated = [...periods];
                                  const modalityDelivery = e.target.value as Discipline['modalityDelivery'];
                                  let next: Discipline = {
                                    ...updated[pIdx].disciplines[dIdx],
                                    modalityDelivery,
                                  };
                                  if (modalityDelivery !== 'presencial') {
                                    next.chTheoretical = undefined;
                                    next.chLaboratory = undefined;
                                    next.chClinical = undefined;
                                    next.chPresential = undefined;
                                  } else {
                                    next.chTheoretical = next.hours;
                                    next.chPresential = next.hours;
                                  }
                                  updated[pIdx].disciplines[dIdx] = next;
                                  setPeriods(updated);
                                }}
                                className="w-full px-2 py-1 border rounded text-xs font-medium"
                              >
                                <option value="presencial">Presencial (padrão)</option>
                                <option value="sincrono">Síncrono</option>
                                <option value="sincrono-mediado">Síncrono-Mediado</option>
                                <option value="assincrono">Assíncrono</option>
                              </select>
                            </div>
                          </>
                        )}

                        <div className={`${useChSplit ? 'lg:col-span-4' : 'lg:col-span-1'} flex items-center justify-end gap-0.5 pt-3`}>
                          <button
                            type="button"
                            disabled={dIdx === 0}
                            onClick={() => {
                              const updated = [...periods];
                              const list = [...updated[pIdx].disciplines];
                              if (dIdx <= 0) return;
                              [list[dIdx - 1], list[dIdx]] = [list[dIdx], list[dIdx - 1]];
                              updated[pIdx].disciplines = list;
                              setPeriods(updated);
                            }}
                            className="text-slate-400 hover:text-[#002B49] p-1 disabled:opacity-30"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={dIdx === period.disciplines.length - 1}
                            onClick={() => {
                              const updated = [...periods];
                              const list = [...updated[pIdx].disciplines];
                              if (dIdx >= list.length - 1) return;
                              [list[dIdx + 1], list[dIdx]] = [list[dIdx], list[dIdx + 1]];
                              updated[pIdx].disciplines = list;
                              setPeriods(updated);
                            }}
                            className="text-slate-400 hover:text-[#002B49] p-1 disabled:opacity-30"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <label
                            className="text-[10px] text-slate-700 flex items-center gap-1 cursor-pointer whitespace-nowrap ml-1"
                            title="Disciplina de Extensão"
                          >
                            <input
                              type="checkbox"
                              checked={disc.isExtension}
                              onChange={(e) => {
                                const updated = [...periods];
                                updated[pIdx].disciplines[dIdx].isExtension = e.target.checked;
                                setPeriods(updated);
                              }}
                            />
                            <span>Ext.</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...periods];
                              updated[pIdx].disciplines = updated[pIdx].disciplines.filter((_, i) => i !== dIdx);
                              setPeriods(updated);
                            }}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Remover disciplina"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {useChSplit && (
                          <div className="lg:col-span-12 mt-1">
                            <ChSplitFields
                              disc={{ ...disc, hasLaboratory, hasClinical }}
                              flags={splitFlags}
                              onChange={(next) => {
                                const updated = [...periods];
                                updated[pIdx].disciplines[dIdx] = next;
                                setPeriods(updated);
                              }}
                            />
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Editor Modular com Suporte a Ramificações e CHA */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#002B49]">
                  3. Módulos Temáticos, Ramificações, Conhecimentos & Saberes ({isZabala ? 'Zabala' : 'CHA'})
                </h3>
                <p className="text-xs text-slate-500">
                  Cadastre os módulos do tronco comum e ramificações com conhecimentos e saberes. Dados do curso já carregados.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearAndStartFresh}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold flex items-center gap-1 hover:bg-slate-50"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Limpar e começar do zero
                </button>
                <button
                  type="button"
                  onClick={() => addModule()}
                  className="px-3.5 py-1.5 rounded-lg bg-[#002B49] text-white text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  + Módulo Tronco Comum
                </button>
                <button
                  type="button"
                  onClick={() => addModule('A')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  + Trilha A
                </button>
                <button
                  type="button"
                  onClick={() => addModule('B')}
                  className="px-3 py-1.5 rounded-lg bg-purple-700 text-white text-xs font-bold flex items-center gap-1"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  + Trilha B
                </button>
              </div>
            </div>

            {modules.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                Nenhum módulo cadastrado. Use os botões acima para iniciar a estrutura.
              </div>
            )}

            <div className="space-y-6">
              {modules.map((mod, mIdx) => (
                <div 
                  key={mod.id} 
                  className={`border rounded-xl overflow-hidden bg-slate-50/50 ${
                    mod.branch ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
                  }`}
                >
                  <div className="bg-[#002B49] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {mod.branch && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-bold shrink-0">
                          Trilha {mod.branch}
                        </span>
                      )}
                      <span className="font-bold text-xs truncate">
                        {formatModuleName(mod.number, mod.title, mod.branch)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs" title="Soma automática das CH dos conhecimentos">
                        <span>CH Módulo:</span>
                        <span className="min-w-[2.5rem] px-1.5 py-0.5 text-slate-900 bg-white/95 rounded font-black text-center text-xs tabular-nums">
                          {sumModuleComponentHours(mod)}
                        </span>
                        <span>h</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs" title="Quantidade de encontros deste módulo">
                        <span>Encontros:</span>
                        <input
                          type="number"
                          min={0}
                          value={mod.meetings ?? 0}
                          onChange={(e) => {
                            const updated = [...modules];
                            updated[mIdx] = {
                              ...updated[mIdx],
                              meetings: Math.max(0, Number(e.target.value) || 0),
                            };
                            setModules(updated);
                          }}
                          className="w-14 px-1.5 py-0.5 text-slate-900 bg-white rounded font-black text-center text-xs tabular-nums border-0 focus:ring-2 focus:ring-[#FF6B00]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeModule(mod.id)}
                        className="text-red-300 hover:text-white p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Module Title & Branch configs */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Nº do Módulo (romano)
                        </label>
                        <input
                          type="text"
                          value={toRoman(mod.number)}
                          onChange={(e) => {
                            const updated = [...modules];
                            const nextNum = fromRoman(e.target.value);
                            updated[mIdx].number = nextNum;
                            updated[mIdx].code = `MOD-${String(nextNum).padStart(2, '0')}${
                              updated[mIdx].branch || ''
                            }`;
                            setModules(updated);
                          }}
                          className="w-full px-3 py-1.5 border rounded text-xs bg-white font-bold uppercase tracking-wide"
                          placeholder="I, II, III…"
                        />
                        <p className="text-[9px] text-slate-400 mt-0.5">Ex.: I, II, III, IV…</p>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Nome do Módulo
                        </label>
                        <input
                          type="text"
                          value={mod.title}
                          onChange={(e) => {
                            const updated = [...modules];
                            updated[mIdx].title = e.target.value;
                            setModules(updated);
                          }}
                          className="w-full px-3 py-1.5 border rounded text-xs bg-white"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Ramificação / Trilha
                        </label>
                        <select
                          value={mod.branch || ''}
                          onChange={(e) => {
                            const updated = [...modules];
                            const newBranch = e.target.value || undefined;
                            updated[mIdx].branch = newBranch;
                            updated[mIdx].branchName = undefined;

                            // Recalcula parent para manter a linha do mapa
                            const trunkMods = updated
                              .filter((m, i) => i !== mIdx && !m.branch)
                              .sort((a, b) => a.number - b.number);
                            if (newBranch) {
                              const same = updated
                                .filter((m, i) => i !== mIdx && m.branch === newBranch)
                                .sort((a, b) => a.number - b.number);
                              updated[mIdx].parentModuleId =
                                same.length > 0
                                  ? same[same.length - 1].id
                                  : trunkMods.length > 0
                                  ? trunkMods[trunkMods.length - 1].id
                                  : undefined;
                            } else {
                              updated[mIdx].parentModuleId =
                                trunkMods.length > 0 ? trunkMods[trunkMods.length - 1].id : undefined;
                            }
                            setModules(updated);
                          }}
                          className="w-full px-2 py-1.5 border rounded text-xs bg-white"
                        >
                          <option value="">Tronco Comum</option>
                          <option value="A">Trilha A (ex: 9A, 10A)</option>
                          <option value="B">Trilha B (ex: 9B, 10B)</option>
                        </select>
                      </div>

                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Competência do Módulo
                        </label>
                        <input
                          type="text"
                          value={mod.competence || ''}
                          onChange={(e) => {
                            const updated = [...modules];
                            updated[mIdx].competence = e.target.value;
                            setModules(updated);
                          }}
                          placeholder="Descreva a competência do módulo (exibida como subtítulo)"
                          className="w-full px-3 py-1.5 border rounded text-xs bg-white"
                        />
                      </div>
                    </div>

                    {/* Saberes CHA / Zabala do Módulo */}
                    <div className="bg-orange-50/50 p-3.5 rounded-lg border border-orange-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-orange-950 uppercase tracking-wider">
                          Saberes
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...modules];
                            updated[mIdx].competencies.push({
                              id: `comp-${Date.now()}`,
                              category: defaultSaberCategory('c', settings.pedagogicalNomenclature),
                              name: '',
                            });
                            setModules(updated);
                          }}
                          className="text-[11px] font-bold text-[#FF6B00] hover:text-[#d95300]"
                        >
                          + Adicionar Saber
                        </button>
                      </div>

                      <div className="space-y-2">
                        {mod.competencies?.map((comp, cIdx) => (
                          <div key={comp.id} className="bg-white p-2 rounded border border-orange-200/80 flex flex-wrap items-center gap-2 text-xs">
                            <select
                              value={comp.category}
                              onChange={(e) => {
                                const updated = [...modules];
                                updated[mIdx].competencies[cIdx].category = e.target.value as any;
                                setModules(updated);
                              }}
                              className="px-2 py-1 rounded border text-[11px] font-bold bg-white"
                            >
                              <option value={defaultSaberCategory('c', settings.pedagogicalNomenclature)}>
                                {chaLabels.c}
                              </option>
                              <option value={defaultSaberCategory('h', settings.pedagogicalNomenclature)}>
                                {chaLabels.h}
                              </option>
                              <option value={defaultSaberCategory('a', settings.pedagogicalNomenclature)}>
                                {chaLabels.a}
                              </option>
                              {/* Mantém valor legado selecionável com o rótulo da nomenclatura ativa */}
                              {comp.category === 'conhecimento' && isZabala && (
                                <option value="conhecimento">{chaLabels.c}</option>
                              )}
                              {comp.category === 'habilidade' && isZabala && (
                                <option value="habilidade">{chaLabels.h}</option>
                              )}
                              {comp.category === 'atitude' && isZabala && (
                                <option value="atitude">{chaLabels.a}</option>
                              )}
                              {comp.category === 'conceitual' && !isZabala && (
                                <option value="conceitual">{chaLabels.c}</option>
                              )}
                              {comp.category === 'procedimental' && !isZabala && (
                                <option value="procedimental">{chaLabels.h}</option>
                              )}
                              {comp.category === 'atitudinal' && !isZabala && (
                                <option value="atitudinal">{chaLabels.a}</option>
                              )}
                            </select>

                            <input
                              type="text"
                              value={comp.name}
                              onChange={(e) => {
                                const updated = [...modules];
                                updated[mIdx].competencies[cIdx].name = e.target.value;
                                setModules(updated);
                              }}
                              placeholder="Novo saber aplicado"
                              className="flex-1 min-w-[200px] px-2 py-1 border rounded text-xs"
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...modules];
                                updated[mIdx].competencies = updated[mIdx].competencies.filter((_, i) => i !== cIdx);
                                setModules(updated);
                              }}
                              className="text-slate-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Conhecimentos do Módulo */}
                    <div className="bg-sky-50/50 p-3.5 rounded-lg border border-sky-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-sky-950 uppercase tracking-wider">
                          Conhecimentos
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...modules];
                            if (!updated[mIdx].knowledges) updated[mIdx].knowledges = [];
                            updated[mIdx].knowledges.push({
                              id: `know-${Date.now()}`,
                              name: '',
                              category: 'saber-conceitual',
                              hours: 0,
                              modalityDelivery: 'presencial',
                              hasLaboratory,
                              hasClinical,
                            });
                            setModules(updated);
                          }}
                          className="text-[11px] font-bold text-[#002B49] hover:underline"
                        >
                          + Adicionar Conhecimento
                        </button>
                      </div>

                      <div className="space-y-2">
                        {mod.knowledges?.map((know, kIdx) => {
                          const isDragging =
                            listDrag?.kind === 'knowledge' &&
                            listDrag.moduleId === mod.id &&
                            listDrag.from === kIdx;
                          const isDropTarget =
                            listDragOver?.kind === 'knowledge' &&
                            listDragOver.parentId === mod.id &&
                            listDragOver.index === kIdx &&
                            listDrag?.from !== kIdx;

                          return (
                          <div
                            key={know.id}
                            onDragOver={(e) => {
                              if (listDrag?.kind !== 'knowledge' || listDrag.moduleId !== mod.id) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                              if (
                                !listDragOver ||
                                listDragOver.kind !== 'knowledge' ||
                                listDragOver.parentId !== mod.id ||
                                listDragOver.index !== kIdx
                              ) {
                                setListDragOver({ kind: 'knowledge', parentId: mod.id, index: kIdx });
                              }
                            }}
                            onDragLeave={() => {
                              if (
                                listDragOver?.kind === 'knowledge' &&
                                listDragOver.parentId === mod.id &&
                                listDragOver.index === kIdx
                              ) {
                                setListDragOver(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (listDrag?.kind !== 'knowledge' || listDrag.moduleId !== mod.id) return;
                              reorderKnowledgeInModule(mod.id, listDrag.from, kIdx);
                              clearListDrag();
                            }}
                            className={`bg-white p-2 rounded border flex flex-wrap items-center gap-2 text-xs transition ${
                              isDragging
                                ? 'opacity-40 border-sky-200/80'
                                : isDropTarget
                                ? 'border-[#FF6B00] ring-2 ring-[#FF6B00]/30'
                                : 'border-sky-200/80'
                            }`}
                          >
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', know.id);
                                setListDrag({ kind: 'knowledge', moduleId: mod.id, from: kIdx });
                              }}
                              onDragEnd={clearListDrag}
                              className="text-slate-400 hover:text-[#002B49] cursor-grab active:cursor-grabbing p-0.5 shrink-0"
                              title="Arrastar para reordenar"
                              aria-label="Arrastar conhecimento"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="text"
                              value={know.name}
                              onChange={(e) => {
                                const updated = [...modules];
                                if (updated[mIdx].knowledges) {
                                  updated[mIdx].knowledges[kIdx].name = e.target.value;
                                  setModules(updated);
                                }
                              }}
                              placeholder="Novo conhecimento aplicado"
                              className="flex-1 min-w-[180px] px-2 py-1 border rounded text-xs"
                            />

                            {!useChSplit && (
                              <>
                                <select
                                  value={know.modalityDelivery}
                                  onChange={(e) => {
                                    const updated = [...modules];
                                    if (updated[mIdx].knowledges) {
                                      const modalityDelivery = e.target.value as KnowledgeItem['modalityDelivery'];
                                      const k = { ...updated[mIdx].knowledges[kIdx], modalityDelivery };
                                      if (modalityDelivery !== 'presencial') {
                                        k.chTheoretical = undefined;
                                        k.chLaboratory = undefined;
                                        k.chClinical = undefined;
                                        k.chPresential = undefined;
                                      }
                                      updated[mIdx].knowledges[kIdx] = k;
                                      setModules(updated);
                                    }
                                  }}
                                  className="px-2 py-1 rounded border text-[11px] font-medium bg-white"
                                >
                                  <option value="presencial">Presencial</option>
                                  <option value="sincrono">Síncrono</option>
                                  <option value="sincrono-mediado">Síncrono-Mediado</option>
                                  <option value="assincrono">Assíncrono</option>
                                </select>

                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={know.hours}
                                    onChange={(e) => {
                                      const updated = [...modules];
                                      if (updated[mIdx].knowledges) {
                                        const hours = Number(e.target.value);
                                        updated[mIdx].knowledges[kIdx] = {
                                          ...updated[mIdx].knowledges[kIdx],
                                          hours,
                                          chPresential:
                                            updated[mIdx].knowledges[kIdx].modalityDelivery === 'presencial'
                                              ? hours
                                              : updated[mIdx].knowledges[kIdx].chPresential,
                                          chTheoretical:
                                            updated[mIdx].knowledges[kIdx].modalityDelivery === 'presencial'
                                              ? hours
                                              : updated[mIdx].knowledges[kIdx].chTheoretical,
                                        };
                                        setModules(updated);
                                      }
                                    }}
                                    className="w-14 px-1.5 py-1 border rounded text-xs text-center font-bold text-sky-900"
                                  />
                                  <span className="text-[10px] text-slate-500">h</span>
                                </div>
                              </>
                            )}

                            {useChSplit && (
                              <div className="w-full">
                                <ChSplitFields
                                  compact
                                  disc={knowledgeAsDiscipline(know, splitFlags)}
                                  flags={splitFlags}
                                  onChange={(next) => {
                                    const updated = [...modules];
                                    if (!updated[mIdx].knowledges) return;
                                    updated[mIdx].knowledges[kIdx] = knowledgeFromDiscipline(know, next);
                                    setModules(updated);
                                  }}
                                />
                              </div>
                            )}

                            <button
                              type="button"
                              disabled={kIdx === 0}
                              onClick={() => {
                                const updated = [...modules];
                                if (!updated[mIdx].knowledges) return;
                                const list = [...updated[mIdx].knowledges];
                                if (kIdx <= 0) return;
                                [list[kIdx - 1], list[kIdx]] = [list[kIdx], list[kIdx - 1]];
                                updated[mIdx].knowledges = list;
                                setModules(updated);
                              }}
                              className="text-slate-400 hover:text-[#002B49] p-1 disabled:opacity-30"
                              title="Mover para cima"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={kIdx === (mod.knowledges?.length || 0) - 1}
                              onClick={() => {
                                const updated = [...modules];
                                if (!updated[mIdx].knowledges) return;
                                const list = [...updated[mIdx].knowledges];
                                if (kIdx >= list.length - 1) return;
                                [list[kIdx + 1], list[kIdx]] = [list[kIdx], list[kIdx + 1]];
                                updated[mIdx].knowledges = list;
                                setModules(updated);
                              }}
                              className="text-slate-400 hover:text-[#002B49] p-1 disabled:opacity-30"
                              title="Mover para baixo"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...modules];
                                if (updated[mIdx].knowledges) {
                                  updated[mIdx].knowledges = updated[mIdx].knowledges.filter((_, i) => i !== kIdx);
                                  setModules(updated);
                                }
                              }}
                              className="text-slate-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action bar at bottom */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex justify-between items-center">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="px-6 py-2.5 rounded-lg bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-black transition flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            Salvar e Concluir Estrutura
          </button>
        </div>
      </form>

      {/* Modal: Adicionar Novo Curso se não estiver na lista */}
      {showAddCourseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-[#002B49]">Cadastrar Novo Curso</h3>
              <button onClick={() => setShowAddCourseModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">
                ×
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome do Curso *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Medicina Veterinária, Psicologia..."
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">CH Mínima Total (h)</label>
                <input
                  type="number"
                  value={newCourseHours}
                  onChange={(e) => setNewCourseHours(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Ato Autorizativo</label>
                <input
                  type="text"
                  placeholder="Ex: Portaria SERES/MEC nº 123/2022"
                  value={newCourseAuthorizationAct}
                  onChange={(e) => setNewCourseAuthorizationAct(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">DCN Ativa Vinculada</label>
                <input
                  type="text"
                  placeholder="Resolução CNE/CES..."
                  value={newCourseDcn}
                  onChange={(e) => setNewCourseDcn(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">CINE Brasil</label>
                <input
                  type="text"
                  placeholder="Ex: 0841V01"
                  value={newCourseCine}
                  onChange={(e) => setNewCourseCine(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddCourseModal(false)}
                  className="px-3 py-1.5 rounded border text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#002B49] text-white font-bold"
                >
                  Adicionar Curso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Validation Blockers Detailed Modal */}
      {showBlockersModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-amber-200">
            <div className="flex items-center gap-3 border-b border-amber-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Motivos que Impedem o Salvamento</h3>
                <p className="text-xs text-slate-500">O sistema regulatório UNISUAM bloqueia a finalização enquanto existirem pendências.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700 max-h-[60vh] overflow-y-auto pr-2">
              <ul className="space-y-2">
                {!isChTotalValid && (
                  <li className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                    <span className="font-bold mt-0.5 text-rose-600">▪</span>
                    <div>
                      <strong className="block font-bold">Carga Horária Mínima Obrigatória Não Atingida:</strong>
                      A CH efetiva do núcleo obrigatório/eletivo (<strong className="text-rose-950 font-bold">{calculated.calculatedCoreHours || calculated.calculatedTotalHours}h</strong>) está abaixo da CH mínima exigida pelo curso (<strong className="text-rose-950 font-bold">{requiredTotalHours}h</strong>). 
                      <span className="block text-[11px] text-rose-700 mt-1">Nota: Disciplinas optativas somam à CH total, mas não contam para a CH mínima legal do curso.</span>
                    </div>
                  </li>
                )}
                {!isPresentialValid && (
                  <li className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
                    <span className="font-bold mt-0.5 text-amber-600">▪</span>
                    <div>
                      <strong className="block font-bold">Presencialidade Abaixo do Mínimo Regulatório:</strong>
                      O percentual de carga horária presencial (<strong className="text-amber-950 font-bold">{currentPresPct}%</strong>) está abaixo do mínimo exigido de <strong className="text-amber-950 font-bold">{minPresentialHoursPercent}%</strong>.
                    </div>
                  </li>
                )}
                {!isEadValid && (
                  <li className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
                    <span className="font-bold mt-0.5 text-amber-600">▪</span>
                    <div>
                      <strong className="block font-bold">Teto Máximo de EAD Ultrapassado:</strong>
                      O percentual de EAD calculado (<strong className="text-amber-950 font-bold">{currentEadPct}%</strong>) excede o teto máximo permitido de <strong className="text-amber-950 font-bold">{maxEadHoursPercent}%</strong>.
                    </div>
                  </li>
                )}
                {code.trim().length === 0 && (
                  <li className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                    <span className="font-bold mt-0.5 text-rose-600">▪</span>
                    <div>
                      <strong className="block font-bold">Código da Estrutura Vazio:</strong>
                      É obrigatório informar o código identificador da estrutura curricular (ex: TAM242).
                    </div>
                  </li>
                )}
                {resolvedCourseName.length === 0 && (
                  <li className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                    <span className="font-bold mt-0.5 text-rose-600">▪</span>
                    <div>
                      <strong className="block font-bold">Curso não informado:</strong>
                      Importe um arquivo com o nome do curso, selecione um curso na lista ou cadastre um novo.
                    </div>
                  </li>
                )}
              </ul>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setShowBlockersModal(false)}
                className="px-5 py-2 rounded-xl bg-[#002B49] text-white text-xs font-bold hover:bg-[#001f35] transition shadow"
              >
                Entendido, Ajustar Parâmetros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DCN PDF Viewer & Management Modal */}
      {isDcnModalOpen && (
        <DcnViewerModal
          isOpen={isDcnModalOpen}
          onClose={() => setIsDcnModalOpen(false)}
          course={currentCourse}
          structure={currentStructurePreview}
          onUpdateCourseDcns={async (cId, updatedDcns) => {
            setStructureDcns(updatedDcns);
            if (updatedDcns.length > 0) {
              setDcnRef(updatedDcns[0].resolutionNumber || updatedDcns[0].title);
            }
          }}
          onUpdateStructureDcns={async (sId, updatedDcns) => {
            setStructureDcns(updatedDcns);
            if (updatedDcns.length > 0) {
              setDcnRef(updatedDcns[0].resolutionNumber || updatedDcns[0].title);
            }
          }}
        />
      )}
    </div>
  );
};
