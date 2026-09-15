import React, { useState } from 'react';
import { 
  CurriculumStructure, 
  Course, 
  AppSettings, 
  PeriodData, 
  ModuleData, 
  Discipline, 
  CompetencyCHA,
  DeliveryModalityFlag,
  ComponentDeliveryFlags,
  DcnDocument
} from '../types/curriculum';
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
  FileText
} from 'lucide-react';
import { calculateStructureTotals } from '../services/curriculumService';
import { DcnViewerModal } from './DcnViewerModal';
import { getSaberesLabels } from '../utils/nomenclature';
import { summarizeCourseDcns } from '../utils/courseBatch';
import type { RequirementLevel } from '../types/curriculum';

interface CurriculumFormProps {
  initialData?: CurriculumStructure | null;
  courses: Course[];
  settings: AppSettings;
  onSave: (structure: CurriculumStructure) => Promise<void>;
  onCancel: () => void;
  onAddCourse: (newCourse: Course) => Promise<void>;
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

  // Core Header State
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    initialData?.courseId || courses[0]?.id || ''
  );
  const [code, setCode] = useState<string>(initialData?.code || 'TAM251');
  const [modality, setModality] = useState<'Presencial' | 'Semipresencial' | 'EAD'>(
    initialData?.modality || 'Presencial'
  );
  const [activeYearSemester, setActiveYearSemester] = useState<string>(
    initialData?.activeYearSemester || '2025.1'
  );
  const [structureType, setStructureType] = useState<'disciplinar' | 'modular'>(
    initialData?.structureType || 'modular'
  );
  const [status, setStatus] = useState<'Ativa' | 'Em Desativação' | 'Em Elaboração' | 'Inativa'>(
    initialData?.status || 'Ativa'
  );
  const [hideStatus, setHideStatus] = useState<boolean>(initialData?.hideStatus ?? false);
  const [validityStart, setValidityStart] = useState<string>(
    initialData?.validityStart || '2025-02-01'
  );
  const [hideValidity, setHideValidity] = useState<boolean>(
    initialData?.hideValidity ?? settings.hideValidityStartDefault
  );

  // Regulatory sliders & values
  const currentCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const [requiredTotalHours, setRequiredTotalHours] = useState<number>(
    initialData?.requiredTotalHours || currentCourse?.minTotalHours || 3000
  );
  const [minPresentialHoursPercent, setMinPresentialHoursPercent] = useState<number>(
    initialData?.minPresentialHoursPercent ?? (modality === 'EAD' ? 10 : 60)
  );
  const [maxEadHoursPercent, setMaxEadHoursPercent] = useState<number>(
    initialData?.maxEadHoursPercent ?? (modality === 'EAD' ? 90 : 40)
  );
  const [dcnRef, setDcnRef] = useState<string>(
    initialData?.dcnRef || currentCourse?.activeDcn || 'Resolução CNE/CES Geral'
  );
  const [cineBrasilRef, setCineBrasilRef] = useState<string>(
    initialData?.cineBrasilRef || currentCourse?.cineBrasilCode || '0413A01'
  );
  const [authorizationAct, setAuthorizationAct] = useState<string>(
    initialData?.authorizationAct ||
      initialData?.recognitionPortaria ||
      currentCourse?.authorizationAct ||
      ''
  );
  const [structureDcns, setStructureDcns] = useState<DcnDocument[]>(
    initialData?.dcns || currentCourse?.dcns || []
  );
  const [isDcnModalOpen, setIsDcnModalOpen] = useState(false);

  const [degrees, setDegrees] = useState<Course['degrees']>(
    initialData?.degrees || currentCourse?.degrees || 'Bacharelado'
  );
  const [internshipRequirement, setInternshipRequirement] = useState<RequirementLevel>(
    initialData?.internshipRequirement || currentCourse?.internshipRequirement || 'Não Informado'
  );
  const [minInternshipHours, setMinInternshipHours] = useState<number | undefined>(
    initialData?.minInternshipHours ?? currentCourse?.minInternshipHours
  );
  const [complementaryRequirement, setComplementaryRequirement] = useState<RequirementLevel>(
    initialData?.complementaryRequirement ||
      currentCourse?.complementaryRequirement ||
      'Não Informado'
  );
  const [finalPaperRequirement, setFinalPaperRequirement] = useState<RequirementLevel>(
    initialData?.finalPaperRequirement || currentCourse?.finalPaperRequirement || 'Não Informado'
  );
  const [coordinatorName, setCoordinatorName] = useState(
    initialData?.coordinatorName || currentCourse?.coordinatorName || ''
  );
  const [coordinatorEmail, setCoordinatorEmail] = useState(
    initialData?.coordinatorEmail || currentCourse?.coordinatorEmail || ''
  );

  const [complementaryTotalHours, setComplementaryTotalHours] = useState<number>(
    initialData?.complementaryTotalHours ?? currentCourse?.complementaryTotalHours ?? 0
  );
  const [complementaryModality, setComplementaryModality] = useState<DeliveryModalityFlag>(
    initialData?.complementaryModality ?? currentCourse?.complementaryModality ?? 'assincrono'
  );
  const [extensionTotalHours, setExtensionTotalHours] = useState<number>(
    initialData?.extensionTotalHours ?? currentCourse?.extensionTotalHours ?? 0
  );
  const [extensionModality, setExtensionModality] = useState<DeliveryModalityFlag>(
    initialData?.extensionModality ?? currentCourse?.extensionModality ?? 'presencial'
  );

  // Periods (for disciplinar)
  const [periods, setPeriods] = useState<PeriodData[]>(
    initialData?.periods || [
      {
        id: 'p-1',
        number: 1,
        totalCredits: 20,
        totalHours: 400,
        disciplines: [
          {
            id: 'd-1',
            code: 'DISC001',
            name: 'Introdução ao Campo Profissional',
            type: 'Obrigatória',
            credits: 4,
            hours: 80,
            evaluationForm: 'Resultado Final',
            modalityDelivery: 'presencial',
            flags: { classroom: 'presencial', internship: 'presencial', complementaryActivity: 'presencial', extension: 'presencial' },
          },
        ],
      },
    ]
  );

  // Modules (for modular)
  const [modules, setModules] = useState<ModuleData[]>(
    initialData?.modules || [
      {
        id: 'm-1',
        number: 1,
        code: 'MOD-01',
        title: 'Módulo Fundamental e Integrador',
        hours: 325,
        disciplines: [
          {
            id: 'md-1',
            code: 'COMP001',
            name: 'Fundamentos e Prática Profissional',
            type: 'Obrigatória',
            credits: 4,
            hours: 80,
            modalityDelivery: 'presencial',
            flags: { classroom: 'presencial', internship: 'presencial', complementaryActivity: 'presencial', extension: 'presencial' },
          },
        ],
        competencies: [
          { id: 'c-1', category: 'conhecimento', name: 'Compreender conceitos teóricos fundamentais' },
          { id: 'c-2', category: 'habilidade', name: 'Aplicar metodologia de resolução de problemas' },
          { id: 'c-3', category: 'atitude', name: 'Atuar com responsabilidade ética e visão crítica' },
        ],
      },
    ]
  );

  // State for Add Course Modal
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseHours, setNewCourseHours] = useState(3000);
  const [newCourseDcn, setNewCourseDcn] = useState('');
  const [newCourseCine, setNewCourseCine] = useState('');
  const [newCourseAuthorizationAct, setNewCourseAuthorizationAct] = useState('');

  // Update linked fields when course changes
  const applyCourseData = (selected: Course) => {
    setRequiredTotalHours(selected.minTotalHours);
    setDcnRef(selected.activeDcn || '');
    setCineBrasilRef(selected.cineBrasilCode || '');
    setAuthorizationAct(selected.authorizationAct || '');
    setStructureDcns(selected.dcns || []);
    if (selected.modality) setModality(selected.modality);
    setDegrees(selected.degrees || 'Bacharelado');
    setInternshipRequirement(selected.internshipRequirement || 'Não Informado');
    setMinInternshipHours(selected.minInternshipHours);
    setComplementaryRequirement(selected.complementaryRequirement || 'Não Informado');
    setComplementaryTotalHours(selected.complementaryTotalHours ?? 0);
    setExtensionTotalHours(selected.extensionTotalHours ?? 0);
    setFinalPaperRequirement(selected.finalPaperRequirement || 'Não Informado');
    setCoordinatorName(selected.coordinatorName || '');
    setCoordinatorEmail(selected.coordinatorEmail || '');
  };

  const handleCourseChange = (courseId: string) => {
    setSelectedCourseId(courseId);
    const selected = courses.find((c) => c.id === courseId);
    if (selected) applyCourseData(selected);
  };

  // Quick course modal submit
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName || !newCourseCode) return;
    const newCourse: Course = {
      id: `course-${Date.now()}`,
      code: newCourseCode.toUpperCase(),
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
    setRequiredTotalHours(newCourse.minTotalHours);
    setDcnRef(newCourse.activeDcn);
    setCineBrasilRef(newCourse.cineBrasilCode);
    setAuthorizationAct(newCourse.authorizationAct || '');
    setShowAddCourseModal(false);
    setNewCourseName('');
    setNewCourseCode('');
    setNewCourseAuthorizationAct('');
  };

  // Calculations for current form
  const currentStructurePreview: CurriculumStructure = {
    id: initialData?.id || `struct-${Date.now()}`,
    code,
    courseId: selectedCourseId,
    courseName: currentCourse?.name || 'Curso Selecionado',
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
    calculatedTotalHours: 0,
    calculatedPresentialHours: 0,
    calculatedEadHours: 0,
    calculatedExtensionHours: 0,
    calculatedComplementaryHours: initialData?.calculatedComplementaryHours || 0,
    calculatedInternshipHours: 0,
    totalCredits: 0,
    periods: structureType === 'disciplinar' ? periods : undefined,
    modules: structureType === 'modular' ? modules : undefined,
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

  const canSave = isChTotalValid && isPresentialValid && code.trim().length > 0;

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
          name: 'Nova Disciplina',
          type: 'Obrigatória',
          credits: 4,
          hours: 80,
          evaluationForm: modality === 'EAD' ? 'Nota (EAD)' : 'Resultado Final',
          modalityDelivery: modality === 'EAD' ? 'assincrono' : 'presencial',
          flags: { classroom: 'presencial', internship: 'presencial', complementaryActivity: 'presencial', extension: 'presencial' },
        };
        return { ...p, disciplines: [...p.disciplines, newD] };
      })
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
      title: branch ? `Módulo Específico ${nextNum}${branch}` : `Módulo Integrado ${nextNum}`,
      hours: 325,
      disciplines: [],
      competencies: [
        { id: `c-1-${Date.now()}`, category: 'conhecimento', name: 'Conhecimentos teóricos do módulo' },
        { id: `c-2-${Date.now()}`, category: 'habilidade', name: 'Habilidades procedimentais aplicadas' },
        { id: `c-3-${Date.now()}`, category: 'atitude', name: 'Atitudes éticas e postura profissional' },
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
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.code}] {c.name} - Mín. {c.minTotalHours}h
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
            </div>

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
                onChange={(e) => setModality(e.target.value as any)}
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

          {/* Dados do curso (carregados automaticamente; editáveis) */}
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
            <p className="text-xs font-bold text-[#002B49] uppercase tracking-wider">
              Dados do curso selecionado (editáveis nesta estrutura)
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
            {/* Atividades Complementares — apenas CH */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Atividades Complementares (CH)
              </label>
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
              <p className="text-[10px] text-slate-500">
                Deve corresponder à CH mínima de atividades complementares informada no cadastro/lote do curso.
              </p>
            </div>

            {/* Extensão */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Carga Horária de Extensão (CH Total & Modalidade)
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
                    onChange={(e) => setExtensionModality(e.target.value as any)}
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
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Conteúdo Curricular (Modular ou Disciplinar) */}
        {structureType === 'disciplinar' ? (
          /* Editor Disciplinar */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#002B49]">
                  3. Períodos Letivos & Disciplinas
                </h3>
                <p className="text-xs text-slate-500">
                  Gerencie as disciplinas de cada período com código, créditos, horas e flags de oferta.
                </p>
              </div>
              <button
                type="button"
                onClick={addPeriod}
                className="px-3.5 py-1.5 rounded-lg bg-[#002B49] text-white text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Período
              </button>
            </div>

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
                    {period.disciplines.map((disc, dIdx) => (
                      <div key={disc.id} className="bg-white p-3 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 gap-2 text-xs items-center">
                        <div className="lg:col-span-2">
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
                            value={disc.credits}
                            onChange={(e) => {
                              const updated = [...periods];
                              updated[pIdx].disciplines[dIdx].credits = Number(e.target.value);
                              setPeriods(updated);
                            }}
                            className="w-full px-2 py-1 border rounded text-xs text-center"
                          />
                        </div>

                        <div className="lg:col-span-1">
                          <label className="text-[10px] text-slate-400 block">Horas (h)</label>
                          <input
                            type="number"
                            value={disc.hours}
                            onChange={(e) => {
                              const updated = [...periods];
                              updated[pIdx].disciplines[dIdx].hours = Number(e.target.value);
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
                              updated[pIdx].disciplines[dIdx].modalityDelivery = e.target.value as any;
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

                        <div className="lg:col-span-1 flex items-center gap-1 pt-3">
                          <label className="text-[10px] text-slate-700 flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={disc.isExtension}
                              onChange={(e) => {
                                const updated = [...periods];
                                updated[pIdx].disciplines[dIdx].isExtension = e.target.checked;
                                setPeriods(updated);
                              }}
                            />
                            <span>Extensão</span>
                          </label>
                        </div>

                        <div className="lg:col-span-1 text-right pt-3">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...periods];
                              updated[pIdx].disciplines = updated[pIdx].disciplines.filter((_, i) => i !== dIdx);
                              setPeriods(updated);
                            }}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
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
                  Cadastre os módulos do tronco comum e ramificações (ex: 9A/9B, 10A/10B) com conhecimentos e saberes.
                </p>
              </div>

              <div className="flex items-center gap-2">
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

            <div className="space-y-6">
              {modules.map((mod, mIdx) => (
                <div 
                  key={mod.id} 
                  className={`border rounded-xl overflow-hidden bg-slate-50/50 ${
                    mod.branch ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
                  }`}
                >
                  <div className="bg-[#002B49] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#FF6B00] text-xs font-black text-white">
                        Módulo {mod.number}
                        {mod.branch ? mod.branch : ''}
                      </span>
                      {mod.branch && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-bold">
                          Trilha {mod.branch}
                        </span>
                      )}
                      <span className="font-bold text-xs truncate max-w-[280px]">{mod.title}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs">
                        <span>CH Módulo:</span>
                        <input
                          type="number"
                          value={mod.hours}
                          onChange={(e) => {
                            const updated = [...modules];
                            updated[mIdx].hours = Number(e.target.value);
                            setModules(updated);
                          }}
                          className="w-16 px-1.5 py-0.5 text-slate-900 bg-white rounded font-bold text-center text-xs"
                        />
                        <span>h</span>
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
                          Nº do Módulo
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={mod.number}
                          onChange={(e) => {
                            const updated = [...modules];
                            updated[mIdx].number = Number(e.target.value) || 1;
                            updated[mIdx].code = `MOD-${String(updated[mIdx].number).padStart(2, '0')}${
                              updated[mIdx].branch || ''
                            }`;
                            setModules(updated);
                          }}
                          className="w-full px-3 py-1.5 border rounded text-xs bg-white"
                        />
                        <p className="text-[9px] text-slate-400 mt-0.5">Ex.: 1, 2… (romano no Excel)</p>
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
                              category: isZabala ? 'conceitual' : 'conhecimento',
                              name: 'Novo saber aplicado',
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
                              <option value={isZabala ? 'conceitual' : 'conhecimento'}>{chaLabels.c}</option>
                              <option value={isZabala ? 'procedimental' : 'habilidade'}>{chaLabels.h}</option>
                              <option value={isZabala ? 'atitudinal' : 'atitude'}>{chaLabels.a}</option>
                              {/* Compatibilidade com valores já salvos */}
                              {!isZabala && (
                                <>
                                  <option value="conceitual">{chaLabels.c}</option>
                                  <option value="procedimental">{chaLabels.h}</option>
                                  <option value="atitudinal">{chaLabels.a}</option>
                                </>
                              )}
                              {isZabala && (
                                <>
                                  <option value="conhecimento">{chaLabels.c}</option>
                                  <option value="habilidade">{chaLabels.h}</option>
                                  <option value="atitude">{chaLabels.a}</option>
                                </>
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
                              placeholder="Descrição do saber"
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
                              name: 'Novo conhecimento aplicado',
                              category: 'saber-conceitual',
                              hours: 20,
                              modalityDelivery: 'presencial',
                            });
                            setModules(updated);
                          }}
                          className="text-[11px] font-bold text-[#002B49] hover:underline"
                        >
                          + Adicionar Conhecimento
                        </button>
                      </div>

                      <div className="space-y-2">
                        {mod.knowledges?.map((know, kIdx) => (
                          <div key={know.id} className="bg-white p-2 rounded border border-sky-200/80 flex flex-wrap items-center gap-2 text-xs">
                            <select
                              value={know.category}
                              onChange={(e) => {
                                const updated = [...modules];
                                if (updated[mIdx].knowledges) {
                                  updated[mIdx].knowledges[kIdx].category = e.target.value as any;
                                  setModules(updated);
                                }
                              }}
                              className="px-2 py-1 rounded border text-[11px] font-bold bg-white text-sky-900"
                            >
                              <option value="saber-conceitual">Conceitual (Saber)</option>
                              <option value="saber-procedimental">Procedimental (Fazer)</option>
                              <option value="saber-atitudinal">Atitudinal (Ser/Agir)</option>
                            </select>

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
                              placeholder="Nome do conhecimento"
                              className="flex-1 min-w-[180px] px-2 py-1 border rounded text-xs"
                            />

                            <select
                              value={know.modalityDelivery}
                              onChange={(e) => {
                                const updated = [...modules];
                                if (updated[mIdx].knowledges) {
                                  updated[mIdx].knowledges[kIdx].modalityDelivery = e.target.value as any;
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
                                    updated[mIdx].knowledges[kIdx].hours = Number(e.target.value);
                                    setModules(updated);
                                  }
                                }}
                                className="w-14 px-1.5 py-1 border rounded text-xs text-center font-bold text-sky-900"
                              />
                              <span className="text-[10px] text-slate-500">h</span>
                            </div>

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
                        ))}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Código da Sigla *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: MED-VET"
                    value={newCourseCode}
                    onChange={(e) => setNewCourseCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border rounded font-mono"
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
