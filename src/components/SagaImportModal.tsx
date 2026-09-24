import React, { useMemo, useRef, useState } from 'react';
import { Course, CurriculumStructure, ModalityType } from '../types/curriculum';
import {
  extractTextFromPdf,
  extractTextFromSpreadsheet,
  extractSpreadsheetMatrix,
  looksLikeEstruturaCurricularSheet,
  parseEstruturaCurricularSheet,
  parseSagaReportText,
  SagaParseResult,
} from '../services/sagaImportService';
import { calculateStructureTotals } from '../services/curriculumService';
import {
  courseBaseName,
  resolveCourseByNameAndModality,
  normalizeCourseName,
  stripAcademicCoursePrefix,
  formatCineBrasilLabel,
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
  XCircle,
} from 'lucide-react';

interface SagaImportModalProps {
  courses: Course[];
  onImportComplete: (structure: CurriculumStructure) => void;
  onCancel: () => void;
}

type ComplianceItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
  critical?: boolean;
};

function courseMatchKeys(name: string): string[] {
  const base = courseBaseName(name);
  const stripped = stripAcademicCoursePrefix(base);
  const keys = new Set<string>([
    normalizeCourseName(base),
    normalizeCourseName(stripped),
  ]);
  return [...keys].filter(Boolean);
}

function findCourseFromHints(
  courses: Course[],
  courseName?: string,
  modality?: ModalityType
): Course | undefined {
  if (!courseName?.trim()) return undefined;

  const hintKeys = courseMatchKeys(courseName);

  const scored = courses.map((c) => {
    const keys = courseMatchKeys(c.name);
    let score = 0;
    for (const hk of hintKeys) {
      for (const ck of keys) {
        if (hk === ck) score = Math.max(score, 100);
        else if (hk.includes(ck) || ck.includes(hk)) score = Math.max(score, 70 + Math.min(hk.length, ck.length));
      }
    }
    if (modality && c.modality === modality) score += 5;
    // Híbrido no PDF ≈ Semipresencial no cadastro
    if (modality === 'Semipresencial' && c.modality === 'Semipresencial') score += 3;
    return { course: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  if (scored[0]?.score >= 70) return scored[0].course;

  return resolveCourseByNameAndModality(
    courses,
    stripAcademicCoursePrefix(courseBaseName(courseName)),
    modality || 'Semipresencial'
  );
}

function applyCourseToStructure(
  structure: CurriculumStructure,
  course: Course | undefined,
  hints: SagaParseResult['hints']
): CurriculumStructure {
  const structureType = structure.structureType || hints.structureType || 'disciplinar';
  const base: CurriculumStructure = {
    ...structure,
    structureType,
    code: structure.code || hints.structureCode || '',
    activeYearSemester: structure.activeYearSemester || hints.semester || '',
    modality: hints.modality || structure.modality || course?.modality || 'EAD',
    courseName: course
      ? courseBaseName(course.name)
      : courseBaseName(hints.courseName || structure.courseName || ''),
    courseId: course?.id || structure.courseId || '',
    complementaryTotalHours:
      structure.complementaryTotalHours || hints.complementaryHours || undefined,
    requiredTotalHours:
      structure.requiredTotalHours || hints.totalHours || course?.minTotalHours || 0,
  };

  if (!course) {
    return calculateStructureTotals(base);
  }

  return calculateStructureTotals({
    ...base,
    courseId: course.id,
    courseName: courseBaseName(course.name),
    modality: course.modality,
    requiredTotalHours: course.minTotalHours || base.requiredTotalHours,
    minPresentialHoursPercent: course.minPresentialPercent,
    maxEadHoursPercent: course.maxEadPercent,
    minExtensionPercent: course.minExtensionPercent ?? 10,
    complementaryTotalHours:
      course.complementaryTotalHours ?? base.complementaryTotalHours,
    complementaryModality: course.complementaryModality,
    extensionTotalHours: course.extensionTotalHours,
    extensionModality: course.extensionModality,
    minInternshipHours: course.minInternshipHours,
    internshipRequirement: course.internshipRequirement,
    complementaryRequirement: course.complementaryRequirement,
    finalPaperRequirement: course.finalPaperRequirement,
    degrees: course.degrees,
    coordinatorName: course.coordinatorName,
    coordinatorEmail: course.coordinatorEmail,
    hasLaboratory: course.hasLaboratory ?? structure.hasLaboratory,
    hasClinical: course.hasClinical,
    dcnRef: course.activeDcn,
    dcns: course.dcns,
    cineBrasilRef: formatCineBrasilLabel(course.cineBrasilCode, course.cineBrasilArea),
    authorizationAct: course.authorizationAct,
    authorizationActs: course.authorizationActs,
    activeAuthorizationActId: course.activeAuthorizationActId,
  });
}

function buildCompliance(
  structure: CurriculumStructure,
  course: Course | undefined,
  hints: SagaParseResult['hints']
): ComplianceItem[] {
  const items: ComplianceItem[] = [];
  const total = structure.calculatedTotalHours || 0;
  const core = structure.calculatedCoreHours ?? total;
  const pct = (part: number) => (total > 0 ? (part / total) * 100 : 0);

  items.push({
    id: 'course',
    label: 'Curso vinculado ao cadastro',
    detail: course
      ? `${courseBaseName(course.name)} · ${course.modality}`
      : hints.courseName
        ? `“${hints.courseName}” não encontrado no cadastro de cursos`
        : 'Nome do curso não identificado no documento',
    ok: Boolean(course),
    critical: true,
  });

  if (course && hints.modality) {
    items.push({
      id: 'modality',
      label: 'Modalidade',
      detail:
        hints.modality === course.modality
          ? `Documento e cadastro: ${course.modality}`
          : `Documento: ${hints.modality} · Cadastro: ${course.modality}`,
      ok: hints.modality === course.modality,
      critical: true,
    });
  }

  if (course) {
    const minCh = course.minTotalHours || 0;
    items.push({
      id: 'ch',
      label: 'Carga horária mínima do curso',
      detail:
        minCh > 0
          ? `Estrutura: ${core}h (núcleo) / ${total}h total · Mínimo cadastrado: ${minCh}h`
          : `Estrutura: ${total}h · Mínimo do curso não informado`,
      ok: minCh <= 0 || core >= minCh || total >= minCh,
      critical: true,
    });

    const presPct = pct(structure.calculatedPresentialHours || 0);
    const minPres = course.minPresentialPercent || 0;
    if (minPres > 0 && total > 0) {
      items.push({
        id: 'presencial',
        label: 'Presencialidade mínima',
        detail: `${presPct.toFixed(1)}% na estrutura · Mínimo: ${minPres}%`,
        ok: presPct + 0.05 >= minPres,
      });
    }

    const eadPct = pct(structure.calculatedEadHours || 0);
    const maxEad = course.maxEadPercent || 0;
    if (maxEad > 0 && total > 0) {
      items.push({
        id: 'ead',
        label: 'Limite de EAD',
        detail: `${eadPct.toFixed(1)}% na estrutura · Máximo: ${maxEad}%`,
        ok: eadPct - 0.05 <= maxEad,
      });
    }

    const extPct = pct(structure.calculatedExtensionHours || 0);
    const minExt = course.minExtensionPercent ?? 10;
    if (total > 0) {
      items.push({
        id: 'extension',
        label: 'Extensão curricular',
        detail: `${extPct.toFixed(1)}% (${structure.calculatedExtensionHours || 0}h) · Mínimo: ${minExt}%`,
        ok: extPct + 0.05 >= minExt,
      });
    }

    const minIntern = course.minInternshipHours;
    if (minIntern != null && minIntern > 0) {
      const intern = structure.calculatedInternshipHours || 0;
      items.push({
        id: 'internship',
        label: 'Estágio supervisionado',
        detail: `${intern}h na estrutura · Mínimo cadastrado: ${minIntern}h`,
        ok: intern >= minIntern,
      });
    }

    if (course.complementaryTotalHours != null && course.complementaryTotalHours > 0) {
      items.push({
        id: 'complementary',
        label: 'Atividades complementares (cadastro)',
        detail: `${course.complementaryTotalHours}h definidas no curso serão aplicadas à estrutura`,
        ok: true,
      });
    }
  }

  if (hints.structureCode) {
    items.push({
      id: 'code',
      label: 'Código da estrutura',
      detail: hints.structureCode,
      ok: true,
    });
  }

  if (hints.semester) {
    items.push({
      id: 'semester',
      label: 'Ano/semestre',
      detail: hints.semester,
      ok: true,
    });
  }

  return items;
}

export const SagaImportModal: React.FC<SagaImportModalProps> = ({
  courses,
  onImportComplete,
  onCancel,
}) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parseResult, setParseResult] = useState<SagaParseResult | null>(null);
  const [matchedCourse, setMatchedCourse] = useState<Course | undefined>();
  const [draftStructure, setDraftStructure] = useState<CurriculumStructure | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<'sheet' | 'pdf' | null>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const compliance = useMemo(() => {
    if (!draftStructure || !parseResult) return [];
    return buildCompliance(draftStructure, matchedCourse, parseResult.hints);
  }, [draftStructure, matchedCourse, parseResult]);

  const criticalFails = compliance.filter((c) => c.critical && !c.ok);
  const softFails = compliance.filter((c) => !c.critical && !c.ok);
  const allCriticalOk = criticalFails.length === 0 && Boolean(matchedCourse);

  const canProceed = (parseResult?.stats.disciplines || 0) > 0;

  const ingestParse = (text: string, sheetResult?: SagaParseResult) => {
    const firstPass =
      sheetResult ||
      parseSagaReportText(text, {
        courseName: '',
        courseId: '',
        modality: 'EAD',
        code: '',
        activeYearSemester: '',
        structureType: 'disciplinar',
      });

    const detectedType = firstPass.hints.structureType || 'disciplinar';
    const course = findCourseFromHints(
      courses,
      firstPass.hints.courseName,
      firstPass.hints.modality
    );

    const result =
      sheetResult ||
      parseSagaReportText(text, {
        courseName: course ? courseBaseName(course.name) : firstPass.hints.courseName || '',
        courseId: course?.id || '',
        modality: firstPass.hints.modality || course?.modality || 'EAD',
        code: firstPass.hints.structureCode || '',
        activeYearSemester: firstPass.hints.semester || '',
        structureType: detectedType,
        requiredTotalHours: course?.minTotalHours || firstPass.hints.totalHours,
      });

    // Reaplica curso no resultado da planilha estrutural
    const structure = applyCourseToStructure(
      sheetResult
        ? {
            ...result.structure,
            courseId: course?.id || result.structure.courseId,
            courseName: course
              ? courseBaseName(course.name)
              : result.structure.courseName || firstPass.hints.courseName || '',
            modality: firstPass.hints.modality || course?.modality || result.structure.modality,
            requiredTotalHours:
              course?.minTotalHours ||
              firstPass.hints.totalHours ||
              result.structure.requiredTotalHours,
            hasLaboratory: result.structure.hasLaboratory || course?.hasLaboratory,
          }
        : result.structure,
      course,
      result.hints
    );
    setParseResult(result);
    setMatchedCourse(course);
    setDraftStructure(structure);

    if (result.stats.disciplines === 0) {
      setError(
        'O texto foi lido, mas nenhum componente curricular foi identificado. Verifique o layout do PDF/planilha ou complete a estrutura no editor.'
      );
    } else if (!firstPass.hints.courseName) {
      setError(
        'Componentes importados, mas o nome do curso não apareceu no cabeçalho. Vincule o curso no editor.'
      );
    } else if (!course) {
      setError(
        `Estrutura lida (${result.stats.disciplines} componentes). Curso “${firstPass.hints.courseName}” não está no cadastro — cadastre-o (modalidade ${firstPass.hints.modality || 'do documento'}) para aplicar os dados obrigatórios, ou prossiga e vincule no editor.`
      );
    } else {
      setError(null);
    }
  };

  const processImportedFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const isPdf = file.type.includes('pdf') || name.endsWith('.pdf');
    const isSheet =
      /\.(xlsx|xls|csv|tsv|txt)$/.test(name) || /spreadsheet|excel|csv/.test(file.type);

    if (!isPdf && !isSheet) {
      setError('Envie uma planilha (.xlsx, .xls, .csv) ou um PDF do relatório SAGA.');
      return;
    }

    setIsReading(true);
    setError(null);
    setParseResult(null);
    setMatchedCourse(undefined);
    setDraftStructure(null);
    setFileName(file.name);

    try {
      let text = '';
      if (isPdf) {
        text = await extractTextFromPdf(await file.arrayBuffer());
        setExtractedText(text);
        ingestParse(text);
      } else if (/\.(xlsx|xls)$/.test(name)) {
        const buffer = await file.arrayBuffer();
        const matrix = extractSpreadsheetMatrix(buffer);
        text = matrix
          .map((row) => row.map((c) => c.trim()).filter(Boolean).join(' '))
          .filter(Boolean)
          .join('\n');
        setExtractedText(text);
        if (looksLikeEstruturaCurricularSheet(matrix)) {
          const sheetResult = parseEstruturaCurricularSheet(matrix, {
            courseName: '',
            courseId: '',
            modality: 'Presencial',
            code: '',
            activeYearSemester: '',
            structureType: 'modular',
          });
          ingestParse(text, sheetResult);
        } else {
          ingestParse(text);
        }
      } else {
        text = await file.text();
        setExtractedText(text);
        ingestParse(text);
      }
    } catch (err) {
      console.error(err);
      setExtractedText('');
      setParseResult(null);
      setMatchedCourse(undefined);
      setDraftStructure(null);
      setError(
        isPdf
          ? 'Não foi possível ler o PDF. Se o arquivo estiver protegido ou for uma imagem digitalizada, o coordenador deve preencher a estrutura manualmente.'
          : 'Não foi possível ler a planilha. Verifique o arquivo e tente novamente.'
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
    if (!draftStructure || !canProceed) return;
    onImportComplete(draftStructure);
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
              <h2 className="text-xl font-black text-[#002B49]">Importador do Relatório SAGA</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie a planilha ou o PDF. O sistema identifica o curso, aplica os dados obrigatórios
                do cadastro e indica se a estrutura está em conformidade.
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
                    <p className="text-xs font-bold text-slate-800">Planilha do relatório SAGA</p>
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
                    <p className="text-xs font-bold text-slate-800">PDF do relatório SAGA</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Formato aceito: .pdf</p>
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

          <div className="w-full h-28 p-3 border border-slate-300 rounded-xl bg-slate-50 overflow-auto">
            {extractedText ? (
              <pre className="font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                {extractedText.slice(0, 4000)}
                {extractedText.length > 4000 ? '\n…' : ''}
              </pre>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                <FileText className="w-6 h-6" />
                <p className="text-xs">
                  O texto extraído aparece aqui para conferência após o envio do arquivo.
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {parseResult && draftStructure && (
          <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                {allCriticalOk && softFails.length === 0 ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span className="text-xs font-bold text-[#002B49]">
                  {matchedCourse
                    ? softFails.length === 0 && criticalFails.length === 0
                      ? 'Curso identificado — estrutura em conformidade com o cadastro'
                      : 'Curso identificado — há divergências em relação ao cadastro'
                    : 'Leitura concluída — curso não vinculado'}
                </span>
              </div>
              <span className="text-xs font-black text-slate-700">
                Extraído: {draftStructure.calculatedTotalHours}h
                {draftStructure.totalCredits
                  ? ` (${draftStructure.totalCredits} créditos)`
                  : ''}{' '}
                · {parseResult.stats.periods}{' '}
                {draftStructure.structureType === 'modular' ? 'módulos' : 'períodos'} ·{' '}
                {parseResult.stats.disciplines} componentes
                {draftStructure.structureType === 'modular' ? ' (modular)' : ''}
              </span>
            </div>

            {matchedCourse && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Curso</span>
                  <span className="font-bold text-slate-800">
                    {courseBaseName(matchedCourse.name)}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Modalidade</span>
                  <span className="font-bold text-slate-800">{matchedCourse.modality}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Código / Semestre</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {draftStructure.code || '—'} · {draftStructure.activeYearSemester || '—'}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">CH mínima do curso</span>
                  <span className="font-bold text-slate-800">
                    {matchedCourse.minTotalHours || 0}h
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Conformidade com o cadastro do curso
              </h5>
              <ul className="space-y-1.5">
                {compliance.map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      item.ok
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                        : item.critical
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {item.ok ? (
                      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold block">{item.label}</span>
                      <span className="opacity-90">{item.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {parseResult.warnings.length > 0 && (
              <ul className="text-[11px] text-amber-800 space-y-1 list-disc pl-4">
                {parseResult.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            <div className="pt-1 flex justify-end">
              <button
                onClick={handleConfirmImport}
                disabled={!canProceed}
                title={
                  !canProceed
                    ? 'Nenhum componente curricular foi identificado no documento'
                    : !matchedCourse
                      ? 'Curso ainda não vinculado ao cadastro — você poderá ajustar no editor'
                      : undefined
                }
                className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black flex items-center gap-2 shadow-md"
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
