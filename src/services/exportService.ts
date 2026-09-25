import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { toPng } from 'html-to-image';
import {
  CurriculumStructure,
  AppSettings,
  Course,
  Discipline,
  getDisciplineChBreakdown,
  getGraduateProfileAspects,
  normalizeModuleCompetences,
  aspectShortLabel,
  structureHasPresentialSplit,
  showsComponentCodeColumn,
} from '../types/curriculum';
import { formatDcnsDisplayLabel } from '../utils/courseBatch';
import { getActiveAuthorizationActLabel } from '../utils/authorizationActs';
import {
  buildWorkloadSummary,
  buildModuleMeetingsSummary,
  formatWorkloadHours,
  formatWorkloadPercent,
  summaryTableDensity,
  workloadSummaryDensity,
  summaryPairGridClass,
  WorkloadSummaryRow,
} from './workloadSummary';
import { getSaberesLabels, labelForCategory, matchesSaberesColumn } from '../utils/nomenclature';
import { formatModuleName, formatBranchLabel } from '../utils/roman';
import { getModularComponents } from '../utils/modularComponents';
import { getReportNotes, renderReportNotesPageHtml } from './reportNotes';
import {
  getPpcSummaryContent,
  hasPpcSummary,
  PPC_SUMMARY_PAGE_TITLE,
  renderPpcSummaryPageHtml,
} from './ppcSummary';
import {
  COURSE_BATCH_HEADERS,
  courseToBatchRow,
  cellToString,
  normalizeCourseBatchMatrix,
} from '../utils/courseBatch';
import logoUnisuamUrl from '../assets/logo-unisuam.png';

/** Converte HTMLImageElement já carregado em data URL PNG. */
function htmlImageToDataUrl(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('Imagem sem dimensões');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchUrlAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return blobToDataUrl(await res.blob());
}

let cachedLogoDataUrl: string | null = null;

/** Logo UNISUAM em resolução completa (arquivo original — nunca a miniatura da tela). */
export async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  cachedLogoDataUrl = await fetchUrlAsDataUrl(logoUnisuamUrl);
  return cachedLogoDataUrl;
}

/**
 * Durante a captura, força a logo em alta resolução e um pouco maior na tela,
 * para não sair pixelizada no PNG/PDF.
 */
async function prepareLogosForCapture(root: HTMLElement): Promise<() => void> {
  const logoDataUrl = await getLogoDataUrl().catch(() => null);
  const imgs = Array.from(
    root.querySelectorAll<HTMLImageElement>('img[alt="UNISUAM"], img[src*="logo-unisuam"]')
  );
  const backups = imgs.map((img) => ({
    img,
    src: img.getAttribute('src'),
    height: img.style.height,
    width: img.style.width,
    maxHeight: img.style.maxHeight,
    className: img.className,
  }));

  for (const img of imgs) {
    if (logoDataUrl) img.setAttribute('src', logoDataUrl);
    img.style.height = '120px';
    img.style.width = 'auto';
    img.style.maxHeight = 'none';
    img.classList.remove('h-9', 'h-12', 'h-14');
  }

  await Promise.all(
    imgs.map((img) => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()))
  );

  return () => {
    for (const b of backups) {
      if (b.src != null) b.img.setAttribute('src', b.src);
      else b.img.removeAttribute('src');
      b.img.style.height = b.height;
      b.img.style.width = b.width;
      b.img.style.maxHeight = b.maxHeight;
      b.img.className = b.className;
    }
  };
}

/** Substitui src de <img> no clone por data URL, usando as imagens do DOM original. */
async function inlineImagesAsDataUrls(
  cloneRoot: HTMLElement,
  sourceRoot: HTMLElement
): Promise<void> {
  const sourceImgs = Array.from(sourceRoot.querySelectorAll('img'));
  const cloneImgs = Array.from(cloneRoot.querySelectorAll('img'));
  const logoDataUrl = await getLogoDataUrl().catch(() => null);

  await Promise.all(
    cloneImgs.map(async (cloneImg, index) => {
      const sourceImg = sourceImgs[index];
      const src = (sourceImg?.currentSrc || sourceImg?.src || cloneImg.src || '').trim();
      if (!src) return;

      try {
        if (sourceImg && sourceImg.complete && sourceImg.naturalWidth > 0) {
          cloneImg.setAttribute('src', htmlImageToDataUrl(sourceImg));
          return;
        }
      } catch {
        /* try other methods */
      }

      try {
        if (/logo-unisuam/i.test(src) && logoDataUrl) {
          cloneImg.setAttribute('src', logoDataUrl);
          return;
        }
        cloneImg.setAttribute('src', await fetchUrlAsDataUrl(src));
      } catch {
        if (logoDataUrl && /logo|unisuam/i.test(src + (cloneImg.alt || ''))) {
          cloneImg.setAttribute('src', logoDataUrl);
        }
      }
    })
  );
}

function renderWorkloadSummaryHtml(structure: CurriculumStructure): string {
  if (structure.hideWorkloadSummaryInReport) return '';
  const { rows } = buildWorkloadSummary(structure);
  const componentRows = rows.filter((row) => row.id !== 'total');
  const totalRow = rows.find((row) => row.id === 'total');
  const meetings = buildModuleMeetingsSummary(structure);
  const meetingCols = meetings?.rows.length ?? 0;
  const chDensity = workloadSummaryDensity(componentRows.length, meetingCols);
  const meetingsDensity = summaryTableDensity(meetingCols);

  const chTable = `
    <section class="bg-white rounded-xl shadow-sm border border-[#002B49]/12 overflow-hidden min-w-0 h-full flex flex-col">
      <div class="bg-[#002B49] px-3 py-2 text-center shrink-0">
        <h3 class="${chDensity.titleText} font-black tracking-wide text-white uppercase">Carga Horária</h3>
        <p class="${chDensity.subtitleText} text-blue-200/90 mt-0.5">Hora-relógio · ${structure.courseName}</p>
      </div>
      <div class="flex-1 flex flex-col min-h-0 overflow-x-auto">
        <table class="w-full min-w-[36rem] table-fixed ${chDensity.tableText} border-collapse">
          <thead>
            <tr class="bg-[#002B49]/5 border-b border-[#002B49]/10">
              <th class="${chDensity.cellPad} text-left ${chDensity.headerText} font-bold uppercase tracking-wide text-[#002B49] ${chDensity.labelCol}">Componentes</th>
              ${componentRows
                .map(
                  (row) =>
                    `<th title="${row.label}" class="${chDensity.cellPad} text-center ${chDensity.headerText} font-bold uppercase tracking-wide text-[#002B49] leading-tight">${
                      row.shortLabel || row.label
                    }</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-slate-100">
              <th class="${chDensity.cellPad} text-left font-semibold text-slate-500">Hora-relógio</th>
              ${componentRows
                .map(
                  (row) =>
                    `<td class="${chDensity.cellPad} text-center tabular-nums font-bold text-slate-800">${formatWorkloadHours(
                      row.hours
                    )}</td>`
                )
                .join('')}
            </tr>
            <tr>
              <th class="${chDensity.cellPad} text-left font-semibold text-slate-500">Percentual</th>
              ${componentRows
                .map(
                  (row) =>
                    `<td class="${chDensity.cellPad} text-center tabular-nums text-slate-600"${
                      row.excludeFromTotal
                        ? ' title="Não contabiliza na CH total do curso"'
                        : ''
                    }>${
                      row.excludeFromTotal ? '—' : formatWorkloadPercent(row.percent)
                    }</td>`
                )
                .join('')}
            </tr>
          </tbody>
        </table>
      </div>
        ${
          totalRow
            ? `<div class="mt-auto relative bg-[#FF6B00]/8 border-t border-[#002B49]/10 px-2 py-1.5 font-bold text-[#002B49] shrink-0">
              <span class="uppercase tracking-wider text-[10px]">Total</span>
              <span class="absolute inset-0 flex items-center justify-center tabular-nums whitespace-nowrap pointer-events-none ${chDensity.footerText}">
                ${formatWorkloadHours(totalRow.hours)} horas
              </span>
            </div>`
            : ''
        }
    </section>`;

  const meetingsTable =
    meetings && meetings.rows.length > 0
      ? `
    <section class="bg-white rounded-xl shadow-sm border border-[#002B49]/12 overflow-hidden min-w-0 h-full flex flex-col">
      <div class="bg-[#002B49] px-3 py-2 text-center shrink-0">
        <h3 class="${meetingsDensity.titleText} font-black tracking-wide text-white uppercase">Encontros por Módulo</h3>
        <p class="${meetingsDensity.subtitleText} text-blue-200/90 mt-0.5">Quantidade de encontros · ${structure.courseName}</p>
      </div>
      <div class="flex-1 flex flex-col min-h-0 overflow-x-auto">
        <table class="w-full min-w-[28rem] table-fixed ${meetingsDensity.tableText} border-collapse">
          <thead>
            <tr class="bg-[#002B49]/5 border-b border-[#002B49]/10">
              <th class="${meetingsDensity.cellPad} text-left ${meetingsDensity.headerText} font-bold uppercase tracking-wide text-[#002B49] ${meetingsDensity.labelCol}">Módulos</th>
              ${meetings.rows
                .map(
                  (row) =>
                    `<th class="${meetingsDensity.cellPad} text-center ${meetingsDensity.headerText} font-bold uppercase tracking-wide text-[#002B49] leading-tight" title="${row.label}">${row.shortLabel}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-slate-100">
              <th class="${meetingsDensity.cellPad} text-left font-semibold text-slate-500">Encontros</th>
              ${meetings.rows
                .map(
                  (row) =>
                    `<td class="${meetingsDensity.cellPad} text-center tabular-nums font-bold text-slate-800">${row.meetings}</td>`
                )
                .join('')}
            </tr>
            <tr>
              <th class="${meetingsDensity.cellPad} text-left font-semibold text-slate-500">Percentual</th>
              ${meetings.rows
                .map(
                  (row) =>
                    `<td class="${meetingsDensity.cellPad} text-center tabular-nums text-slate-600">${formatWorkloadPercent(
                      row.percent
                    )}</td>`
                )
                .join('')}
            </tr>
          </tbody>
        </table>
      </div>
        <div class="mt-auto relative bg-[#FF6B00]/8 border-t border-[#002B49]/10 px-2 py-1.5 font-bold text-[#002B49] shrink-0">
          <span class="uppercase tracking-wider text-[10px]">Total</span>
          <span class="absolute inset-0 flex items-center justify-center tabular-nums whitespace-nowrap pointer-events-none ${meetingsDensity.footerText}">
            ${meetings.totalMeetings} ${meetings.totalMeetings === 1 ? 'encontro' : 'encontros'}
          </span>
        </div>
    </section>`
      : '';

  if (!meetingsTable) return chTable;

  return `<div class="grid gap-4 items-stretch ${summaryPairGridClass(meetingCols)}">${chTable}${meetingsTable}</div>`;
}

export async function captureElementAsPngDataUrl(
  elementId: string
): Promise<{ dataUrl: string; widthPx: number; heightPx: number; cssWidth: number }> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Elemento de visualização não encontrado para captura');
  }

  const actionButtons = element.querySelectorAll<HTMLElement>('.no-export');
  actionButtons.forEach((btn) => (btn.style.display = 'none'));

  // Protótipos / mapas de teste (ex.: competences-thesis) nunca entram em PNG/PDF.
  const excludedMapPanels = Array.from(
    element.querySelectorAll<HTMLElement>('[data-map-export="exclude"]')
  );
  const inactiveParents: Array<{ parent: Node; next: ChildNode | null; panel: HTMLElement }> = [];
  excludedMapPanels.forEach((panel) => {
    inactiveParents.push({
      parent: panel.parentNode as Node,
      next: panel.nextSibling,
      panel,
    });
    panel.remove();
  });

  // Em mapas modulares há dois painéis (pedagógico / competências); PNG/PDF exportam só o ativo.
  const inactiveMapPanels = Array.from(
    element.querySelectorAll<HTMLElement>('[data-map-view]')
  ).filter((panel) => {
    const style = window.getComputedStyle(panel);
    return style.display === 'none' || style.visibility === 'hidden';
  });
  inactiveMapPanels.forEach((panel) => {
    inactiveParents.push({
      parent: panel.parentNode as Node,
      next: panel.nextSibling,
      panel,
    });
    panel.remove();
  });

  const prevWidth = element.style.width;
  const prevMinWidth = element.style.minWidth;
  const prevMaxWidth = element.style.maxWidth;
  const prevOverflow = element.style.overflow;

  // Libera overflow ANTES de medir — senão scrollWidth fica preso à viewport
  element.style.overflow = 'visible';
  element.style.maxWidth = 'none';

  const scrollContainers = element.querySelectorAll<HTMLElement>(
    '.overflow-x-auto, .overflow-auto, .overflow-y-auto, .overflow-scroll'
  );
  const prevContainerStyles: Array<{ overflow: string; maxHeight: string; height: string }> = [];
  scrollContainers.forEach((c) => {
    prevContainerStyles.push({
      overflow: c.style.overflow,
      maxHeight: c.style.maxHeight,
      height: c.style.height,
    });
    c.style.overflow = 'visible';
    c.style.maxHeight = 'none';
    c.style.height = 'auto';
  });

  // Força reflow após liberar overflow
  void element.offsetWidth;

  let maxRequiredWidth = Math.max(1100, element.scrollWidth + 48);
  const tables = element.querySelectorAll<HTMLElement>('table');
  tables.forEach((t) => {
    if (t.scrollWidth + 48 > maxRequiredWidth) {
      maxRequiredWidth = t.scrollWidth + 48;
    }
  });
  const mapStages = element.querySelectorAll<HTMLElement>(
    '.inline-block, .inline-grid, [data-map-canvas], [data-map-view]'
  );
  mapStages.forEach((stage) => {
    const w = Math.max(stage.scrollWidth, stage.offsetWidth);
    if (w + 64 > maxRequiredWidth) {
      maxRequiredWidth = w + 64;
    }
  });
  // Mede filhos diretos largos (árvores do mapa de competências)
  element.querySelectorAll<HTMLElement>('[data-map-canvas] > *, [data-map-view] .inline-flex').forEach((node) => {
    const w = Math.max(node.scrollWidth, node.offsetWidth);
    if (w + 64 > maxRequiredWidth) {
      maxRequiredWidth = w + 64;
    }
  });

  // Matrizes modulares ficam muito altas: evita canvas branco por limite do browser
  const SAFE_PIXELS = 28_000_000;
  let captureWidth = maxRequiredWidth;
  let contentHeight = Math.max(element.scrollHeight, 1);
  // Preferir 3x / 2x para zoom sem perder nitidez (logo e textos)
  let pixelRatio = 3;
  while (captureWidth * contentHeight * pixelRatio * pixelRatio > SAFE_PIXELS && pixelRatio > 1) {
    pixelRatio = pixelRatio <= 2 ? 1 : 2;
  }
  while (captureWidth * contentHeight * pixelRatio * pixelRatio > SAFE_PIXELS && captureWidth > 1000) {
    captureWidth = Math.floor(captureWidth * 0.9);
  }

  element.style.width = `${captureWidth}px`;
  element.style.minWidth = `${captureWidth}px`;
  element.style.maxWidth = 'none';
  element.style.overflow = 'visible';

  const restoreLogos = await prepareLogosForCapture(element);
  contentHeight = Math.max(element.scrollHeight, 1);

  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));

  try {
    const dataUrl = await rasterizeElementToPng(element, {
      width: captureWidth,
      pixelRatio,
      backgroundColor: '#ffffff',
    });

    let widthPx = captureWidth * pixelRatio;
    let heightPx = contentHeight * pixelRatio;
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      widthPx = img.naturalWidth || widthPx;
      heightPx = img.naturalHeight || heightPx;
    } catch {
      /* mantém estimativa */
    }

    if (widthPx < 20 || heightPx < 20) {
      throw new Error('Captura gerou imagem inválida (muito pequena)');
    }

    return { dataUrl, widthPx, heightPx, cssWidth: captureWidth };
  } finally {
    restoreLogos();
    element.style.width = prevWidth;
    element.style.minWidth = prevMinWidth;
    element.style.maxWidth = prevMaxWidth;
    element.style.overflow = prevOverflow;
    scrollContainers.forEach((c, idx) => {
      const prev = prevContainerStyles[idx];
      if (!prev) return;
      c.style.overflow = prev.overflow;
      c.style.maxHeight = prev.maxHeight;
      c.style.height = prev.height;
    });
    inactiveParents.forEach(({ parent, next, panel }) => {
      try {
        parent.insertBefore(panel, next);
      } catch {
        parent.appendChild(panel);
      }
    });
    actionButtons.forEach((btn) => (btn.style.display = ''));
  }
}

/**
 * Converte cores modernas (oklch/color-mix do Tailwind v4) em RGB no próprio
 * elemento — evita PNG/PDF em branco (html-to-image desta versão não tem onclone).
 */
function applyComputedPaintInlining(root: HTMLElement): () => void {
  type PaintKeys =
    | 'backgroundColor'
    | 'color'
    | 'borderTopColor'
    | 'borderRightColor'
    | 'borderBottomColor'
    | 'borderLeftColor'
    | 'outlineColor'
    | 'boxShadow'
    | 'opacity';

  const keys: PaintKeys[] = [
    'backgroundColor',
    'color',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'outlineColor',
    'boxShadow',
    'opacity',
  ];

  const backups: Array<{ el: HTMLElement; values: Record<PaintKeys, string> }> = [];
  const nodes = [root, ...Array.from(root.querySelectorAll('*'))];

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const cs = window.getComputedStyle(node);
    const values = {} as Record<PaintKeys, string>;
    for (const key of keys) {
      values[key] = node.style[key];
      const computed = cs[key];
      if (computed) node.style[key] = computed;
    }
    backups.push({ el: node, values });
  }

  return () => {
    for (const { el, values } of backups) {
      for (const key of keys) {
        el.style[key] = values[key];
      }
    }
  };
}

async function rasterizeElementToPng(
  element: HTMLElement,
  opts: { width: number; pixelRatio: number; backgroundColor: string }
): Promise<string> {
  const { width, pixelRatio, backgroundColor } = opts;
  const restorePaint = applyComputedPaintInlining(element);

  try {
    try {
      const dataUrl = await toPng(element, {
        cacheBust: true,
        backgroundColor,
        pixelRatio,
        width,
        skipAutoScale: true,
        filter: (node) => {
          if (node instanceof HTMLElement && node.classList?.contains('no-export')) return false;
          return true;
        },
      });
      if (dataUrl?.startsWith('data:image')) return dataUrl;
    } catch (primaryErr) {
      console.warn('html-to-image falhou, tentando html2canvas:', primaryErr);
    }

    const canvas = await html2canvas(element, {
      scale: pixelRatio,
      useCORS: true,
      allowTaint: true,
      backgroundColor,
      logging: false,
      windowWidth: width + 80,
    });
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl?.startsWith('data:image')) {
      throw new Error('Falha ao gerar os dados da imagem');
    }
    return dataUrl;
  } finally {
    restorePaint();
  }
}

/** Opções de páginas extras (perfil do egresso + observações) na geração de documentos. */
export interface DocumentPageExportOptions {
  /**
   * Inclui a página “Perfil do Egresso”.
   * Padrão: true. Nos mapas, passar false.
   */
  includePpcSummary?: boolean;
  /**
   * Inclui a página de observações.
   * Padrão: true. Nos mapas, passar false.
   */
  includeReportNotes?: boolean;
}

/** Opções de exportação por captura de tela (páginas extras: resumo PPC + observações). */
export interface ElementExportOptions extends DocumentPageExportOptions {
  structure?: CurriculumStructure;
  settings?: AppSettings;
}

function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
  }, 200);
}

type CapturedPage = { dataUrl: string; widthPx: number; heightPx: number };

/**
 * Renderiza uma página HTML auxiliar (resumo PPC / observações) e captura como imagem.
 * Host fica no viewport (sem left:-10000) para o rasterizer não gerar branco.
 */
async function captureHtmlPage(
  html: string,
  widthPx: number,
  label: string
): Promise<CapturedPage | null> {
  if (!html) return null;

  const safeWidth = Math.max(800, Math.round(widthPx) || 1100);
  const host = document.createElement('div');
  host.id = `report-page-capture-${Date.now()}`;
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:-1',
    'opacity:0.01',
    'pointer-events:none',
    `width:${safeWidth}px`,
    'background:#ffffff',
  ].join(';');
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map((img) =>
        img.decode ? img.decode().catch(() => undefined) : Promise.resolve()
      )
    );
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));

    const target = (host.firstElementChild as HTMLElement) || host;
    const pixelRatio = 2;
    const dataUrl = await rasterizeElementToPng(target, {
      width: safeWidth,
      pixelRatio,
      backgroundColor: '#ffffff',
    });

    let outWidth = safeWidth * pixelRatio;
    let outHeight = Math.max(target.scrollHeight, 1) * pixelRatio;
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      outWidth = img.naturalWidth || outWidth;
      outHeight = img.naturalHeight || outHeight;
    } catch {
      /* mantém estimativa */
    }

    return { dataUrl, widthPx: outWidth, heightPx: outHeight };
  } catch (err) {
    console.warn(`Não foi possível gerar a página de ${label}:`, err);
    return null;
  } finally {
    if (document.body.contains(host)) document.body.removeChild(host);
  }
}

async function capturePpcSummaryPage(
  options: ElementExportOptions,
  widthPx: number,
  mode: 'standalone' | 'append' = 'append'
): Promise<CapturedPage | null> {
  const { structure, settings } = options;
  if (!structure || !hasPpcSummary(structure)) return null;

  const safeWidth = Math.max(800, Math.round(widthPx) || 1100);
  const logoDataUrl = mode === 'standalone' ? await getLogoDataUrl().catch(() => '') : '';
  const html = renderPpcSummaryPageHtml(structure, settings, {
    widthPx: safeWidth,
    logoDataUrl,
    mode,
  });
  return captureHtmlPage(html, safeWidth, 'resumo do PPC');
}

/**
 * Página de observações.
 * mode=append: sem 2º cabeçalho institucional — usado no PNG combinado.
 */
async function captureReportNotesPage(
  options: ElementExportOptions,
  widthPx: number,
  mode: 'standalone' | 'append' = 'append'
): Promise<CapturedPage | null> {
  const { structure, settings } = options;
  if (!structure) return null;

  const safeWidth = Math.max(800, Math.round(widthPx) || 1100);
  const logoDataUrl = mode === 'standalone' ? await getLogoDataUrl().catch(() => '') : '';
  const html = renderReportNotesPageHtml(structure, settings, {
    widthPx: safeWidth,
    logoDataUrl,
    mode,
  });
  return captureHtmlPage(html, safeWidth, 'observações');
}

/** Empilha capturas em um único PNG (resumo + matriz + observações), mesma largura. */
async function stitchPngVertically(pages: CapturedPage[], gapPx = 24): Promise<string> {
  if (pages.length === 0) throw new Error('Nenhuma página para combinar');
  if (pages.length === 1) return pages[0].dataUrl;

  const images = await Promise.all(pages.map((p) => loadImageFromDataUrl(p.dataUrl)));
  const width = Math.max(...images.map((img, i) => img.naturalWidth || pages[i].widthPx), 1);

  const scaledHeights = images.map((img, i) => {
    const scale = width / Math.max(img.naturalWidth || pages[i].widthPx, 1);
    return Math.max(1, Math.round((img.naturalHeight || pages[i].heightPx) * scale));
  });
  const height =
    scaledHeights.reduce((acc, h) => acc + h, 0) + gapPx * (scaledHeights.length - 1);

  const SAFE_PIXELS = 32_000_000;
  const scale = width * height > SAFE_PIXELS ? Math.sqrt(SAFE_PIXELS / (width * height)) : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível montar a imagem combinada');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let y = 0;
  images.forEach((img, i) => {
    const h = Math.round(scaledHeights[i] * scale);
    ctx.drawImage(img, 0, y, canvas.width, h);
    y += h + Math.round(gapPx * scale);
  });

  return canvas.toDataURL('image/png');
}

/** Desenha a 1ª página — Resumo do Projeto Pedagógico do Curso (fallback vetorial). */
function appendPpcSummaryVectorPages(
  doc: jsPDF,
  structure: CurriculumStructure,
  settings?: AppSettings
): boolean {
  const content = getPpcSummaryContent(structure);
  if (!content.graduateProfile && content.aspects.length === 0) return false;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = Math.min(18, pageWidth * 0.04);
  const contentWidth = pageWidth - margin * 2;

  // Insere como primeira página: o jsPDF começa com uma página em branco já criada pelo caller.
  // Esta função assume que o caller ainda não desenhou a matriz — usamos a página atual se vazia,
  // ou addPage+movePage. Mais simples: caller chama isto ANTES de desenhar a matriz na pág. 1,
  // então aqui só preenchemos a página atual e o caller faz addPage() para a matriz.
  let ny = margin;

  doc.setFillColor(0, 43, 73);
  doc.rect(margin, ny, contentWidth, 16, 'F');
  doc.setFillColor(255, 107, 0);
  doc.rect(margin, ny + 16, contentWidth, 2.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(
    settings?.institutionName || 'UNISUAM - Centro Universitário Augusto Motta',
    margin + 4,
    ny + 7
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.text(PPC_SUMMARY_PAGE_TITLE.toUpperCase(), margin + 4, ny + 12.5);
  ny += 24;

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(
    `Curso: ${structure.courseName} (${structure.modality}) · Código: ${structure.code} · CH: ${structure.calculatedTotalHours}h`,
    margin + 2,
    ny
  );
  ny += 10;

  if (content.graduateProfile) {
    doc.setFillColor(240, 244, 248);
    doc.rect(margin, ny, contentWidth, 7, 'F');
    doc.setFillColor(255, 107, 0);
    doc.rect(margin, ny, 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 43, 73);
    doc.text('PERFIL DO EGRESSO', margin + 5, ny + 4.8);
    ny += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(50, 50, 50);
    content.graduateProfile.split(/\r?\n/).forEach((paragraph) => {
      const clean = paragraph.trim();
      if (!clean) {
        ny += 2;
        return;
      }
      const lines = doc.splitTextToSize(clean, contentWidth - 6) as string[];
      lines.forEach((line) => {
        if (ny > pageHeight - 20) {
          doc.addPage();
          ny = margin;
        }
        doc.text(line, margin + 3, ny);
        ny += 4.2;
      });
    });
    ny += 6;
  }

  return true;
}

/** Desenha a página de observações em PDF vetorial (fallback se a captura falhar). */
function appendReportNotesVectorPages(
  doc: jsPDF,
  structure: CurriculumStructure,
  settings?: AppSettings
): boolean {
  const notes = getReportNotes(structure.structureType, settings);
  if (notes.blocks.length === 0) return false;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = Math.min(18, pageWidth * 0.04);
  const contentWidth = pageWidth - margin * 2;

  doc.addPage();
  let ny = margin;

  doc.setFillColor(0, 43, 73);
  doc.rect(margin, ny, contentWidth, 16, 'F');
  doc.setFillColor(255, 107, 0);
  doc.rect(margin, ny + 16, contentWidth, 2.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(
    settings?.institutionName || 'UNISUAM - Centro Universitário Augusto Motta',
    margin + 4,
    ny + 7
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11.5);
  doc.text(notes.title.toUpperCase(), margin + 4, ny + 12.5);
  ny += 24;

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(
    `Curso: ${structure.courseName} (${structure.modality}) · Código: ${structure.code} · CH: ${structure.calculatedTotalHours}h`,
    margin + 2,
    ny
  );
  ny += 10;

  notes.blocks.forEach((block) => {
    if (ny > pageHeight - 28) {
      doc.addPage();
      ny = margin;
    }
    if (block.title) {
      doc.setFillColor(240, 244, 248);
      doc.rect(margin, ny, contentWidth, 7, 'F');
      doc.setFillColor(255, 107, 0);
      doc.rect(margin, ny, 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(0, 43, 73);
      doc.text(block.title.toUpperCase(), margin + 5, ny + 4.8);
      ny += 10;
    }
    if (block.text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(50, 50, 50);
      block.text.split(/\r?\n/).forEach((paragraph) => {
        const clean = paragraph.trim();
        if (!clean) {
          ny += 2;
          return;
        }
        const lines = doc.splitTextToSize(clean, contentWidth - 6) as string[];
        lines.forEach((line) => {
          if (ny > pageHeight - 20) {
            doc.addPage();
            ny = margin;
          }
          doc.text(line, margin + 3, ny);
          ny += 4.2;
        });
      });
    }
    ny += 5;
  });

  return true;
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return img;
}

export async function exportToPNG(
  elementId: string,
  filename: string,
  options: ElementExportOptions = {}
): Promise<string> {
  const main = await captureElementAsPngDataUrl(elementId);
  const includePpc = options.includePpcSummary !== false;
  const includeNotes = options.includeReportNotes !== false;
  const summary = includePpc
    ? await capturePpcSummaryPage(options, main.cssWidth, 'append')
    : null;
  const notes = includeNotes
    ? await captureReportNotesPage(options, main.cssWidth, 'append')
    : null;

  const pages: CapturedPage[] = [];
  if (summary) pages.push(summary);
  pages.push({
    dataUrl: main.dataUrl,
    widthPx: main.widthPx,
    heightPx: main.heightPx,
  });
  if (notes) pages.push(notes);

  const dataUrl = await stitchPngVertically(pages);
  triggerDownload(dataUrl, `${filename}.png`);
  return dataUrl;
}

/** PDF da visualização atual (mapa ou tabela capturada da tela). */
export async function exportElementToPDF(
  elementId: string,
  filename: string,
  options: ElementExportOptions = {}
): Promise<void> {
  const { dataUrl, widthPx, heightPx, cssWidth } = await captureElementAsPngDataUrl(elementId);

  // Converte px → pt (~0.75) para página sob medida; sem reduzir demais a resolução
  const scale = 0.85;
  const pageW = Math.max(200, widthPx * scale);
  const pageH = Math.max(200, heightPx * scale);
  const matrixOrientation = pageW >= pageH ? 'landscape' : 'portrait';

  const includePpc = options.includePpcSummary !== false;
  const includeNotes = options.includeReportNotes !== false;
  // 1ª página: Resumo do PPC — somente quando solicitado (estrutura; não mapa)
  const summary = includePpc
    ? await capturePpcSummaryPage(options, cssWidth, 'standalone')
    : null;

  let pdf: jsPDF;
  if (summary) {
    const summaryH = Math.max(200, (summary.heightPx / summary.widthPx) * pageW);
    const summaryOrientation = pageW >= summaryH ? 'landscape' : 'portrait';
    pdf = new jsPDF({
      orientation: summaryOrientation,
      unit: 'pt',
      format: [pageW, summaryH],
      compress: true,
    });
    pdf.addImage(summary.dataUrl, 'PNG', 0, 0, pageW, summaryH, undefined, 'MEDIUM');
    pdf.addPage([pageW, pageH], matrixOrientation);
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'MEDIUM');
  } else {
    pdf = new jsPDF({
      orientation: matrixOrientation,
      unit: 'pt',
      format: [pageW, pageH],
      compress: true,
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'MEDIUM');
  }

  // Última página: observações (só na estrutura)
  if (includeNotes) {
    const notes = await captureReportNotesPage(options, cssWidth, 'standalone');
    if (notes) {
      const notesH = Math.max(200, (notes.heightPx / notes.widthPx) * pageW);
      pdf.addPage([pageW, notesH], pageW >= notesH ? 'landscape' : 'portrait');
      pdf.addImage(notes.dataUrl, 'PNG', 0, 0, pageW, notesH, undefined, 'MEDIUM');
    } else if (options.structure) {
      appendReportNotesVectorPages(pdf, options.structure, options.settings);
    }
  }

  pdf.save(`${filename}.pdf`);
}

export async function exportToXLSX(
  structure: CurriculumStructure,
  settings?: AppSettings
): Promise<void> {
  const { exportCurriculumToXlsx } = await import('./curriculumExcelExport');
  await exportCurriculumToXlsx(structure, settings);
}

export function exportToPDF(
  structure: CurriculumStructure,
  settings?: AppSettings,
  options: DocumentPageExportOptions = {}
): void {
  // Use landscape A4 (297 x 210 mm) for academic matrixes with granular CH columns
  const doc = new jsPDF('l', 'mm', 'a4');
  const usePresentialSplit = structureHasPresentialSplit(structure);
  const showCodeCol = showsComponentCodeColumn(structure);
  const saberes = getSaberesLabels(settings?.pedagogicalNomenclature);
  const chaTitle =
    settings?.pedagogicalNomenclature === 'zabala' ? saberes.full : saberes.sectionTitle;
  const includePpc = options.includePpcSummary !== false;
  const includeNotes = options.includeReportNotes !== false;

  // 1ª página: Perfil do Egresso
  if (includePpc && hasPpcSummary(structure)) {
    appendPpcSummaryVectorPages(doc, structure, settings);
    doc.addPage();
  }

  let y = 12;
  const pageWidth = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 273mm

  // Header UNISUAM (Cores da UNISUAM: Azul Marinho #002B49 e Laranja #FF6B00)
  doc.setFillColor(0, 43, 73); // UNISUAM Deep Blue
  doc.rect(margin, y, contentWidth, 14, 'F');
  doc.setFillColor(255, 107, 0); // UNISUAM Orange Bar
  doc.rect(margin, y + 14, contentWidth, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('UNISUAM - Centro Universitário Augusto Motta', margin + 4, y + 6);
  doc.setFontSize(11.5);
  doc.setFont('helvetica', 'normal');
  doc.text('ESTRUTURA CURRICULAR OFICIAL - MATRIZ PEDAGÓGICA E REGULATÓRIA', margin + 4, y + 11);

  y += 20;

  // Box Informações Básicas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y, contentWidth, 22);

  doc.text(`Curso e Modalidade: ${structure.courseName} (${structure.modality})`, margin + 3, y + 5);
  doc.text(
    `Ato Autorizativo: ${getActiveAuthorizationActLabel(structure)}`,
    margin + 3,
    y + 10
  );
  doc.text(`DCN do Curso: ${formatDcnsDisplayLabel(structure.dcns, structure.dcnRef)}`, margin + 3, y + 15);
  
  doc.text(`Estrutura: ${structure.code} (${structure.status})`, margin + 110, y + 5);
  if (!structure.hideValidity && structure.validityStart) {
    doc.text(`Início de Vigência: ${structure.validityStart} (Semestre: ${structure.activeYearSemester})`, margin + 110, y + 10);
  } else {
    doc.text(`Semestre Ativo: ${structure.activeYearSemester}`, margin + 110, y + 10);
  }
  doc.text(`Tipo de Estrutura: ${structure.structureType.toUpperCase()}`, margin + 110, y + 15);

  doc.text(`CINE Brasil: ${structure.cineBrasilRef || 'Geral'}`, margin + 200, y + 5);
  if (structure.structureType === 'disciplinar') {
    doc.text(`Total de Créditos: ${structure.totalCredits}`, margin + 200, y + 10);
  }
  doc.text(`CH Total: ${structure.calculatedTotalHours}h`, margin + 200, y + 15);

  y += 26;

  // Quadro Resumo Regulatório de Cargas Horárias
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, y, contentWidth, 18, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 43, 73);
  doc.text('RESUMO DE CARGA HORÁRIA E CONFORMIDADE REGULATÓRIA (MEC / DCN)', margin + 3, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(50, 50, 50);

  const col1 = margin + 3;
  const col2 = margin + 68;
  const col3 = margin + 138;
  const col4 = margin + 205;

  doc.text(`CH Total Exigida: ${structure.requiredTotalHours} horas`, col1, y + 9);
  doc.text(`CH Total Apurada: ${structure.calculatedTotalHours} horas`, col1, y + 14);

  const summaryPreview = buildWorkloadSummary(structure);
  const findRow = (id: string) => summaryPreview.rows.find((r) => r.id === id);
  const theoH = findRow('teorico')?.hours || 0;
  const labH = findRow('laboratorio')?.hours || 0;
  const clinH = findRow('clinica')?.hours || 0;
  const syncMedH = findRow('sincrono-mediado')?.hours || 0;
  const asyncH = findRow('assincrono')?.hours || 0;

  if (usePresentialSplit) {
    doc.text(`CH Presencial: ${structure.calculatedPresentialHours}h (Teór. ${theoH} · Lab. ${labH} · Clín. ${clinH})`, col2, y + 9);
  } else {
    doc.text(`CH Presencial: ${structure.calculatedPresentialHours} horas`, col2, y + 9);
  }
  doc.text(`Síncrono-Mediado / Assíncrono: ${syncMedH} / ${asyncH}`, col2, y + 14);

  doc.text(`Extensão (Mínimo 10%): ${structure.calculatedExtensionHours} horas`, col3, y + 9);
  doc.text(`Estágio Supervisionado: ${structure.calculatedInternshipHours} horas`, col3, y + 14);

  doc.text(`Atividades Complementares: ${structure.calculatedComplementaryHours} horas`, col4, y + 9);
  doc.text(`Conformidade: Regulamentar (MEC)`, col4, y + 14);

  y += 22;

  // Itens da Estrutura
  if (structure.structureType === 'disciplinar' && structure.periods) {
    structure.periods.forEach((period) => {
      if (y > 175) {
        doc.addPage();
        y = 12;
      }

      // Título do Período
      doc.setFillColor(0, 43, 73);
      doc.rect(margin, y, contentWidth, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(255, 255, 255);
      doc.text(`${period.number}º Período - Componentes Curriculares (${period.disciplines.length} disciplinas)`, margin + 3, y + 3.8);
      y += 5.5;

      // Cabeçalho da Tabela
      doc.setFillColor(235, 240, 245);
      doc.rect(margin, y, contentWidth, 5, 'F');
      doc.setTextColor(0, 43, 73);
      doc.setFontSize(8.2);
      if (showCodeCol) {
        doc.text('Código', margin + 2, y + 3.5);
        doc.text('Nome da Disciplina', margin + 20, y + 3.5);
      } else {
        doc.text('Nome da Disciplina', margin + 2, y + 3.5);
      }
      doc.text('Tipo', margin + 100, y + 3.5);
      doc.text('Créd.', margin + 120, y + 3.5);
      if (usePresentialSplit) {
        doc.text('Teór.', margin + 136, y + 3.5);
        doc.text('Lab.', margin + 156, y + 3.5);
        doc.text('Clín.', margin + 174, y + 3.5);
        doc.text('Sínc.-Med.', margin + 194, y + 3.5);
        doc.text('Assínc.', margin + 226, y + 3.5);
        doc.text('Total', margin + 258, y + 3.5);
      } else {
        doc.text('CH Presencial', margin + 140, y + 3.5);
        doc.text('Sínc.-Mediada', margin + 180, y + 3.5);
        doc.text('Assíncrona', margin + 220, y + 3.5);
        doc.text('Total', margin + 258, y + 3.5);
      }
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);

      let pTheo = 0;
      let pLab = 0;
      let pClin = 0;
      let pPres = 0;
      let pSyncMed = 0;
      let pAsync = 0;
      let pTot = 0;

      period.disciplines.forEach((disc) => {
        if (y > 185) {
          doc.addPage();
          y = 12;
        }
        const bd = getDisciplineChBreakdown(disc);
        const syncMed = (bd.syncMediated || 0) + (bd.sync || 0);
        pTheo += bd.theoretical;
        pLab += bd.laboratory;
        pClin += bd.clinical;
        pPres += bd.presential;
        pSyncMed += syncMed;
        pAsync += bd.async;
        pTot += bd.total;

        doc.setDrawColor(240, 240, 240);
        doc.line(margin, y + 4.2, margin + contentWidth, y + 4.2);

        if (showCodeCol) {
          doc.setFont('helvetica', 'bold');
          doc.text(disc.code, margin + 2, y + 3.2);
          doc.setFont('helvetica', 'normal');
          doc.text(disc.name.substring(0, 42), margin + 20, y + 3.2);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.text(disc.name.substring(0, 52), margin + 2, y + 3.2);
        }
        doc.text(disc.type.substring(0, 10), margin + 100, y + 3.2);
        doc.text(`${disc.credits}`, margin + 122, y + 3.2);
        if (usePresentialSplit) {
          doc.text(`${bd.theoretical}`, margin + 138, y + 3.2);
          doc.text(`${bd.laboratory}`, margin + 158, y + 3.2);
          doc.text(`${bd.clinical}`, margin + 176, y + 3.2);
          doc.text(`${syncMed}`, margin + 200, y + 3.2);
          doc.text(`${bd.async}`, margin + 230, y + 3.2);
          doc.text(`${bd.total}`, margin + 260, y + 3.2);
        } else {
          doc.text(`${bd.presential}`, margin + 150, y + 3.2);
          doc.text(`${syncMed}`, margin + 190, y + 3.2);
          doc.text(`${bd.async}`, margin + 230, y + 3.2);
          doc.text(`${bd.total}`, margin + 260, y + 3.2);
        }

        y += 4.5;
      });

      // Subtotal do Período
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 107, 0); // Laranja UNISUAM
      doc.setFontSize(8.5);
      doc.text(
        usePresentialSplit
          ? `Subtotal ${period.number}º Período: ${period.totalCredits} créd. | Teór. ${pTheo}h | Lab. ${pLab}h | Clín. ${pClin}h | Sínc.-Med. ${pSyncMed}h | Assínc. ${pAsync}h | Total: ${pTot || period.totalHours}h`
          : `Subtotal ${period.number}º Período: ${period.totalCredits} créd. | CH Presencial: ${pPres}h | Sínc.-Med. ${pSyncMed}h | Assínc. ${pAsync}h | Total: ${pTot || period.totalHours}h`,
        margin + 3,
        y + 3.5
      );
      y += 7;
    });
  } else if (structure.structureType === 'modular' && structure.modules) {
    structure.modules.forEach((mod) => {
      if (y > 170) {
        doc.addPage();
        y = 12;
      }

      // Título do Módulo
      doc.setFillColor(0, 43, 73);
      doc.rect(margin, y, contentWidth, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(255, 255, 255);
      const modTitle = `${formatModuleName(mod.number, mod.title, mod.branch)} (${
        structure.hideMeetings ? `${mod.hours}h` : `${mod.hours}h · ${mod.meetings ?? 0} encontros`
      })`;
      doc.text(modTitle, margin + contentWidth / 2, y + 4.2, { align: 'center' });
      y += 6;
      // Competências do módulo vão para a 1ª página (Resumo do PPC)

      // Conhecimentos do Módulo (em estrutura modular)
      const moduleComponents = getModularComponents(mod);
      if (!structure.hideKnowledgesInReport && moduleComponents.length > 0) {
        doc.setFillColor(242, 244, 247);
        doc.rect(margin, y, contentWidth, 4.5, 'F');
        doc.setTextColor(0, 43, 73);
        doc.setFontSize(8.8);
        doc.text('Conhecimento', margin + 2, y + 3.2);
        doc.text('Tipo', margin + 110, y + 3.2);
        if (usePresentialSplit) {
          doc.text('Teór.', margin + 140, y + 3.2);
          doc.text('Lab.', margin + 160, y + 3.2);
          doc.text('Clín.', margin + 178, y + 3.2);
          doc.text('Sínc.-Med.', margin + 198, y + 3.2);
          doc.text('Assínc.', margin + 230, y + 3.2);
        } else {
          doc.text('Presencial', margin + 150, y + 3.2);
          doc.text('Sínc.-Mediada', margin + 190, y + 3.2);
          doc.text('Assíncrona', margin + 235, y + 3.2);
        }
        y += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);

        let mTheo = 0;
        let mLab = 0;
        let mClin = 0;
        let mPres = 0;
        let mSyncMed = 0;
        let mAsync = 0;

        moduleComponents.forEach((d) => {
          if (y > 185) {
            doc.addPage();
            y = 12;
          }
          const bd = getDisciplineChBreakdown(d);
          const syncMed = (bd.syncMediated || 0) + (bd.sync || 0);
          mTheo += bd.theoretical;
          mLab += bd.laboratory;
          mClin += bd.clinical;
          mPres += bd.presential;
          mSyncMed += syncMed;
          mAsync += bd.async;

          doc.text(d.name.substring(0, 58), margin + 2, y + 3.2);
          doc.text(d.type.substring(0, 12), margin + 110, y + 3.2);
          if (usePresentialSplit) {
            doc.text(`${bd.theoretical}`, margin + 142, y + 3.2);
            doc.text(`${bd.laboratory}`, margin + 162, y + 3.2);
            doc.text(`${bd.clinical}`, margin + 180, y + 3.2);
            doc.text(`${syncMed}`, margin + 205, y + 3.2);
            doc.text(`${bd.async}`, margin + 234, y + 3.2);
          } else {
            doc.text(`${bd.presential}`, margin + 158, y + 3.2);
            doc.text(`${syncMed}`, margin + 200, y + 3.2);
            doc.text(`${bd.async}`, margin + 242, y + 3.2);
          }
          y += 4.2;
        });

        if (y > 185) {
          doc.addPage();
          y = 12;
        }
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, y, contentWidth, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 107, 0);
        doc.setFontSize(8.5);
        doc.text(
          usePresentialSplit
            ? `Subtotal: Teór. ${mTheo}h | Lab. ${mLab}h | Clín. ${mClin}h | Sínc.-Med. ${mSyncMed}h | Assínc. ${mAsync}h`
            : `Subtotal: CH Presencial: ${mPres}h | Sínc.-Med. ${mSyncMed}h | Assínc. ${mAsync}h`,
          margin + 3,
          y + 3.5
        );
        y += 7;
      }

      // Conhecimentos, Habilidades e Atitudes (CHA / Zabala)
      if (!structure.hideCompetenciesInReport && mod.competencies && mod.competencies.length > 0) {
        if (y > 175) {
          doc.addPage();
          y = 12;
        }

        doc.setFillColor(254, 243, 235);
        doc.rect(margin, y, contentWidth, 4, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(217, 83, 0);
        doc.text(`SABERES - ${formatModuleName(mod.number, mod.title).toUpperCase()}:`, margin + 2, y + 2.8);
        y += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.8);
        doc.setTextColor(50, 50, 50);

        mod.competencies.forEach((comp) => {
          if (y > 185) {
            doc.addPage();
            y = 12;
          }
          const cat = labelForCategory(comp.category, settings?.pedagogicalNomenclature);
          doc.text(`• [${cat.toUpperCase()}] ${comp.name}`, margin + 4, y + 2.8);
          y += 3.6;
        });
      }

      y += 4;
    });
  }

  // Quadro de Carga Horária (resumo final)
  if (!structure.hideWorkloadSummaryInReport) {
    if (y > 150) {
      doc.addPage();
      y = 12;
    }
    y += 4;
    const { rows } = buildWorkloadSummary(structure);
    const componentRows = rows.filter((row) => row.id !== 'total');
    const totalRow = rows.find((row) => row.id === 'total');

    // Quadro horizontal: um componente por coluna, total na faixa de baixo.
    // Ocupa a mesma largura das tabelas de disciplinas para alinhar o relatório.
    const colLabel = 30;
    const tableW = contentWidth;
    const tableX = margin;
    const colData = (tableW - colLabel) / Math.max(componentRows.length, 1);
    const rowH = 7;
    const centerOf = (index: number) => tableX + colLabel + colData * index + colData / 2;

    doc.setFillColor(0, 43, 73);
    doc.rect(tableX, y, tableW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(255, 255, 255);
    doc.text('CARGA HORÁRIA', tableX + tableW / 2, y + 5.2, { align: 'center' });
    y += 8;

    doc.setFillColor(245, 247, 250);
    doc.rect(tableX, y, tableW, rowH, 'F');
    doc.setDrawColor(0, 43, 73);
    doc.rect(tableX, y, tableW, rowH);
    doc.setFontSize(8.5);
    doc.setTextColor(0, 43, 73);
    doc.text('Componentes', tableX + 2, y + 4.4);
    componentRows.forEach((row, index) => {
      doc.text(row.shortLabel || row.label, centerOf(index), y + 4.4, {
        align: 'center',
        maxWidth: colData - 2,
      });
    });
    y += rowH;

    const drawValueRow = (
      title: string,
      valueOf: (row: WorkloadSummaryRow) => string,
      bold: boolean
    ) => {
      doc.setDrawColor(220, 220, 220);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(title, tableX + 2, y + 4.4);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      componentRows.forEach((row, index) => {
        doc.text(valueOf(row), centerOf(index), y + 4.4, { align: 'center' });
      });
      y += rowH;
    };

    drawValueRow('Hora-relógio', (row) => formatWorkloadHours(row.hours), true);
    drawValueRow(
      'Percentual',
      (row) => (row.excludeFromTotal ? '—' : formatWorkloadPercent(row.percent)),
      false
    );

    if (totalRow) {
      doc.setFillColor(255, 240, 230);
      doc.rect(tableX, y, tableW, rowH, 'F');
      doc.setDrawColor(0, 43, 73);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 43, 73);
      doc.text('TOTAL', tableX + 2, y + 4.6);
      doc.text(
        `${formatWorkloadHours(totalRow.hours)} horas`,
        tableX + tableW / 2,
        y + 4.6,
        { align: 'center' }
      );
      y += rowH;
    }

    const meetingsSummary = buildModuleMeetingsSummary(structure);
    if (meetingsSummary && meetingsSummary.rows.length > 0) {
      y += 6;
      if (y > 175) {
        doc.addPage();
        y = 12;
      }
      const mRows = meetingsSummary.rows;
      const mColData = (tableW - colLabel) / Math.max(mRows.length, 1);
      const mCenterOf = (index: number) => tableX + colLabel + mColData * index + mColData / 2;

      doc.setFillColor(0, 43, 73);
      doc.rect(tableX, y, tableW, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(255, 255, 255);
      doc.text('ENCONTROS POR MÓDULO', tableX + tableW / 2, y + 5.2, { align: 'center' });
      y += 8;

      doc.setFillColor(245, 247, 250);
      doc.rect(tableX, y, tableW, rowH, 'F');
      doc.setDrawColor(0, 43, 73);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFontSize(8.5);
      doc.setTextColor(0, 43, 73);
      doc.text('Módulos', tableX + 2, y + 4.4);
      mRows.forEach((row, index) => {
        doc.text(row.shortLabel, mCenterOf(index), y + 4.4, {
          align: 'center',
          maxWidth: mColData - 2,
        });
      });
      y += rowH;

      doc.setDrawColor(220, 220, 220);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Encontros', tableX + 2, y + 4.4);
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      mRows.forEach((row, index) => {
        doc.text(String(row.meetings), mCenterOf(index), y + 4.4, { align: 'center' });
      });
      y += rowH;

      doc.setDrawColor(220, 220, 220);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Percentual', tableX + 2, y + 4.4);
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(9);
      mRows.forEach((row, index) => {
        doc.text(formatWorkloadPercent(row.percent), mCenterOf(index), y + 4.4, {
          align: 'center',
        });
      });
      y += rowH;

      doc.setFillColor(255, 240, 230);
      doc.rect(tableX, y, tableW, rowH, 'F');
      doc.setDrawColor(0, 43, 73);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 43, 73);
      doc.text('TOTAL', tableX + 2, y + 4.6);
      doc.text(
        `${meetingsSummary.totalMeetings} ${
          meetingsSummary.totalMeetings === 1 ? 'encontro' : 'encontros'
        }`,
        tableX + colLabel + (tableW - colLabel) / 2,
        y + 4.6,
        { align: 'center' }
      );
      y += rowH;
    }
  }

  // Footer / Assinatura Oficial
  if (y > 180) {
    doc.addPage();
    y = 15;
  }
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + contentWidth, y);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Documento gerado eletronicamente pelo Sistema de Gestão de Estruturas Curriculares - UNISUAM.', margin, y + 4);
  doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin + 180, y + 4);

  // Última página: observações, regras e explicações da estrutura
  if (includeNotes) {
  const notes = getReportNotes(structure.structureType, settings);
  if (notes.blocks.length > 0) {
    doc.addPage();
    let ny = 12;

    doc.setFillColor(0, 43, 73);
    doc.rect(margin, ny, contentWidth, 14, 'F');
    doc.setFillColor(255, 107, 0);
    doc.rect(margin, ny + 14, contentWidth, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(
      settings?.institutionName || 'UNISUAM - Centro Universitário Augusto Motta',
      margin + 4,
      ny + 6
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.text(notes.title.toUpperCase(), margin + 4, ny + 11);
    ny += 20;

    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, ny, contentWidth, 16);
    doc.text(
      `Curso e Modalidade: ${structure.courseName} (${structure.modality})`,
      margin + 3,
      ny + 5
    );
    doc.text(
      `Ato Autorizativo: ${getActiveAuthorizationActLabel(structure)}`,
      margin + 110,
      ny + 5
    );
    doc.text(`CH Total: ${structure.calculatedTotalHours}h`, margin + 200, ny + 5);
    doc.text(
      `Estrutura: ${structure.code}${structure.hideStatus ? '' : ` (${structure.status})`}`,
      margin + 3,
      ny + 9.5
    );
    doc.text(`DCN do Curso: ${formatDcnsDisplayLabel(structure.dcns, structure.dcnRef)}`, margin + 110, ny + 9.5);
    doc.text(`Semestre Ativo: ${structure.activeYearSemester}`, margin + 200, ny + 9.5);
    ny += 22;

    notes.blocks.forEach((block) => {
      if (block.title) {
        if (ny > 185) {
          doc.addPage();
          ny = 12;
        }
        doc.setFillColor(240, 244, 248);
        doc.rect(margin, ny, contentWidth, 6, 'F');
        doc.setFillColor(255, 107, 0);
        doc.rect(margin, ny, 1.5, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0, 43, 73);
        doc.text(block.title.toUpperCase(), margin + 5, ny + 4);
        ny += 8;
      }

      if (block.text) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(50, 50, 50);
        block.text.split(/\r?\n/).forEach((paragraph) => {
          const clean = paragraph.trim();
          if (!clean) {
            ny += 2;
            return;
          }
          const lines = doc.splitTextToSize(clean, contentWidth - 8) as string[];
          lines.forEach((line) => {
            if (ny > 195) {
              doc.addPage();
              ny = 12;
            }
            doc.text(line, margin + 4, ny);
            ny += 4;
          });
        });
      }

      ny += 4;
    });
  }
  }

  doc.save(`${structure.code}_${structure.courseName.replace(/\s+/g, '_')}_Oficial_UNISUAM.pdf`);
}

export async function generateInteractiveHtml(
  structure: CurriculumStructure,
  settings?: AppSettings,
  options: DocumentPageExportOptions = {}
): Promise<string> {
  const saberes = getSaberesLabels(settings?.pedagogicalNomenclature);
  const chaTitle =
    settings?.pedagogicalNomenclature === 'zabala' ? saberes.full : saberes.sectionTitle;
  const workload = buildWorkloadSummary(structure);
  const hoursOf = (id: string) => workload.rows.find((r) => r.id === id)?.hours || 0;
  const usePresentialSplit = structureHasPresentialSplit(structure);
  const showCodeCol = showsComponentCodeColumn(structure);
  const logoDataUrl = await getLogoDataUrl().catch(() => '');
  const includePpc = options.includePpcSummary !== false;
  const includeNotes = options.includeReportNotes !== false;

  const dataJson = JSON.stringify(structure);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${structure.code} - ${structure.courseName} | Estrutura Curricular UNISUAM</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; color: black !important; }
      .report-notes-page { page-break-before: always; break-before: page; border: 0 !important; }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 font-sans antialiased min-h-screen">
  <!-- Topbar UNISUAM -->
  <header class="bg-[#002B49] text-white border-b-4 border-[#FF6B00] shadow-md sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        ${
          logoDataUrl
            ? `<img src="${logoDataUrl}" alt="UNISUAM" class="h-12 w-auto object-contain bg-white/95 rounded-md p-1" />`
            : `<div class="leading-none select-none"><span class="text-[27px] font-black tracking-tight"><span class="text-[#FF6B00]">UNI</span><span class="text-white">SUAM</span></span></div>`
        }
        <div>
          <h1 class="text-lg sm:text-[23px] font-bold tracking-tight">Estrutura Curricular Oficial</h1>
          <p class="text-[15px] text-blue-200">${structure.courseName} • Código: <span class="font-bold text-[#FF6B00]">${structure.code}</span> • ${structure.modality}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 no-print">
        <button onclick="window.print()" class="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-[15px] font-medium text-white transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
          Imprimir
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
    ${(() => {
      if (!includePpc) return '';
      const summaryHtml = renderPpcSummaryPageHtml(structure, settings, { logoDataUrl });
      return summaryHtml
        ? `<div class="ppc-summary-page rounded-xl overflow-hidden border border-slate-200 bg-white">${summaryHtml}</div>`
        : '';
    })()}

    <!-- Header Card -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="space-y-1">
          <span class="text-[15px] font-semibold uppercase tracking-wider text-slate-400">Curso e Modalidade</span>
          <h2 class="text-[23px] font-bold text-slate-900">${structure.courseName}</h2>
          <p class="text-[17px] text-slate-600">Modalidade: <span class="font-semibold text-[#002B49]">${structure.modality}</span></p>
          <p class="text-[17px] text-slate-600">Grau: <span class="font-semibold text-[#002B49]">${
            structure.degrees === 'Tecnólogo' ? 'Tecnológico' : structure.degrees || '—'
          }</span></p>
          <p class="text-[17px] text-slate-600">Estrutura: <span class="font-semibold text-[#002B49]">${
            structure.structureType === 'modular' ? 'Modular' : 'Disciplinar'
          }</span></p>
          <p class="text-[15px] text-slate-500">Ato Autorizativo: ${getActiveAuthorizationActLabel(structure)}</p>
          <p class="text-[15px] text-slate-500">DCN do Curso: ${formatDcnsDisplayLabel(structure.dcns, structure.dcnRef)}</p>
        </div>
        <div class="space-y-1">
          <span class="text-[15px] font-semibold uppercase tracking-wider text-slate-400">Vigência & Diretriz</span>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[15px] font-medium bg-emerald-100 text-emerald-800">${structure.status}</span>
            <span class="text-[17px] font-semibold text-slate-700">Semestre Ativo: ${structure.activeYearSemester}</span>
          </div>
          <p class="text-[15px] text-slate-500">CINE Brasil: ${structure.cineBrasilRef || 'Não classificado'}</p>
        </div>
        <div class="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-2">
          <div class="flex justify-between items-center text-[15px]">
            <span class="text-slate-500">Carga Horária Total:</span>
            <span class="font-bold text-slate-900 text-[17px]">${structure.calculatedTotalHours} horas</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div class="bg-[#FF6B00] h-2 rounded-full" style="width: ${Math.min(100, Math.round((structure.calculatedTotalHours / (structure.requiredTotalHours || 1)) * 100))}%"></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-1 pt-1 text-[14px] text-slate-600">
            ${
              usePresentialSplit
                ? `<div>Teórico: <span class="font-bold text-slate-800">${hoursOf('teorico')}h</span></div>
            <div>Laboratório: <span class="font-bold text-slate-800">${hoursOf('laboratorio')}h</span></div>
            <div>Clínica: <span class="font-bold text-slate-800">${hoursOf('clinica')}h</span></div>`
                : `<div>Presencial: <span class="font-bold text-slate-800">${structure.calculatedPresentialHours}h</span></div>`
            }
            <div>Síncrona Mediada: <span class="font-bold text-slate-800">${hoursOf('sincrono-mediado')}h</span></div>
            <div>Assíncrona: <span class="font-bold text-slate-800">${hoursOf('assincrono')}h</span></div>
            ${
              usePresentialSplit
                ? `<div>Presencial total: <span class="font-bold text-slate-800">${structure.calculatedPresentialHours}h</span></div>`
                : ''
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Search / Filter -->
    <div class="flex flex-wrap items-center justify-between gap-4 no-print">
      <div class="relative flex-1 min-w-[280px]">
        <input id="searchInput" type="text" placeholder="Buscar disciplina, código ou competência..." class="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#002B49] text-[17px] bg-white shadow-sm" onkeyup="filterContent()">
      </div>
      <div class="flex items-center gap-2">
        <button id="toggleAllBtn" onclick="toggleAllAccordions()" class="px-3 py-2 text-[15px] font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition">
          Expandir/Recolher Detalhes
        </button>
      </div>
    </div>

    <!-- Content Sections -->
    <div id="contentContainer" class="space-y-6">
      ${
        structure.structureType === 'disciplinar' && structure.periods
          ? structure.periods
              .map(
                (period) => `
        <div class="period-card bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" data-period-card>
          <button type="button" data-period-toggle aria-expanded="true" class="w-full bg-[#002B49] px-6 py-3.5 flex justify-between items-center text-white text-left hover:bg-[#003a63] transition">
            <h3 class="font-bold text-[19px] flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-[#FF6B00] text-[15px] flex items-center justify-center text-white">${period.number}</span>
              ${period.number}º Período Letivo
            </h3>
            <span class="text-[15px] font-semibold px-2.5 py-1 rounded bg-white/10 text-white">${period.totalCredits} · ${period.totalHours} horas</span>
          </button>
          <div data-period-body class="overflow-x-auto">
            <table class="w-full text-left text-[17px] ${usePresentialSplit ? 'min-w-[980px]' : 'min-w-[860px]'}">
              <thead class="bg-slate-50 border-b border-slate-200 text-[15px] font-semibold text-slate-600">
                ${
                  usePresentialSplit
                    ? `<tr>
                  ${showCodeCol ? `<th rowspan="2" class="px-3 py-2 align-bottom">Código</th>` : ''}
                  <th rowspan="2" class="px-3 py-2 min-w-[180px] align-bottom">Disciplina</th>
                  <th rowspan="2" class="px-2.5 py-2 align-bottom">Tipo</th>
                  <th rowspan="2" class="px-2.5 py-2 align-bottom">Avaliação</th>
                  <th rowspan="2" class="px-2 py-2 text-center align-bottom">Créditos</th>
                  <th colspan="3" class="px-2 py-1 text-center bg-blue-50/50 text-[#002B49]">Presencial</th>
                  <th rowspan="2" class="px-2 py-2 text-center bg-blue-50/50 text-[#002B49] align-bottom" style="line-height:1.15">Síncrona<br/>Mediada</th>
                  <th rowspan="2" class="px-2 py-2 text-center bg-blue-50/50 text-[#002B49] align-bottom">Assíncrona</th>
                  <th rowspan="2" class="px-2.5 py-2 text-center align-bottom">Total</th>
                </tr>
                <tr>
                  <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Teórico</th>
                  <th class="px-1.5 py-1 text-center bg-blue-50/30 text-[#002B49]">Laboratório</th>
                  <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Clínica</th>
                </tr>`
                    : `<tr>
                  ${showCodeCol ? `<th class="px-3 py-3">Código</th>` : ''}
                  <th class="px-3 py-3 min-w-[200px]">Disciplina</th>
                  <th class="px-2.5 py-3">Tipo</th>
                  <th class="px-2.5 py-3">Avaliação</th>
                  <th class="px-2 py-3 text-center">Créditos</th>
                  <th class="px-2.5 py-3 text-center bg-blue-50/50 text-[#002B49]">Presencial</th>
                  <th class="px-2.5 py-3 text-center bg-blue-50/50 text-[#002B49]" style="line-height:1.15">Síncrona<br/>Mediada</th>
                  <th class="px-2.5 py-3 text-center bg-blue-50/50 text-[#002B49]">Assíncrona</th>
                  <th class="px-2.5 py-3 text-center">Total</th>
                </tr>`
                }
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${period.disciplines
                  .map((disc) => {
                    const chBd = getDisciplineChBreakdown(disc);
                    const syncMed = (chBd.syncMediated || 0) + (chBd.sync || 0);
                    return usePresentialSplit
                      ? `
                  <tr class="item-row hover:bg-blue-50/50 transition">
                    ${showCodeCol ? `<td class="px-3 py-3 font-mono text-[15px] font-semibold text-[#002B49]">${disc.code}</td>` : ''}
                    <td class="px-3 py-3 font-medium text-slate-900">${disc.name}</td>
                    <td class="px-2.5 py-3 text-[15px] text-slate-600">${disc.type}</td>
                    <td class="px-2.5 py-3 text-[15px] text-slate-500">${disc.evaluationForm || 'Nota'}</td>
                    <td class="px-2 py-3 text-[15px] text-center font-semibold">${disc.credits}</td>
                    <td class="px-1.5 py-3 text-[15px] text-center font-bold text-blue-950">${chBd.theoretical}h</td>
                    <td class="px-1.5 py-3 text-[15px] text-center font-bold text-teal-800">${chBd.laboratory}h</td>
                    <td class="px-1.5 py-3 text-[15px] text-center font-bold text-rose-800">${chBd.clinical}h</td>
                    <td class="px-2 py-3 text-[15px] text-center font-bold text-[#002B49]">${syncMed}h</td>
                    <td class="px-2 py-3 text-[15px] text-center font-bold text-[#002B49]">${chBd.async}h</td>
                    <td class="px-2.5 py-3 text-[15px] text-center font-black text-[#FF6B00]">${chBd.total}h</td>
                  </tr>
                `
                      : `
                  <tr class="item-row hover:bg-blue-50/50 transition">
                    ${showCodeCol ? `<td class="px-3 py-3 font-mono text-[15px] font-semibold text-[#002B49]">${disc.code}</td>` : ''}
                    <td class="px-3 py-3 font-medium text-slate-900">${disc.name}</td>
                    <td class="px-2.5 py-3 text-[15px] text-slate-600">${disc.type}</td>
                    <td class="px-2.5 py-3 text-[15px] text-slate-500">${disc.evaluationForm || 'Nota'}</td>
                    <td class="px-2 py-3 text-[15px] text-center font-semibold">${disc.credits}</td>
                    <td class="px-2.5 py-3 text-[15px] text-center font-bold text-blue-950">${chBd.presential}h</td>
                    <td class="px-2.5 py-3 text-[15px] text-center font-bold text-[#002B49]">${syncMed}h</td>
                    <td class="px-2.5 py-3 text-[15px] text-center font-bold text-[#002B49]">${chBd.async}h</td>
                    <td class="px-2.5 py-3 text-[15px] text-center font-black text-[#FF6B00]">${chBd.total}h</td>
                  </tr>
                `;
                  })
                  .join('')}
              </tbody>
              <tfoot class="bg-slate-50 border-t border-slate-200 text-[15px] font-bold">
                ${(() => {
                  const pPres = period.disciplines.reduce((acc, d) => acc + getDisciplineChBreakdown(d).presential, 0);
                  const pTheo = period.disciplines.reduce((acc, d) => acc + getDisciplineChBreakdown(d).theoretical, 0);
                  const pLab = period.disciplines.reduce((acc, d) => acc + getDisciplineChBreakdown(d).laboratory, 0);
                  const pClin = period.disciplines.reduce((acc, d) => acc + getDisciplineChBreakdown(d).clinical, 0);
                  const pSyncMed = period.disciplines.reduce((acc, d) => {
                    const bd = getDisciplineChBreakdown(d);
                    return acc + bd.syncMediated + (bd.sync || 0);
                  }, 0);
                  const pAsync = period.disciplines.reduce((acc, d) => acc + getDisciplineChBreakdown(d).async, 0);
                  const pTot = period.disciplines.reduce((acc, d) => acc + getDisciplineChBreakdown(d).total, 0);
                  return usePresentialSplit
                    ? `
                <tr>
                  <td colspan="${showCodeCol ? 4 : 3}" class="px-3 py-2.5 text-right text-slate-600">Subtotal do ${period.number}º Período</td>
                  <td class="px-2 py-2.5 text-center text-slate-900">${period.totalCredits}</td>
                  <td class="px-1.5 py-2.5 text-center text-blue-900">${pTheo}h</td>
                  <td class="px-1.5 py-2.5 text-center text-teal-800">${pLab}h</td>
                  <td class="px-1.5 py-2.5 text-center text-rose-800">${pClin}h</td>
                  <td class="px-2 py-2.5 text-center text-[#002B49]">${pSyncMed}h</td>
                  <td class="px-2 py-2.5 text-center text-[#002B49]">${pAsync}h</td>
                  <td class="px-2.5 py-2.5 text-center text-[#FF6B00]">${pTot || period.totalHours}h</td>
                </tr>`
                    : `
                <tr>
                  <td colspan="${showCodeCol ? 4 : 3}" class="px-3 py-2.5 text-right text-slate-600">Subtotal do ${period.number}º Período</td>
                  <td class="px-2 py-2.5 text-center text-slate-900">${period.totalCredits}</td>
                  <td class="px-2.5 py-2.5 text-center text-blue-900">${pPres}h</td>
                  <td class="px-2.5 py-2.5 text-center text-[#002B49]">${pSyncMed}h</td>
                  <td class="px-2.5 py-2.5 text-center text-[#002B49]">${pAsync}h</td>
                  <td class="px-2.5 py-2.5 text-center text-[#FF6B00]">${pTot || period.totalHours}h</td>
                </tr>`;
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      `
              )
              .join('')
          : structure.modules
          ? structure.modules
              .map(
                (mod) => `
        <div class="module-card bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div class="bg-[#002B49] px-6 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-white">
            <div class="flex items-center gap-2 justify-self-start">
              ${mod.branch ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[15px] font-semibold">${formatBranchLabel(mod.branch)}</span>` : ''}
            </div>
            <h3 class="font-bold text-[19px] text-white text-center">${formatModuleName(mod.number, mod.title, mod.branch)}</h3>
            <div class="flex items-center gap-3 justify-self-end">
              <span class="text-[17px] font-extrabold text-[#FF6B00] bg-white px-3 py-1 rounded shadow-sm">${mod.hours}h</span>
              ${
                !structure.hideMeetings
                  ? `<span class="text-[17px] font-extrabold text-[#002B49] bg-white px-3 py-1 rounded shadow-sm">${mod.meetings ?? 0} encontros</span>`
                  : ''
              }
              ${
                !structure.hideCompetenciesInReport && (mod.competencies || []).length > 0
                  ? `<button onclick="toggleDetails('mod-details-${mod.id}')" class="text-[15px] px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition no-print">
                Ver Saberes / CHA
              </button>`
                  : ''
              }
            </div>
          </div>

          ${(() => {
            if (structure.hideModuleCompetencesInReport) return '';
            const aspects = getGraduateProfileAspects(structure);
            const aspectIndex = new Map(aspects.map((a, i) => [a.id, i]));
            const comps = normalizeModuleCompetences(mod);
            if (comps.length === 0) return '';

            const cards = comps
              .map((c) => {
                const linked = (c.aspectIds || [])
                  .map((id) => {
                    const i = aspectIndex.get(id);
                    return i === undefined ? null : { asp: aspects[i], i };
                  })
                  .filter((x): x is { asp: (typeof aspects)[number]; i: number } => !!x);
                const body =
                  linked.length === 0
                    ? `<p class="text-[13px] text-slate-400 italic leading-snug">Sem perfil vinculado</p>`
                    : linked
                        .map(
                          ({ asp, i }) =>
                            `<p class="flex items-start gap-2 text-[13px] text-slate-700 leading-snug font-medium" style="overflow-wrap:anywhere"><span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#FF6B00] shrink-0" aria-hidden="true"></span><span>${
                              asp.title?.trim() || aspectShortLabel(asp, i)
                            }</span></p>`
                        )
                        .join('');
                return `<div class="bg-white p-3 rounded-lg border border-[#002B49]/12 shadow-sm flex flex-col gap-2 min-w-0">
                  <p class="text-[14px] font-bold text-[#002B49] leading-snug" style="overflow-wrap:anywhere">${c.text}</p>
                  <div class="border-t border-slate-100 pt-2 space-y-1.5">${body}</div>
                </div>`;
              })
              .join('');

            const colCount = Math.min(Math.max(comps.length, 1), 4);
            const gridClass =
              colCount === 1
                ? 'grid grid-cols-1 gap-3'
                : colCount === 2
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
                  : colCount === 3
                    ? 'grid grid-cols-1 sm:grid-cols-3 gap-3'
                    : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3';

            return `<div class="px-6 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-br from-orange-50/30 to-blue-50/20">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-orange-200/60 pb-2 mb-3">
                <span class="inline-flex items-center gap-1.5">
                  <svg class="w-4 h-4 text-[#FF6B00] shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16 20V4H8v16m8 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2m0 16H8m0 0H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg>
                  <span class="text-[15px] font-bold tracking-wide text-slate-800">Competências e Perfil do Egresso</span>
                </span>
              </div>
              <div class="${gridClass}">${cards}</div>
            </div>`;
          })()}

          <!-- Conhecimentos do Módulo -->
          <div class="p-6">
            ${
              !structure.hideKnowledgesInReport && getModularComponents(mod).length > 0
                ? (() => {
                    const discs = getModularComponents(mod);
                    const mPres = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).presential, 0);
                    const mTheo = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).theoretical, 0);
                    const mLab = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).laboratory, 0);
                    const mClin = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).clinical, 0);
                    const mSyncMed = discs.reduce((acc, d) => {
                      const bd = getDisciplineChBreakdown(d);
                      return acc + bd.syncMediated + (bd.sync || 0);
                    }, 0);
                    const mAsync = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).async, 0);
                    return `<h4 class="text-[15px] font-bold text-slate-500 mb-3 flex items-center gap-2">
              <svg class="w-4 h-4 text-[#002B49] shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path stroke-linecap="round" stroke-linejoin="round" d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
              Conhecimentos do Módulo
            </h4>
            <div class="overflow-x-auto mb-4">
              <table class="w-full text-left text-[17px] ${usePresentialSplit ? 'min-w-[820px]' : 'min-w-[700px]'} border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 border-b border-slate-200 text-[15px] font-semibold text-slate-600">
                  ${
                    usePresentialSplit
                      ? `<tr>
                    <th rowspan="2" class="px-3 py-2 align-bottom">Conhecimentos</th>
                    <th rowspan="2" class="px-2 py-2 text-center align-bottom">Tipo</th>
                    <th colspan="3" class="px-2 py-1 text-center bg-blue-50/50 text-[#002B49]">Presencial</th>
                    <th rowspan="2" class="px-2 py-2 text-center bg-blue-50/50 text-[#002B49] align-bottom" style="line-height:1.15">Síncrona<br/>Mediada</th>
                    <th rowspan="2" class="px-2 py-2 text-center bg-blue-50/50 text-[#002B49] align-bottom">Assíncrona</th>
                  </tr>
                  <tr>
                    <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Teórico</th>
                    <th class="px-1.5 py-1 text-center bg-blue-50/30 text-[#002B49]">Laboratório</th>
                    <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Clínica</th>
                  </tr>`
                      : `<tr>
                    <th class="px-3 py-2.5">Conhecimentos</th>
                    <th class="px-2 py-2.5 text-center">Tipo</th>
                    <th class="px-2.5 py-2.5 text-center bg-blue-50/50 text-[#002B49]">Presencial</th>
                    <th class="px-2.5 py-2.5 text-center bg-blue-50/50 text-[#002B49]" style="line-height:1.15">Síncrona<br/>Mediada</th>
                    <th class="px-2.5 py-2.5 text-center bg-blue-50/50 text-[#002B49]">Assíncrona</th>
                  </tr>`
                  }
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${discs
                    .map((d) => {
                      const chBd = getDisciplineChBreakdown(d);
                      const syncMed = (chBd.syncMediated || 0) + (chBd.sync || 0);
                      return usePresentialSplit
                        ? `<tr class="item-row">
                    <td class="px-3 py-2.5 font-medium text-slate-900">${d.name}</td>
                    <td class="px-2 py-2.5 text-[15px] text-center text-slate-600">${d.type}</td>
                    <td class="px-1.5 py-2.5 text-[15px] text-center font-bold text-blue-950">${chBd.theoretical}h</td>
                    <td class="px-1.5 py-2.5 text-[15px] text-center font-bold text-teal-800">${chBd.laboratory}h</td>
                    <td class="px-1.5 py-2.5 text-[15px] text-center font-bold text-rose-800">${chBd.clinical}h</td>
                    <td class="px-2 py-2.5 text-[15px] text-center font-bold text-[#002B49]">${syncMed}h</td>
                    <td class="px-2 py-2.5 text-[15px] text-center font-bold text-[#002B49]">${chBd.async}h</td>
                  </tr>`
                        : `<tr class="item-row">
                    <td class="px-3 py-2.5 font-medium text-slate-900">${d.name}</td>
                    <td class="px-2 py-2.5 text-[15px] text-center text-slate-600">${d.type}</td>
                    <td class="px-2.5 py-2.5 text-[15px] text-center font-bold text-blue-950">${chBd.presential}h</td>
                    <td class="px-2.5 py-2.5 text-[15px] text-center font-bold text-[#002B49]">${syncMed}h</td>
                    <td class="px-2.5 py-2.5 text-[15px] text-center font-bold text-[#002B49]">${chBd.async}h</td>
                  </tr>`;
                    })
                    .join('')}
                </tbody>
                <tfoot class="bg-slate-50 border-t border-slate-200 text-[15px] font-bold">
                  ${
                    usePresentialSplit
                      ? `<tr>
                    <td colspan="2" class="px-3 py-2.5 text-right text-slate-600">Subtotal dos Conhecimentos</td>
                    <td class="px-1.5 py-2.5 text-center text-blue-900">${mTheo}h</td>
                    <td class="px-1.5 py-2.5 text-center text-teal-800">${mLab}h</td>
                    <td class="px-1.5 py-2.5 text-center text-rose-800">${mClin}h</td>
                    <td class="px-2 py-2.5 text-center text-[#002B49]">${mSyncMed}h</td>
                    <td class="px-2 py-2.5 text-center text-[#002B49]">${mAsync}h</td>
                  </tr>`
                      : `<tr>
                    <td colspan="2" class="px-3 py-2.5 text-right text-slate-600">Subtotal dos Conhecimentos</td>
                    <td class="px-2.5 py-2.5 text-center text-blue-900">${mPres}h</td>
                    <td class="px-2.5 py-2.5 text-center text-[#002B49]">${mSyncMed}h</td>
                    <td class="px-2.5 py-2.5 text-center text-[#002B49]">${mAsync}h</td>
                  </tr>`
                  }
                </tfoot>
              </table>
            </div>`;
                  })()
                : ''
            }

            ${
              !structure.hideCompetenciesInReport && (mod.competencies || []).length > 0
                ? `<!-- Saberes -->
            <div id="mod-details-${mod.id}" class="cha-panel mt-4 p-4 rounded-lg bg-orange-50/60 border border-orange-200 space-y-3">
              <div class="flex items-center justify-between border-b border-orange-200/60 pb-2">
                <span class="text-[15px] font-bold tracking-wide text-orange-900 flex items-center gap-1.5">
                  <svg class="w-4 h-4 text-[#FF6B00]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.937 15.5A2 2 0 008.5 14.063l-6.135-1.582a.5.5 0 01.037-.956l6.135-1.582a2 2 0 001.437-1.437L11.437 2.37a.5.5 0 01.956-.037l1.582 6.135a2 2 0 001.437 1.437l6.135 1.582a.5.5 0 01.037.956l-6.135 1.582a2 2 0 00-1.437 1.437l-1.582 6.135a.5.5 0 01-.956.037L9.937 15.5z"/></svg>
                  Saberes
                </span>
                <span class="text-[14px] text-orange-700 font-medium">Navegação Integrada</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${(mod.competencies || [])
                  .map(
                    (c) => `
                  <div class="bg-white p-3 rounded-lg border border-orange-100 shadow-xs">
                    <div class="mb-1">
                      <span class="text-[12px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        matchesSaberesColumn(c.category, 'c')
                          ? 'bg-blue-100 text-blue-800'
                          : matchesSaberesColumn(c.category, 'h')
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }">${labelForCategory(c.category, settings?.pedagogicalNomenclature)}</span>
                    </div>
                    <p class="text-[15px] text-slate-700 leading-relaxed">${c.name}</p>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>`
                : ''
            }
          </div>
        </div>
      `
              )
              .join('')
          : ''
      }
    </div>

    ${renderWorkloadSummaryHtml(structure)}

    ${(() => {
      if (!includeNotes) return '';
      const notesHtml = renderReportNotesPageHtml(structure, settings, { logoDataUrl });
      return notesHtml
        ? `<div class="report-notes-page mt-8 rounded-xl overflow-hidden border border-slate-200 bg-white">${notesHtml}</div>`
        : '';
    })()}
  </main>

  <footer class="bg-white border-t border-slate-200 mt-12 py-6 text-center text-[15px] text-slate-500">
    <p>UNISUAM - Centro Universitário Augusto Motta • Sistema de Gestão de Estruturas Curriculares</p>
  </footer>

  <script>
    function toggleDetails(id) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('hidden');
      }
    }

    let allExpanded = true;
    function toggleAllAccordions() {
      allExpanded = !allExpanded;
      document.querySelectorAll('.cha-panel').forEach(panel => {
        if (allExpanded) {
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      });
      document.getElementById('toggleAllBtn').innerText = allExpanded ? 'Recolher Detalhes' : 'Expandir Detalhes';
    }

    function filterContent() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      const rows = document.querySelectorAll('.item-row, .module-card');
      rows.forEach(r => {
        const text = r.innerText.toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    }

    document.querySelectorAll('[data-period-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('[data-period-card]');
        if (!card) return;
        var body = card.querySelector('[data-period-body]');
        if (!body) return;
        var expanded = btn.getAttribute('aria-expanded') !== 'false';
        if (expanded) {
          body.style.display = 'none';
          btn.setAttribute('aria-expanded', 'false');
        } else {
          body.style.display = '';
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  </script>
</body>
</html>`;
}

export async function exportToInteractiveHTML(
  structure: CurriculumStructure,
  settings?: AppSettings,
  options: DocumentPageExportOptions = {}
): Promise<void> {
  const htmlContent = await generateInteractiveHtml(structure, settings, options);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${structure.code}_${structure.courseName.replace(/\s+/g, '_')}_Navegavel.html`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Gera um HTML autônomo com o Mapa Curricular renderizado na tela
 * (inclui pan por arrastar, Tailwind via CDN e, em estruturas modulares,
 * o seletor Mapa da Trilha Formativa / Mapa de Competências — ou só um mapa).
 */
export type MapHtmlExportMode = 'both' | 'current';

export async function exportMapToHTML(
  elementId: string,
  structure: CurriculumStructure,
  filename?: string,
  settings?: AppSettings,
  options?: { mode?: MapHtmlExportMode; activeMap?: string }
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Elemento do mapa não encontrado para exportação HTML');
  }

  const mode: MapHtmlExportMode = options?.mode === 'current' ? 'current' : 'both';
  const preferredActive =
    options?.activeMap ||
    element.getAttribute('data-active-map') ||
    '';

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-export').forEach((n) => n.remove());
  // Protótipos / mapas de teste nunca entram no HTML do relatório.
  clone.querySelectorAll('[data-map-export="exclude"]').forEach((n) => n.remove());

  // Expande containers com scroll para o mapa aparecer completo
  clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const style = el.getAttribute('style') || '';
    const cls = el.className?.toString?.() || '';
    if (
      cls.includes('overflow') ||
      cls.includes('max-h-') ||
      style.includes('overflow') ||
      style.includes('max-height')
    ) {
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
      el.style.height = 'auto';
    }
    el.classList.remove('cursor-grab', 'cursor-grabbing');
  });

  let mapPanels = Array.from(
    clone.querySelectorAll<HTMLElement>('[data-map-view]')
  );
  const initialMap =
    preferredActive ||
    mapPanels[0]?.getAttribute('data-map-view') ||
    'pedagogical';

  // Só um mapa: remove o outro painel do HTML
  if (mode === 'current' && mapPanels.length > 1) {
    mapPanels.forEach((panel) => {
      const key = panel.getAttribute('data-map-view') || '';
      if (key !== initialMap) panel.remove();
    });
    mapPanels = Array.from(clone.querySelectorAll<HTMLElement>('[data-map-view]'));
  }

  const hasMapSwitcher = mode === 'both' && mapPanels.length > 1;

  mapPanels.forEach((panel) => {
    const key = panel.getAttribute('data-map-view') || '';
    panel.style.display = key === initialMap || mapPanels.length === 1 ? 'block' : 'none';
  });

  // Embute imagens (logo etc.) como data URL — HTML baixado não tem acesso aos assets do Vite
  await inlineImagesAsDataUrls(clone, element);

  const safeName = (structure.courseName || 'Curso').replace(/\s+/g, '_');
  const singleTitle =
    mapPanels[0]?.getAttribute('data-map-title') ||
    (initialMap === 'competences' ? 'Mapa de Competências' : 'Mapa da Trilha Formativa');
  const title = hasMapSwitcher
    ? `Mapa Curricular — ${structure.code} · ${structure.courseName}`
    : `${singleTitle} — ${structure.code} · ${structure.courseName}`;
  // Mapas NÃO incluem Resumo do PPC nem observações — isso fica só na impressão da estrutura.

  const switcherHtml = hasMapSwitcher
    ? `<div class="map-switcher" role="tablist" aria-label="Tipo de mapa">
      ${mapPanels
        .map((panel) => {
          const key = panel.getAttribute('data-map-view') || '';
          const label =
            panel.getAttribute('data-map-title') ||
            (key === 'competences' ? 'Mapa de Competências' : 'Mapa da Trilha Formativa');
          const active = key === initialMap;
          const activeClass =
            key === 'competences' ? 'is-active-orange' : 'is-active-blue';
          return `<button type="button" class="map-switch-btn${
            active ? ` ${activeClass}` : ''
          }" data-map-switch="${key}" role="tab" aria-selected="${active ? 'true' : 'false'}">${label}</button>`;
        })
        .join('')}
    </div>`
    : '';

  const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --unisuam-blue: #002B49;
      --unisuam-orange: #FF6B00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(165deg, #f7f9fc 0%, #eef3f9 45%, #fff7f0 100%);
      color: #0f172a;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }
    header .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }
    header .code {
      background: var(--unisuam-blue);
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 10px;
    }
    header h1 {
      margin: 0;
      font-size: 19px;
      font-weight: 800;
      color: var(--unisuam-blue);
    }
    header .hint {
      font-size: 14px;
      color: #94a3b8;
    }
    header .header-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .map-switcher {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
    }
    .map-switch-btn {
      border: 0;
      background: transparent;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .map-switch-btn:hover { background: #fff; }
    .map-switch-btn.is-active-blue {
      background: var(--unisuam-blue);
      color: #fff;
      box-shadow: 0 1px 2px rgba(0,43,73,0.2);
    }
    .map-switch-btn.is-active-orange {
      background: var(--unisuam-orange);
      color: #fff;
      box-shadow: 0 1px 2px rgba(255,107,0,0.25);
    }
    #map-viewport {
      overflow: auto;
      height: calc(100dvh - 72px);
      max-height: calc(100vh - 72px);
      cursor: grab;
      padding: 12px;
      touch-action: pan-x pan-y;
      user-select: none;
      -webkit-overflow-scrolling: touch;
    }
    #map-viewport.dragging { cursor: grabbing; }
    #map-stage {
      display: inline-block;
      min-width: 100%;
      padding-bottom: 24px;
      transform-origin: top left;
    }
    [data-map-canvas] {
      width: max-content !important;
      min-width: 100%;
      max-width: none !important;
    }
    [data-map-view] {
      max-width: none !important;
      overflow: visible !important;
    }
    .report-notes-page {
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      padding: 20px 12px 40px;
    }
    .report-notes-inner {
      max-width: 1100px;
      margin: 0 auto;
    }
    @media print {
      #map-viewport { height: auto; max-height: none; overflow: visible; }
      .report-notes-page { page-break-before: always; break-before: page; background: #fff; border: 0; }
      .map-switcher { display: none !important; }
    }
    @media (max-width: 768px) {
      header {
        padding: 10px 12px;
        gap: 6px;
      }
      header h1 {
        font-size: 16px;
        line-height: 1.25;
        max-width: 100%;
      }
      header .code {
        font-size: 12px;
        padding: 3px 8px;
      }
      header .hint {
        width: 100%;
        font-size: 12px;
      }
      .map-switch-btn {
        font-size: 11px;
        padding: 6px 10px;
      }
      #map-viewport {
        height: calc(100dvh - 110px);
        padding: 8px;
      }
      #map-stage {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="code">${structure.code}</span>
      <h1 id="map-page-title">Mapa Curricular — ${structure.courseName}</h1>
    </div>
    <div class="header-actions">
      ${switcherHtml}
      <span class="hint">${
        hasMapSwitcher
          ? 'Escolha o mapa · Arraste para navegar · UNISUAM'
          : 'Arraste para navegar · UNISUAM'
      }</span>
    </div>
  </header>
  <div id="map-viewport">
    <div id="map-stage">
      ${clone.outerHTML}
    </div>
  </div>
  <script>
    (function () {
      var vp = document.getElementById('map-viewport');
      var titleEl = document.getElementById('map-page-title');
      var courseName = ${JSON.stringify(structure.courseName || '')};
      var panels = Array.prototype.slice.call(document.querySelectorAll('[data-map-view]'));
      var switchBtns = Array.prototype.slice.call(document.querySelectorAll('[data-map-switch]'));

      function setMapMode(mode) {
        panels.forEach(function (panel) {
          var key = panel.getAttribute('data-map-view') || '';
          panel.style.display = key === mode ? 'block' : 'none';
        });
        switchBtns.forEach(function (btn) {
          var key = btn.getAttribute('data-map-switch') || '';
          var active = key === mode;
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
          btn.classList.remove('is-active-blue', 'is-active-orange');
          if (active) {
            btn.classList.add(key === 'competences' ? 'is-active-orange' : 'is-active-blue');
          }
        });
        if (titleEl) {
          var label = mode === 'competences' ? 'Mapa de Competências' : 'Mapa da Trilha Formativa';
          if (panels.length <= 1) label = 'Mapa Curricular';
          titleEl.textContent = label + ' — ' + courseName;
        }
        if (vp) {
          vp.scrollLeft = 0;
          vp.scrollTop = 0;
        }
      }

      switchBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          setMapMode(btn.getAttribute('data-map-switch') || 'pedagogical');
        });
      });

      if (panels.length > 1) {
        var initial = ${JSON.stringify(initialMap)};
        setMapMode(initial);
      }

      // Soft hide: preserva layout (sem display:none) para não saltar o pan
      function softHide(el, hide) {
        if (!el) return;
        el.style.transition = 'opacity 0.3s ease, filter 0.3s ease, transform 0.3s ease';
        if (hide) {
          el.style.opacity = '0';
          el.style.filter = 'blur(1px)';
          el.style.transform = 'scale(0.985)';
          el.style.pointerEvents = 'none';
          el.setAttribute('aria-hidden', 'true');
          el.classList.add('is-map-collapsed');
        } else {
          el.style.opacity = '';
          el.style.filter = '';
          el.style.transform = '';
          el.style.pointerEvents = '';
          el.setAttribute('aria-hidden', 'false');
          el.classList.remove('is-map-collapsed');
        }
      }

      // Legenda Trilha Formativa: oculta/mostra camadas
      document.querySelectorAll('[data-map-legend="trilha"] [data-map-toggle]').forEach(function (btn) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var layer = btn.getAttribute('data-map-toggle');
          if (!layer || layer === 'modulos') return;
          var panel = btn.closest('[data-map-view]') || document;
          var nodes = panel.querySelectorAll('[data-map-layer="' + layer + '"]');
          if (!nodes.length) return;
          var hide = !nodes[0].classList.contains('is-map-collapsed') && nodes[0].style.opacity !== '0';
          nodes.forEach(function (n) { softHide(n, hide); });
          btn.setAttribute('aria-pressed', hide ? 'false' : 'true');
          btn.style.opacity = hide ? '0.4' : '1';
        });
      });

      // Trilha: topo do módulo = conhecimentos; base = saberes
      document.querySelectorAll(
        '[data-map-toggle="trilha-module-conhecimentos"], [data-map-toggle="trilha-module-saberes"]'
      ).forEach(function (btn) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var mid = btn.getAttribute('data-module-id');
          var toggle = btn.getAttribute('data-map-toggle') || '';
          var layer = toggle.indexOf('saberes') >= 0 ? 'saberes' : 'conhecimentos';
          if (!mid) return;
          var panel = btn.closest('[data-map-view]') || document;
          var nodes = panel.querySelectorAll(
            '[data-map-module="' + mid + '"][data-map-layer="' + layer + '"]'
          );
          if (!nodes.length) return;
          var hide = !nodes[0].classList.contains('is-map-collapsed') && nodes[0].style.opacity !== '0';
          nodes.forEach(function (n) { softHide(n, hide); });
          btn.setAttribute('aria-pressed', hide ? 'false' : 'true');
        });
      });

      // Compat: clique antigo no módulo inteiro (se ainda existir no DOM)
      document.querySelectorAll('[data-map-toggle="trilha-module"]').forEach(function (btn) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var mid = btn.getAttribute('data-module-id');
          if (!mid) return;
          var panel = btn.closest('[data-map-view]') || document;
          var nodes = panel.querySelectorAll('[data-map-module="' + mid + '"]');
          if (!nodes.length) return;
          var hide = !nodes[0].classList.contains('is-map-collapsed') && nodes[0].style.opacity !== '0';
          nodes.forEach(function (n) { softHide(n, hide); });
          btn.setAttribute('aria-expanded', hide ? 'false' : 'true');
        });
      });

      // Mapa de Competências: módulo oculta tudo; competência oculta perfis
      document.querySelectorAll('[data-map-toggle="module"]').forEach(function (btn) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var root = btn.closest('[data-map-branch]') || btn.parentElement;
          if (!root) return;
          var body = root.querySelector('[data-map-collapse="module-body"]');
          if (!body) return;
          var hide = !body.classList.contains('is-map-collapsed') && body.style.opacity !== '0';
          softHide(body, hide);
          btn.setAttribute('aria-expanded', hide ? 'false' : 'true');
        });
      });
      document.querySelectorAll('[data-map-toggle="competence"]').forEach(function (btn) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var root = btn.closest('[data-map-branch]') || btn.parentElement;
          if (!root) return;
          var body = root.querySelector('[data-map-collapse="profiles"]');
          if (!body) return;
          var hide = !body.classList.contains('is-map-collapsed') && body.style.opacity !== '0';
          softHide(body, hide);
          btn.setAttribute('aria-expanded', hide ? 'false' : 'true');
        });
      });

      if (!vp) return;
      var dragging = false;
      var ox = 0, oy = 0, sl = 0, st = 0;
      vp.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        var t = e.target;
        if (t && t.closest && t.closest('button, a, input, label, select, textarea, [data-period-toggle], [data-map-toggle]')) return;
        if (e.pointerType === 'touch') return;
        dragging = true;
        vp.classList.add('dragging');
        ox = e.clientX; oy = e.clientY;
        sl = vp.scrollLeft; st = vp.scrollTop;
        try { vp.setPointerCapture(e.pointerId); } catch (_) {}
      });
      vp.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        vp.scrollLeft = sl - (e.clientX - ox);
        vp.scrollTop = st - (e.clientY - oy);
      });
      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        vp.classList.remove('dragging');
        try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
      }
      vp.addEventListener('pointerup', endDrag);
      vp.addEventListener('pointercancel', endDrag);

      document.querySelectorAll('[data-period-toggle]').forEach(function (btn) {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var card = btn.closest('[data-period-card]');
          if (!card) return;
          var body = card.querySelector('[data-period-body]');
          if (!body) return;
          var expanded = btn.getAttribute('aria-expanded') !== 'false';
          if (expanded) {
            body.style.display = 'none';
            btn.setAttribute('aria-expanded', 'false');
          } else {
            body.style.display = '';
            btn.setAttribute('aria-expanded', 'true');
          }
        });
      });
    })();
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const mapSlug =
    mode === 'current'
      ? initialMap === 'competences'
        ? 'Mapa_Competencias'
        : 'Mapa_Trilha_Formativa'
      : 'Mapa_Curricular';
  link.download = filename || `${structure.code}_${safeName}_${mapSlug}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSampleTemplate(type: 'disciplinar' | 'modular'): void {
  const wb = XLSX.utils.book_new();

  if (type === 'disciplinar') {
    const headers = [
      ['MODELO DE IMPORTAÇÃO / PREENCHIMENTO - ESTRUTURA DISCIPLINAR (UNISUAM)'],
      ['Preencha as linhas abaixo com as disciplinas do curso por período letivo'],
      [],
      ['Período', 'Código', 'Nome da Disciplina', 'Tipo (Obrigatória/Eletiva/Optativa)', 'Forma de Avaliação', 'Créditos', 'Carga Horária (horas)', 'Modalidade (Presencial/Síncrono/Síncrono-Mediado/Assíncrono)'],
      [1, 'EXTN0001 (B)', 'Extensão 1', 'Obrigatória', 'Resultado Final', 2, 40, 'Síncrono-Mediado'],
      [1, 'TCSA0021 (B)', 'Contabilidade Básica', 'Obrigatória', 'Nota', 4, 80, 'Assíncrono'],
      [1, 'TCSA0053 (A)', 'Gestão Contemporânea', 'Obrigatória', 'Nota', 4, 80, 'Assíncrono'],
      [2, 'EDAM0002 (B)', 'Extensão 2', 'Obrigatória', 'Resultado Final', 3, 60, 'Síncrono-Mediado'],
      [2, 'TCSA0023 (B)', 'Contabilidade Geral', 'Obrigatória', 'Nota', 4, 80, 'Assíncrono'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Disciplinar');
    XLSX.writeFile(wb, 'Template_Estrutura_Disciplinar_UNISUAM.xlsx');
  } else {
    const headers = [
      ['MODELO DE IMPORTAÇÃO / PREENCHIMENTO - ESTRUTURA MODULAR (UNISUAM)'],
      ['Preencha os módulos, trilhas (tronco ou ramificação A/B) e os conhecimentos, habilidades e atitudes'],
      [],
      ['Módulo', 'Trilha / Ramificação', 'Código Módulo/Disciplina', 'Título / Nome do Componente', 'Carga Horária (h)', 'Conhecimentos', 'Habilidades', 'Atitudes'],
      ['I', '', 'MOD-01', 'Empreendedorismo e Sustentabilidade', 325, 'Modelagem de Negócios', 'Diagnósticos ESG', 'Postura Ética'],
      ['II', '', 'MOD-02', 'Ambiente Corporativo e Comunicação', 325, 'Teorias da Administração', 'Técnicas de Negociação', 'Empatia e Liderança'],
      ['IX', 'A', 'MOD-09A', 'Ênfase Clínica I: Práticas Terapêuticas', 450, 'Psicofarmacologia', 'Supervisão Clínica', 'Postura Bioética'],
      ['IX', 'B', 'MOD-09B', 'Ênfase Gestão I: Consultoria Organizacional', 450, 'Intervenção Psicossocial', 'Diagnóstico Organizacional', 'Inclusão Social'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Modular');
    XLSX.writeFile(wb, 'Template_Estrutura_Modular_UNISUAM.xlsx');
  }
}

const COURSE_BATCH_INSTRUCTIONS = [
  'MODELO DE CARGA EM LOTE — DADOS DOS CURSOS (UNISUAM)',
  'Uma linha por curso. Colunas Nome DCN e Link DCN: use a mesma ordem quando houver várias (separe com | ou quebra de linha). Ex.: Nome DCN = "DCN Bacharelado | DCN Licenciatura" e Link DCN = url1 | url2.',
];

const COURSE_BATCH_EXAMPLE_ROWS: (string | number)[][] = [
  [
    'Administração',
    'Bacharelado',
    'Presencial',
    3000,
    'Obrigatório',
    300,
    300,
    'Obrigatório',
    100,
    'Obrigatório',
    'Maria Silva',
    'maria.silva@unisuam.edu.br',
    'Portaria SERES/MEC nº 123/2022',
    'DCN Administração Bacharelado | DCN Administração complementar',
    'https://drive.google.com/file/d/EXEMPLO1/view, https://drive.google.com/file/d/EXEMPLO2/view',
  ],
  [
    'Pedagogia',
    'Licenciatura',
    'EAD',
    3200,
    'Opcional',
    'Não Informado',
    320,
    'Opcional',
    'Não Informado',
    'Não Informado',
    'João Souza',
    'joao.souza@unisuam.edu.br',
    'Portaria SERES/MEC nº 456/2021',
    'DCN Pedagogia',
    'https://drive.google.com/file/d/EXEMPLO3/view',
  ],
];

/**
 * Exporta planilha Excel (.xlsx) da carga em lote.
 * Se houver cursos, inclui os dados atuais; senão, gera modelo com exemplos.
 */
export function exportCourseBatchTemplate(courses?: Course[]): void {
  const header = [...COURSE_BATCH_HEADERS];
  const dataRows =
    courses && courses.length > 0
      ? courses.map((c) => courseToBatchRow(c))
      : COURSE_BATCH_EXAMPLE_ROWS;

  const aoa: (string | number)[][] = [
    [COURSE_BATCH_INSTRUCTIONS[0]],
    [COURSE_BATCH_INSTRUCTIONS[1]],
    [],
    header,
    ...dataRows,
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((h) => ({ wch: Math.min(42, Math.max(14, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Cursos');

  const hasData = Boolean(courses && courses.length > 0);
  const fileName = hasData
    ? 'Carga_Lote_Cursos_UNISUAM.xlsx'
    : 'Template_Carga_Lote_Cursos_UNISUAM.xlsx';

  // .xlsx evita os erros de encoding/separador típicos do CSV no Excel BR
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
}

/** Lê matriz de linhas a partir de um arquivo Excel (.xlsx / .xls) ou CSV. */
export async function readCourseBatchFile(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith('.csv') || name.endsWith('.txt');

  const wb = XLSX.read(buffer, {
    type: 'array',
    codepage: isCsv ? 65001 : undefined,
    raw: false,
    cellHTML: false,
    cellFormula: true,
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];

  // Lê célula a célula para capturar hiperlinks do Excel (Google Drive costuma vir assim)
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const matrix: string[][] = [];

  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: string[] = [];
    let hasContent = false;
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr] as XLSX.CellObject | undefined;
      if (!cell) {
        row.push('');
        continue;
      }

      const chunks: string[] = [];
      const display =
        cell.w != null && String(cell.w).trim()
          ? String(cell.w)
          : cell.v != null
            ? String(cell.v)
            : '';
      if (display.trim()) chunks.push(display.trim());

      const hyperlinkTarget =
        (cell.l && typeof cell.l === 'object' && 'Target' in cell.l
          ? String((cell.l as { Target?: string }).Target || '')
          : '') || '';
      if (hyperlinkTarget.trim()) {
        const target = hyperlinkTarget.trim();
        if (!chunks.some((c) => c.includes(target))) chunks.push(target);
      }

      // Fórmula HYPERLINK("url"; "texto")
      if (typeof cell.f === 'string' && /HYPERLINK/i.test(cell.f)) {
        const m = cell.f.match(/HYPERLINK\s*\(\s*"([^"]+)"/i) ||
          cell.f.match(/HYPERLINK\s*\(\s*'([^']+)'/i);
        if (m?.[1] && !chunks.some((c) => c.includes(m[1]))) chunks.push(m[1]);
      }

      const merged = chunks.join('\n');
      if (merged.trim()) hasContent = true;
      row.push(merged);
    }
    if (hasContent) matrix.push(row);
  }

  return normalizeCourseBatchMatrix(matrix);
}
