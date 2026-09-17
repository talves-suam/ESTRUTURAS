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
  structureHasPresentialSplit,
} from '../types/curriculum';
import {
  buildWorkloadSummary,
  formatWorkloadHours,
  formatWorkloadPercent,
  WorkloadSummaryRow,
} from './workloadSummary';
import { getSaberesLabels, labelForCategory } from '../utils/nomenclature';
import { getReportNotes, renderReportNotesPageHtml } from './reportNotes';
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

/** Logo UNISUAM embutida (para HTML autônomo). */
export async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  // Tenta pegar a logo já renderizada na página (mesma origem)
  const live = document.querySelector<HTMLImageElement>(
    'img[alt="UNISUAM"], img[src*="logo-unisuam"]'
  );
  if (live && live.complete && live.naturalWidth > 0) {
    try {
      cachedLogoDataUrl = htmlImageToDataUrl(live);
      return cachedLogoDataUrl;
    } catch {
      /* fallback fetch */
    }
  }
  cachedLogoDataUrl = await fetchUrlAsDataUrl(logoUnisuamUrl);
  return cachedLogoDataUrl;
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
  return `
    <section class="bg-white rounded-xl shadow-sm border border-[#002B49]/12 overflow-hidden">
      <div class="bg-[#002B49] px-3 py-2 text-center">
        <h3 class="text-[11px] font-black tracking-wide text-white uppercase">Carga Horária</h3>
        <p class="text-[9px] text-blue-200/90 mt-0.5">Hora-relógio · ${structure.courseName}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px] border-collapse">
          <thead>
            <tr class="bg-[#002B49]/5 border-b border-[#002B49]/10">
              <th class="px-2.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-[#002B49] whitespace-nowrap">Componentes</th>
              ${componentRows
                .map(
                  (row) =>
                    `<th class="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#002B49] leading-tight">${
                      row.shortLabel || row.label
                    }</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            <tr class="border-b border-slate-100">
              <th class="px-2.5 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap">Hora-relógio</th>
              ${componentRows
                .map(
                  (row) =>
                    `<td class="px-2 py-1.5 text-center tabular-nums font-bold text-slate-800 whitespace-nowrap">${formatWorkloadHours(
                      row.hours
                    )}</td>`
                )
                .join('')}
            </tr>
            <tr>
              <th class="px-2.5 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap">Percentual</th>
              ${componentRows
                .map(
                  (row) =>
                    `<td class="px-2 py-1.5 text-center tabular-nums text-slate-600 whitespace-nowrap">${formatWorkloadPercent(
                      row.percent
                    )}</td>`
                )
                .join('')}
            </tr>
          </tbody>
          ${
            totalRow
              ? `<tfoot>
            <tr class="bg-[#FF6B00]/8 border-t border-[#002B49]/10 font-bold text-[#002B49]">
              <th class="px-2.5 py-1.5 text-left uppercase tracking-wider">Total</th>
              <td colspan="${componentRows.length}" class="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                ${formatWorkloadHours(totalRow.hours)} horas
                <span class="text-[#FF6B00] ml-1.5">(${formatWorkloadPercent(totalRow.percent)})</span>
              </td>
            </tr>
          </tfoot>`
              : ''
          }
        </table>
      </div>
    </section>`;
}

async function captureElementAsPngDataUrl(
  elementId: string
): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Elemento de visualização não encontrado para captura');
  }

  const actionButtons = element.querySelectorAll<HTMLElement>('.no-export');
  actionButtons.forEach((btn) => (btn.style.display = 'none'));

  const prevWidth = element.style.width;
  const prevMinWidth = element.style.minWidth;
  const prevMaxWidth = element.style.maxWidth;
  const prevOverflow = element.style.overflow;

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

  let maxRequiredWidth = Math.max(1200, element.scrollWidth + 80);
  const tables = element.querySelectorAll<HTMLElement>('table');
  tables.forEach((t) => {
    if (t.scrollWidth + 60 > maxRequiredWidth) {
      maxRequiredWidth = t.scrollWidth + 60;
    }
  });
  const mapStage = element.querySelector<HTMLElement>('.inline-block, .inline-grid');
  if (mapStage && mapStage.scrollWidth + 80 > maxRequiredWidth) {
    maxRequiredWidth = mapStage.scrollWidth + 80;
  }

  element.style.width = `${maxRequiredWidth}px`;
  element.style.minWidth = `${maxRequiredWidth}px`;
  element.style.maxWidth = 'none';
  element.style.overflow = 'visible';

  try {
    let dataUrl = '';
    let widthPx = maxRequiredWidth;
    let heightPx = element.scrollHeight;

    try {
      dataUrl = await toPng(element, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        width: maxRequiredWidth,
        filter: (node) => {
          if (node instanceof HTMLElement && node.classList?.contains('no-export')) {
            return false;
          }
          return true;
        },
      });
      widthPx = maxRequiredWidth * 2;
      heightPx = Math.max(element.scrollHeight, 1) * 2;
    } catch (primaryErr) {
      console.warn('html-to-image falhou, tentando fallback com html2canvas:', primaryErr);
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: maxRequiredWidth + 100,
      });
      dataUrl = canvas.toDataURL('image/png');
      widthPx = canvas.width;
      heightPx = canvas.height;
    }

    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      throw new Error('Falha ao gerar os dados da imagem');
    }

    // Lê dimensões reais da imagem gerada
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      widthPx = img.naturalWidth || widthPx;
      heightPx = img.naturalHeight || heightPx;
    } catch {
      /* mantém estimativa */
    }

    return { dataUrl, widthPx, heightPx };
  } finally {
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
    actionButtons.forEach((btn) => (btn.style.display = ''));
  }
}

/** Opções de exportação por captura de tela (2ª página de observações). */
export interface ElementExportOptions {
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

/**
 * Renderiza a página de observações fora da tela e a captura como imagem,
 * na mesma largura da 1ª página para o relatório ficar homogêneo.
 */
async function captureReportNotesPage(
  options: ElementExportOptions,
  widthPx: number
): Promise<{ dataUrl: string; widthPx: number; heightPx: number } | null> {
  const { structure, settings } = options;
  if (!structure) return null;

  const logoDataUrl = await getLogoDataUrl().catch(() => '');
  const html = renderReportNotesPageHtml(structure, settings, {
    widthPx: Math.round(widthPx),
    logoDataUrl,
  });
  if (!html) return null;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${Math.round(widthPx)}px`;
  host.style.background = '#ffffff';
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map((img) =>
        img.decode ? img.decode().catch(() => undefined) : Promise.resolve()
      )
    );

    const dataUrl = await toPng(host, {
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      width: Math.round(widthPx),
    });

    let outWidth = Math.round(widthPx) * 2;
    let outHeight = Math.max(host.scrollHeight, 1) * 2;
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
    console.warn('Não foi possível gerar a página de observações:', err);
    return null;
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportToPNG(
  elementId: string,
  filename: string,
  options: ElementExportOptions = {}
): Promise<string> {
  const { dataUrl, widthPx } = await captureElementAsPngDataUrl(elementId);
  triggerDownload(dataUrl, `${filename}.png`);

  const notes = await captureReportNotesPage(options, widthPx / 2);
  if (notes) {
    triggerDownload(notes.dataUrl, `${filename}_Observacoes.png`);
  }

  return dataUrl;
}

/** PDF da visualização atual (mapa ou tabela capturada da tela). */
export async function exportElementToPDF(
  elementId: string,
  filename: string,
  options: ElementExportOptions = {}
): Promise<void> {
  const { dataUrl, widthPx, heightPx } = await captureElementAsPngDataUrl(elementId);

  // Converte px → pt (~0.75) para página sob medida
  const scale = 0.72;
  const pageW = Math.max(200, widthPx * scale);
  const pageH = Math.max(200, heightPx * scale);
  const orientation = pageW >= pageH ? 'landscape' : 'portrait';

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [pageW, pageH],
    compress: true,
  });

  pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');

  // 2ª página: observações da ementa com o mesmo cabeçalho e largura da 1ª
  const notes = await captureReportNotesPage(options, widthPx / 2);
  if (notes) {
    const notesH = Math.max(200, (notes.heightPx / notes.widthPx) * pageW);
    pdf.addPage([pageW, notesH], pageW >= notesH ? 'landscape' : 'portrait');
    pdf.addImage(notes.dataUrl, 'PNG', 0, 0, pageW, notesH, undefined, 'FAST');
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

export function exportToPDF(structure: CurriculumStructure, settings?: AppSettings): void {
  // Use landscape A4 (297 x 210 mm) for academic matrixes with granular CH columns
  const doc = new jsPDF('l', 'mm', 'a4');
  const usePresentialSplit = structureHasPresentialSplit(structure);
  const saberes = getSaberesLabels(settings?.pedagogicalNomenclature);
  const chaTitle =
    settings?.pedagogicalNomenclature === 'zabala' ? saberes.full : saberes.sectionTitle;

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
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('UNISUAM - Centro Universitário Augusto Motta', margin + 4, y + 6);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('ESTRUTURA CURRICULAR OFICIAL - MATRIZ PEDAGÓGICA E REGULATÓRIA', margin + 4, y + 11);

  y += 20;

  // Box Informações Básicas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y, contentWidth, 22);

  doc.text(`Curso e Modalidade: ${structure.courseName} (${structure.modality})`, margin + 3, y + 5);
  doc.text(
    `Ato Autorizativo: ${structure.authorizationAct || structure.recognitionPortaria || '-'}`,
    margin + 3,
    y + 10
  );
  doc.text(`Tipo de Estrutura: ${structure.structureType.toUpperCase()}`, margin + 3, y + 15);
  
  doc.text(`Estrutura: ${structure.code} (${structure.status})`, margin + 110, y + 5);
  if (!structure.hideValidity && structure.validityStart) {
    doc.text(`Início de Vigência: ${structure.validityStart} (Semestre: ${structure.activeYearSemester})`, margin + 110, y + 10);
  } else {
    doc.text(`Semestre Ativo: ${structure.activeYearSemester}`, margin + 110, y + 10);
  }
  doc.text(`DCN Ativa: ${structure.dcnRef || 'Resolução MEC'}`, margin + 110, y + 15);

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
  doc.setFontSize(8);
  doc.setTextColor(0, 43, 73);
  doc.text('RESUMO DE CARGA HORÁRIA E CONFORMIDADE REGULATÓRIA (MEC / DCN)', margin + 3, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
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
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(`${period.number}º Período - Componentes Curriculares (${period.disciplines.length} disciplinas)`, margin + 3, y + 3.8);
      y += 5.5;

      // Cabeçalho da Tabela
      doc.setFillColor(235, 240, 245);
      doc.rect(margin, y, contentWidth, 5, 'F');
      doc.setTextColor(0, 43, 73);
      doc.setFontSize(6.2);
      doc.text('Código', margin + 2, y + 3.5);
      doc.text('Nome da Disciplina', margin + 20, y + 3.5);
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

        doc.setFont('helvetica', 'bold');
        doc.text(disc.code, margin + 2, y + 3.2);
        doc.setFont('helvetica', 'normal');
        doc.text(disc.name.substring(0, 42), margin + 20, y + 3.2);
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
      doc.setFontSize(6.5);
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
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      const branchIndicator = mod.branch ? ` [Trilha ${mod.branch}]` : '';
      doc.text(`Módulo ${mod.number}: ${mod.title}${branchIndicator} (${mod.hours}h)`, margin + 3, y + 4.2);
      y += 6;
      if (mod.competence) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(0, 43, 73);
        doc.text(mod.competence.substring(0, 140), margin + 3, y + 3);
        y += 5;
      }

      // Conhecimentos do Módulo (em estrutura modular)
      if (!structure.hideKnowledgesInReport && mod.disciplines && mod.disciplines.length > 0) {
        doc.setFillColor(242, 244, 247);
        doc.rect(margin, y, contentWidth, 4.5, 'F');
        doc.setTextColor(0, 43, 73);
        doc.setFontSize(6.8);
        doc.text('Código', margin + 2, y + 3.2);
        doc.text('Conhecimento', margin + 22, y + 3.2);
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

        mod.disciplines.forEach((d) => {
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

          doc.text(d.code, margin + 2, y + 3.2);
          doc.text(d.name.substring(0, 48), margin + 22, y + 3.2);
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
        doc.setFontSize(6.5);
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
        doc.setFontSize(6.8);
        doc.setTextColor(217, 83, 0);
        doc.text(`SABERES - MÓDULO ${mod.number}:`, margin + 2, y + 2.8);
        y += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
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

      // Conhecimentos adicionais (lista knowledges)
      if (!structure.hideKnowledgesInReport && mod.knowledges && mod.knowledges.length > 0) {
        if (y > 175) {
          doc.addPage();
          y = 12;
        }

        doc.setFillColor(240, 249, 255);
        doc.rect(margin, y, contentWidth, 4, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(0, 43, 73);
        doc.text(`CONHECIMENTOS ESPECÍFICOS - MÓDULO ${mod.number}:`, margin + 2, y + 2.8);
        y += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(50, 50, 50);

        mod.knowledges.forEach((know) => {
          if (y > 185) {
            doc.addPage();
            y = 12;
          }
          const modText = `[${know.modalityDelivery.toUpperCase()}]`;
          const chTag = know.hours ? ` [${know.hours}h]` : '';
          doc.text(`• ${modText} [${know.category.toUpperCase()}] ${know.name}${chTag}`, margin + 4, y + 2.8);
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
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('CARGA HORÁRIA', tableX + tableW / 2, y + 5.2, { align: 'center' });
    y += 8;

    doc.setFillColor(245, 247, 250);
    doc.rect(tableX, y, tableW, rowH, 'F');
    doc.setDrawColor(0, 43, 73);
    doc.rect(tableX, y, tableW, rowH);
    doc.setFontSize(6.5);
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
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(title, tableX + 2, y + 4.4);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(7);
      componentRows.forEach((row, index) => {
        doc.text(valueOf(row), centerOf(index), y + 4.4, { align: 'center' });
      });
      y += rowH;
    };

    drawValueRow('Hora-relógio', (row) => formatWorkloadHours(row.hours), true);
    drawValueRow('Percentual', (row) => formatWorkloadPercent(row.percent), false);

    if (totalRow) {
      doc.setFillColor(255, 240, 230);
      doc.rect(tableX, y, tableW, rowH, 'F');
      doc.setDrawColor(0, 43, 73);
      doc.rect(tableX, y, tableW, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 43, 73);
      doc.text('TOTAL', tableX + 2, y + 4.6);
      doc.text(
        `${formatWorkloadHours(totalRow.hours)} horas (${formatWorkloadPercent(totalRow.percent)})`,
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
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Documento gerado eletronicamente pelo Sistema de Gestão de Estruturas Curriculares - UNISUAM.', margin, y + 4);
  doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin + 180, y + 4);

  // 2ª página: observações, regras e explicações da ementa
  const notes = getReportNotes(structure.structureType, settings);
  if (notes.blocks.length > 0) {
    doc.addPage();
    let ny = 12;

    doc.setFillColor(0, 43, 73);
    doc.rect(margin, ny, contentWidth, 14, 'F');
    doc.setFillColor(255, 107, 0);
    doc.rect(margin, ny + 14, contentWidth, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(
      settings?.institutionName || 'UNISUAM - Centro Universitário Augusto Motta',
      margin + 4,
      ny + 6
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(notes.title.toUpperCase(), margin + 4, ny + 11);
    ny += 20;

    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, ny, contentWidth, 12);
    doc.text(
      `Curso e Modalidade: ${structure.courseName} (${structure.modality})`,
      margin + 3,
      ny + 5
    );
    doc.text(
      `Estrutura: ${structure.code}${structure.hideStatus ? '' : ` (${structure.status})`}`,
      margin + 110,
      ny + 5
    );
    doc.text(`CH Total: ${structure.calculatedTotalHours}h`, margin + 200, ny + 5);
    doc.text(`Tipo de Estrutura: ${structure.structureType.toUpperCase()}`, margin + 3, ny + 9.5);
    doc.text(`DCN Ativa: ${structure.dcnRef || 'Resolução MEC'}`, margin + 110, ny + 9.5);
    doc.text(`Semestre Ativo: ${structure.activeYearSemester}`, margin + 200, ny + 9.5);
    ny += 18;

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
        doc.setFontSize(8.5);
        doc.setTextColor(0, 43, 73);
        doc.text(block.title.toUpperCase(), margin + 5, ny + 4);
        ny += 8;
      }

      if (block.text) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
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

  doc.save(`${structure.code}_${structure.courseName.replace(/\s+/g, '_')}_Oficial_UNISUAM.pdf`);
}

export async function generateInteractiveHtml(
  structure: CurriculumStructure,
  settings?: AppSettings
): Promise<string> {
  const saberes = getSaberesLabels(settings?.pedagogicalNomenclature);
  const chaTitle =
    settings?.pedagogicalNomenclature === 'zabala' ? saberes.full : saberes.sectionTitle;
  const workload = buildWorkloadSummary(structure);
  const hoursOf = (id: string) => workload.rows.find((r) => r.id === id)?.hours || 0;
  const usePresentialSplit = structureHasPresentialSplit(structure);
  const logoDataUrl = await getLogoDataUrl().catch(() => '');

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
            : `<div class="leading-none select-none"><span class="text-2xl font-black tracking-tight"><span class="text-[#FF6B00]">UNI</span><span class="text-white">SUAM</span></span></div>`
        }
        <div>
          <h1 class="text-lg sm:text-xl font-bold tracking-tight">Estrutura Curricular Oficial</h1>
          <p class="text-xs text-blue-200">${structure.courseName} • Código: <span class="font-bold text-[#FF6B00]">${structure.code}</span> • ${structure.modality}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 no-print">
        <button onclick="window.print()" class="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
          Imprimir
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
    <!-- Header Card -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Curso e Modalidade</span>
          <h2 class="text-xl font-bold text-slate-900">${structure.courseName}</h2>
          <p class="text-sm text-slate-600">Modalidade: <span class="font-semibold text-[#002B49]">${structure.modality}</span></p>
          <p class="text-xs text-slate-500">Ato Autorizativo: ${structure.authorizationAct || structure.recognitionPortaria || '—'}</p>
        </div>
        <div class="space-y-1">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Vigência & Diretriz</span>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">${structure.status}</span>
            <span class="text-sm font-semibold text-slate-700">Semestre Ativo: ${structure.activeYearSemester}</span>
          </div>
          <p class="text-xs text-slate-600">DCN: ${structure.dcnRef || 'Geral'}</p>
          <p class="text-xs text-slate-500">CINE Brasil: ${structure.cineBrasilRef || 'Não classificado'}</p>
        </div>
        <div class="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-2">
          <div class="flex justify-between items-center text-xs">
            <span class="text-slate-500">Carga Horária Total:</span>
            <span class="font-bold text-slate-900 text-sm">${structure.calculatedTotalHours} horas</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2">
            <div class="bg-[#FF6B00] h-2 rounded-full" style="width: ${Math.min(100, Math.round((structure.calculatedTotalHours / (structure.requiredTotalHours || 1)) * 100))}%"></div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-1 pt-1 text-[11px] text-slate-600">
            ${
              usePresentialSplit
                ? `<div>Teórico: <span class="font-bold text-slate-800">${hoursOf('teorico')}h</span></div>
            <div>Laboratório: <span class="font-bold text-slate-800">${hoursOf('laboratorio')}h</span></div>
            <div>Clínica: <span class="font-bold text-slate-800">${hoursOf('clinica')}h</span></div>`
                : `<div>Presencial: <span class="font-bold text-slate-800">${structure.calculatedPresentialHours}h</span></div>`
            }
            <div>Síncrono-Mediado: <span class="font-bold text-slate-800">${hoursOf('sincrono-mediado')}h</span></div>
            <div>Assíncrono: <span class="font-bold text-slate-800">${hoursOf('assincrono')}h</span></div>
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
        <input id="searchInput" type="text" placeholder="Buscar disciplina, código ou competência..." class="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#002B49] text-sm bg-white shadow-sm" onkeyup="filterContent()">
      </div>
      <div class="flex items-center gap-2">
        <button id="toggleAllBtn" onclick="toggleAllAccordions()" class="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition">
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
            <h3 class="font-bold text-base flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-[#FF6B00] text-xs flex items-center justify-center text-white">${period.number}</span>
              ${period.number}º Período Letivo
            </h3>
            <span class="text-xs font-semibold px-2.5 py-1 rounded bg-white/10 text-white">${period.totalCredits} · ${period.totalHours} horas</span>
          </button>
          <div data-period-body class="overflow-x-auto">
            <table class="w-full text-left text-sm ${usePresentialSplit ? 'min-w-[980px]' : 'min-w-[860px]'}">
              <thead class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                ${
                  usePresentialSplit
                    ? `<tr>
                  <th rowspan="2" class="px-3 py-2 align-bottom">Código</th>
                  <th rowspan="2" class="px-3 py-2 min-w-[180px] align-bottom">Disciplina</th>
                  <th rowspan="2" class="px-2.5 py-2 align-bottom">Tipo</th>
                  <th rowspan="2" class="px-2.5 py-2 align-bottom">Avaliação</th>
                  <th rowspan="2" class="px-2 py-2 text-center align-bottom">Créditos</th>
                  <th colspan="3" class="px-2 py-1 text-center bg-blue-50/50 text-[#002B49]">Presencial</th>
                  <th rowspan="2" class="px-2 py-2 text-center bg-indigo-50/50 text-indigo-900 align-bottom">Síncrono-Mediado</th>
                  <th rowspan="2" class="px-2 py-2 text-center bg-purple-50/50 text-purple-900 align-bottom">Assíncrono</th>
                  <th rowspan="2" class="px-2.5 py-2 text-center align-bottom">Total</th>
                </tr>
                <tr>
                  <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Teórico</th>
                  <th class="px-1.5 py-1 text-center bg-blue-50/30 text-[#002B49]">Laboratório</th>
                  <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Clínica</th>
                </tr>`
                    : `<tr>
                  <th class="px-3 py-3">Código</th>
                  <th class="px-3 py-3 min-w-[200px]">Disciplina</th>
                  <th class="px-2.5 py-3">Tipo</th>
                  <th class="px-2.5 py-3">Avaliação</th>
                  <th class="px-2 py-3 text-center">Créditos</th>
                  <th class="px-2.5 py-3 text-center bg-blue-50/50 text-[#002B49]">CH Presencial</th>
                  <th class="px-2.5 py-3 text-center bg-indigo-50/50 text-indigo-900">CH Síncrona-Mediada</th>
                  <th class="px-2.5 py-3 text-center bg-purple-50/50 text-purple-900">CH Assíncrona</th>
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
                    <td class="px-3 py-3 font-mono text-xs font-semibold text-[#002B49]">${disc.code}</td>
                    <td class="px-3 py-3 font-medium text-slate-900">${disc.name}</td>
                    <td class="px-2.5 py-3 text-xs text-slate-600">${disc.type}</td>
                    <td class="px-2.5 py-3 text-xs text-slate-500">${disc.evaluationForm || 'Nota'}</td>
                    <td class="px-2 py-3 text-xs text-center font-semibold">${disc.credits}</td>
                    <td class="px-1.5 py-3 text-xs text-center font-bold text-blue-950">${chBd.theoretical}h</td>
                    <td class="px-1.5 py-3 text-xs text-center font-bold text-teal-800">${chBd.laboratory}h</td>
                    <td class="px-1.5 py-3 text-xs text-center font-bold text-rose-800">${chBd.clinical}h</td>
                    <td class="px-2 py-3 text-xs text-center font-bold text-indigo-900">${syncMed}h</td>
                    <td class="px-2 py-3 text-xs text-center font-bold text-purple-900">${chBd.async}h</td>
                    <td class="px-2.5 py-3 text-xs text-center font-black text-[#FF6B00]">${chBd.total}h</td>
                  </tr>
                `
                      : `
                  <tr class="item-row hover:bg-blue-50/50 transition">
                    <td class="px-3 py-3 font-mono text-xs font-semibold text-[#002B49]">${disc.code}</td>
                    <td class="px-3 py-3 font-medium text-slate-900">${disc.name}</td>
                    <td class="px-2.5 py-3 text-xs text-slate-600">${disc.type}</td>
                    <td class="px-2.5 py-3 text-xs text-slate-500">${disc.evaluationForm || 'Nota'}</td>
                    <td class="px-2 py-3 text-xs text-center font-semibold">${disc.credits}</td>
                    <td class="px-2.5 py-3 text-xs text-center font-bold text-blue-950">${chBd.presential}h</td>
                    <td class="px-2.5 py-3 text-xs text-center font-bold text-indigo-900">${syncMed}h</td>
                    <td class="px-2.5 py-3 text-xs text-center font-bold text-purple-900">${chBd.async}h</td>
                    <td class="px-2.5 py-3 text-xs text-center font-black text-[#FF6B00]">${chBd.total}h</td>
                  </tr>
                `;
                  })
                  .join('')}
              </tbody>
              <tfoot class="bg-slate-50 border-t border-slate-200 text-xs font-bold">
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
                  <td colspan="4" class="px-3 py-2.5 text-right text-slate-600">Subtotal do ${period.number}º Período</td>
                  <td class="px-2 py-2.5 text-center text-slate-900">${period.totalCredits}</td>
                  <td class="px-1.5 py-2.5 text-center text-blue-900">${pTheo}h</td>
                  <td class="px-1.5 py-2.5 text-center text-teal-800">${pLab}h</td>
                  <td class="px-1.5 py-2.5 text-center text-rose-800">${pClin}h</td>
                  <td class="px-2 py-2.5 text-center text-indigo-900">${pSyncMed}h</td>
                  <td class="px-2 py-2.5 text-center text-purple-900">${pAsync}h</td>
                  <td class="px-2.5 py-2.5 text-center text-[#FF6B00]">${pTot || period.totalHours}h</td>
                </tr>`
                    : `
                <tr>
                  <td colspan="4" class="px-3 py-2.5 text-right text-slate-600">Subtotal do ${period.number}º Período</td>
                  <td class="px-2 py-2.5 text-center text-slate-900">${period.totalCredits}</td>
                  <td class="px-2.5 py-2.5 text-center text-blue-900">${pPres}h</td>
                  <td class="px-2.5 py-2.5 text-center text-indigo-900">${pSyncMed}h</td>
                  <td class="px-2.5 py-2.5 text-center text-purple-900">${pAsync}h</td>
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
          <div class="bg-[#002B49] px-6 py-4 flex flex-wrap justify-between items-center text-white gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-[#FF6B00] text-xs font-bold text-white">${mod.code}</span>
                ${mod.branch ? `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-semibold">Trilha ${mod.branch}</span>` : ''}
              </div>
              <h3 class="font-bold text-base mt-1 text-white">${mod.number}º Módulo: ${mod.title}</h3>
              ${mod.competence ? `<p class="text-xs text-blue-200 mt-0.5">${mod.competence}</p>` : ''}
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-extrabold text-[#FF6B00] bg-white px-3 py-1 rounded shadow-sm">${mod.hours}h</span>
              ${
                !structure.hideCompetenciesInReport
                  ? `<button onclick="toggleDetails('mod-details-${mod.id}')" class="text-xs px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition no-print">
                Ver Saberes / CHA
              </button>`
                  : ''
              }
            </div>
          </div>

          <!-- Conhecimentos do Módulo -->
          <div class="p-6">
            ${
              !structure.hideKnowledgesInReport && (mod.disciplines || []).length > 0
                ? (() => {
                    const discs = mod.disciplines || [];
                    const mPres = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).presential, 0);
                    const mTheo = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).theoretical, 0);
                    const mLab = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).laboratory, 0);
                    const mClin = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).clinical, 0);
                    const mSyncMed = discs.reduce((acc, d) => {
                      const bd = getDisciplineChBreakdown(d);
                      return acc + bd.syncMediated + (bd.sync || 0);
                    }, 0);
                    const mAsync = discs.reduce((acc, d) => acc + getDisciplineChBreakdown(d).async, 0);
                    return `<h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Conhecimentos</h4>
            <div class="overflow-x-auto mb-4">
              <table class="w-full text-left text-sm ${usePresentialSplit ? 'min-w-[820px]' : 'min-w-[700px]'} border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  ${
                    usePresentialSplit
                      ? `<tr>
                    <th rowspan="2" class="px-3 py-2 align-bottom">Código</th>
                    <th rowspan="2" class="px-3 py-2 align-bottom">Conhecimento</th>
                    <th rowspan="2" class="px-2 py-2 text-center align-bottom">Tipo</th>
                    <th colspan="3" class="px-2 py-1 text-center bg-blue-50/50 text-[#002B49]">Presencial</th>
                    <th rowspan="2" class="px-2 py-2 text-center bg-indigo-50/50 text-indigo-900 align-bottom">Síncrono-Mediado</th>
                    <th rowspan="2" class="px-2 py-2 text-center bg-purple-50/50 text-purple-900 align-bottom">Assíncrono</th>
                  </tr>
                  <tr>
                    <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Teórico</th>
                    <th class="px-1.5 py-1 text-center bg-blue-50/30 text-[#002B49]">Laboratório</th>
                    <th class="px-1.5 py-1 text-center bg-blue-50/40 text-[#002B49]">Clínica</th>
                  </tr>`
                      : `<tr>
                    <th class="px-3 py-2.5">Código</th>
                    <th class="px-3 py-2.5">Conhecimento</th>
                    <th class="px-2 py-2.5 text-center">Tipo</th>
                    <th class="px-2.5 py-2.5 text-center bg-blue-50/50 text-[#002B49]">CH Presencial</th>
                    <th class="px-2.5 py-2.5 text-center bg-indigo-50/50 text-indigo-900">CH Síncrona-Mediada</th>
                    <th class="px-2.5 py-2.5 text-center bg-purple-50/50 text-purple-900">CH Assíncrona</th>
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
                    <td class="px-3 py-2.5 font-mono text-xs font-semibold text-[#002B49]">${d.code}</td>
                    <td class="px-3 py-2.5 font-medium text-slate-900">${d.name}</td>
                    <td class="px-2 py-2.5 text-xs text-center text-slate-600">${d.type}</td>
                    <td class="px-1.5 py-2.5 text-xs text-center font-bold text-blue-950">${chBd.theoretical}h</td>
                    <td class="px-1.5 py-2.5 text-xs text-center font-bold text-teal-800">${chBd.laboratory}h</td>
                    <td class="px-1.5 py-2.5 text-xs text-center font-bold text-rose-800">${chBd.clinical}h</td>
                    <td class="px-2 py-2.5 text-xs text-center font-bold text-indigo-900">${syncMed}h</td>
                    <td class="px-2 py-2.5 text-xs text-center font-bold text-purple-900">${chBd.async}h</td>
                  </tr>`
                        : `<tr class="item-row">
                    <td class="px-3 py-2.5 font-mono text-xs font-semibold text-[#002B49]">${d.code}</td>
                    <td class="px-3 py-2.5 font-medium text-slate-900">${d.name}</td>
                    <td class="px-2 py-2.5 text-xs text-center text-slate-600">${d.type}</td>
                    <td class="px-2.5 py-2.5 text-xs text-center font-bold text-blue-950">${chBd.presential}h</td>
                    <td class="px-2.5 py-2.5 text-xs text-center font-bold text-indigo-900">${syncMed}h</td>
                    <td class="px-2.5 py-2.5 text-xs text-center font-bold text-purple-900">${chBd.async}h</td>
                  </tr>`;
                    })
                    .join('')}
                </tbody>
                <tfoot class="bg-slate-50 border-t border-slate-200 text-xs font-bold">
                  ${
                    usePresentialSplit
                      ? `<tr>
                    <td colspan="3" class="px-3 py-2.5 text-right text-slate-600">Subtotal dos Conhecimentos</td>
                    <td class="px-1.5 py-2.5 text-center text-blue-900">${mTheo}h</td>
                    <td class="px-1.5 py-2.5 text-center text-teal-800">${mLab}h</td>
                    <td class="px-1.5 py-2.5 text-center text-rose-800">${mClin}h</td>
                    <td class="px-2 py-2.5 text-center text-indigo-900">${mSyncMed}h</td>
                    <td class="px-2 py-2.5 text-center text-purple-900">${mAsync}h</td>
                  </tr>`
                      : `<tr>
                    <td colspan="3" class="px-3 py-2.5 text-right text-slate-600">Subtotal dos Conhecimentos</td>
                    <td class="px-2.5 py-2.5 text-center text-blue-900">${mPres}h</td>
                    <td class="px-2.5 py-2.5 text-center text-indigo-900">${mSyncMed}h</td>
                    <td class="px-2.5 py-2.5 text-center text-purple-900">${mAsync}h</td>
                  </tr>`
                  }
                </tfoot>
              </table>
            </div>`;
                  })()
                : ''
            }

            ${
              !structure.hideCompetenciesInReport
                ? `<!-- Saberes -->
            <div id="mod-details-${mod.id}" class="cha-panel mt-4 p-4 rounded-lg bg-orange-50/60 border border-orange-200 space-y-3">
              <div class="flex items-center justify-between border-b border-orange-200/60 pb-2">
                <span class="text-xs font-bold uppercase tracking-wider text-orange-900 flex items-center gap-1.5">
                  <svg class="w-4 h-4 text-[#FF6B00]" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path></svg>
                  Saberes
                </span>
                <span class="text-[11px] text-orange-700 font-medium">Navegação Integrada</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                ${(mod.competencies || [])
                  .map(
                    (c) => `
                  <div class="bg-white p-3 rounded-lg border border-orange-100 shadow-xs">
                    <div class="mb-1">
                      <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        c.category === 'conhecimento' || c.category === 'conceitual'
                          ? 'bg-blue-100 text-blue-800'
                          : c.category === 'habilidade' || c.category === 'procedimental'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }">${labelForCategory(c.category, settings?.pedagogicalNomenclature)}</span>
                    </div>
                    <p class="text-xs text-slate-700 leading-relaxed">${c.name}</p>
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
      const notesHtml = renderReportNotesPageHtml(structure, settings, { logoDataUrl });
      return notesHtml
        ? `<div class="report-notes-page mt-8 rounded-xl overflow-hidden border border-slate-200 bg-white">${notesHtml}</div>`
        : '';
    })()}
  </main>

  <footer class="bg-white border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-500">
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
  settings?: AppSettings
): Promise<void> {
  const htmlContent = await generateInteractiveHtml(structure, settings);
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
 * (inclui pan por arrastar e Tailwind via CDN).
 */
export async function exportMapToHTML(
  elementId: string,
  structure: CurriculumStructure,
  filename?: string,
  settings?: AppSettings
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Elemento do mapa não encontrado para exportação HTML');
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-export').forEach((n) => n.remove());

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

  // Embute imagens (logo etc.) como data URL — HTML baixado não tem acesso aos assets do Vite
  await inlineImagesAsDataUrls(clone, element);

  const safeName = (structure.courseName || 'Curso').replace(/\s+/g, '_');
  const title = `Mapa Curricular — ${structure.code} · ${structure.courseName}`;
  const notesPageHtml = renderReportNotesPageHtml(structure, settings, {
    logoDataUrl: await getLogoDataUrl().catch(() => ''),
  });

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
    }
    header .code {
      background: var(--unisuam-blue);
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 10px;
    }
    header h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
      color: var(--unisuam-blue);
    }
    header .hint {
      font-size: 11px;
      color: #94a3b8;
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
    }
    @media (max-width: 768px) {
      header {
        padding: 10px 12px;
        gap: 6px;
      }
      header h1 {
        font-size: 13px;
        line-height: 1.25;
        max-width: 100%;
      }
      header .code {
        font-size: 10px;
        padding: 3px 8px;
      }
      header .hint {
        width: 100%;
        font-size: 10px;
      }
      #map-viewport {
        height: calc(100dvh - 96px);
        padding: 8px;
      }
      #map-stage {
        /* Em telas menores, permite scroll livre sem forçar zoom destrutivo */
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="code">${structure.code}</span>
      <h1>Mapa Curricular — ${structure.courseName}</h1>
    </div>
    <span class="hint">Arraste para navegar · UNISUAM</span>
  </header>
  <div id="map-viewport">
    <div id="map-stage">
      ${clone.outerHTML}
    </div>
  </div>
  ${
    notesPageHtml
      ? `<div class="report-notes-page">
    <div class="report-notes-inner">${notesPageHtml}</div>
  </div>`
      : ''
  }
  <script>
    (function () {
      var vp = document.getElementById('map-viewport');
      if (!vp) return;
      var dragging = false;
      var ox = 0, oy = 0, sl = 0, st = 0;
      vp.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        var t = e.target;
        if (t && t.closest && t.closest('button, a, input, label, select, textarea, [data-period-toggle]')) return;
        // Em touch, deixa o scroll nativo; pan por arrastar só no mouse
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
  link.download =
    filename ||
    `${structure.code}_${safeName}_Mapa_Curricular.html`;
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
      [1, '', 'MOD-01', 'Empreendedorismo e Sustentabilidade', 325, 'Modelagem de Negócios', 'Diagnósticos ESG', 'Postura Ética'],
      [2, '', 'MOD-02', 'Ambiente Corporativo e Comunicação', 325, 'Teorias da Administração', 'Técnicas de Negociação', 'Empatia e Liderança'],
      [9, 'A', 'MOD-09A', 'Ênfase Clínica I: Práticas Terapêuticas', 450, 'Psicofarmacologia', 'Supervisão Clínica', 'Postura Bioética'],
      [9, 'B', 'MOD-09B', 'Ênfase Gestão I: Consultoria Organizacional', 450, 'Intervenção Psicossocial', 'Diagnóstico Organizacional', 'Inclusão Social'],
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
