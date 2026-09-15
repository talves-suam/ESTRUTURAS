import React from 'react';
import { CurriculumStructure, AppSettings } from '../types/curriculum';
import { templateDisciplinarTAM242, templateModularPAD231, templateModularPsicologiaRamificada } from '../data/initialData';
import { 
  BookOpen, 
  Copy, 
  FileText, 
  Download, 
  Share2, 
  Printer, 
  GitBranch, 
  Layers, 
  ArrowRight,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { exportToPDF, exportToXLSX, exportToInteractiveHTML } from '../services/exportService';

interface OfficialTemplatesProps {
  settings: AppSettings;
  onUseTemplate: (template: CurriculumStructure) => void;
  onViewTemplate: (template: CurriculumStructure, view: 'table' | 'graph') => void;
}

export const OfficialTemplates: React.FC<OfficialTemplatesProps> = ({
  settings,
  onUseTemplate,
  onViewTemplate,
}) => {
  const templates = [
    {
      title: 'Modelo 1: Disciplinar EAD (Padrão SAGA TAM242)',
      desc: 'Baseado no relatório oficial do SAGA para cursos a distância com períodos letivos flexíveis, disciplinas obrigatórias, eletivas, avaliação e extensão.',
      tag: 'Disciplinar • EAD',
      badgeColor: 'bg-blue-100 text-blue-900 border-blue-200',
      data: templateDisciplinarTAM242,
    },
    {
      title: 'Modelo 2: Modular Integrado com CHA (Padrão PAD231)',
      desc: 'Estrutura inovadora organizada em 8 módulos integrados com mapeamento completo de Saberes.',
      tag: 'Modular • Presencial',
      badgeColor: 'bg-orange-100 text-orange-900 border-orange-200',
      data: templateModularPAD231,
    },
    {
      title: 'Modelo 3: Modular Ramificado (Padrão Psicologia PSI251)',
      desc: 'Tronco comum até o 8º módulo e bifurcação em trilhas distintas (Módulos 9A/9B e 10A/10B para Clínica vs Gestão Organizacional).',
      tag: 'Modular Ramificado • Bifurcação 9A/9B',
      badgeColor: 'bg-purple-100 text-purple-900 border-purple-200',
      data: templateModularPsicologiaRamificada,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 text-[#FF6B00] flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#002B49]">Modelos Oficiais de Relatório & Estrutura</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Exporte estes relatórios de referência ou use como base inicial para seguir o preenchimento na ferramenta.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
          {templates.map((tpl, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden"
            >
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${tpl.badgeColor}`}>
                    {tpl.tag}
                  </span>
                  <span className="font-mono text-xs font-black text-[#002B49] bg-slate-100 px-2 py-0.5 rounded">
                    {tpl.data.code}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {tpl.title}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {tpl.desc}
                </p>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Curso:</span>
                    <span className="font-semibold text-slate-800">{tpl.data.courseName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Carga Horária Total:</span>
                    <span className="font-bold text-[#FF6B00]">{tpl.data.calculatedTotalHours}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Semestre Ativo:</span>
                    <span className="font-medium text-slate-700">{tpl.data.activeYearSemester}</span>
                  </div>
                </div>

                {/* Quick exports for template */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Exportar Modelo:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => exportToPDF(tpl.data, settings)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-[#002B49]"
                      title="Baixar PDF do Modelo"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => exportToXLSX(tpl.data, settings)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-emerald-700"
                      title="Baixar XLS do Modelo"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => exportToInteractiveHTML(tpl.data, settings)}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-[#FF6B00]"
                      title="Baixar HTML Navegável do Modelo"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 space-y-2">
                <button
                  onClick={() => onUseTemplate(tpl.data)}
                  className="w-full py-2 px-3 rounded-lg bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Usar Como Base Para Novo Curso
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => onViewTemplate(tpl.data, 'table')}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold text-center"
                  >
                    Ver Tabela
                  </button>
                  {tpl.data.structureType === 'modular' && (
                    <button
                      onClick={() => onViewTemplate(tpl.data, 'graph')}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold text-center flex items-center justify-center gap-1"
                    >
                      <GitBranch className="w-3 h-3" />
                      Ver Gráfico
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
