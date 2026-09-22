import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CurriculumStructure, 
  AppSettings, 
  Discipline,
  ModuleData, 
  PeriodData,
  getDisciplineChBreakdown,
  getModuleCompetences,
  getGraduateProfileAspects,
  normalizeModuleCompetences,
  structureHasPresentialSplit,
  getPresentialSplitFlags,
  withStructurePresentialFlags,
  showsComponentCodeColumn,
} from '../types/curriculum';
import { 
  FileText, 
  Download, 
  Printer, 
  Share2, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Edit3, 
  Check, 
  BookOpen, 
  Clock, 
  Layers, 
  Award,
  GitBranch,
  Eye,
  EyeOff
} from 'lucide-react';
import { exportToXLSX, exportToInteractiveHTML, exportToPNG, exportElementToPDF } from '../services/exportService';
import { PpcExportMenu } from './PpcExportMenu';
import { RegulatoryValidator } from './RegulatoryValidator';
import { DcnViewerModal } from './DcnViewerModal';
import { WorkloadSummaryCard } from './WorkloadSummaryCard';
import { ModuleMeetingsSummaryCard } from './ModuleMeetingsSummaryCard';
import { StructureOfficialHeader } from './StructureOfficialHeader';
import { PpcSummaryPreview } from './PpcSummaryPreview';
import { ModuleCompetencesTableCards } from './ModuleCompetencesTableCards';
import { getSaberesLabels, matchesSaberesColumn } from '../utils/nomenclature';
import { formatModuleName } from '../utils/roman';
import { getModularComponents } from '../utils/modularComponents';
import { showsModuleMeetings } from '../services/workloadSummary';
import { hasPpcSummary } from '../services/ppcSummary';

interface CurriculumTableProps {
  structure: CurriculumStructure;
  settings: AppSettings;
  onEdit: (structure: CurriculumStructure) => void;
  onSwitchToGraph: () => void;
}

export const CurriculumTable: React.FC<CurriculumTableProps> = ({
  structure,
  settings,
  onEdit,
  onSwitchToGraph,
}) => {
  const [expandedModules, setExpandedModules] = useState<{ [key: string]: boolean }>({});
  const [activeTab, setActiveTab] = useState<'matrix' | 'regulatory'>('matrix');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isDcnModalOpen, setIsDcnModalOpen] = useState(false);
  const [exportToast, setExportToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const exportToastTimer = useRef<number>(0);
  const showExportToast = (message: string, type: 'info' | 'success' | 'error', ms?: number) => {
    setExportToast({ message, type });
    window.clearTimeout(exportToastTimer.current);
    exportToastTimer.current = window.setTimeout(
      () => setExportToast(null),
      ms ?? (type === 'info' ? 4000 : 5000)
    );
  };
  const [hideCompetenciesInReport, setHideCompetenciesInReport] = useState(
    structure.hideCompetenciesInReport ?? false
  );
  const [hideKnowledgesInReport, setHideKnowledgesInReport] = useState(
    structure.hideKnowledgesInReport ?? false
  );
  const [hideModuleCompetencesInReport, setHideModuleCompetencesInReport] = useState(
    structure.hideModuleCompetencesInReport ?? false
  );
  const [hideWorkloadSummaryInReport, setHideWorkloadSummaryInReport] = useState(
    structure.hideWorkloadSummaryInReport ?? false
  );
  const splitFlags = getPresentialSplitFlags(structure);
  const usePresentialSplit = splitFlags.enabled;
  const showCodeCol = showsComponentCodeColumn(structure);
  const presentialColSpan = 1 + (splitFlags.hasLaboratory ? 1 : 0) + (splitFlags.hasClinical ? 1 : 0);
  const chOf = (disc: Parameters<typeof getDisciplineChBreakdown>[0]) =>
    getDisciplineChBreakdown(withStructurePresentialFlags(disc, structure));

  useEffect(() => {
    setHideCompetenciesInReport(structure.hideCompetenciesInReport ?? false);
    setHideKnowledgesInReport(structure.hideKnowledgesInReport ?? false);
    setHideModuleCompetencesInReport(structure.hideModuleCompetencesInReport ?? false);
    setHideWorkloadSummaryInReport(structure.hideWorkloadSummaryInReport ?? false);
  }, [
    structure.id,
    structure.hideCompetenciesInReport,
    structure.hideKnowledgesInReport,
    structure.hideModuleCompetencesInReport,
    structure.hideWorkloadSummaryInReport,
  ]);

  const structureForExport: CurriculumStructure = {
    ...structure,
    hideCompetenciesInReport,
    hideKnowledgesInReport,
    hideModuleCompetencesInReport,
    hideWorkloadSummaryInReport,
  };

  const chaTitle = getSaberesLabels(settings.pedagogicalNomenclature);
  const profileAspects = useMemo(() => getGraduateProfileAspects(structure), [structure]);
  const profileAspectIndex = useMemo(
    () => new Map(profileAspects.map((a, i) => [a.id, i])),
    [profileAspects]
  );

  const toggleModule = (id: string) => {
    setExpandedModules((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const prepareMatrixForCapture = async () => {
    setActiveTab('matrix');
    setSearchTerm('');
    setSelectedBranchFilter('all');
    if (structure.modules) {
      const all: { [key: string]: boolean } = {};
      structure.modules.forEach((m) => (all[m.id] = true));
      setExpandedModules(all);
    }
    // Aguarda o React pintar o conteúdo expandido / filtros limpos
    await new Promise((r) => setTimeout(r, 180));
  };

  const handleExportPNG = async () => {
    setIsExportingPng(true);
    showExportToast('Renderizando e gerando imagem PNG em alta resolução...', 'info');
    try {
      await prepareMatrixForCapture();
      await exportToPNG('curriculum-print-area', `${structure.code}_Estrutura_Curricular_UNISUAM`, {
        structure: structureForExport,
        settings,
      });
      showExportToast('Imagem PNG gerada com sucesso e download iniciado!', 'success');
    } catch (err: any) {
      console.error(err);
      showExportToast('Erro ao gerar PNG: ' + (err?.message || 'Falha na renderização'), 'error');
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExportingPdf(true);
    showExportToast('Gerando PDF com o mesmo visual da tabela...', 'info');
    try {
      await prepareMatrixForCapture();
      await exportElementToPDF(
        'curriculum-print-area',
        `${structure.code}_Estrutura_Curricular_UNISUAM`,
        { structure: structureForExport, settings }
      );
      showExportToast('PDF gerado com sucesso e download iniciado!', 'success');
    } catch (err: any) {
      console.error(err);
      showExportToast('Erro ao gerar PDF: ' + (err?.message || 'Falha na renderização'), 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Check unique branches for modular structures
  const availableBranches = structure.modules
    ? Array.from(new Set(structure.modules.map((m) => m.branch).filter(Boolean))) as string[]
    : [];

  const filteredModules = structure.modules?.filter((m) => {
    if (selectedBranchFilter !== 'all' && m.branch && m.branch !== selectedBranchFilter) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const titleMatch = m.title.toLowerCase().includes(term);
    const codeMatch = m.code.toLowerCase().includes(term);
    const discMatch = getModularComponents(m).some(
      (d) => d.name.toLowerCase().includes(term) || d.code.toLowerCase().includes(term)
    );
    const compMatch = m.competencies?.some((c) => c.name.toLowerCase().includes(term));
    const ppcCompMatch = getModuleCompetences(m).some((c) => c.toLowerCase().includes(term));
    return titleMatch || codeMatch || discMatch || compMatch || ppcCompMatch;
  });

  const filteredPeriods = structure.periods?.map((period) => {
    if (!searchTerm) return period;
    const term = searchTerm.toLowerCase();
    const matchingDiscs = period.disciplines.filter(
      (d) => d.name.toLowerCase().includes(term) || d.code.toLowerCase().includes(term)
    );
    return { ...period, disciplines: matchingDiscs };
  }).filter((p) => p.disciplines.length > 0);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{structure.courseName}</h2>
              <span className="text-xs font-semibold text-slate-500">
                Código: <strong className="text-[#002B49] font-mono">{structure.code}</strong>
              </span>
              {!structure.hideStatus && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  structure.status === 'Ativa'
                    ? 'bg-emerald-100 text-emerald-800'
                    : structure.status === 'Em Desativação'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {structure.status}
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-[#002B49]">
                {structure.modality}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ano/Semestre: <strong className="text-slate-800">{structure.activeYearSemester}</strong>
              {!structure.hideValidity && structure.validityStart && (
                <> • Vigência a partir de: <strong className="text-slate-800">{structure.validityStart}</strong></>
              )}
              {structure.hideValidity && (
                <span className="ml-2 text-[11px] text-slate-400 italic">(Vigência oculta no relatório)</span>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons: Edit, Switch to Graph, and Exports */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSwitchToGraph}
            className="px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs transition flex items-center gap-1.5 border border-indigo-200 shadow-xs"
          >
            <GitBranch className="w-4 h-4 text-indigo-600" />
            Visualização Gráfica / Mapa
          </button>

          <button
            onClick={() => setIsDcnModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#002B49] font-bold text-xs transition flex items-center gap-1.5 border border-blue-200 shadow-xs"
            title="Visualizar e gerenciar arquivos PDF das DCNs vinculadas a este curso"
          >
            <BookOpen className="w-4 h-4 text-[#FF6B00]" />
            DCNs do Curso {structure.dcns?.length ? `(${structure.dcns.length})` : ''}
          </button>

          <button
            onClick={() => onEdit(structure)}
            className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition flex items-center gap-1.5 border border-slate-300"
          >
            <Edit3 className="w-4 h-4 text-slate-600" />
            Editar Estrutura
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex flex-col items-end gap-2 border-l border-slate-200 pl-2">
            <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-slate-600">
              <span className="font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Eye className="w-3 h-3 text-[#FF6B00]" />
                Relatório:
              </span>
              {structure.structureType === 'modular' && (
                <>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!hideModuleCompetencesInReport}
                      onChange={(e) => setHideModuleCompetencesInReport(!e.target.checked)}
                      className="rounded text-[#002B49]"
                    />
                    <span className="flex items-center gap-1">
                      {hideModuleCompetencesInReport ? (
                        <EyeOff className="w-3 h-3 text-slate-400" />
                      ) : (
                        <Eye className="w-3 h-3 text-emerald-600" />
                      )}
                      Competências
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!hideCompetenciesInReport}
                      onChange={(e) => setHideCompetenciesInReport(!e.target.checked)}
                      className="rounded text-[#002B49]"
                    />
                    <span className="flex items-center gap-1">
                      {hideCompetenciesInReport ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-emerald-600" />}
                      Saberes
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!hideKnowledgesInReport}
                      onChange={(e) => setHideKnowledgesInReport(!e.target.checked)}
                      className="rounded text-[#002B49]"
                    />
                    <span className="flex items-center gap-1">
                      {hideKnowledgesInReport ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-emerald-600" />}
                      Conhecimentos
                    </span>
                  </label>
                </>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!hideWorkloadSummaryInReport}
                  onChange={(e) => setHideWorkloadSummaryInReport(!e.target.checked)}
                  className="rounded text-[#002B49]"
                />
                <span className="flex items-center gap-1">
                  {hideWorkloadSummaryInReport ? <EyeOff className="w-3 h-3 text-slate-400" /> : <Eye className="w-3 h-3 text-emerald-600" />}
                  Resumo de Carga Horária
                </span>
              </label>
            </div>
            <div className="flex items-center gap-1">
            <button
              onClick={handleExportPDF}
              disabled={isExportingPdf || isExportingPng}
              title="Baixar PDF com o mesmo visual da tabela"
              className="px-3 py-2 rounded-lg bg-[#002B49] hover:bg-[#003a63] text-white text-xs font-semibold transition flex items-center gap-1 shadow-xs disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-[#FF6B00]" />
              {isExportingPdf ? 'Gerando...' : 'PDF'}
            </button>

            <button
              onClick={() => exportToXLSX(structureForExport, settings)}
              title="Baixar Planilha Excel XLSX completa"
              className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition flex items-center gap-1 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              XLS
            </button>

            <button
              onClick={handleExportPNG}
              disabled={isExportingPng || isExportingPdf}
              title="Gerar Imagem PNG em Alta Resolução"
              className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition flex items-center gap-1 shadow-xs disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {isExportingPng ? 'Gerando...' : 'PNG'}
            </button>

            <button
              onClick={() => exportToInteractiveHTML(structureForExport, settings)}
              title="Exportar HTML Navegável Autônomo"
              className="px-3 py-2 rounded-lg bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-bold transition flex items-center gap-1 shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5" />
              HTML Navegável
            </button>
            <PpcExportMenu
              structure={structureForExport}
              disabled={isExportingPng || isExportingPdf}
              onToast={showExportToast}
              prepareCapture={prepareMatrixForCapture}
            />
            </div>
          </div>
        </div>
      </div>

        {/* Regulatory Constraints Card */}
        <RegulatoryValidator structure={structure} />

        {/* Feedback Toast for PNG Export */}
        {exportToast && (
          <div className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-bold transition animate-in fade-in duration-150 ${
            exportToast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : exportToast.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-300'
              : 'bg-blue-50 text-blue-800 border-blue-300'
          }`}>
            <Sparkles className="w-4 h-4 shrink-0 text-[#FF6B00]" />
            <span>{exportToast.message}</span>
          </div>
        )}

      {/* Navigation Sub-Tabs & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'matrix'
                ? 'bg-[#002B49] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Matriz Curricular ({structure.structureType === 'modular' ? 'Módulos' : 'Períodos'})
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {structure.structureType === 'modular' && availableBranches.length > 0 && (
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-700 focus:ring-2 focus:ring-[#002B49]"
            >
              <option value="all">Todas as Trilhas / Ramificações</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>
                  Trilha {b}
                </option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="Buscar por nome ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#002B49] w-52"
          />
        </div>
      </div>

      {/* Main Printable / Capture Area */}
      <div id="curriculum-print-area" className="space-y-4 bg-slate-50/50 p-2 sm:p-4 rounded-xl border border-slate-100">
        {hasPpcSummary(structure) && <PpcSummaryPreview structure={structure} />}

        <div data-ppc-header>
          <StructureOfficialHeader structure={structure} />
        </div>

        {/* TAB 1: Matriz Curricular */}
        {activeTab === 'matrix' && (
          <>
            {/* Disciplinar View */}
            {structure.structureType === 'disciplinar' && (
              <div className="space-y-4">
                {filteredPeriods?.map((period) => (
                  <div 
                    key={period.id}
                    data-ppc-section={period.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    {/* Period Header */}
                    <div className="bg-[#002B49] text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-[#FF6B00] font-black text-[15px] flex items-center justify-center text-white shadow-xs">
                          {period.number}
                        </span>
                        <h4 className="font-bold text-[17px] tracking-wide">
                          {period.number}º Período - Disciplinas Obrigatórias / Eletivas
                        </h4>
                      </div>
                      <div className="text-[15px] font-semibold bg-white/10 px-3 py-1 rounded-full text-blue-100 flex items-center gap-2">
                        <span>{period.totalCredits} Créditos</span>
                        <span>•</span>
                        <span className="text-[#FF7A00] font-bold">{period.totalHours} Horas</span>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className={`w-full text-left text-[15px] ${usePresentialSplit ? 'min-w-[980px]' : 'min-w-[900px]'}`}>
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[12px]">
                          {usePresentialSplit ? (
                            <>
                              <tr>
                                {showCodeCol && (
                                <th rowSpan={2} className="px-3 py-2 w-20 align-bottom">Código</th>
                                )}
                                <th rowSpan={2} className="px-3 py-2 min-w-[180px] align-bottom">Nome da Disciplina</th>
                                <th rowSpan={2} className="px-2.5 py-2 text-center w-24 align-bottom">Tipo</th>
                                <th rowSpan={2} className="px-2.5 py-2 text-center w-28 align-bottom">Avaliação</th>
                                <th rowSpan={2} className="px-2 py-2 text-center w-14 align-bottom">Créditos</th>
                                <th colSpan={presentialColSpan} className="px-2 py-1.5 text-center bg-blue-50/80 text-[#002B49] border-l border-slate-200">
                                  Presencial
                                </th>
                                <th rowSpan={2} className="px-2 py-2 text-center w-24 bg-blue-50/70 text-[#002B49] border-l border-slate-200 align-bottom leading-tight">
                                  Síncrona<br />Mediada
                                </th>
                                <th rowSpan={2} className="px-2 py-2 text-center w-20 bg-blue-50/70 text-[#002B49] border-l border-slate-200 align-bottom">
                                  Assíncrona
                                </th>
                                <th rowSpan={2} className="px-2.5 py-2 text-center w-16 border-l border-slate-200 align-bottom">
                                  Total
                                </th>
                              </tr>
                              <tr>
                                <th className="px-1.5 py-1.5 text-center w-16 bg-blue-50/50 text-[#002B49] border-l border-slate-200 font-bold">Teórico</th>
                                {splitFlags.hasLaboratory && (
                                  <th className="px-1.5 py-1.5 text-center w-16 bg-blue-50/40 text-[#002B49] font-bold">Laboratório</th>
                                )}
                                {splitFlags.hasClinical && (
                                  <th className="px-1.5 py-1.5 text-center w-16 bg-blue-50/50 text-[#002B49] font-bold">Clínica</th>
                                )}
                              </tr>
                            </>
                          ) : (
                            <tr className="text-[14px]">
                              {showCodeCol && (
                              <th className="px-3 py-3 w-20">Código</th>
                              )}
                              <th className="px-3 py-3 min-w-[200px]">Nome da Disciplina</th>
                              <th className="px-2.5 py-3 text-center w-24">Tipo</th>
                              <th className="px-2.5 py-3 text-center w-28">Avaliação</th>
                              <th className="px-2 py-3 text-center w-16">Créditos</th>
                              <th className="px-2.5 py-3 text-center w-24 bg-blue-50/70 text-[#002B49] border-l border-slate-200">
                                Presencial
                              </th>
                              <th className="px-2.5 py-3 text-center w-28 bg-blue-50/70 text-[#002B49] border-l border-slate-200 leading-tight">
                                Síncrona<br />Mediada
                              </th>
                              <th className="px-2.5 py-3 text-center w-24 bg-blue-50/70 text-[#002B49] border-l border-slate-200">
                                Assíncrona
                              </th>
                              <th className="px-2.5 py-3 text-center w-20 border-l border-slate-200">
                                Total
                              </th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {period.disciplines.map((disc) => {
                            const chBd = chOf(disc);
                            const syncMed = (chBd.syncMediated || 0) + (chBd.sync || 0);
                            return (
                              <tr key={disc.id} className="hover:bg-blue-50/40 transition">
                                {showCodeCol && (
                                <td className="px-3 py-2.5 font-mono font-bold text-[#002B49] text-[15px] whitespace-nowrap">
                                  {disc.code}
                                </td>
                                )}
                                <td className="px-3 py-2.5 font-medium text-slate-900 text-[15px]">
                                  {disc.name}
                                </td>
                                <td className="px-2.5 py-2.5 text-center text-slate-600">
                                  <span className={`px-2 py-0.5 rounded text-[12px] font-semibold ${
                                    disc.type === 'Obrigatória' ? 'bg-slate-100 text-slate-800' : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {disc.type}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2.5 text-center text-slate-500 text-[15px]">
                                  {disc.evaluationForm || 'Nota Oficial'}
                                </td>
                                <td className="px-2 py-2.5 text-center font-bold text-slate-700 text-[15px]">
                                  {disc.credits}
                                </td>
                                {usePresentialSplit ? (
                                  <>
                                    <td className="px-1.5 py-2.5 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                      {chBd.theoretical > 0 ? (
                                        <span className="text-blue-900 font-black">{chBd.theoretical}h</span>
                                      ) : (
                                        <span className="text-slate-300 font-normal">0h</span>
                                      )}
                                    </td>
                                    {splitFlags.hasLaboratory && (
                                      <td className="px-1.5 py-2.5 text-center font-bold text-[15px] bg-blue-50/10">
                                        {chBd.laboratory > 0 ? (
                                          <span className="text-teal-800 font-black">{chBd.laboratory}h</span>
                                        ) : (
                                          <span className="text-slate-300 font-normal">0h</span>
                                        )}
                                      </td>
                                    )}
                                    {splitFlags.hasClinical && (
                                      <td className="px-1.5 py-2.5 text-center font-bold text-[15px] bg-blue-50/20">
                                        {chBd.clinical > 0 ? (
                                          <span className="text-rose-800 font-black">{chBd.clinical}h</span>
                                        ) : (
                                          <span className="text-slate-300 font-normal">0h</span>
                                        )}
                                      </td>
                                    )}
                                  </>
                                ) : (
                                  <td className="px-2.5 py-2.5 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                    {chBd.presential > 0 ? (
                                      <span className="text-blue-900 font-black">{chBd.presential}h</span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">0h</span>
                                    )}
                                  </td>
                                )}
                                <td className="px-2 py-2.5 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                  {syncMed > 0 ? (
                                    <span className="text-blue-900 font-black">{syncMed}h</span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0h</span>
                                  )}
                                </td>
                                <td className="px-2 py-2.5 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                  {chBd.async > 0 ? (
                                    <span className="text-blue-900 font-black">{chBd.async}h</span>
                                  ) : (
                                    <span className="text-slate-300 font-normal">0h</span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2.5 text-center font-black text-[15px] text-[#FF6B00] border-l border-slate-100">
                                  {chBd.total}h
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 text-[15px] font-bold text-slate-700">
                          {(() => {
                            const pPres = period.disciplines.reduce((acc, d) => acc + chOf(d).presential, 0);
                            const pTheo = period.disciplines.reduce((acc, d) => acc + chOf(d).theoretical, 0);
                            const pLab = period.disciplines.reduce((acc, d) => acc + chOf(d).laboratory, 0);
                            const pClin = period.disciplines.reduce((acc, d) => acc + chOf(d).clinical, 0);
                            const pSyncMed = period.disciplines.reduce((acc, d) => {
                              const bd = chOf(d);
                              return acc + bd.syncMediated + (bd.sync || 0);
                            }, 0);
                            const pAsync = period.disciplines.reduce((acc, d) => acc + chOf(d).async, 0);
                            const pTot = period.disciplines.reduce((acc, d) => acc + chOf(d).total, 0);
                            return (
                              <tr>
                                <td colSpan={showCodeCol ? 4 : 3} className="px-3 py-2.5 text-slate-600 text-right">
                                  Subtotal do {period.number}º Período
                                </td>
                                <td className="px-2 py-2.5 text-center text-slate-900 font-bold">
                                  {period.totalCredits}
                                </td>
                                {usePresentialSplit ? (
                                  <>
                                    <td className="px-1.5 py-2.5 text-center text-blue-900 font-black border-l border-slate-200 bg-blue-50/50">
                                      {pTheo}h
                                    </td>
                                    {splitFlags.hasLaboratory && (
                                      <td className="px-1.5 py-2.5 text-center text-teal-900 font-black bg-blue-50/40">
                                        {pLab}h
                                      </td>
                                    )}
                                    {splitFlags.hasClinical && (
                                      <td className="px-1.5 py-2.5 text-center text-rose-900 font-black bg-blue-50/50">
                                        {pClin}h
                                      </td>
                                    )}
                                  </>
                                ) : (
                                  <td className="px-2.5 py-2.5 text-center text-blue-900 font-black border-l border-slate-200 bg-blue-50/50">
                                    {pPres}h
                                  </td>
                                )}
                                <td className="px-2 py-2.5 text-center text-[#002B49] font-black border-l border-slate-200 bg-blue-50/50">
                                  {pSyncMed}h
                                </td>
                                <td className="px-2 py-2.5 text-center text-[#002B49] font-black border-l border-slate-200 bg-blue-50/50">
                                  {pAsync}h
                                </td>
                                <td className="px-2.5 py-2.5 text-center text-[#FF6B00] font-black border-l border-slate-200 bg-orange-50/60">
                                  {pTot || period.totalHours}h
                                </td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modular View */}
            {structure.structureType === 'modular' && (
              <div className="space-y-4">
                {filteredModules?.map((mod) => {
                  const isExpanded = expandedModules[mod.id] ?? true;
                  const isBranch = !!mod.branch;
                  const components = getModularComponents(mod);

                  return (
                    <div 
                      key={mod.id}
                      data-ppc-section={mod.id}
                      className={`bg-white rounded-xl border transition shadow-sm overflow-hidden ${
                        isBranch ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
                      }`}
                    >
                      {/* Module Header */}
                      <div className="bg-[#002B49] text-white px-5 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="flex items-center gap-3 justify-self-start min-w-0">
                          {mod.branch && (
                            <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[15px] font-bold flex items-center gap-1 shrink-0">
                              <GitBranch className="w-3.5 h-3.5" />
                              Trilha {mod.branch}
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-[19px] text-white text-center px-2">
                          {formatModuleName(mod.number, mod.title, mod.branch)}
                        </h4>
                        <div className="flex items-center gap-3 justify-self-end">
                          <div className="text-right">
                            <span className="text-[15px] text-blue-200 block">Carga Horária:</span>
                            <span className="text-[17px] font-black text-[#FF6B00] bg-white/10 px-2.5 py-0.5 rounded">
                              {mod.hours}h
                            </span>
                          </div>
                          {showsModuleMeetings(structure) && (
                          <div className="text-right">
                            <span className="text-[15px] text-blue-200 block">Encontros:</span>
                            <span className="text-[17px] font-black text-white bg-white/10 px-2.5 py-0.5 rounded tabular-nums">
                              {mod.meetings ?? 0}
                            </span>
                          </div>
                          )}

                          <button
                            onClick={() => toggleModule(mod.id)}
                            className="no-export p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                            title={isExpanded ? 'Recolher detalhes de CHA' : 'Expandir detalhes de CHA'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Competências do módulo (acima dos conhecimentos) — cards em texto */}
                      {!hideModuleCompetencesInReport &&
                        normalizeModuleCompetences(mod).length > 0 && (
                        <ModuleCompetencesTableCards
                          mod={mod}
                          aspects={profileAspects}
                          aspectIndex={profileAspectIndex}
                        />
                      )}

                      {/* Conhecimentos do Módulo (em estrutura modular) */}
                      {!hideKnowledgesInReport && components.length > 0 && (
                        <div className="p-4 border-b border-slate-100 overflow-x-auto">
                          <h5 className="text-[15px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                            Conhecimentos do Módulo
                          </h5>
                          <table className={`w-full text-left text-[15px] bg-slate-50/50 rounded-lg border border-slate-200 overflow-hidden ${usePresentialSplit ? 'min-w-[860px]' : 'min-w-[700px]'}`}>
                            <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[12px]">
                              {usePresentialSplit ? (
                                <>
                                  <tr>
                                    <th rowSpan={2} className="px-3 py-2 min-w-[160px] align-bottom">Conhecimento</th>
                                    <th rowSpan={2} className="px-2 py-2 text-center w-24 align-bottom">Tipo</th>
                                    <th colSpan={presentialColSpan} className="px-2 py-1 text-center bg-blue-50/80 text-[#002B49] border-l border-slate-200">Presencial</th>
                                    <th rowSpan={2} className="px-2 py-2 text-center w-24 bg-blue-50/70 text-[#002B49] border-l border-slate-200 align-bottom leading-tight">Síncrona<br />Mediada</th>
                                    <th rowSpan={2} className="px-2 py-2 text-center w-20 bg-blue-50/70 text-[#002B49] border-l border-slate-200 align-bottom">Assíncrona</th>
                                  </tr>
                                  <tr>
                                    <th className="px-1.5 py-1 text-center bg-blue-50/50 text-[#002B49] border-l border-slate-200">Teórico</th>
                                    {splitFlags.hasLaboratory && (
                                      <th className="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Laboratório</th>
                                    )}
                                    {splitFlags.hasClinical && (
                                      <th className="px-1.5 py-1 text-center bg-blue-50/50 text-[#002B49]">Clínica</th>
                                    )}
                                  </tr>
                                </>
                              ) : (
                                <tr>
                                  <th className="px-3 py-2 min-w-[180px]">Conhecimento</th>
                                  <th className="px-2 py-2 text-center w-24">Tipo</th>
                                  <th className="px-2.5 py-2 text-center w-24 bg-blue-50/70 text-[#002B49] border-l border-slate-200">Presencial</th>
                                  <th className="px-2.5 py-2 text-center w-28 bg-blue-50/70 text-[#002B49] border-l border-slate-200 leading-tight">Síncrona<br />Mediada</th>
                                  <th className="px-2.5 py-2 text-center w-24 bg-blue-50/70 text-[#002B49] border-l border-slate-200">Assíncrona</th>
                                </tr>
                              )}
                            </thead>
                            <tbody className="divide-y divide-slate-200/60 bg-white">
                              {components.map((d) => {
                                const chBd = chOf(d);
                                const syncMed = (chBd.syncMediated || 0) + (chBd.sync || 0);
                                return (
                                  <tr key={d.id} className="hover:bg-blue-50/30 transition">
                                    <td className="px-3 py-2 font-medium text-slate-900">{d.name}</td>
                                    <td className="px-2 py-2 text-center text-slate-600">
                                      <span className="px-1.5 py-0.5 rounded text-[12px] bg-slate-100">{d.type}</span>
                                    </td>
                                    {usePresentialSplit ? (
                                      <>
                                        <td className="px-1.5 py-2 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                          {chBd.theoretical > 0 ? <span className="text-blue-900 font-black">{chBd.theoretical}h</span> : <span className="text-slate-300 font-normal">0h</span>}
                                        </td>
                                        {splitFlags.hasLaboratory && (
                                          <td className="px-1.5 py-2 text-center font-bold text-[15px] bg-blue-50/10">
                                            {chBd.laboratory > 0 ? <span className="text-teal-800 font-black">{chBd.laboratory}h</span> : <span className="text-slate-300 font-normal">0h</span>}
                                          </td>
                                        )}
                                        {splitFlags.hasClinical && (
                                          <td className="px-1.5 py-2 text-center font-bold text-[15px] bg-blue-50/20">
                                            {chBd.clinical > 0 ? <span className="text-rose-800 font-black">{chBd.clinical}h</span> : <span className="text-slate-300 font-normal">0h</span>}
                                          </td>
                                        )}
                                      </>
                                    ) : (
                                      <td className="px-2.5 py-2 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                        {chBd.presential > 0 ? <span className="text-blue-900 font-black">{chBd.presential}h</span> : <span className="text-slate-300 font-normal">0h</span>}
                                      </td>
                                    )}
                                    <td className="px-2 py-2 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                      {syncMed > 0 ? <span className="text-blue-900 font-black">{syncMed}h</span> : <span className="text-slate-300 font-normal">0h</span>}
                                    </td>
                                    <td className="px-2 py-2 text-center font-bold text-[15px] bg-blue-50/20 border-l border-slate-100">
                                      {chBd.async > 0 ? <span className="text-blue-900 font-black">{chBd.async}h</span> : <span className="text-slate-300 font-normal">0h</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-100/90 border-t border-slate-200 text-[15px] font-bold text-slate-700">
                              {(() => {
                                const mPres = components.reduce((acc, d) => acc + chOf(d).presential, 0);
                                const mTheo = components.reduce((acc, d) => acc + chOf(d).theoretical, 0);
                                const mLab = components.reduce((acc, d) => acc + chOf(d).laboratory, 0);
                                const mClin = components.reduce((acc, d) => acc + chOf(d).clinical, 0);
                                const mSyncMed = components.reduce((acc, d) => {
                                  const bd = chOf(d);
                                  return acc + bd.syncMediated + (bd.sync || 0);
                                }, 0);
                                const mAsync = components.reduce((acc, d) => acc + chOf(d).async, 0);
                                return (
                                  <tr>
                                    <td colSpan={2} className="px-3 py-2.5 text-slate-600 text-right">
                                      Subtotal dos Conhecimentos
                                    </td>
                                    {usePresentialSplit ? (
                                      <>
                                        <td className="px-1.5 py-2.5 text-center text-blue-900 font-black border-l border-slate-200 bg-blue-50/50">
                                          {mTheo}h
                                        </td>
                                        {splitFlags.hasLaboratory && (
                                          <td className="px-1.5 py-2.5 text-center text-teal-900 font-black bg-blue-50/40">
                                            {mLab}h
                                          </td>
                                        )}
                                        {splitFlags.hasClinical && (
                                          <td className="px-1.5 py-2.5 text-center text-rose-900 font-black bg-blue-50/50">
                                            {mClin}h
                                          </td>
                                        )}
                                      </>
                                    ) : (
                                      <td className="px-2.5 py-2.5 text-center text-blue-900 font-black border-l border-slate-200 bg-blue-50/50">
                                        {mPres}h
                                      </td>
                                    )}
                                    <td className="px-2 py-2.5 text-center text-[#002B49] font-black border-l border-slate-200 bg-blue-50/50">
                                      {mSyncMed}h
                                    </td>
                                    <td className="px-2 py-2.5 text-center text-[#002B49] font-black border-l border-slate-200 bg-blue-50/50">
                                      {mAsync}h
                                    </td>
                                  </tr>
                                );
                              })()}
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {/* Conhecimentos, Habilidades e Atitudes (CHA / Zabala) */}
                      {isExpanded && !hideCompetenciesInReport && (() => {
                        const conceptual = (mod.competencies || []).filter((c) =>
                          matchesSaberesColumn(c.category, 'c')
                        );
                        const procedural = (mod.competencies || []).filter((c) =>
                          matchesSaberesColumn(c.category, 'h')
                        );
                        const attitudinal = (mod.competencies || []).filter((c) =>
                          matchesSaberesColumn(c.category, 'a')
                        );
                        if (
                          conceptual.length + procedural.length + attitudinal.length === 0
                        ) {
                          return null;
                        }
                        const columns = [
                          { key: 'c', title: chaTitle.c, items: conceptual, titleClass: 'text-blue-900 border-blue-200', dotClass: 'bg-blue-600', cardClass: 'border-blue-100' },
                          { key: 'h', title: chaTitle.h, items: procedural, titleClass: 'text-emerald-900 border-emerald-200', dotClass: 'bg-emerald-600', cardClass: 'border-emerald-100' },
                          { key: 'a', title: chaTitle.a, items: attitudinal, titleClass: 'text-amber-900 border-amber-200', dotClass: 'bg-amber-600', cardClass: 'border-amber-100' },
                        ].filter((col) => col.items.length > 0);
                        return (
                        <div className="p-5 bg-gradient-to-br from-orange-50/40 to-blue-50/30 space-y-3">
                          <div className="flex items-center gap-2 border-b border-orange-200/60 pb-2">
                            <Sparkles className="w-4 h-4 text-[#FF6B00]" />
                            <h5 className="text-[15px] font-bold uppercase tracking-wider text-slate-800">
                              {chaTitle.sectionTitle}
                            </h5>
                          </div>

                          <div className={`grid grid-cols-1 gap-3 ${
                            columns.length === 3 ? 'md:grid-cols-3' : columns.length === 2 ? 'md:grid-cols-2' : ''
                          }`}>
                            {columns.map((col) => (
                            <div key={col.key} className="space-y-2">
                              <div className={`flex items-center gap-1.5 text-[15px] font-bold border-b pb-1 ${col.titleClass}`}>
                                <div className={`w-2 h-2 rounded-full ${col.dotClass}`}></div>
                                {col.title}
                              </div>
                              <div className="space-y-1.5">
                                {col.items.map((comp) => (
                                    <div key={comp.id} className={`bg-white p-2.5 rounded-lg border shadow-2xs text-[15px] ${col.cardClass}`}>
                                      <p className="font-medium text-slate-800 leading-relaxed">{comp.name}</p>
                                    </div>
                                  ))}
                              </div>
                            </div>
                            ))}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!hideWorkloadSummaryInReport && (
          <div
            data-ppc-section="summary"
            className={`grid gap-4 items-stretch ${
              showsModuleMeetings(structure)
                ? 'grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)]'
                : 'grid-cols-1'
            }`}
          >
            <WorkloadSummaryCard structure={structure} className="w-full" />
            {showsModuleMeetings(structure) && (
              <ModuleMeetingsSummaryCard structure={structure} className="w-full" />
            )}
          </div>
        )}
      </div>

      {/* Modal de Visualização e Cadastro de DCNs */}
      {isDcnModalOpen && (
        <DcnViewerModal
          isOpen={isDcnModalOpen}
          onClose={() => setIsDcnModalOpen(false)}
          structure={structure}
        />
      )}
    </div>
  );
};
