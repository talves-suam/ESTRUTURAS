import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as XLSX from 'xlsx';
import {
  CurriculumStructure,
  Discipline,
  DeliveryModalityFlag,
  ModalityType,
  PeriodData,
  ModuleData,
} from '../types/curriculum';

GlobalWorkerOptions.workerSrc = pdfWorker;

export interface SagaParseParams {
  courseName: string;
  courseId: string;
  modality: ModalityType;
  code: string;
  activeYearSemester: string;
  structureType: 'disciplinar' | 'modular';
  requiredTotalHours?: number;
}

export interface SagaHeaderHints {
  courseName?: string;
  structureCode?: string;
  semester?: string;
  modality?: ModalityType;
}

export interface SagaParseResult {
  structure: CurriculumStructure;
  hints: SagaHeaderHints;
  warnings: string[];
  stats: {
    periods: number;
    disciplines: number;
    withoutHours: number;
    withoutCredits: number;
    withoutName: number;
    textChars: number;
  };
}

type TextContentItem = {
  str?: string;
  transform?: number[];
};

export async function extractTextFromPdf(data: ArrayBuffer): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pages.push(rebuildPageLines(content.items as TextContentItem[]));
  }

  return pages.join('\n');
}

export async function extractTextFromSpreadsheet(data: ArrayBuffer): Promise<string> {
  const workbook = XLSX.read(data, { type: 'array' });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    for (const row of rows) {
      const line = (row || [])
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean)
        .join(' ');
      if (line) lines.push(line);
    }
  }

  return lines.join('\n');
}

/** Reconstrói linhas a partir dos itens de texto do PDF (agrupa pelo eixo Y). */
function rebuildPageLines(items: TextContentItem[]): string {
  const rows = new Map<number, { x: number; str: string }[]>();

  for (const item of items) {
    const str = (item.str || '').replace(/\s+/g, ' ');
    if (!str.trim() || !item.transform) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const bucket = Math.round(y / 3) * 3;
    const row = rows.get(bucket) || [];
    row.push({ x, str });
    rows.set(bucket, row);
  }

  return [...rows.keys()]
    .sort((a, b) => b - a)
    .map((y) =>
      (rows.get(y) || [])
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}

export function extractSagaHeaderHints(rawText: string): SagaHeaderHints {
  const hints: SagaHeaderHints = {};
  const head = rawText.slice(0, 2500);

  const courseMatch = head.match(
    /(?:curso|nome do curso)\s*[:\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç0-9][^\n]{2,80})/i
  );
  if (courseMatch) {
    hints.courseName = courseMatch[1].replace(/\s+/g, ' ').trim();
  }

  const codeMatch = head.match(
    /(?:c[oó]digo(?: da estrutura)?|estrutura)\s*[:\-]\s*([A-Z]{2,6}\d{2,4}[A-Z]?)/i
  );
  if (codeMatch) {
    hints.structureCode = codeMatch[1].toUpperCase();
  } else {
    const loose = head.match(/\b([A-Z]{3}\d{3})\b/);
    if (loose) hints.structureCode = loose[1];
  }

  const semMatch = head.match(/\b(20\d{2}\s*[./]\s*[12])\b/);
  if (semMatch) {
    hints.semester = semMatch[1].replace(/\s+/g, '').replace('/', '.');
  }

  if (/\b(semipresencial|semi[\s-]?presencial)\b/i.test(head)) {
    hints.modality = 'Semipresencial';
  } else if (/\b(ead|a dist[aâ]ncia|educa[cç][aã]o a dist[aâ]ncia)\b/i.test(head)) {
    hints.modality = 'EAD';
  } else if (/\bpresencial\b/i.test(head)) {
    hints.modality = 'Presencial';
  }

  return hints;
}

function detectDelivery(text: string, fallbackModality: ModalityType): DeliveryModalityFlag | undefined {
  if (/s[ií]ncrono[\s-]*mediado/i.test(text)) return 'sincrono-mediado';
  if (/\bs[ií]ncrono\b/i.test(text)) return 'sincrono';
  if (/ass[ií]ncrono|a dist[aâ]ncia|\bead\b/i.test(text)) return 'assincrono';
  if (/\bpresencial\b/i.test(text)) return 'presencial';
  if (fallbackModality === 'EAD') return 'assincrono';
  if (fallbackModality === 'Presencial') return 'presencial';
  return undefined;
}

function parseDisciplineLine(
  line: string,
  fallbackModality: ModalityType
): Discipline | null {
  const skipped =
    /^(subtotal|total|carga hor[aá]ria|cr[eé]ditos|c[oó]digo|nome da disciplina|estrutura curricular|relat[oó]rio)/i;
  if (skipped.test(line)) return null;

  const match = line.match(
    /^([A-Z]{2,6}\d{3,5})(?:\s*\(([A-Z0-9])\))?\s+(.+)$/i
  );
  if (!match) return null;

  const baseCode = match[1].toUpperCase();
  const group = match[2];
  let rest = match[3].trim();

  const typeMatch = rest.match(/\b(Obrigat[oó]ria|Eletiva|Optativa)\b/i);
  let type: Discipline['type'] | undefined;
  if (typeMatch) {
    const t = typeMatch[1].toLowerCase();
    type = t.startsWith('elet') ? 'Eletiva' : t.startsWith('opt') ? 'Optativa' : 'Obrigatória';
  }

  const creditMatch = rest.match(/(\d+)\s*\(\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s*\)/);
  const credits = creditMatch ? Number(creditMatch[1]) : undefined;

  const hoursMatch =
    rest.match(/\b(\d{2,4})\s*h(?:oras?)?\b/i) ||
    rest.match(/\bch\s*[:\-]?\s*(\d{2,4})\b/i);
  const hours = hoursMatch ? Number(hoursMatch[1]) : undefined;

  let name = rest;
  if (typeMatch) name = name.slice(0, typeMatch.index).trim();
  name = name
    .replace(/\d+\s*\(\s*\d+\s*\/\s*\d+\s*\/\s*\d+\s*\)/g, '')
    .replace(/\b(Obrigat[oó]ria|Eletiva|Optativa)\b/gi, '')
    .replace(/\b(A Dist[aâ]ncia|Presencial|Semipresencial|S[ií]ncrono(?:[\s-]*Mediado)?|Ass[ií]ncrono|EAD)\b/gi, '')
    .replace(/\b\d+\s*h(?:oras?)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name || name.length < 2) return null;

  const delivery = detectDelivery(rest, fallbackModality);
  const code = group ? `${baseCode} (${group})` : baseCode;
  const isExt = baseCode.startsWith('EXT') || /extens[aã]o/i.test(name);
  const isIntern = /est[aá]gio|pr[aá]tica supervisionada/i.test(name);

  return {
    id: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code,
    name,
    type: type || 'Obrigatória',
    credits: credits ?? 0,
    hours: hours ?? 0,
    modalityDelivery: delivery || (fallbackModality === 'EAD' ? 'assincrono' : 'presencial'),
    isExtension: isExt || undefined,
    isInternship: isIntern || undefined,
    evaluationForm: undefined,
  };
}

function emptyStructure(params: SagaParseParams, periods?: PeriodData[], modules?: ModuleData[]): CurriculumStructure {
  const safePeriods = periods || [];
  const safeModules = modules || [];
  const totalHours =
    params.structureType === 'modular'
      ? safeModules.reduce((acc, m) => acc + (m.hours || 0), 0)
      : safePeriods.reduce((acc, p) => acc + (p.totalHours || 0), 0);
  const totalCredits =
    params.structureType === 'modular'
      ? 0
      : safePeriods.reduce((acc, p) => acc + (p.totalCredits || 0), 0);
  const extensionHours = safePeriods.reduce(
    (sum, p) => sum + p.disciplines.filter((d) => d.isExtension).reduce((s, d) => s + (d.hours || 0), 0),
    0
  );

  return {
    id: `saga-${Date.now()}`,
    code: params.code,
    courseId: params.courseId,
    courseName: params.courseName,
    modality: params.modality,
    activeYearSemester: params.activeYearSemester,
    structureType: params.structureType,
    status: 'Em Elaboração',
    validityStart: '',
    hideValidity: false,
    requiredTotalHours: params.requiredTotalHours || 0,
    minPresentialHoursPercent: 0,
    maxEadHoursPercent: 0,
    minExtensionPercent: 10,
    calculatedTotalHours: totalHours,
    calculatedPresentialHours: 0,
    calculatedEadHours: 0,
    calculatedExtensionHours: extensionHours,
    calculatedComplementaryHours: 0,
    calculatedInternshipHours: 0,
    totalCredits,
    periods: params.structureType === 'disciplinar' ? safePeriods : undefined,
    modules: params.structureType === 'modular' ? safeModules : undefined,
    institutionName: 'UNISUAM - Centro Universitário Augusto Motta',
    campusName: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function parseSagaReportText(rawText: string, params: SagaParseParams): SagaParseResult {
  const hints = extractSagaHeaderHints(rawText);
  const warnings: string[] = [];
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  if (!rawText.trim()) {
    warnings.push('Nenhum texto foi extraído. O PDF pode ser digitalizado (imagem). Preencha a estrutura manualmente.');
    return {
      structure: emptyStructure(params, [], []),
      hints,
      warnings,
      stats: { periods: 0, disciplines: 0, withoutHours: 0, withoutCredits: 0, withoutName: 0, textChars: 0 },
    };
  }

  const resolvedParams: SagaParseParams = {
    ...params,
    code: params.code || hints.structureCode || '',
    activeYearSemester: params.activeYearSemester || hints.semester || '',
    modality: hints.modality || params.modality,
    courseName: params.courseName || hints.courseName || '',
  };

  if (resolvedParams.structureType === 'modular') {
    return parseModular(lines, resolvedParams, hints, warnings, rawText.length);
  }
  return parseDisciplinar(lines, resolvedParams, hints, warnings, rawText.length);
}

function parseDisciplinar(
  lines: string[],
  params: SagaParseParams,
  hints: SagaHeaderHints,
  warnings: string[],
  textChars: number
): SagaParseResult {
  const periods: PeriodData[] = [];
  let current: PeriodData | null = null;
  let withoutHours = 0;
  let withoutCredits = 0;
  let withoutName = 0;

  const ensurePeriod = (num: number) => {
    current = {
      id: `p-${num}-${Date.now()}`,
      number: num,
      disciplines: [],
      totalCredits: 0,
      totalHours: 0,
    };
    periods.push(current);
  };

  for (const line of lines) {
    const periodMatch = line.match(/(\d+)\s*[ºo°]?\s*[Pp]er[íi]odo/i);
    if (periodMatch && !/subtotal/i.test(line)) {
      ensurePeriod(parseInt(periodMatch[1], 10));
      continue;
    }

    const disc = parseDisciplineLine(line, params.modality);
    if (!disc) continue;
    if (!current) ensurePeriod(periods.length + 1);

    if (!disc.hours) withoutHours++;
    if (!disc.credits) withoutCredits++;
    if (!disc.name) withoutName++;
    current!.disciplines.push(disc);
  }

  periods.forEach((p) => {
    p.totalCredits = p.disciplines.reduce((acc, d) => acc + (d.credits || 0), 0);
    p.totalHours = p.disciplines.reduce((acc, d) => acc + (d.hours || 0), 0);
  });

  const disciplines = periods.reduce((acc, p) => acc + p.disciplines.length, 0);
  if (disciplines === 0) {
    warnings.push('Nenhuma disciplina foi identificada no PDF. O coordenador deve preencher a matriz.');
  }
  if (withoutHours > 0) {
    warnings.push(`${withoutHours} disciplina(s) sem carga horária — preencha no editor.`);
  }
  if (withoutCredits > 0) {
    warnings.push(`${withoutCredits} disciplina(s) sem créditos — preencha no editor.`);
  }

  return {
    structure: emptyStructure(params, periods, []),
    hints,
    warnings,
    stats: {
      periods: periods.length,
      disciplines,
      withoutHours,
      withoutCredits,
      withoutName,
      textChars,
    },
  };
}

function parseModular(
  lines: string[],
  params: SagaParseParams,
  hints: SagaHeaderHints,
  warnings: string[],
  textChars: number
): SagaParseResult {
  const modules: ModuleData[] = [];
  let current: ModuleData | null = null;
  let modNumber = 1;
  let withoutHours = 0;
  let withoutCredits = 0;

  for (const line of lines) {
    if (/^(m[oó]dulo\s*\d*|conhecimentos)\b/i.test(line)) {
      const title =
        line.replace(/^(m[oó]dulo\s*\d*[:.\-]?\s*|conhecimentos[:.\-]?\s*)/i, '').trim() ||
        `Módulo ${modNumber}`;
      current = {
        id: `mod-${modNumber}-${Date.now()}`,
        number: modNumber,
        code: '',
        title,
        hours: 0,
        disciplines: [],
        competencies: [],
      };
      modules.push(current);
      modNumber++;
      continue;
    }

    const disc = parseDisciplineLine(line, params.modality);
    if (disc && current) {
      if (!disc.hours) withoutHours++;
      if (!disc.credits) withoutCredits++;
      current.disciplines.push(disc);
      current.hours += disc.hours || 0;
    }
  }

  const disciplines = modules.reduce((acc, m) => acc + m.disciplines.length, 0);
  if (modules.length === 0) {
    warnings.push('Nenhum módulo foi identificado no PDF. O coordenador deve preencher a estrutura.');
  }
  if (withoutHours > 0) {
    warnings.push(`${withoutHours} disciplina(s) sem carga horária — preencha no editor.`);
  }

  return {
    structure: emptyStructure(params, [], modules),
    hints,
    warnings,
    stats: {
      periods: modules.length,
      disciplines,
      withoutHours,
      withoutCredits,
      withoutName: 0,
      textChars,
    },
  };
}
