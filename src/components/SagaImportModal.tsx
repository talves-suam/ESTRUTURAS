import React, { useEffect, useRef, useState } from 'react';
import { Course, CurriculumStructure, ModalityType } from '../types/curriculum';
import {
  extractTextFromPdf,
  extractTextFromSpreadsheet,
  parseSagaReportText,
  SagaParseResult,
} from '../services/sagaImportService';
import {
  courseBaseName,
  uniqueCourseOptions,
  resolveCourseByNameAndModality,
  normalizeCourseName,
} from '../utils/courseBatch';
import {
  UploadCloud,
  FileUp,
  CheckCircle,
  ArrowRight,
  AlertCircle,
  Loader2,
  FileText,
  FileSpreadsheet,
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
  const [code, setCode] = useState('');
  const [activeYearSemester, setActiveYearSemester] = useState('');
  const [modality, setModality] = useState<ModalityType>('EAD');
  const [structureType, setStructureType] = useState<'disciplinar' | 'modular'>('disciplinar');
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parseResult, setParseResult] = useState<SagaParseResult | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<'sheet' | 'pdf' | null>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const courseOptions = uniqueCourseOptions(courses);
  const selectedCourse =
    resolveCourseByNameAndModality(courses, selectedCourseId, modality) ||
    courses.find((c) => c.id === selectedCourseId) ||
    courses[0];
  const selectedCourseKey = normalizeCourseName(courseBaseName(selectedCourse?.name || ''));

  const buildParams = (overrides?: { courseId?: string; courseName?: string; code?: string; modality?: ModalityType; semester?: string }) => ({
    courseName: courseBaseName(overrides?.courseName || selectedCourse?.name || ''),
    courseId: overrides?.courseId || selectedCourseId,
    modality: overrides?.modality || modality,
    code: overrides?.code || code,
    activeYearSemester: overrides?.semester || activeYearSemester,
    structureType,
    requiredTotalHours: selectedCourse?.minTotalHours,
  });

  useEffect(() => {
    const resolved = resolveCourseByNameAndModality(courses, selectedCourseId, modality);
    if (resolved && resolved.id !== selectedCourseId) {
      setSelectedCourseId(resolved.id);
    }
  }, [modality, courses, selectedCourseId]);

  useEffect(() => {
    if (!extractedText.trim()) return;
    setParseResult(parseSagaReportText(extractedText, buildParams()));
  }, [structureType, selectedCourseId, code, modality, activeYearSemester, extractedText]);

  const applyHints = (result: SagaParseResult) => {
    const { hints } = result;
    if (hints.structureCode) setCode(hints.structureCode);
    if (hints.semester) setActiveYearSemester(hints.semester);
    if (hints.modality) setModality(hints.modality);
    if (hints.courseName) {
      const found = resolveCourseByNameAndModality(
        courses,
        hints.courseName,
        hints.modality || modality
      );
      if (found) setSelectedCourseId(found.id);
    }
  };

  const parseExtractedText = (text: string) => {
    const hintsFirst = parseSagaReportText(text, buildParams());
    applyHints(hintsFirst);
    const matchedCourse =
      (hintsFirst.hints.courseName &&
        resolveCourseByNameAndModality(
          courses,
          hintsFirst.hints.courseName,
          hintsFirst.hints.modality || modality
        )) ||
      selectedCourse;
    const result = parseSagaReportText(
      text,
      buildParams({
        courseId: matchedCourse?.id,
        courseName: matchedCourse?.name,
        code: hintsFirst.hints.structureCode || code,
        modality: hintsFirst.hints.modality || modality,
        semester: hintsFirst.hints.semester || activeYearSemester,
      })
    );
    setParseResult(result);
  };

  const processImportedFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isPdf = file.type.includes('pdf') || name.endsWith('.pdf');
    const isSheet = /\.(xlsx|xls|csv|tsv|txt)$/.test(name) || /spreadsheet|excel|csv/.test(file.type);

    if (!isPdf && !isSheet) {
      setError('Envie uma planilha (.xlsx, .xls, .csv) ou um PDF do relatório SAGA.');
      return;
    }

    setIsReading(true);
    setError(null);
    setParseResult(null);
    setFileName(file.name);

    try {
      let text = '';
      if (isPdf) {
        text = await extractTextFromPdf(await file.arrayBuffer());
      } else if (/\.(xlsx|xls)$/.test(name)) {
        text = await extractTextFromSpreadsheet(await file.arrayBuffer());
      } else {
        text = await file.text();
      }
      setExtractedText(text);
      parseExtractedText(text);
    } catch (err) {
      console.error(err);
      setExtractedText('');
      setParseResult(null);
      setError(
        isPdf
          ? 'Não foi possível ler o PDF. Se o arquivo estiver protegido ou for uma imagem digitalizada, o coordenador deve preencher a estrutura manualmente.'
          : 'Não foi possível ler a planilha. Verifique o arquivo e tente novamente, ou complete os campos no editor.'
      );
    } finally {
      setIsReading(false);
    }
  };

  const handleSheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processImportedFile(file);
    e.target.value = '';
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processImportedFile(file);
    e.target.value = '';
  };

  const handleDrop = (zone: 'sheet' | 'pdf') => (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (zone === 'pdf' && !name.endsWith('.pdf') && !file.type.includes('pdf')) {
      setError('Nesta área, envie um arquivo PDF.');
      return;
    }
    if (zone === 'sheet' && name.endsWith('.pdf')) {
      setError('Nesta área, envie uma planilha (.xlsx, .xls, .csv).');
      return;
    }
    void processImportedFile(file);
  };

  const handleConfirmImport = () => {
    if (!parseResult) return;
    const parsed = parseSagaReportText(extractedText, buildParams()).structure;
    onImportComplete({
      ...parsed,
      courseName: courseBaseName(selectedCourse?.name || parsed.courseName),
      requiredTotalHours: selectedCourse?.minTotalHours || parsed.requiredTotalHours || 0,
      minPresentialHoursPercent: selectedCourse?.minPresentialPercent ?? parsed.minPresentialHoursPercent,
      maxEadHoursPercent: selectedCourse?.maxEadPercent ?? parsed.maxEadHoursPercent,
      minExtensionPercent: selectedCourse?.minExtensionPercent ?? 10,
      complementaryTotalHours: selectedCourse?.complementaryTotalHours,
      complementaryModality: selectedCourse?.complementaryModality,
      extensionTotalHours: selectedCourse?.extensionTotalHours,
      extensionModality: selectedCourse?.extensionModality,
      minInternshipHours: selectedCourse?.minInternshipHours,
      internshipRequirement: selectedCourse?.internshipRequirement,
      complementaryRequirement: selectedCourse?.complementaryRequirement,
      finalPaperRequirement: selectedCourse?.finalPaperRequirement,
      degrees: selectedCourse?.degrees,
      coordinatorName: selectedCourse?.coordinatorName,
      coordinatorEmail: selectedCourse?.coordinatorEmail,
      hasLaboratory: selectedCourse?.hasLaboratory,
      hasClinical: selectedCourse?.hasClinical,
      dcnRef: selectedCourse?.activeDcn,
      dcns: selectedCourse?.dcns,
      cineBrasilRef: selectedCourse?.cineBrasilCode,
      authorizationAct: selectedCourse?.authorizationAct,
    });
  };

  const parsedPreview = parseResult?.structure;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <UploadCloud className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#002B49]">Importador do Relatório SAGA</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie a planilha ou o PDF do relatório. O sistema preenche o que conseguir ler; o restante fica em branco para o coordenador completar.
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-100"
          >
            Voltar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 py-5 border-b border-slate-100 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Curso Vinculado</label>
            <select
              value={selectedCourseKey}
              onChange={(e) => {
                const resolved = resolveCourseByNameAndModality(courses, e.target.value, modality);
                if (resolved) setSelectedCourseId(resolved.id);
              }}
              className="w-full px-2.5 py-2 border rounded-lg bg-white font-medium"
            >
              {courseOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.name}
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
              placeholder="Ex: TAM242"
              className="w-full px-2.5 py-2 border rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Modalidade</label>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as ModalityType)}
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
              placeholder="Ex: 2025.1"
              className="w-full px-2.5 py-2 border rounded-lg font-semibold"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Tipo da Estrutura</label>
            <select
              value={structureType}
              onChange={(e) => setStructureType(e.target.value as 'disciplinar' | 'modular')}
              className="w-full px-2.5 py-2 border rounded-lg bg-white font-bold text-[#002B49]"
            >
              <option value="disciplinar">Disciplinar (SAGA padrão)</option>
              <option value="modular">Modular (com CHA)</option>
            </select>
          </div>
        </div>

        <div className="py-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Relatório SAGA (planilha ou PDF)
            </h4>
            {fileName && (
              <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Arquivo: {fileName}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging('sheet');
              }}
              onDragLeave={() => setIsDragging(null)}
              onDrop={handleDrop('sheet')}
              className={`border-2 border-dashed rounded-xl p-6 text-center space-y-3 transition flex flex-col items-center justify-center min-h-[176px] ${
                isDragging === 'sheet'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-300 hover:border-emerald-500 bg-slate-50/60'
              }`}
            >
              {isReading && isDragging !== 'pdf' ? (
                <>
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  <p className="text-xs font-bold text-slate-800">Lendo o arquivo…</p>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Planilha do relatório SAGA
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Formatos: .xlsx, .xls, .csv, .tsv ou .txt
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => sheetInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg bg-[#002B49] text-white text-xs font-bold hover:bg-[#003860]"
                  >
                    Selecionar planilha
                  </button>
                  <input
                    ref={sheetInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
                    onChange={handleSheetUpload}
                    className="hidden"
                  />
                </>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging('pdf');
              }}
              onDragLeave={() => setIsDragging(null)}
              onDrop={handleDrop('pdf')}
              className={`border-2 border-dashed rounded-xl p-6 text-center space-y-3 transition flex flex-col items-center justify-center min-h-[176px] ${
                isDragging === 'pdf'
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-slate-300 hover:border-emerald-500 bg-slate-50/60'
              }`}
            >
              {isReading && isDragging !== 'sheet' ? (
                <>
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                  <p className="text-xs font-bold text-slate-800">Lendo o PDF…</p>
                </>
              ) : (
                <>
                  <FileUp className="w-8 h-8 text-emerald-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      PDF do relatório SAGA
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Formato aceito: .pdf
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="px-4 py-1.5 rounded-lg bg-[#002B49] text-white text-xs font-bold hover:bg-[#003860]"
                  >
                    Selecionar PDF
                  </button>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="w-full h-32 p-3 border border-slate-300 rounded-xl bg-slate-50 overflow-auto">
              {extractedText ? (
                <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                  {extractedText.slice(0, 4000)}
                  {extractedText.length > 4000 ? '\n…' : ''}
                </pre>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                  <FileText className="w-6 h-6" />
                  <p className="text-xs">
                    O texto extraído da planilha ou do PDF aparece aqui para conferência.
                    Campos não identificados ficam em branco no editor.
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {parseResult && parsedPreview && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-900">
                  Leitura concluída
                </span>
              </div>
              <span className="text-xs font-black text-emerald-800">
                Extraído: {parsedPreview.calculatedTotalHours}h ({parsedPreview.totalCredits} créditos)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Períodos Detectados</span>
                <span className="font-bold text-slate-800">{parseResult.stats.periods}</span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Disciplinas Importadas</span>
                <span className="font-bold text-slate-800">{parseResult.stats.disciplines}</span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Sem CH / créditos</span>
                <span className="font-bold text-[#FF6B00]">
                  {parseResult.stats.withoutHours} / {parseResult.stats.withoutCredits}
                </span>
              </div>
              <div className="bg-white p-2 rounded border border-emerald-100">
                <span className="text-slate-500 block text-[10px]">Status Inicial</span>
                <span className="font-bold text-slate-800">Pronto para complementar</span>
              </div>
            </div>

            {parseResult.warnings.length > 0 && (
              <ul className="text-[11px] text-amber-800 space-y-1 list-disc pl-4">
                {parseResult.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

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
