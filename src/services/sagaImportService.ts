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
  KnowledgeItem,
} from '../types/curriculum';
import { syncModuleKnowledgesToDisciplines } from '../utils/modularComponents';

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
  structureType?: 'disciplinar' | 'modular';
  totalHours?: number;
  complementaryHours?: number;
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
  const rows = extractSpreadsheetMatrix(data);
  return rows
    .map((row) => row.map((c) => c.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

/** Matriz crua da planilha (preserva colunas — necessário para estrutura curricular). */
export function extractSpreadsheetMatrix(data: ArrayBuffer): string[][] {
  const workbook = XLSX.read(data, { type: 'array' });
  const out: string[][] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });
    for (const row of rows) {
      out.push((row || []).map((cell) => (cell == null ? '' : String(cell).trim())));
    }
  }
  return out;
}

/** Detecta planilha no layout “ESTRUTURA CURRICULAR” (módulos + conhecimentos com CH presencial/distância). */
export function looksLikeEstruturaCurricularSheet(rows: string[][]): boolean {
  const head = rows
    .slice(0, 12)
    .map((r) => r.join(' '))
    .join('\n');
  const hasTitle = /estrutura\s+curricular/i.test(head);
  const hasModule = rows.some((r) => /^m[oó]dulo\s+([ivxlcdm]+|\d+)/i.test(r[0] || ''));
  const hasKnowledgeHeader = rows.some((r) => /^conhecimento$/i.test((r[0] || '').trim()));
  return (hasTitle || hasKnowledgeHeader) && hasModule;
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
  const head = rawText.slice(0, 3500);
  const full = rawText;

  const courseLabeled = head.match(
    /(?:curso|nome do curso)\s*[:\-]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç0-9][^\n]{2,100})/i
  );
  if (courseLabeled) {
    hints.courseName = courseLabeled[1].replace(/\s+/g, ' ').trim();
  } else {
    const courseLine = head.match(
      /^\s*((?:Curso\s+Superior\s+de\s+Tecnologia\s+em|CST\s+em|Tecn[oó]logo\s+em|Bacharelado\s+em|Licenciatura\s+em|Curso\s+de)\s+[^\n]{3,80})/im
    );
    if (courseLine) {
      hints.courseName = courseLine[1]
        .replace(/\s*[—–-]\s*Estrutura.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      const cstShort = head.match(/\bCST\s+em\s+([^\n—–-]{3,60})/i);
      if (cstShort) {
        hints.courseName = `CST em ${cstShort[1].replace(/\s+/g, ' ').trim()}`;
      }
    }
  }

  const codeMatch = head.match(
    /(?:c[oó]digo(?: da estrutura)?|estrutura)\s*[:\-]\s*([A-Z]{2,6}\d{2,4}[A-Z]?)/i
  );
  if (codeMatch) {
    hints.structureCode = codeMatch[1].toUpperCase();
  } else {
    const estruturaNum = head.match(/estrutura\s+curricular\s*[-–—]\s*(\d{2,4})/i);
    if (estruturaNum) {
      hints.structureCode = estruturaNum[1];
    } else {
      const loose = head.match(/\b([A-Z]{3}\d{3})\b/);
      if (loose) hints.structureCode = loose[1];
    }
  }

  if (!hints.courseName) {
    const lines = head.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const line = lines[i];
      if (/estrutura\s+curricular/i.test(line)) continue;
      if (/^m[oó]dulo\b/i.test(line)) break;
      if (/conhecimento|carga\s+hor/i.test(line)) break;
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]{2,60}$/.test(line) && !/\d{3,}/.test(line)) {
        hints.courseName = line.replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  const semMatch = head.match(/\b(20\d{2}\s*[./]\s*[12])\b/);
  if (semMatch) {
    hints.semester = semMatch[1].replace(/\s+/g, '').replace('/', '.');
  }

  if (/\b(semipresencial|semi[\s-]?presencial|h[ií]brido)\b/i.test(head)) {
    hints.modality = 'Semipresencial';
  } else if (/\b(ead|a dist[aâ]ncia|educa[cç][aã]o a dist[aâ]ncia)\b/i.test(head)) {
    hints.modality = 'EAD';
  } else if (/\bpresencial\b/i.test(head)) {
    hints.modality = 'Presencial';
  }

  const modularSignals =
    /m[oó]dulo\s*(?:[ivxlcdm]+|\d+)/i.test(full) ||
    /m[oó]dulos?\s+tem[aá]ticos?/i.test(full) ||
    /componente\s+curricular\s*\/\s*conhecimento/i.test(full) ||
    /estrutura\s+curricular/i.test(full);
  if (modularSignals) {
    hints.structureType = 'modular';
  } else if (/\d+\s*[ºo°]?\s*per[íi]odo/i.test(full)) {
    hints.structureType = 'disciplinar';
  }

  const totalMatch = full.match(
    /(?:carga\s+hor[aá]ria\s+total(?:\s+do\s+curso)?|ch\s+total)\s*[:\-]?\s*([\d.]+)\s*h?/i
  );
  if (totalMatch) {
    hints.totalHours = Number(String(totalMatch[1]).replace(/\./g, '').replace(',', '.'));
  }

  const compMatch = full.match(/atividades\s+complementares\s*[:\-]?\s*([\d.,]+)\s*h?/i);
  if (compMatch) {
    hints.complementaryHours = Number(String(compMatch[1]).replace(/\./g, '').replace(',', '.'));
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

/** Junta nomes quebrados em linhas com a linha de horas da matriz modular. */
function coalesceMatrixLines(lines: string[]): string[] {
  const hoursOnly =
    /^(\d+(?:[.,]\d+)?\s+){5}\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s*h?$/i;
  const isNoise = (l: string) =>
    /^(subtotal|total|presencial|a dist[aâ]ncia|componente|conhecimento|te[oó]\.|pr[aá]t\.|t-p|consolida|legendas|carga hor[aá]ria|p[aá]gina\s+\d)/i.test(
      l
    ) || /^m[oó]dulo\s/i.test(l);

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (hoursOnly.test(line) && out.length > 0) {
      let name = out.pop()!;
      if (isNoise(name) || /\d+\s*h\s*$/i.test(name)) {
        out.push(name);
        out.push(line);
        continue;
      }
      while (
        i + 1 < lines.length &&
        !hoursOnly.test(lines[i + 1]) &&
        !isNoise(lines[i + 1]) &&
        !/\d+\s*h\s*$/i.test(lines[i + 1]) &&
        lines[i + 1].length < 80
      ) {
        name = `${name} ${lines[++i]}`.replace(/\s+/g, ' ').trim();
      }
      out.push(`${name} ${line}`.replace(/\s+/g, ' ').trim());
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * Linha de matriz modular:
 * Nome  TEÓ PRÁT T-P  TEÓ PRÁT T-P  TOTALh
 * (presencial)         (a distância)
 */
function parseMatrixComponentLine(line: string): Discipline | null {
  const skipped =
    /^(subtotal|total|carga hor[aá]ria|cr[eé]ditos|c[oó]digo|nome|estrutura|relat[oó]rio|presencial|a dist[aâ]ncia|componente|conhecimento|te[oó]|pr[aá]t|consolida|legendas)/i;
  if (skipped.test(line)) return null;

  const match = line.match(
    /^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*h?\s*$/i
  );
  if (!match) return null;

  const name = match[1].replace(/\s+/g, ' ').trim();
  if (!name || name.length < 2) return null;
  if (/^m[oó]dulo\b/i.test(name)) return null;

  const pTheo = Number(match[2]) || 0;
  const pPrat = Number(match[3]) || 0;
  const pTp = Number(match[4]) || 0;
  const dTheo = Number(match[5]) || 0;
  const dPrat = Number(match[6]) || 0;
  const dTp = Number(match[7]) || 0;
  const total = Number(match[8]) || 0;

  const presential = pTheo + pPrat + pTp;
  const ead = dTheo + dPrat + dTp;
  const hours = total || presential + ead;
  if (hours <= 0) return null;

  const isExt = /extens[aã]o/i.test(name);
  const isIntern = /est[aá]gio|pr[aá]tica supervisionada/i.test(name);

  let modalityDelivery: DeliveryModalityFlag = 'presencial';
  if (presential > 0 && ead > 0) modalityDelivery = 'presencial';
  else if (ead > 0) modalityDelivery = 'assincrono';
  else modalityDelivery = 'presencial';

  let pedagogicalNature: Discipline['pedagogicalNature'];
  const prat = pPrat + dPrat;
  const theo = pTheo + dTheo;
  const tp = pTp + dTp;
  if (tp > 0 && prat === 0 && theo === 0) pedagogicalNature = 'teorico-pratica';
  else if (prat > 0 && theo === 0 && tp === 0) pedagogicalNature = 'pratica';
  else if (theo > 0 && prat === 0 && tp === 0) pedagogicalNature = 'teorica';
  else if (prat > 0 || tp > 0) pedagogicalNature = 'teorico-pratica';
  else pedagogicalNature = 'teorica';

  return {
    id: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: '',
    name,
    type: 'Obrigatória',
    credits: 0,
    hours,
    modalityDelivery,
    pedagogicalNature,
    chPresential: presential || undefined,
    chTheoretical: presential > 0 ? pTheo + pTp : undefined,
    chLaboratory: presential > 0 && pPrat > 0 ? pPrat : undefined,
    hasLaboratory: pPrat > 0 || undefined,
    chAsync: ead || undefined,
    isExtension: isExt || undefined,
    isInternship: isIntern || undefined,
  };
}

function parseDisciplineLine(
  line: string,
  fallbackModality: ModalityType
): Discipline | null {
  const fromMatrix = parseMatrixComponentLine(line);
  if (fromMatrix) return fromMatrix;

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

function romanOrDigitToNumber(token: string): number {
  const t = token.trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const map: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
    xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
  };
  return map[t] || 0;
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
  const extensionHours =
    params.structureType === 'modular'
      ? safeModules.reduce(
          (sum, m) =>
            sum + (m.disciplines || []).filter((d) => d.isExtension).reduce((s, d) => s + (d.hours || 0), 0),
          0
        )
      : safePeriods.reduce(
          (sum, p) =>
            sum + p.disciplines.filter((d) => d.isExtension).reduce((s, d) => s + (d.hours || 0), 0),
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
  const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const lines = coalesceMatrixLines(rawLines);

  if (!rawText.trim()) {
    warnings.push('Nenhum texto foi extraído. O PDF pode ser digitalizado (imagem). Preencha a estrutura manualmente.');
    return {
      structure: emptyStructure(params, [], []),
      hints,
      warnings,
      stats: { periods: 0, disciplines: 0, withoutHours: 0, withoutCredits: 0, withoutName: 0, textChars: 0 },
    };
  }

  const structureType = hints.structureType || params.structureType || 'disciplinar';

  const resolvedParams: SagaParseParams = {
    ...params,
    code: params.code || hints.structureCode || '',
    activeYearSemester: params.activeYearSemester || hints.semester || '',
    modality: hints.modality || params.modality,
    courseName: params.courseName || hints.courseName || '',
    structureType,
    requiredTotalHours: params.requiredTotalHours || hints.totalHours,
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
  let withoutHours = 0;
  let withoutCredits = 0;

  const moduleHeader =
    /^m[oó]dulo\s+([ivxlcdm]+|\d+)\s*[—–:\-.]?\s*(.*)$/i;

  for (const line of lines) {
    const modMatch = line.match(moduleHeader);
    if (modMatch) {
      const num = romanOrDigitToNumber(modMatch[1]) || modules.length + 1;
      let title = (modMatch[2] || '')
        .replace(/\s*Presencial\s*:.*/i, '')
        .replace(/\s*EaD\s*:.*/i, '')
        .replace(/\s*Total\s*:.*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!title) title = '';

      current = {
        id: `mod-${num}-${Date.now()}`,
        number: num,
        code: '',
        title,
        hours: 0,
        disciplines: [],
        competencies: [],
        knowledges: [],
      };
      modules.push(current);
      continue;
    }

    if (/^conhecimentos\b/i.test(line) && !current) {
      current = {
        id: `mod-${modules.length + 1}-${Date.now()}`,
        number: modules.length + 1,
        code: '',
        title: line.replace(/^conhecimentos[:.\-]?\s*/i, '').trim() || '',
        hours: 0,
        disciplines: [],
        competencies: [],
        knowledges: [],
      };
      modules.push(current);
      continue;
    }

    const disc = parseDisciplineLine(line, params.modality);
    if (disc && current) {
      if (!disc.hours) withoutHours++;
      if (!disc.credits) withoutCredits++;
      current.disciplines.push(disc);
      current.knowledges = current.knowledges || [];
      current.knowledges.push({
        id: `know-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: disc.name,
        category: 'conhecimento',
        hours: disc.hours,
        modalityDelivery: disc.modalityDelivery,
        chPresential: disc.chPresential,
        chTheoretical: disc.chTheoretical,
        chLaboratory: disc.chLaboratory,
        chAsync: disc.chAsync,
        hasLaboratory: disc.hasLaboratory,
      });
      current.hours += disc.hours || 0;
    }
  }

  modules.sort((a, b) => a.number - b.number);

  const disciplines = modules.reduce((acc, m) => acc + m.disciplines.length, 0);
  if (modules.length === 0) {
    warnings.push('Nenhum módulo foi identificado no PDF. O coordenador deve preencher a estrutura.');
  }
  if (disciplines === 0) {
    warnings.push('Nenhum componente curricular foi identificado nos módulos.');
  }
  if (withoutHours > 0) {
    warnings.push(`${withoutHours} componente(s) sem carga horária — preencha no editor.`);
  }
  if (hints.complementaryHours && hints.complementaryHours > 0) {
    // aplicado no modal via hints; aviso informativo
  }

  const structure = emptyStructure(params, [], modules);
  if (hints.complementaryHours) {
    structure.complementaryTotalHours = hints.complementaryHours;
  }
  if (hints.totalHours && structure.requiredTotalHours <= 0) {
    structure.requiredTotalHours = hints.totalHours;
  }

  return {
    structure,
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

function sheetCellNumber(raw: string | undefined): number {
  if (raw == null || String(raw).trim() === '') return 0;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isSheetSkipRow(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (/^(conhecimento|conhecimentos|carga\s+hor[aá]ria|presencial|a\s+dist[aâ]ncia|te[oó]rico|pr[aá]tico|te[oó]rico-pr[aá]tico|total|subtotal|resumo)$/i.test(n)) {
    return true;
  }
  if (/^componentes$/i.test(n)) return true;
  if (/^hora-?rel[oó]gio$/i.test(n)) return true;
  if (/^percentual$/i.test(n)) return true;
  return false;
}

function classifyKnowledgeFlags(name: string): {
  isExtension?: boolean;
  isInternship?: boolean;
  isFinalPaper?: boolean;
  type: Discipline['type'];
} {
  if (/^extens[aã]o\b/i.test(name)) {
    return { isExtension: true, type: 'Obrigatória' };
  }
  if (/^est[aá]gio\b/i.test(name)) {
    return { isInternship: true, type: 'Obrigatória' };
  }
  if (
    /\btrabalho de conclus/i.test(name) ||
    /\btcc\b/i.test(name) ||
    /\bpr[eé]\s*projeto\b/i.test(name)
  ) {
    return { isFinalPaper: true, type: 'Obrigatória' };
  }
  return { type: 'Obrigatória' };
}

/**
 * Pré-preenche estrutura modular a partir da planilha “ESTRUTURA CURRICULAR”
 * (módulos romanos + conhecimentos com CH presencial/distância em colunas).
 */
export function parseEstruturaCurricularSheet(
  rows: string[][],
  params: SagaParseParams
): SagaParseResult {
  const flatText = rows.map((r) => r.join(' ')).join('\n');
  const hints = extractSagaHeaderHints(flatText);
  const warnings: string[] = [];
  const modules: ModuleData[] = [];
  let current: ModuleData | null = null;
  let withoutHours = 0;
  let hasLaboratory = false;
  let stamp = Date.now();
  const specialFlags = new Map<
    string,
    { isExtension?: boolean; isInternship?: boolean; isFinalPaper?: boolean }
  >();

  const moduleHeader = /^m[oó]dulo\s+([ivxlcdm]+|\d+)\s*[—–:\-.]?\s*(.*)$/i;

  const pushCurrent = () => {
    if (!current) return;
    current = syncModuleKnowledgesToDisciplines(current);
    for (const know of current.knowledges || []) {
      const f = specialFlags.get(know.id);
      if (!f) continue;
      const disc = (current.disciplines || []).find((d) => d.id === know.id);
      if (!disc) continue;
      if (f.isExtension) disc.isExtension = true;
      if (f.isInternship) disc.isInternship = true;
      if (f.isFinalPaper) disc.isFinalPaper = true;
    }
    modules.push(current);
    current = null;
  };

  for (const row of rows) {
    const cells = row.map((c) => String(c ?? '').trim());
    const name = cells[0] || '';
    if (!name) continue;

    const modMatch = name.match(moduleHeader);
    if (modMatch) {
      pushCurrent();
      stamp += 1;
      const num = romanOrDigitToNumber(modMatch[1]) || modules.length + 1;
      const title = (modMatch[2] || '').replace(/\s+/g, ' ').trim();
      current = {
        id: `mod-${num}-${stamp}`,
        number: num,
        code: `MOD-${String(num).padStart(2, '0')}`,
        title: title || `Módulo ${modMatch[1].toUpperCase()}`,
        hours: 0,
        meetings: 0,
        disciplines: [],
        competencies: [],
        knowledges: [],
        competences: [],
      };
      continue;
    }

    // Resumo final (fora dos módulos)
    if (/^resumo\b/i.test(name)) {
      pushCurrent();
      continue;
    }
    if (/^atividades\s+complementares$/i.test(name)) {
      pushCurrent();
      const h = sheetCellNumber(cells[1]);
      if (h > 0) hints.complementaryHours = h;
      continue;
    }
    if (/^total$/i.test(name) && !current) {
      const h = sheetCellNumber(cells[1]);
      if (h > 0) hints.totalHours = h;
      continue;
    }

    if (!current) continue;
    if (isSheetSkipRow(name)) continue;
    if (/^subtotal$/i.test(name) || /^total$/i.test(name)) continue;

    const presTheo = sheetCellNumber(cells[1]);
    const presPrac = sheetCellNumber(cells[2]);
    const presTheoPrac = sheetCellNumber(cells[3]);
    const distTheo = sheetCellNumber(cells[4]);
    const distPrac = sheetCellNumber(cells[5]);
    const distTheoPrac = sheetCellNumber(cells[6]);
    const totalCol = sheetCellNumber(cells[7]);

    const presential = presTheo + presPrac + presTheoPrac;
    const distance = distTheo + distPrac + distTheoPrac;
    const hours = totalCol > 0 ? totalCol : presential + distance;

    if (hours <= 0 && presential <= 0 && distance <= 0) continue;

    if (presPrac > 0 || distPrac > 0) hasLaboratory = true;

    const flags = classifyKnowledgeFlags(name);
    const chTheoretical = (presTheo || 0) + (presTheoPrac || 0);
    const chLaboratory = presPrac || 0;
    const chAsync = distance;

    stamp += 1;
    const knowId = `know-${stamp}`;
    const know: KnowledgeItem = {
      id: knowId,
      name,
      category: 'conhecimento',
      hours: hours || presential + distance,
      modalityDelivery:
        distance > 0 && presential === 0
          ? 'assincrono'
          : presential > 0 && distance === 0
            ? 'presencial'
            : 'assincrono',
      hasLaboratory: chLaboratory > 0,
      chTheoretical: chTheoretical || undefined,
      chLaboratory: chLaboratory || undefined,
      chPresential: presential || undefined,
      chAsync: chAsync || undefined,
      type: flags.type,
    };

    if (flags.isExtension || flags.isInternship || flags.isFinalPaper) {
      specialFlags.set(knowId, flags);
    }

    current.knowledges = current.knowledges || [];
    current.knowledges.push(know);
    current.hours = (current.hours || 0) + (know.hours || 0);

    if (!know.hours) withoutHours++;
  }

  pushCurrent();

  modules.sort((a, b) => a.number - b.number);
  modules.forEach((m, i) => {
    m.parentModuleId = i > 0 ? modules[i - 1].id : undefined;
    m.hours = (m.knowledges || []).reduce((a, k) => a + (k.hours || 0), 0);
  });

  const resolvedParams: SagaParseParams = {
    ...params,
    code: params.code || hints.structureCode || '',
    activeYearSemester: params.activeYearSemester || hints.semester || '',
    modality:
      hints.modality ||
      params.modality ||
      (hasLaboratory ? 'Semipresencial' : 'Presencial'),
    courseName: params.courseName || hints.courseName || '',
    structureType: 'modular',
    requiredTotalHours: params.requiredTotalHours || hints.totalHours,
  };

  hints.structureType = 'modular';
  if (!hints.modality && flatText.match(/a\s+dist[aâ]ncia/i)) {
    hints.modality = 'Semipresencial';
  }

  const disciplines = modules.reduce(
    (acc, m) => acc + (m.knowledges?.length || m.disciplines?.length || 0),
    0
  );

  if (modules.length === 0) {
    warnings.push('Nenhum módulo foi identificado na planilha de estrutura curricular.');
  }
  if (disciplines === 0) {
    warnings.push('Nenhum conhecimento/componente foi identificado nos módulos.');
  }

  const structure = emptyStructure(resolvedParams, [], modules);
  structure.hasLaboratory = hasLaboratory;
  if (hints.complementaryHours) {
    structure.complementaryTotalHours = hints.complementaryHours;
  }
  if (hints.totalHours && structure.requiredTotalHours <= 0) {
    structure.requiredTotalHours = hints.totalHours;
  }

  return {
    structure,
    hints,
    warnings,
    stats: {
      periods: modules.length,
      disciplines,
      withoutHours,
      withoutCredits: 0,
      withoutName: 0,
      textChars: flatText.length,
    },
  };
}
