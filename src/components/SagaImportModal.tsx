import React, { useState } from 'react';
import { Course, CurriculumStructure } from '../types/curriculum';
import { parseSagaReportText } from '../services/sagaImportService';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle, 
  ArrowRight, 
  FileUp, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';

interface SagaImportModalProps {
  courses: Course[];
  onImportComplete: (structure: CurriculumStructure) => void;
  onCancel: () => void;
}

export const SagaImportModal: React.FC<SagaImportModalProps> = ({
  courses,
  onImportComplete,
  onCancel,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  const [code, setCode] = useState('TAM251');
  const [activeYearSemester, setActiveYearSemester] = useState('2025.1');
  const [modality, setModality] = useState<'Presencial' | 'Semipresencial' | 'EAD'>('EAD');
  const [structureType, setStructureType] = useState<'disciplinar' | 'modular'>('disciplinar');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<CurriculumStructure | null>(null);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content);
      generatePreview(content);
    };
    reader.readAsText(file);
  };

  const generatePreview = (textToParse: string) => {
    if (!textToParse.trim()) return;
    const struct = parseSagaReportText(textToParse, {
      courseName: selectedCourse?.name || 'Curso SAGA',
      courseId: selectedCourseId,
      modality,
      code,
      activeYearSemester,
      structureType,
      requiredTotalHours: selectedCourse?.minTotalHours,
    });
    setParsedPreview(struct);
  };

  const handleLoadSampleSaga = () => {
    const sampleSagaTAM242 = `1º Período
EXTN0001 (B) Extensão 1 Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0021 (B) Contabilidade Básica Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0013 (B) Economia e Mercado Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0018 (B) Fundamentos da Administração Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0023 (B) Matemática Aplicada Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0034 (B) Métodos e Práticas de Pesquisa Obrigatória 2(2/0/0) 0 0 A Distância
Subtotal do Período: 22(22/0/0) 0 0
2º Período
TCSA0007 (B) Comunicação Empresarial Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0012 (B) Direito Empresarial Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0014 (B) Estatística Aplicada Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0024 (B) Modelos de Negócios e Inovação Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0035 (B) Psicologia das Organizações Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0039 (B) Sustentabilidade e Responsabilidade Social Obrigatória 2(2/0/0) 0 0 A Distância
Subtotal do Período: 22(22/0/0) 0 0
3º Período
EXTN0002 (B) Extensão 2 Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0016 (B) Estruturas Organizacionais Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0022 (B) Gestão de Custos e Preços Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0025 (B) Modelos de Gestão Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0032 (B) Matemática Financeira Obrigatória 4(4/0/0) 0 0 A Distância
TCSA0040 (B) Tecnologia da Informação Obrigatória 2(2/0/0) 0 0 A Distância
Subtotal do Período: 22(22/0/0) 0 0`;

    setRawText(sampleSagaTAM242);
    setCode('TAM242-SAGA');
    setModality('EAD');
    setStructureType('disciplinar');
    generatePreview(sampleSagaTAM242);
  };

  const handleConfirmImport = () => {
    if (!parsedPreview) {
      generatePreview(rawText);
    }
    const finalStruct = parsedPreview || parseSagaReportText(rawText, {
      courseName: selectedCourse?.name || 'Curso SAGA',
      courseId: selectedCourseId,
      modality,
      code,
      activeYearSemester,
      structureType,
      requiredTotalHours: selectedCourse?.minTotalHours,
    });

    onImportComplete(finalStruct);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <UploadCloud className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#002B49]">Importador Inteligente do Relatório SAGA</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Faça o upload ou cole o texto do relatório oficial SAGA para extrair períodos, disciplinas, créditos e horas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadSampleSaga}
              className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300"
            >
              Carregar Relatório Exemplo (TAM242)
            </button>
            <button
              onClick={onCancel}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-100"
            >
              Voltar
            </button>
          </div>
        </div>

        {/* Input Form Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 py-5 border-b border-slate-100 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Curso Vinculado</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="w-full px-2.5 py-2 border rounded-lg bg-white font-medium"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Código da Estrutura</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-full px-2.5 py-2 border rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Modalidade</label>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as any)}
              className="w-full px-2.5 py-2 border rounded-lg bg-white"
            >
              <option value="EAD">EAD</option>
              <option value="Presencial">Presencial</option>
              <option value="Semipresencial">Semipresencial</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Ano/Semestre</label>
            <input
              type="text"
              value={activeYearSemester}
              onChange={(e) => setActiveYearSemester(e.target.value)}
              className="w-full px-2.5 py-2 border rounded-lg font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Tipo da Estrutura</label>
            <select
              value={structureType}
              onChange={(e) => setStructureType(e.target.value as any)}
              className="w-full px-2.5 py-2 border rounded-lg bg-white font-bold text-[#002B49]"
            >
              <option value="disciplinar">Disciplinar (SAGA padrão)</option>
              <option value="modular">Modular (com CHA)</option>
            </select>
          </div>
        </div>

        {/* Upload & Paste Area */}
        <div className="py-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Conteúdo do Relatório SAGA (Upload de Arquivo ou Texto Copiado)
            </h4>
            {fileName && (
              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Arquivo: {fileName}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* File drop area */}
            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center space-y-3 bg-slate-50/60 transition flex flex-col items-center justify-center">
              <FileUp className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Arraste ou selecione o relatório exportado do SAGA
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Formatos aceitos: .txt, .csv, .tsv ou relatório em texto
                </p>
              </div>
              <label className="px-4 py-1.5 rounded-lg bg-[#002B49] text-white text-xs font-bold cursor-pointer hover:bg-[#003860]">
                Selecionar Arquivo
                <input
                  type="file"
                  accept=".txt,.csv,.tsv,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste box */}
            <div className="space-y-1">
              <textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  generatePreview(e.target.value);
                }}
                placeholder="Ou cole as linhas do relatório SAGA aqui... Ex:&#10;1º Período&#10;EXTN0001 (B) Extensão 1 Obrigatória 4(4/0/0) 0 0 A Distância&#10;TCSA0021 (B) Contabilidade Básica Obrigatória 4(4/0/0) 0 0 A Distância"
                className="w-full h-44 p-3 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 bg-white focus:ring-2 focus:ring-[#002B49]"
              />
              <p className="text-[11px] text-slate-400">
                O parser identifica automaticamente os marcadores de períodos e linhas de disciplinas.
              </p>
            </div>
          </div>
        </div>

        {/* Parsed Preview Section */}
        {parsedPreview && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-900">
                  Estrutura Processada com Sucesso do SAGA
                </span>
              </div>
              <span className="text-xs font-black text-emerald-800">
                Total Extraído: {parsedPreview.calculatedTotalHours}h ({parsedPreview.totalCredits} créditos)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Períodos Detectados</span>
                <span className="font-bold text-slate-800">{parsedPreview.periods?.length || 0}</span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Disciplinas Importadas</span>
                <span className="font-bold text-slate-800">
                  {parsedPreview.periods?.reduce((acc, p) => acc + p.disciplines.length, 0) || 0}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">CH Extensão</span>
                <span className="font-bold text-[#FF6B00]">{parsedPreview.calculatedExtensionHours}h</span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Status Inicial</span>
                <span className="font-bold text-slate-800">Pronto para Edição</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-2 shadow-md"
              >
                Prosseguir para o Editor Curricular
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
