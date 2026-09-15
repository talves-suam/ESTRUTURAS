import React, { useState } from 'react';
import { CurriculumStructure, AppSettings } from '../types/curriculum';
import { 
  Search, 
  Filter, 
  Layers, 
  FileText, 
  Download, 
  Share2, 
  Printer, 
  GitBranch, 
  Eye, 
  Edit3, 
  Trash2, 
  Copy, 
  Plus, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  UploadCloud,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { exportToPDF, exportToXLSX, exportToInteractiveHTML, exportToPNG } from '../services/exportService';
import { DcnViewerModal } from './DcnViewerModal';

interface StructuresListProps {
  structures: CurriculumStructure[];
  settings: AppSettings;
  onSelectStructure: (structure: CurriculumStructure, view: 'table' | 'graph') => void;
  onEditStructure: (structure: CurriculumStructure) => void;
  onDeleteStructure: (id: string) => Promise<void>;
  onDuplicateStructure: (structure: CurriculumStructure) => Promise<void>;
  onCreateNew: () => void;
  onOpenSagaImport: () => void;
}

export const StructuresList: React.FC<StructuresListProps> = ({
  structures,
  settings,
  onSelectStructure,
  onEditStructure,
  onDeleteStructure,
  onDuplicateStructure,
  onCreateNew,
  onOpenSagaImport,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModality, setSelectedModality] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dcnModalStructure, setDcnModalStructure] = useState<CurriculumStructure | null>(null);

  const filteredStructures = structures.filter((s) => {
    if (selectedModality !== 'all' && s.modality !== selectedModality) return false;
    if (selectedType !== 'all' && s.structureType !== selectedType) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      s.courseName.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term) ||
      s.activeYearSemester.toLowerCase().includes(term) ||
      (s.dcnRef && s.dcnRef.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Stats & CTA */}
      <div className="bg-gradient-to-r from-[#002B49] via-[#003B66] to-[#00223A] rounded-2xl text-white p-6 shadow-xl border border-blue-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#FF6B00]/10 to-transparent pointer-events-none"></div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FF6B00] text-white uppercase tracking-wider">
                UNISUAM • Sistema Oficial
              </span>
              <span className="text-xs text-blue-200">
                Sincronizado com Firebase Cloud Firestore
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Cadastro e Gestão de Estruturas Curriculares
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 font-normal leading-relaxed">
              Consulte, elabore matrizes disciplinares e modulares com CHA/Zabala, ramificações de trilha e exportação em PNG, PDF, XLS e HTML Navegável.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="cta-create-structure"
              onClick={onCreateNew}
              className="px-4 py-2.5 rounded-xl bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-orange-950/20"
            >
              <Plus className="w-4 h-4" />
              Nova Estrutura
            </button>

            <button
              onClick={onOpenSagaImport}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-2 border border-white/20"
            >
              <UploadCloud className="w-4 h-4 text-emerald-300" />
              Importar do SAGA
            </button>
          </div>
        </div>

        {/* Quick counter metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-5 border-t border-white/10 text-xs">
          <div>
            <span className="text-blue-300 block text-[11px]">Total de Estruturas</span>
            <span className="text-xl font-extrabold text-white">{structures.length}</span>
          </div>
          <div>
            <span className="text-blue-300 block text-[11px]">Estruturas Modulares</span>
            <span className="text-xl font-extrabold text-[#FF7A00]">
              {structures.filter((s) => s.structureType === 'modular').length}
            </span>
          </div>
          <div>
            <span className="text-blue-300 block text-[11px]">Estruturas Disciplinares</span>
            <span className="text-xl font-extrabold text-blue-100">
              {structures.filter((s) => s.structureType === 'disciplinar').length}
            </span>
          </div>
          <div>
            <span className="text-blue-300 block text-[11px]">Estrutura EAD</span>
            <span className="text-xl font-extrabold text-emerald-300">
              {structures.filter((s) => s.modality === 'EAD').length}
            </span>
          </div>
          <div>
            <span className="text-blue-300 block text-[11px]">Estrutura Presencial</span>
            <span className="text-xl font-extrabold text-sky-200">
              {structures.filter((s) => s.modality === 'Presencial').length}
            </span>
          </div>
          <div>
            <span className="text-blue-300 block text-[11px]">Estrutura Semipresencial</span>
            <span className="text-xl font-extrabold text-amber-300">
              {structures.filter((s) => s.modality === 'Semipresencial').length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por curso, código da estrutura (ex: TAM242, PSI251) ou semestre..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#002B49]"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 font-semibold"
          >
            <option value="all">Todos os Tipos</option>
            <option value="modular">Modular (CHA / Ramificado)</option>
            <option value="disciplinar">Disciplinar (Períodos)</option>
          </select>

          <select
            value={selectedModality}
            onChange={(e) => setSelectedModality(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 font-semibold"
          >
            <option value="all">Todas Modalidades</option>
            <option value="Presencial">Presencial</option>
            <option value="Semipresencial">Semipresencial</option>
            <option value="EAD">EAD</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 font-semibold"
          >
            <option value="all">Todos os Status</option>
            <option value="Ativa">Ativa</option>
            <option value="Em Desativação">Em Desativação</option>
            <option value="Em Elaboração">Em Elaboração</option>
          </select>
        </div>
      </div>

      {/* Cards Grid */}
      {filteredStructures.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <Layers className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">Nenhuma estrutura curricular encontrada</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Ajuste os filtros ou crie uma nova estrutura curricular usando os modelos oficiais ou o importador SAGA.
          </p>
          <button
            onClick={onCreateNew}
            className="mt-2 px-4 py-2 rounded-lg bg-[#FF6B00] text-white text-xs font-bold"
          >
            Cadastrar Estrutura Agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStructures.map((struct) => {
            const hasBranches = struct.modules?.some((m) => !!m.branch);
            const presPercent = struct.calculatedTotalHours > 0
              ? Math.round((struct.calculatedPresentialHours / struct.calculatedTotalHours) * 100)
              : 0;
            const eadPercent = struct.calculatedTotalHours > 0
              ? Math.round((struct.calculatedEadHours / struct.calculatedTotalHours) * 100)
              : 0;

            return (
              <div
                key={struct.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden group"
              >
                {/* Header Card */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2.5 py-1 rounded bg-[#002B49] text-white">
                        {struct.code}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        struct.status === 'Ativa'
                          ? 'bg-emerald-100 text-emerald-800'
                          : struct.status === 'Em Desativação'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {struct.status}
                      </span>
                    </div>

                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {struct.activeYearSemester}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-[#002B49] transition leading-snug">
                      {struct.courseName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
                      <span>{struct.modality}</span>
                      <span>•</span>
                      <span className="capitalize">{struct.structureType}</span>
                      {hasBranches && (
                        <>
                          <span>•</span>
                          <span className="text-[#FF6B00] font-bold flex items-center gap-1">
                            <GitBranch className="w-3 h-3" /> Ramificada
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Hours badge bar */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-medium">Carga Horária Total:</span>
                      <span className="font-black text-[#FF6B00] text-sm">
                        {struct.calculatedTotalHours}h
                      </span>
                    </div>

                    {/* Mini indicator bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                      <div style={{ width: `${presPercent}%` }} className="bg-blue-600 h-full" title={`Presencial: ${presPercent}%`}></div>
                      <div style={{ width: `${eadPercent}%` }} className="bg-orange-500 h-full" title={`EAD: ${eadPercent}%`}></div>
                    </div>

                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Presencial: <strong className="text-slate-700">{presPercent}%</strong></span>
                      <span>EAD: <strong className="text-slate-700">{eadPercent}%</strong></span>
                      <span>Extensão: <strong className="text-slate-700">{struct.calculatedExtensionHours}h</strong></span>
                    </div>
                  </div>

                  {/* Quick Export Strip */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <button
                      onClick={() => setDcnModalStructure(struct)}
                      className="text-[11px] font-bold text-[#002B49] hover:text-[#FF6B00] flex items-center gap-1 transition"
                      title="Visualizar Diretrizes Curriculares Nacionais (DCNs) em PDF"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[#FF6B00]" />
                      <span>DCNs ({struct.dcns?.length || 2})</span>
                    </button>
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        onClick={() => exportToPDF(struct, settings)}
                        title="Exportar PDF Oficial UNISUAM"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-[#002B49]"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => exportToXLSX(struct, settings)}
                        title="Exportar Planilha Excel XLS"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-emerald-700"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => exportToInteractiveHTML(struct, settings)}
                        title="Exportar HTML Navegável"
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-[#FF6B00]"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="bg-slate-50 p-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onSelectStructure(struct, 'table')}
                      className="px-3 py-1.5 rounded-lg bg-[#002B49] text-white hover:bg-[#003960] text-xs font-bold transition flex items-center gap-1 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Tabela
                    </button>

                    <button
                      onClick={() => onSelectStructure(struct, 'graph')}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition flex items-center gap-1 border border-indigo-200"
                      title="Ver Mapa Gráfico"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      Mapa
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEditStructure(struct)}
                      title="Editar Estrutura"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDuplicateStructure(struct)}
                      title="Duplicar Estrutura"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteStructure(struct.id)}
                      title="Excluir Estrutura"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DCN PDF Modal */}
      {dcnModalStructure && (
        <DcnViewerModal
          isOpen={!!dcnModalStructure}
          onClose={() => setDcnModalStructure(null)}
          structure={dcnModalStructure}
        />
      )}
    </div>
  );
};
