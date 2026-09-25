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
import { normalizeModuleTitle, formatBranchLabel } from '../utils/roman';
import {
  parseEnfaseOrTrilhaHeader,
  parseModuleHeaderLine,
  linkModularParents,
} from '../utils/modularBranches';

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

/**
 * Extrai o PDF como matriz (linhas × células) usando posição X/Y dos glyphs.
 * Melhora a leitura de tabelas de CH presencial / a distância.
 */
export async function extractPdfMatrix(data: ArrayBuffer): Promise<string[][]> {
  const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
  const matrix: string[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    matrix.push(...itemsToMatrixRows(content.items as TextContentItem[]));
  }

  return matrix;
}

/** Texto + matriz (tabelas) a partir de .docx / .doc. */
export async function extractFromWord(
  data: ArrayBuffer,
  fileName: string
): Promise<{ text: string; rows: string[][]; warnings: string[] }> {
  const lower = fileName.toLowerCase();
  const warnings: string[] = [];

  if (lower.endsWith('.docx') || isZipDocx(data)) {
    const mammoth = await import('mammoth');
    const [raw, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: data }),
      mammoth.convertToHtml({ arrayBuffer: data }),
    ]);
    const rows = htmlTablesToMatrix(html.value);
    // Inclui parágrafos de módulo fora de tabela
    const extra = textLinesToPseudoMatrix(raw.value || '');
    const merged = mergeModuleHeadersIntoRows(extra, rows);
    return {
      text: raw.value || '',
      rows: merged.length > rows.length ? merged : rows.length ? rows : extra,
      warnings,
    };
  }

  if (lower.endsWith('.doc')) {
    warnings.push(
      'Arquivo .doc (formato antigo): extração limitada. Se faltar componente, salve como .docx ou use o Excel.'
    );
    const text = extractLooseTextFromDocBinary(data);
    return { text, rows: textLinesToPseudoMatrix(text), warnings };
  }

  throw new Error('Formato Word não suportado. Use .docx, .doc, Excel ou PDF.');
}

function isZipDocx(data: ArrayBuffer): boolean {
  const u8 = new Uint8Array(data);
  return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b;
}

/** Extrai strings legíveis de .doc binário (UTF-16LE / ASCII). */
function extractLooseTextFromDocBinary(data: ArrayBuffer): string {
  const u8 = new Uint8Array(data);
  const chunks: string[] = [];

  let utf16 = '';
  for (let i = 0; i + 1 < u8.length; i += 2) {
    const code = u8[i] | (u8[i + 1] << 8);
    if (code >= 0x20 && code < 0xfffe && code !== 0xad) {
      utf16 += String.fromCharCode(code);
    } else if (utf16.length >= 5) {
      chunks.push(utf16.replace(/\s+/g, ' ').trim());
      utf16 = '';
    } else {
      utf16 = '';
    }
  }
  if (utf16.length >= 5) chunks.push(utf16.replace(/\s+/g, ' ').trim());

  let ascii = '';
  for (let i = 0; i < u8.length; i++) {
    const c = u8[i];
    if (c >= 0x20 && c < 0x7f) ascii += String.fromCharCode(c);
    else if (ascii.length >= 5) {
      chunks.push(ascii.trim());
      ascii = '';
    } else ascii = '';
  }

  const interesting = chunks.filter(
    (c) =>
      /m[oó]dulo|conhecimento|extens|est[aá]gio|estrutura|biolog|sa[uú]de|\d{2,4}/i.test(
        c
      ) && c.length < 300
  );
  return (interesting.length > 20 ? interesting : chunks)
    .filter((c) => c.length >= 3)
    .join('\n');
}

function htmlTablesToMatrix(html: string): string[][] {
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rows: string[][] = [];

  doc.querySelectorAll('p, h1, h2, h3, h4').forEach((el) => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (/^m[oó]dulo\s+/i.test(t) || /^estrutura\s+curricular/i.test(t)) {
      rows.push([t]);
    }
  });

  doc.querySelectorAll('table').forEach((table) => {
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('th, td')).map((c) =>
        (c.textContent || '').replace(/\s+/g, ' ').trim()
      );
      if (cells.some((c) => c)) rows.push(cells);
    });
  });

  return rows;
}

function mergeModuleHeadersIntoRows(fromText: string[][], fromTables: string[][]): string[][] {
  if (!fromTables.length) return fromText;
  if (!fromText.length) return fromTables;
  // Se as tabelas já têm módulos, preferir tabelas; senão intercalamos cabeçalhos do texto
  const tablesHaveModules = fromTables.some((r) => /^m[oó]dulo\s+/i.test(r[0] || ''));
  if (tablesHaveModules) return fromTables;
  return [...fromText.filter((r) => /^m[oó]dulo\s+/i.test(r[0] || '')), ...fromTables];
}

/** Converte texto corrido em matriz nome + colunas de CH. */
export function textLinesToPseudoMatrix(text: string): string[][] {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const lines = coalesceMatrixLines(rawLines);
  return lines.map((line) => nameAndNumbersToRow(line));
}

function nameAndNumbersToRow(line: string): string[] {
  const split = splitNameAndNumbers(line);
  if (!split) return [line];
  const { name, nums } = split;
  const cells = [name, '', '', '', '', '', '', ''];
  const mapNums = (values: number[], indexes: number[]) => {
    indexes.forEach((col, i) => {
      if (values[i] != null) cells[col] = String(values[i]);
    });
  };

  if (nums.length >= 7) {
    mapNums(nums.slice(-7), [1, 2, 3, 4, 5, 6, 7]);
  } else if (nums.length === 6) {
    mapNums(nums, [1, 2, 3, 4, 5, 6]);
  } else if (nums.length === 4) {
    // Padrão comum no PDF (células vazias omitidas): P.Téo P.Prá Dist.Téo Total
    mapNums(nums, [1, 2, 4, 7]);
  } else if (nums.length === 3) {
    mapNums(nums, [1, 4, 7]);
  } else if (nums.length === 2) {
    mapNums(nums, [1, 4]);
    cells[7] = String(nums[0] + nums[1]);
  } else if (nums.length === 1) {
    cells[7] = String(nums[0]);
  }
  return cells;
}

function splitNameAndNumbers(
  line: string
): { name: string; nums: number[] } | null {
  const m = line.match(
    /^(.+?)\s+((?:\d+(?:[.,]\d+)?\s+)*\d+(?:[.,]\d+)?)(?:\s*h)?\s*$/i
  );
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  if (!name || name.length < 2) return null;
  if (/^(subtotal|total|presencial|conhecimento|te[oó]rico|pr[aá]tico)/i.test(name)) {
    return null;
  }
  const nums = m[2]
    .trim()
    .split(/\s+/)
    .map((s) => Number(String(s).replace(',', '.')))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return { name, nums };
}

export async function extractTextFromSpreadsheet(data: ArrayBuffer): Promise<string> {
  const rows = extractSpreadsheetMatrix(data);
  return rows
    .map((row) => row.map((c) => c.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

function sheetRowsFromWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string
): string[][] {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });
  return rows.map((row) =>
    (row || []).map((cell) => (cell == null ? '' : String(cell).trim()))
  );
}

/** Matriz crua da planilha (preserva colunas — necessário para estrutura curricular). */
export function extractSpreadsheetMatrix(data: ArrayBuffer): string[][] {
  const workbook = XLSX.read(data, { type: 'array' });
  const out: string[][] = [];

  // Preferir a aba de estrutura curricular (evita Legenda/Encontros/etc.).
  let sheetNames = workbook.SheetNames;
  const preferredName = workbook.SheetNames.find((n) =>
    /^estrutura$/i.test(String(n || '').trim())
  );
  const candidates = preferredName
    ? [preferredName, ...workbook.SheetNames.filter((n) => n !== preferredName)]
    : workbook.SheetNames;

  for (const sheetName of candidates) {
    const probeRows = sheetRowsFromWorkbook(workbook, sheetName);
    if (looksLikeEstruturaCurricularSheet(probeRows)) {
      sheetNames = [sheetName];
      break;
    }
  }

  for (const sheetName of sheetNames) {
    for (const row of sheetRowsFromWorkbook(workbook, sheetName)) {
      out.push(row);
    }
  }
  return out;
}

/** Código de UC no padrão UNISUAM (ex.: GPSA0003, GPFT0066). */
function isUnidadeCurricularCode(value: string): boolean {
  return /^[A-Z]{2,8}\d{3,5}[A-Z]?$/i.test(String(value || '').trim());
}

/**
 * Cabeçalho temático (sem “MÓDULO N”): "HUMANIZAÇÃO E SAÚDE | Compartilhado …"
 */
function parseThematicModuleHeader(line: string): string | null {
  const raw = String(line || '').trim();
  if (!raw || raw.length < 3) return null;
  if (/^m[oó]dulo\b/i.test(raw)) return null;
  if (/^(c[oó]digo|unidade\s+curricular|identifica)/i.test(raw)) return null;
  if (isUnidadeCurricularCode(raw)) return null;

  const withFlag = raw.match(/^(.+?)\s*\|\s*Compartilh/i);
  if (withFlag) {
    const title = withFlag[1].replace(/\s+/g, ' ').trim().replace(/[:.\-–—]+$/, '').trim();
    if (title.length >= 3 && !/^(subtotal|total|resumo)$/i.test(title)) return title;
  }
  return null;
}

/** Detecta planilha no layout “ESTRUTURA CURRICULAR” (módulos + conhecimentos com CH presencial/distância). */
export function looksLikeEstruturaCurricularSheet(rows: string[][]): boolean {
  const flat = rows
    .slice(0, 50)
    .map((r) => r.join(' '))
    .join('\n');
  const hasTitle = /estrutura\s+curricular/i.test(flat);
  const hasModule = rows.some((r) =>
    r.some((c) => /^m[oó]dulo\s+([ivxlcdm]+|\d+)/i.test((c || '').trim()))
  );
  const hasKnowledgeHeader = rows.some((r) =>
    r.some((c) => /^conhecimentos?$/i.test((c || '').trim()))
  );
  const hasUnidadeCurricular = /unidade\s+curricular/i.test(flat);
  const hasUcCodes = rows.some((r) => isUnidadeCurricularCode(r[0] || ''));
  const hasThematicModule = rows.some((r) => Boolean(parseThematicModuleHeader(r[0] || '')));
  const hasPresDist =
    /presencial/i.test(flat) && /a\s+dist[aâ]ncia|ass[ií]ncrono|\bead\b/i.test(flat);

  if (hasModule && (hasTitle || hasKnowledgeHeader || hasPresDist)) return true;
  // Layout temático UNISUAM (Terapia Ocupacional etc.): sem “MÓDULO N”, com UC + CH.
  if (
    hasTitle &&
    hasPresDist &&
    (hasUnidadeCurricular || hasUcCodes || hasThematicModule)
  ) {
    return true;
  }
  return false;
}

/** Reconstrói linhas a partir dos itens de texto do PDF (agrupa pelo eixo Y). */
function rebuildPageLines(items: TextContentItem[]): string {
  return itemsToMatrixRows(items)
    .map((row) => row.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Agrupa glyphs do PDF em linhas e células pela posição. */
function itemsToMatrixRows(items: TextContentItem[]): string[][] {
  type Cell = { x: number; str: string };
  const rowMap = new Map<number, Cell[]>();

  for (const item of items) {
    const str = (item.str || '').replace(/\s+/g, ' ');
    if (!str.trim() || !item.transform) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const bucket = Math.round(y / 4) * 4;
    const row = rowMap.get(bucket) || [];
    row.push({ x, str });
    rowMap.set(bucket, row);
  }

  const sortedYs = [...rowMap.keys()].sort((a, b) => b - a);
  const rows: string[][] = [];

  for (const y of sortedYs) {
    const cells = (rowMap.get(y) || []).sort((a, b) => a.x - b.x);
    if (!cells.length) continue;

    // Une tokens próximos; quebra célula quando o gap horizontal é grande
    const gaps: number[] = [];
    for (let i = 1; i < cells.length; i++) {
      gaps.push(cells[i].x - cells[i - 1].x);
    }
    const medianGap =
      gaps.length === 0
        ? 20
        : [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 20;
    const splitGap = Math.max(18, medianGap * 2.2);

    const out: string[] = [];
    let cur = cells[0].str;
    let lastX = cells[0].x;
    for (let i = 1; i < cells.length; i++) {
      const c = cells[i];
      if (c.x - lastX > splitGap) {
        out.push(cur.replace(/\s+/g, ' ').trim());
        cur = c.str;
      } else {
        cur += (/^\s|\s$/.test(cur) || /^\s/.test(c.str) ? '' : ' ') + c.str;
      }
      lastX = c.x;
    }
    out.push(cur.replace(/\s+/g, ' ').trim());

    if (out.some((c) => c)) rows.push(out);
  }

  return rows;
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
    const isPlausibleCourseLine = (line: string): boolean => {
      const t = line.replace(/\s+/g, ' ').trim();
      if (t.length < 3 || t.length > 80) return false;
      if (/\d{3,}/.test(t)) return false;
      if (/estrutura\s+curricular/i.test(t)) return false;
      if (/^(atividade|tipo|modalidade|defini[cç][aã]o|c[oó]digo|legenda|encontros?)\b/i.test(t)) {
        return false;
      }
      if (/\b(tipo|modalidade|defini[cç][aã]o)\b/i.test(t)) return false;
      if (/\|/.test(t) || /compartilh/i.test(t)) return false;
      if (/conhecimento|carga\s+hor|unidade\s+curricular/i.test(t)) return false;
      // Preferir título de curso (ex.: "TERAPIA OCUPACIONAL") — maiúsculas ou Title Case curto.
      const allCaps =
        /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{2,60}$/.test(t) &&
        /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(t);
      const titleCase =
        /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]{2,60}$/.test(t) &&
        t.split(/\s+/).length <= 6;
      return allCaps || titleCase;
    };

    // 1ª linha da matriz costuma ser o nome do curso (layout UNISUAM).
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      if (/estrutura\s+curricular/i.test(line)) continue;
      if (/^m[oó]dulo\b/i.test(line)) break;
      if (/conhecimento|carga\s+hor|unidade\s+curricular/i.test(line)) break;
      if (isPlausibleCourseLine(line)) {
        hints.courseName = line.replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  const semMatch = head.match(/\b(20\d{2}\s*[./]\s*[12])\b/);
  if (semMatch) {
    hints.semester = semMatch[1].replace(/\s+/g, '').replace('/', '.');
  }

  // Modalidade do CURSO — não confundir com colunas da matriz ("Presencial" / "A Distância").
  const modalityField = head.match(
    /modalidade(?:\s+do\s+curso)?\s*[:\-]\s*([^\n,;]{3,40})/i
  );
  if (modalityField) {
    const raw = modalityField[1];
    if (/semi|h[ií]brido/i.test(raw)) hints.modality = 'Semipresencial';
    else if (/\bead\b|a\s*dist|dist[aâ]ncia/i.test(raw)) hints.modality = 'EAD';
    else if (/presencial/i.test(raw)) hints.modality = 'Presencial';
  } else if (/\beduca[cç][aã]o\s+a\s+dist[aâ]ncia\b/i.test(head)) {
    hints.modality = 'EAD';
  } else {
    // Ex.: "BIOMEDICINA (Presencial)" / "Administração — EAD" no título
    const titled = head.match(
      /\(([^\)]{0,30})\b(semipresencial|ead|a\s*dist[aâ]ncia|presencial)\b([^\)]{0,30})\)/i
    ) || head.match(
      /(?:curso|bacharelado|licenciatura|tecn[oó]logo)[^\n]{0,50}?[—\-–]\s*(semipresencial|ead|presencial)\b/i
    );
    if (titled) {
      const raw = (titled[2] || titled[1] || '').toString();
      if (/semi/i.test(raw)) hints.modality = 'Semipresencial';
      else if (/\bead\b|dist/i.test(raw)) hints.modality = 'EAD';
      else if (/presencial/i.test(raw)) hints.modality = 'Presencial';
    }
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
    /^(?:\d+(?:[.,]\d+)?\s+){0,7}\d+(?:[.,]\d+)?\s*h?$/i;
  const isNoise = (l: string) =>
    /^(subtotal|total|presencial|a dist[aâ]ncia|componente|conhecimento|te[oó]\.|pr[aá]t\.|t-p|consolida|legendas|carga hor[aá]ria|p[aá]gina\s+\d|te[oó]rico|pr[aá]tico)/i.test(
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
        !/\d+(?:[.,]\d+)?(?:\s+\d+(?:[.,]\d+)?){0,7}\s*h?\s*$/i.test(lines[i + 1]) &&
        lines[i + 1].length < 90
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
 * Linha de matriz modular (PDF/texto): aceita 1–7 números no fim
 * (células vazias do Excel costumam sumir no PDF).
 * Só presencial vs assíncrono — ignora teórico/prático/T-P.
 */
function parseMatrixComponentLine(line: string): Discipline | null {
  const skipped =
    /^(subtotal|total|carga hor[aá]ria|cr[eé]ditos|c[oó]digo|nome|estrutura|relat[oó]rio|presencial|a dist[aâ]ncia|componente|conhecimento|te[oó]|pr[aá]t|consolida|legendas)/i;
  if (skipped.test(line)) return null;

  const split = splitNameAndNumbers(line);
  if (!split) return null;

  const { name, nums } = split;
  if (/^m[oó]dulo\b/i.test(name)) return null;

  const mapped = mapTrailingHours(nums);
  if (mapped.hours <= 0) return null;

  const { presential, asyncH, hours } = mapped;
  const isExt = /extens[aã]o/i.test(name);
  const isIntern = /est[aá]gio|pr[aá]tica supervisionada/i.test(name);

  let modalityDelivery: DeliveryModalityFlag = 'presencial';
  if (presential > 0 && asyncH === 0) modalityDelivery = 'presencial';
  else if (asyncH > 0 && presential === 0) modalityDelivery = 'assincrono';
  else if (presential > 0) modalityDelivery = 'presencial';
  else modalityDelivery = 'assincrono';

  return {
    id: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: '',
    name,
    type: 'Obrigatória',
    credits: 0,
    hours,
    modalityDelivery,
    chPresential: presential || undefined,
    chAsync: asyncH || undefined,
    isExtension: isExt || undefined,
    isInternship: isIntern || undefined,
  };
}

function mapTrailingHours(nums: number[]): {
  presential: number;
  asyncH: number;
  hours: number;
} {
  if (nums.length >= 7) {
    const [a, b, c, d, e, f, g] = nums.slice(-7);
    const presential = a + b + c;
    const asyncH = d + e + f;
    return { presential, asyncH, hours: g || presential + asyncH };
  }
  if (nums.length === 6) {
    const presential = nums[0] + nums[1] + nums[2];
    const asyncH = nums[3] + nums[4] + nums[5];
    return { presential, asyncH, hours: presential + asyncH };
  }
  if (nums.length === 4) {
    return {
      presential: nums[0] + nums[1],
      asyncH: nums[2],
      hours: nums[3],
    };
  }
  if (nums.length === 3) {
    return { presential: nums[0], asyncH: nums[1], hours: nums[2] };
  }
  if (nums.length === 2) {
    return {
      presential: nums[0],
      asyncH: nums[1],
      hours: nums[0] + nums[1],
    };
  }
  if (nums.length === 1) {
    return { presential: 0, asyncH: 0, hours: nums[0] };
  }
  return { presential: 0, asyncH: 0, hours: 0 };
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
    name: normalizeModuleTitle(name),
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
  const safeModules = (modules || []).map((m) => ({
    ...m,
    title: normalizeModuleTitle(m.title),
  }));
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
  // Reusa o parser de planilha (dedupe + presencial/assíncrono) via matriz sintética
  const rows = lines.map((line) => nameAndNumbersToRow(line));
  if (looksLikeEstruturaCurricularSheet(rows) || rows.some((r) => /^m[oó]dulo\s+/i.test(r[0] || ''))) {
    const sheetResult = parseEstruturaCurricularSheet(rows, {
      ...params,
      structureType: 'modular',
    });
    sheetResult.stats.textChars = textChars;
    if (hints.courseName && !sheetResult.hints.courseName) {
      sheetResult.hints.courseName = hints.courseName;
    }
    sheetResult.hints = { ...hints, ...sheetResult.hints };
    sheetResult.warnings = [...warnings, ...sheetResult.warnings];
    return sheetResult;
  }

  const modules: ModuleData[] = [];
  let current: ModuleData | null = null;
  let withoutHours = 0;
  let withoutCredits = 0;
  const seenModuleKeys = new Set<string>();
  let activeBranch: string | undefined;
  let activeBranchName: string | undefined;

  for (const line of lines) {
    const enfase = parseEnfaseOrTrilhaHeader(line);
    if (enfase) {
      activeBranch = enfase.branch;
      activeBranchName = normalizeModuleTitle(enfase.branchName);
      continue;
    }

    const modHeader = parseModuleHeaderLine(line);
    if (modHeader) {
      const num = modHeader.number || modules.length + 1;
      const branch = modHeader.branchSuffix || activeBranch;
      const seenKey = `${branch || 'trunk'}:${num}`;
      if (seenModuleKeys.has(seenKey)) {
        warnings.push(
          `Módulo ${num}${branch ? branch : ''} repetido na mesma trilha — ignoramos a segunda cópia.`
        );
        if (!branch) break;
        continue;
      }
      seenModuleKeys.add(seenKey);
      let title = (modHeader.title || '')
        .replace(/\s*Presencial\s*:.*/i, '')
        .replace(/\s*EaD\s*:.*/i, '')
        .replace(/\s*Total\s*:.*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!title) title = '';

      current = {
        id: `mod-${num}${branch || ''}-${Date.now()}`,
        number: num,
        code: branch ? `MOD-${String(num).padStart(2, '0')}${branch}` : '',
        title,
        branch: branch || undefined,
        branchName: branch ? activeBranchName : undefined,
        hours: 0,
        meetings: 0,
        disciplines: [],
        competencies: [],
        knowledges: [],
        competences: [],
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
        meetings: 0,
        disciplines: [],
        competencies: [],
        knowledges: [],
        competences: [],
      };
      modules.push(current);
      continue;
    }

    const disc = parseDisciplineLine(line, params.modality);
    if (disc && current) {
      if (!disc.hours) withoutHours++;
      if (!disc.credits) withoutCredits++;
      const flags = classifyKnowledgeFlags(disc.name);
      current.knowledges = current.knowledges || [];
      current.knowledges.push({
        id: `know-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: disc.name,
        category: 'conhecimento',
        hours: disc.hours,
        modalityDelivery: disc.modalityDelivery,
        chPresential: disc.chPresential,
        chAsync: disc.chAsync,
        type: flags.type,
      });
      current.hours += disc.hours || 0;
    }
  }

  modules.forEach((m, i) => {
    const synced = syncModuleKnowledgesToDisciplines(m);
    modules[i] = synced;
  });
  modules.sort((a, b) => {
    const byNum = a.number - b.number;
    if (byNum !== 0) return byNum;
    return (a.branch || '').localeCompare(b.branch || '', 'pt-BR');
  });
  linkModularParents(modules);

  const disciplines = modules.reduce(
    (acc, m) => acc + (m.knowledges?.length || m.disciplines.length),
    0
  );
  if (modules.length === 0) {
    warnings.push('Nenhum módulo foi identificado no arquivo. Complete a estrutura manualmente.');
  }
  if (disciplines === 0) {
    warnings.push('Nenhum componente curricular foi identificado nos módulos.');
  }
  if (withoutHours > 0) {
    warnings.push(`${withoutHours} componente(s) sem carga horária — preencha no editor.`);
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

/** Normaliza linhas curtas do PDF/Word para o layout 8 colunas da planilha. */
function splitCellLines(value: string): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeImportedMatrix(rows: string[][]): string[][] {
  // Planilhas UNISUAM: ênfase + módulo na mesma célula com quebra de linha
  const expanded: string[][] = [];
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? '').trim());
    const parts = splitCellLines(cells[0] || '');
    const hasEnfase = parts.some((p) => Boolean(parseEnfaseOrTrilhaHeader(p)));
    const hasModulo = parts.some((p) => Boolean(parseModuleHeaderLine(p)));
    if (parts.length > 1 && (hasEnfase || hasModulo)) {
      for (const part of parts) {
        expanded.push([part, ...cells.slice(1)]);
      }
      continue;
    }
    expanded.push(cells);
  }

  return expanded.map((cells) => {
    if (!cells.some(Boolean)) return cells;
    const c0 = cells[0] || '';
    if (
      /^m[oó]dulo\s+/i.test(c0) ||
      /^estrutura\s+curricular/i.test(c0) ||
      /^identifica[cç][aã]o\s+da\s+estrutura/i.test(c0) ||
      /^[eê]nfases?\s+/i.test(c0) ||
      /^trilhas?\s+/i.test(c0)
    ) {
      return [c0];
    }
    // Código | Unidade Curricular | CH… (9 colunas: 6 partes + total)
    if (isUnidadeCurricularCode(c0) && cells[1]) {
      return cells.slice(0, 9);
    }
    // Nome em col1 (ex.: EXTENSÃO) com CH a partir da col2
    if (!c0 && cells[1] && cells.length >= 8) {
      return cells.slice(0, 9);
    }
    if (parseThematicModuleHeader(c0)) {
      return [c0];
    }
    if (cells.length >= 8) return cells.slice(0, 9);
    const name = c0;
    const numericCells = cells
      .slice(1)
      .filter((c) => c !== '' && Number.isFinite(Number(String(c).replace(',', '.'))));
    if (name && numericCells.length > 0) {
      return nameAndNumbersToRow(`${name} ${numericCells.join(' ')}`);
    }
    if (cells.length === 1) {
      return nameAndNumbersToRow(cells[0]);
    }
    return cells;
  });
}

function isSheetSkipRow(name: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (/^(conhecimento|conhecimentos|carga\s+hor[aá]ria|presencial|a\s+dist[aâ]ncia|te[oó]rico|pr[aá]tico|te[oó]rico-pr[aá]tico|total|subtotal|resumo|c[oó]digo|unidade\s+curricular)$/i.test(n)) {
    return true;
  }
  if (/^componentes$/i.test(n)) return true;
  if (/^hora-?rel[oó]gio$/i.test(n)) return true;
  if (/^percentual$/i.test(n)) return true;
  if (/^identifica[cç][aã]o\s+da\s+estrutura/i.test(n)) return true;
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
 *
 * Colunas teórico/prático/T-P são somadas: Presencial → chPresential,
 * A Distância → chAsync (assíncrono). Não importa a natureza pedagógica.
 * Se a planilha repetir a matriz (módulos duplicados), usa só a 1ª ocorrência.
 */
export function parseEstruturaCurricularSheet(
  rows: string[][],
  params: SagaParseParams
): SagaParseResult {
  rows = normalizeImportedMatrix(rows);
  const flatText = rows.map((r) => r.join(' ')).join('\n');
  const hints = extractSagaHeaderHints(flatText);
  const warnings: string[] = [];
  const modules: ModuleData[] = [];
  let current: ModuleData | null = null;
  let withoutHours = 0;
  let stamp = Date.now();
  const seenModuleKeys = new Set<string>();
  let activeBranch: string | undefined;
  let activeBranchName: string | undefined;
  const specialFlags = new Map<
    string,
    { isExtension?: boolean; isInternship?: boolean; isFinalPaper?: boolean }
  >();

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
    let name = cells[0] || '';
    let hourOffset = 1;

    // Layout UC: Código | Nome | CH…  (ou nome só na col1, ex. EXTENSÃO)
    if (isUnidadeCurricularCode(cells[0] || '') && cells[1]) {
      name = cells[1];
      hourOffset = 2;
    } else if (!cells[0] && cells[1]) {
      name = cells[1];
      hourOffset = 2;
    }

    if (!name && !cells.some(Boolean)) continue;

    // Segundo cabeçalho de título = cópia da matriz na mesma aba
    if (/^estrutura\s+curricular\b/i.test(name) && modules.length > 0) {
      pushCurrent();
      warnings.push(
        'A planilha parece conter a matriz em duplicata. Importamos apenas a primeira ocorrência.'
      );
      break;
    }

    const enfase = parseEnfaseOrTrilhaHeader(name);
    if (enfase) {
      pushCurrent();
      activeBranch = enfase.branch;
      activeBranchName = normalizeModuleTitle(enfase.branchName);
      continue;
    }

    const thematicTitle = parseThematicModuleHeader(cells[0] || name);
    if (thematicTitle) {
      pushCurrent();
      const num = modules.length + 1;
      const seenKey = `thematic:${thematicTitle.toLowerCase()}`;
      if (seenModuleKeys.has(seenKey)) {
        continue;
      }
      seenModuleKeys.add(seenKey);
      stamp += 1;
      current = {
        id: `mod-${num}-${stamp}`,
        number: num,
        code: `MOD-${String(num).padStart(2, '0')}`,
        title: normalizeModuleTitle(thematicTitle),
        hours: 0,
        meetings: 0,
        disciplines: [],
        competencies: [],
        knowledges: [],
        competences: [],
      };
      continue;
    }

    const modHeader = parseModuleHeaderLine(name);
    if (modHeader) {
      const num = modHeader.number || modules.length + 1;
      const branch = modHeader.branchSuffix || activeBranch;
      const seenKey = `${branch || 'trunk'}:${num}`;
      if (seenModuleKeys.has(seenKey)) {
        pushCurrent();
        warnings.push(
          `Módulo ${num}${branch ? branch : ''} repetido na mesma trilha — ignoramos a segunda cópia.`
        );
        // Sem trilha ativa: comportamento antigo (matriz duplicada na aba)
        if (!branch && !activeBranch) break;
        continue;
      }
      seenModuleKeys.add(seenKey);
      pushCurrent();
      stamp += 1;
      const title = (modHeader.title || '').replace(/\s+/g, ' ').trim();
      current = {
        id: `mod-${num}${branch || ''}-${stamp}`,
        number: num,
        code: `MOD-${String(num).padStart(2, '0')}${branch || ''}`,
        title: title || `Módulo ${num}`,
        branch: branch || undefined,
        branchName: branch ? activeBranchName : undefined,
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
    // Bloco final “Carga Horária / Componentes / Ideal 60-40” — não é UC
    if (
      (modules.length > 0 || current) &&
      (/^carga\s+hor[aá]ria$/i.test(name) ||
        /^componentes$/i.test(name) ||
        /^atividades\s+presenciais$/i.test(name) ||
        /^total\s+de\s+atividades/i.test(name) ||
        /\bideal\s*\d+\s*[/]\s*\d+/i.test(cells.join(' ')) ||
        /hora-?rel[oó]gio/i.test(cells.join(' ')))
    ) {
      pushCurrent();
      break;
    }
    if (/^atividades\s+complementares$/i.test(name)) {
      pushCurrent();
      const h =
        sheetCellNumber(cells[hourOffset]) ||
        sheetCellNumber(cells[hourOffset + 6]) ||
        sheetCellNumber(cells[1]) ||
        sheetCellNumber(cells[7]);
      if (h > 0) hints.complementaryHours = h;
      continue;
    }
    if (/^total$/i.test(name) && !current) {
      const h =
        sheetCellNumber(cells[hourOffset + 6]) ||
        sheetCellNumber(cells[hourOffset]) ||
        sheetCellNumber(cells[7]) ||
        sheetCellNumber(cells[1]);
      if (h > 0) hints.totalHours = h;
      continue;
    }

    if (!current) continue;
    if (isSheetSkipRow(name)) continue;
    if (/^subtotal$/i.test(name) || /^total$/i.test(name)) continue;
    // Cabeçalho "Código | Unidade Curricular" no meio da matriz
    if (/^c[oó]digo$/i.test(cells[0] || '') || /^unidade\s+curricular$/i.test(name)) continue;
    // Linhas de resumo que vazaram sem o cabeçalho “Carga Horária”
    if (
      /^(encontros|ead|a\s+dist[aâ]ncia)$/i.test(name) ||
      (/^est[aá]gio\s+supervisionado$/i.test(name) &&
        sheetCellNumber(cells[hourOffset + 1]) > 0 &&
        sheetCellNumber(cells[hourOffset + 1]) < 1)
    ) {
      pushCurrent();
      break;
    }

    // Colunas: Presencial (T/P/TP) | A Distância (T/P/TP) | Total
    const presential =
      sheetCellNumber(cells[hourOffset]) +
      sheetCellNumber(cells[hourOffset + 1]) +
      sheetCellNumber(cells[hourOffset + 2]);
    const asyncH =
      sheetCellNumber(cells[hourOffset + 3]) +
      sheetCellNumber(cells[hourOffset + 4]) +
      sheetCellNumber(cells[hourOffset + 5]);
    const totalCol = sheetCellNumber(cells[hourOffset + 6]);
    // CH do componente = soma das modalidades (Presencial + A Distância).
    // Não preferir a coluna Total se ela divergir (causa CH do módulo errada).
    const partsSum = presential + asyncH;
    const hours = partsSum > 0 ? partsSum : totalCol;

    // Percentuais do resumo (0.2, 0.28125…) não são CH de UC
    if (hours > 0 && hours < 1) continue;

    if (hours <= 0 && presential <= 0 && asyncH <= 0) continue;

    const flags = classifyKnowledgeFlags(name);

    let modalityDelivery: DeliveryModalityFlag = 'presencial';
    if (presential > 0 && asyncH === 0) modalityDelivery = 'presencial';
    else if (asyncH > 0 && presential === 0) modalityDelivery = 'assincrono';
    else if (presential > 0) modalityDelivery = 'presencial';
    else modalityDelivery = 'assincrono';

    stamp += 1;
    const knowId = `know-${stamp}`;
    const know: KnowledgeItem = {
      id: knowId,
      name: normalizeModuleTitle(name),
      category: 'conhecimento',
      hours: hours || presential + asyncH,
      modalityDelivery,
      chPresential: presential || undefined,
      chAsync: asyncH || undefined,
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

  modules.sort((a, b) => {
    const byNum = a.number - b.number;
    if (byNum !== 0) return byNum;
    return (a.branch || '').localeCompare(b.branch || '', 'pt-BR');
  });
  modules.forEach((m) => {
    m.hours = (m.knowledges || []).reduce((a, k) => a + (k.hours || 0), 0);
  });
  linkModularParents(modules);

  if (activeBranch || modules.some((m) => m.branch)) {
    const keys = [...new Set(modules.map((m) => m.branch).filter(Boolean))];
    warnings.push(
      `Ênfases detectadas (${keys.map((k) => formatBranchLabel(String(k))).join(', ') || 'I/II'}): módulos sob Ênfase foram marcados como ramificação (CH conta só uma ênfase).`
    );
  }

  // CH presencial + a distância na matriz ≠ modalidade do curso (ex.: presencial com até 40% EAD).
  const resolvedParams: SagaParseParams = {
    ...params,
    code: params.code || hints.structureCode || '',
    activeYearSemester: params.activeYearSemester || hints.semester || '',
    modality: hints.modality || params.modality || 'Presencial',
    courseName: params.courseName || hints.courseName || '',
    structureType: 'modular',
    requiredTotalHours: params.requiredTotalHours || hints.totalHours || 0,
  };

  hints.structureType = 'modular';

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
