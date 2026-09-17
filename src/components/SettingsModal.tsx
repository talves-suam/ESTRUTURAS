import React, { useRef, useState } from 'react';
import {
  AppSettings,
  Course,
  ModalityType,
  ReportNoteBlock,
  RequirementLevel,
} from '../types/curriculum';
import { 
  Settings, 
  Save, 
  Layers, 
  Sliders, 
  FileSpreadsheet, 
  CheckCircle2, 
  Sparkles,
  Database,
  Building2,
  FileText,
  Download,
  Upload,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  NotebookPen,
} from 'lucide-react';
import { DcnViewerModal } from './DcnViewerModal';
import { exportCourseBatchTemplate, readCourseBatchFile } from '../services/exportService';
import { DEFAULT_REPORT_NOTES_TITLE, createReportNoteBlock } from '../services/reportNotes';
import {
  COURSE_BATCH_HEADERS,
  applyCourseBatchRows,
  parseCourseBatchText,
  summarizeCourseDcns,
} from '../utils/courseBatch';

interface SettingsModalProps {
  settings: AppSettings;
  courses: Course[];
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onBatchUpdateCourses: (courses: Course[]) => Promise<void>;
  onClose: () => void;
}

const REQUIREMENT_OPTIONS: RequirementLevel[] = ['Obrigatório', 'Opcional', 'Não Informado'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  courses,
  onSaveSettings,
  onBatchUpdateCourses,
  onClose,
}) => {
  const [nomenclature, setNomenclature] = useState<'cha' | 'zabala'>(
    settings.pedagogicalNomenclature
  );
  const [hideValidityDefault, setHideValidityDefault] = useState(
    settings.hideValidityStartDefault
  );
  const [institutionName, setInstitutionName] = useState(settings.institutionName);
  const [defaultEadLimit, setDefaultEadLimit] = useState(settings.defaultEadPercentLimit);
  const [defaultExtensionMin, setDefaultExtensionMin] = useState(settings.defaultExtensionPercentMin);

  const [reportNotesTitle, setReportNotesTitle] = useState(
    settings.reportNotesTitle || DEFAULT_REPORT_NOTES_TITLE
  );
  const [reportNotes, setReportNotes] = useState<{
    disciplinar: ReportNoteBlock[];
    modular: ReportNoteBlock[];
  }>({
    disciplinar: settings.reportNotesDisciplinar || [],
    modular: settings.reportNotesModular || [],
  });
  const [activeNotesType, setActiveNotesType] = useState<'disciplinar' | 'modular'>('disciplinar');

  const [editableCourses, setEditableCourses] = useState<Course[]>(courses);
  const [selectedDcnCourse, setSelectedDcnCourse] = useState<Course | null>(null);
  const [csvText, setCsvText] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  const handleCourseFieldChange = <K extends keyof Course>(
    courseId: string,
    field: K,
    value: Course[K]
  ) => {
    setEditableCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, [field]: value } : c))
    );
  };

  const activeNotesBlocks = reportNotes[activeNotesType];

  const updateActiveNotes = (updater: (blocks: ReportNoteBlock[]) => ReportNoteBlock[]) => {
    setReportNotes((prev) => ({ ...prev, [activeNotesType]: updater(prev[activeNotesType]) }));
  };

  const handleAddNoteBlock = () => {
    updateActiveNotes((blocks) => [...blocks, createReportNoteBlock()]);
  };

  const handleNoteBlockChange = (id: string, field: 'title' | 'text', value: string) => {
    updateActiveNotes((blocks) =>
      blocks.map((block) => (block.id === id ? { ...block, [field]: value } : block))
    );
  };

  const handleRemoveNoteBlock = (id: string) => {
    updateActiveNotes((blocks) => blocks.filter((block) => block.id !== id));
  };

  const handleMoveNoteBlock = (index: number, direction: -1 | 1) => {
    updateActiveNotes((blocks) => {
      const target = index + direction;
      if (target < 0 || target >= blocks.length) return blocks;
      const next = [...blocks];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const applyBatchResult = (result: ReturnType<typeof applyCourseBatchRows>) => {
    const dcnCount = result.courses.reduce((n, c) => n + (c.dcns?.length || 0), 0);
    setEditableCourses(result.courses);
    setSaveSuccessMsg(
      `${result.matchedCount} atualizado(s)${result.createdCount ? `, ${result.createdCount} novo(s)` : ''}. ${dcnCount} DCN(s) vinculadas no total. Clique em Salvar Alterações.`
    );
    setTimeout(() => setSaveSuccessMsg(null), 7000);
  };

  const handleProcessCsv = () => {
    const rows = parseCourseBatchText(csvText);
    if (rows.length === 0) return;
    applyBatchResult(applyCourseBatchRows(editableCourses, rows));
  };

  const handleImportBatchFile = async (file: File | null) => {
    if (!file) return;
    try {
      const rows = await readCourseBatchFile(file);
      if (rows.length === 0) {
        setSaveSuccessMsg('Nenhuma linha de curso encontrada no arquivo.');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
        return;
      }
      applyBatchResult(applyCourseBatchRows(editableCourses, rows));
    } catch (err) {
      console.error(err);
      setSaveSuccessMsg('Falha ao ler o arquivo. Use .xlsx, .xls ou .csv.');
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } finally {
      if (batchFileInputRef.current) batchFileInputRef.current.value = '';
    }
  };

  const handleDeleteCourse = (courseId: string) => {
    const course = editableCourses.find((c) => c.id === courseId);
    if (!course) return;
    if (!window.confirm(`Remover o curso "${course.name}" da lista cadastrada?`)) return;
    setEditableCourses((prev) => prev.filter((c) => c.id !== courseId));
    if (selectedDcnCourse?.id === courseId) setSelectedDcnCourse(null);
    setSaveSuccessMsg(`Curso "${course.name}" removido. Clique em Salvar para confirmar.`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  const handleClearAllCourses = () => {
    if (editableCourses.length === 0) return;
    if (
      !window.confirm(
        `Apagar todos os ${editableCourses.length} curso(s) cadastrados? Esta ação só será permanente após Salvar.`
      )
    ) {
      return;
    }
    setEditableCourses([]);
    setSelectedDcnCourse(null);
    setSaveSuccessMsg('Lista de cursos limpa. Clique em Salvar para confirmar.');
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  const handleSaveAll = async () => {
    const updatedSettings: AppSettings = {
      pedagogicalNomenclature: nomenclature,
      hideValidityStartDefault: hideValidityDefault,
      institutionName,
      defaultEadPercentLimit: defaultEadLimit,
      defaultPresentialPercentMin: settings.defaultPresentialPercentMin || 60,
      defaultExtensionPercentMin: defaultExtensionMin,
      campusDefault: settings.campusDefault || 'Sede: UNISUAM-RJ',
      reportNotesTitle: reportNotesTitle.trim() || DEFAULT_REPORT_NOTES_TITLE,
      reportNotesDisciplinar: reportNotes.disciplinar,
      reportNotesModular: reportNotes.modular,
    };

    await onSaveSettings(updatedSettings);
    await onBatchUpdateCourses(editableCourses);
    setSaveSuccessMsg('Configurações e carga em lote salvas!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#002B49] flex items-center justify-center">
              <Settings className="w-6 h-6 text-[#002B49]" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#002B49]">Configurações Institucionais & Carga em Lote</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Alterne nomenclaturas pedagógicas, limites regulatórios e atualize a carga horária de todos os cursos de uma só vez.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-100"
            >
              Voltar
            </button>
            <button
              onClick={handleSaveAll}
              className="px-5 py-2 rounded-lg bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-black transition flex items-center gap-1.5 shadow-md"
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {saveSuccessMsg}
          </div>
        )}

        {/* Section 1: Pedagogical Nomenclature */}
        <div className="py-6 border-b border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-[#002B49] uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF6B00]" />
            1. Nomenclatura Pedagógica dos Módulos
          </h3>
          <p className="text-xs text-slate-500">
            Escolha o modelo taxonômico para os cursos modulares em todo o sistema, relatórios impressos, PDF, Excel e HTML interativo.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Opção CHA */}
            <div
              onClick={() => setNomenclature('cha')}
              className={`p-4 rounded-xl border cursor-pointer transition select-none ${
                nomenclature === 'cha'
                  ? 'border-[#002B49] bg-blue-50/50 ring-2 ring-[#002B49]'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-[#002B49]">Padrão Tradicional (CHA)</span>
                {nomenclature === 'cha' && <CheckCircle2 className="w-4 h-4 text-[#002B49]" />}
              </div>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>• <strong>Saber Conceitual:</strong> Saber teórico e conceitual</li>
                <li>• <strong>Saber Fazer:</strong> Execução prática e procedimentos</li>
                <li>• <strong>Saber Ser:</strong> Postura ética, valores e colaboração</li>
              </ul>
            </div>

            {/* Opção Antoni Zabala */}
            <div
              onClick={() => setNomenclature('zabala')}
              className={`p-4 rounded-xl border cursor-pointer transition select-none ${
                nomenclature === 'zabala'
                  ? 'border-[#FF6B00] bg-orange-50/50 ring-2 ring-[#FF6B00]'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-[#D45500]">Padrão Antoni Zabala (Matrix Builder)</span>
                {nomenclature === 'zabala' && <CheckCircle2 className="w-4 h-4 text-[#FF6B00]" />}
              </div>
              <ul className="text-xs text-slate-600 space-y-1">
                <li>• <strong>Conceitual:</strong> Fatos, conceitos e princípios estruturantes</li>
                <li>• <strong>Procedimental:</strong> Métodos, técnicas e operações aplicadas</li>
                <li>• <strong>Atitudinal:</strong> Valores, normas e responsabilidade social</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Section 2: Regulação & Visualização */}
        <div className="py-6 border-b border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-[#002B49] uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#FF6B00]" />
            2. Padrões Regulatórios Institucionais
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Nome da Instituição</label>
              <input
                type="text"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Teto Máximo EAD Padrão (%)</label>
              <input
                type="number"
                value={defaultEadLimit}
                onChange={(e) => setDefaultEadLimit(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Mínimo Extensão Curricular (%)</label>
              <input
                type="number"
                value={defaultExtensionMin}
                onChange={(e) => setDefaultExtensionMin(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hideValidityDefault}
                onChange={(e) => setHideValidityDefault(e.target.checked)}
                className="rounded text-[#002B49]"
              />
              <span>Ocultar data de início da vigência da estrutura por padrão em novas estruturas</span>
            </label>
          </div>
        </div>

        {/* Section 3: Página de Observações (2ª página dos relatórios) */}
        <div className="py-6 border-b border-slate-200 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#002B49] uppercase tracking-wider flex items-center gap-2">
              <NotebookPen className="w-4 h-4 text-[#FF6B00]" />
              3. Página de Observações, Regras e Explicações da Ementa
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-4xl">
              Este conteúdo é gerado como 2ª página nas exportações em PDF, PNG e HTML, com o mesmo
              cabeçalho institucional da primeira. Cadastre quantos títulos e textos precisar; o
              conteúdo é separado por tipo de estrutura. Linhas iniciadas por “-” viram lista.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Título da Página</label>
              <input
                type="text"
                value={reportNotesTitle}
                onChange={(e) => setReportNotesTitle(e.target.value)}
                placeholder={DEFAULT_REPORT_NOTES_TITLE}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <span className="font-bold text-slate-700 block mb-1">Tipo de Estrutura</span>
              <div className="flex items-center gap-2">
                {(['disciplinar', 'modular'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveNotesType(type)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                      activeNotesType === type
                        ? 'bg-[#002B49] text-white border-[#002B49]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {type === 'disciplinar' ? 'Disciplinar' : 'Modular'}
                    <span
                      className={`ml-1.5 ${
                        activeNotesType === type ? 'text-[#FF9B4A]' : 'text-slate-400'
                      }`}
                    >
                      ({reportNotes[type].length})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {activeNotesBlocks.length === 0 && (
              <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4">
                Nenhuma observação cadastrada para estruturas{' '}
                {activeNotesType === 'disciplinar' ? 'disciplinares' : 'modulares'}. Sem conteúdo, os
                relatórios continuam com apenas uma página.
              </p>
            )}

            {activeNotesBlocks.map((block, index) => (
              <div
                key={block.id}
                className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 w-5 text-center">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={block.title}
                    onChange={(e) => handleNoteBlockChange(block.id, 'title', e.target.value)}
                    placeholder="Título (ex.: Regras de Extensão Curricular)"
                    className="flex-1 px-3 py-2 border rounded-lg text-xs font-bold text-[#002B49]"
                  />
                  <button
                    type="button"
                    onClick={() => handleMoveNoteBlock(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveNoteBlock(index, 1)}
                    disabled={index === activeNotesBlocks.length - 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveNoteBlock(block.id)}
                    className="p-1.5 rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50"
                    title="Remover bloco"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={block.text}
                  onChange={(e) => handleNoteBlockChange(block.id, 'text', e.target.value)}
                  placeholder="Texto da observação, regra ou explicação sobre o conteúdo da ementa."
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg text-xs leading-relaxed"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddNoteBlock}
              className="px-3 py-2 rounded-lg bg-[#002B49] hover:bg-[#003a63] text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar título e texto
            </button>
          </div>
        </div>

        {/* Section 4: Carga em Lote — Dados dos Cursos */}
        <div className="py-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#002B49] uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                4. Carga em Lote — Dados dos Cursos
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-4xl">
                Prefira Excel (.xlsx). Colunas: {COURSE_BATCH_HEADERS.join('; ')}.
                Use Nome DCN (identificação) e Link DCN (Google Drive/PDF);
                várias na mesma linha na mesma ordem, separadas por |.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportCourseBatchTemplate(editableCourses)}
                className="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 flex items-center gap-1.5"
                title="Baixa a planilha com os cursos atuais em formato Excel"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar planilha Excel
              </button>
              <button
                type="button"
                onClick={() => exportCourseBatchTemplate()}
                className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5"
                title="Baixa modelo em branco com exemplos"
              >
                <Download className="w-3.5 h-3.5" />
                Modelo vazio
              </button>
              <button
                type="button"
                onClick={() => batchFileInputRef.current?.click()}
                className="px-3 py-2 rounded-lg bg-[#002B49] hover:bg-[#003a63] text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar Excel
              </button>
              <button
                type="button"
                onClick={handleClearAllCourses}
                disabled={editableCourses.length === 0}
                className="px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Apagar todos
              </button>
              <input
                ref={batchFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => handleImportBatchFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <label className="font-bold text-xs text-slate-700 block">
              Opcional — colar dados (separados por ponto e vírgula ou tabulação). Recomendado: Importar Excel.
            </label>
            <div className="flex gap-2">
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={
                  COURSE_BATCH_HEADERS.join(';') +
                  '\nAdministração;Bacharelado;Presencial;3000;Obrigatório;300;300;Obrigatório;100;Obrigatório;Maria Silva;maria@unisuam.edu.br;Portaria nº 123/2022;DCN Administração;https://drive.google.com/file/d/xxx/view'
                }
                className="flex-1 h-28 p-2 border rounded font-mono text-[11px] bg-white leading-relaxed"
              />
              <button
                type="button"
                onClick={handleProcessCsv}
                className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 self-start"
              >
                Aplicar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[28rem]">
            <table className="w-full text-[11px] text-left min-w-[2100px]">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th className="px-2.5 py-2">Curso</th>
                  <th className="px-2.5 py-2">Grau</th>
                  <th className="px-2.5 py-2">Modalidade</th>
                  <th className="px-2.5 py-2">CH Mínima</th>
                  <th className="px-2.5 py-2">Estágio</th>
                  <th className="px-2.5 py-2">CH Estágio</th>
                  <th className="px-2.5 py-2">Extensão</th>
                  <th className="px-2.5 py-2">Ativ. Comp.</th>
                  <th className="px-2.5 py-2">CH Ativ. Comp.</th>
                  <th className="px-2.5 py-2">TCC</th>
                  <th className="px-2.5 py-2">Coordenador</th>
                  <th className="px-2.5 py-2">E-mail</th>
                  <th className="px-2.5 py-2">Ato Autorizativo</th>
                  <th className="px-2.5 py-2">DCNs do curso</th>
                  <th className="px-2.5 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {editableCourses.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={c.name}
                        onChange={(e) => handleCourseFieldChange(c.id, 'name', e.target.value)}
                        className="w-40 px-1.5 py-1 border rounded bg-slate-50"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <select
                        value={c.degrees === 'Tecnólogo' ? 'Tecnológico' : c.degrees || 'Bacharelado'}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'degrees', e.target.value as Course['degrees'])
                        }
                        className="px-1.5 py-1 border rounded bg-slate-50"
                      >
                        <option value="Bacharelado">Bacharelado</option>
                        <option value="Licenciatura">Licenciatura</option>
                        <option value="Tecnológico">Tecnológico</option>
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <select
                        value={c.modality}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'modality', e.target.value as ModalityType)
                        }
                        className="px-1.5 py-1 border rounded bg-slate-50"
                      >
                        <option value="Presencial">Presencial</option>
                        <option value="Semipresencial">Semipresencial</option>
                        <option value="EAD">EAD</option>
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="number"
                        value={c.minTotalHours}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'minTotalHours', Number(e.target.value))
                        }
                        className="w-20 px-1.5 py-1 border rounded font-bold text-[#FF6B00] bg-slate-50 text-center"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <select
                        value={c.internshipRequirement || 'Não Informado'}
                        onChange={(e) =>
                          handleCourseFieldChange(
                            c.id,
                            'internshipRequirement',
                            e.target.value as RequirementLevel
                          )
                        }
                        className="px-1.5 py-1 border rounded bg-slate-50"
                      >
                        {REQUIREMENT_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={
                          c.minInternshipHours === undefined
                            ? 'Não Informado'
                            : String(c.minInternshipHours)
                        }
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          handleCourseFieldChange(
                            c.id,
                            'minInternshipHours',
                            /não inform|nao inform|^$/i.test(v)
                              ? undefined
                              : Number(v.replace(/\D/g, '')) || undefined
                          );
                        }}
                        className="w-24 px-1.5 py-1 border rounded bg-slate-50 text-center"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="number"
                        value={c.extensionTotalHours ?? 0}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'extensionTotalHours', Number(e.target.value))
                        }
                        className="w-20 px-1.5 py-1 border rounded bg-slate-50 text-center"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <select
                        value={c.complementaryRequirement || 'Não Informado'}
                        onChange={(e) =>
                          handleCourseFieldChange(
                            c.id,
                            'complementaryRequirement',
                            e.target.value as RequirementLevel
                          )
                        }
                        className="px-1.5 py-1 border rounded bg-slate-50"
                      >
                        {REQUIREMENT_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={
                          c.complementaryTotalHours === undefined
                            ? 'Não Informado'
                            : String(c.complementaryTotalHours)
                        }
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          handleCourseFieldChange(
                            c.id,
                            'complementaryTotalHours',
                            /não inform|nao inform|^$/i.test(v)
                              ? undefined
                              : Number(v.replace(/\D/g, '')) || undefined
                          );
                        }}
                        className="w-24 px-1.5 py-1 border rounded bg-slate-50 text-center"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <select
                        value={c.finalPaperRequirement || 'Não Informado'}
                        onChange={(e) =>
                          handleCourseFieldChange(
                            c.id,
                            'finalPaperRequirement',
                            e.target.value as RequirementLevel
                          )
                        }
                        className="px-1.5 py-1 border rounded bg-slate-50"
                      >
                        {REQUIREMENT_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={c.coordinatorName || ''}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'coordinatorName', e.target.value)
                        }
                        className="w-36 px-1.5 py-1 border rounded bg-slate-50"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="email"
                        value={c.coordinatorEmail || ''}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'coordinatorEmail', e.target.value)
                        }
                        className="w-40 px-1.5 py-1 border rounded bg-slate-50"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="text"
                        value={c.authorizationAct || ''}
                        onChange={(e) =>
                          handleCourseFieldChange(c.id, 'authorizationAct', e.target.value)
                        }
                        className="w-44 px-1.5 py-1 border rounded bg-slate-50"
                      />
                    </td>
                    <td className="px-2.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDcnCourse(c)}
                        className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-[#002B49] text-[10px] font-bold border border-blue-200 flex flex-col items-start gap-0.5 max-w-[220px]"
                        title={summarizeCourseDcns(c)}
                      >
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3 text-red-500" /> DCNs ({c.dcns?.length || 0})
                        </span>
                        <span className="text-[9px] font-medium text-slate-600 normal-case whitespace-normal text-left line-clamp-2">
                          {summarizeCourseDcns(c)}
                        </span>
                      </button>
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteCourse(c.id)}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700"
                        title={`Apagar ${c.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {editableCourses.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-4 py-8 text-center text-slate-500 text-xs">
                      Nenhum curso cadastrado. Importe a planilha Excel ou use o modelo vazio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer save */}
        <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border text-slate-600 text-xs font-semibold"
          >
            Fechar
          </button>
          <button
            onClick={handleSaveAll}
            className="px-6 py-2 rounded-lg bg-[#FF6B00] text-white text-xs font-black shadow-md"
          >
            Salvar Todas as Configurações
          </button>
        </div>
      </div>

      {/* Modal para Visualizar / Cadastrar PDFs das DCNs deste Curso */}
      {selectedDcnCourse && (
        <DcnViewerModal
          isOpen={!!selectedDcnCourse}
          onClose={() => setSelectedDcnCourse(null)}
          course={selectedDcnCourse}
          onUpdateCourseDcns={async (courseId, updatedDcns) => {
            const updated = editableCourses.map((c) =>
              c.id === courseId
                ? {
                    ...c,
                    dcns: updatedDcns,
                    activeDcn: updatedDcns.length > 0 ? (updatedDcns[0].resolutionNumber || updatedDcns[0].title) : c.activeDcn,
                  }
                : c
            );
            setEditableCourses(updated);
            setSelectedDcnCourse((prev) => prev ? { ...prev, dcns: updatedDcns } : null);
            await onBatchUpdateCourses(updated);
          }}
        />
      )}
    </div>
  );
};
