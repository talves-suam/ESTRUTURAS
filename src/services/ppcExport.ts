import {
  CurriculumStructure,
} from '../types/curriculum';
import { captureElementAsPngDataUrl } from './exportService';
import { formatModuleName, toRoman, formatBranchLabel } from '../utils/roman';

export interface PpcSection {
  id: string;
  slug: string;
  title: string;
  meta: string;
  kind: 'period' | 'module' | 'summary';
}

function slugPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export function listPpcSections(structure: CurriculumStructure): PpcSection[] {
  const sections: PpcSection[] = [];

  if (structure.structureType === 'disciplinar') {
    (structure.periods || []).forEach((period) => {
      sections.push({
        id: period.id,
        slug: `${period.number}_Periodo`,
        title: `${period.number}º Período`,
        meta: `${period.totalCredits} créditos · ${period.totalHours}h`,
        kind: 'period',
      });
    });
  } else {
    (structure.modules || []).forEach((mod) => {
      const branch = mod.branch ? ` · ${formatBranchLabel(mod.branch)}` : '';
      sections.push({
        id: mod.id,
        slug: `Modulo_${toRoman(mod.number)}${mod.branch || ''}_${slugPart(mod.title)}`,
        title: formatModuleName(mod.number, mod.title, mod.branch),
        meta: `${mod.hours}h${branch}`,
        kind: 'module',
      });
    });
  }

  if (!structure.hideWorkloadSummaryInReport) {
    sections.push({
      id: 'summary',
      slug: 'Carga_Horaria',
      title: 'Carga Horária',
      meta: `${structure.calculatedTotalHours}h`,
      kind: 'summary',
    });
  }

  return sections;
}

function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (document.body.contains(link)) document.body.removeChild(link);
  }, 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findPpcSectionEl(root: HTMLElement, sectionId: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>('[data-ppc-section]')).find(
      (node) => node.getAttribute('data-ppc-section') === sectionId
    ) || null
  );
}

function setDisplay(el: HTMLElement | null, visible: boolean): void {
  if (!el) return;
  el.style.display = visible ? '' : 'none';
}

/**
 * Captura PNGs no visual real da tabela (curriculum-print-area),
 * um quadro por período/módulo. Cabeçalho só na primeira imagem.
 */
async function capturePpcSections(
  structure: CurriculumStructure
): Promise<Array<PpcSection & { dataUrl: string; widthPx: number; heightPx: number }>> {
  const root = document.getElementById('curriculum-print-area');
  if (!root) {
    throw new Error('Abra a visualização em tabela da estrutura para gerar o PPC.');
  }

  const header = root.querySelector<HTMLElement>('[data-ppc-header]');
  const sections = listPpcSections(structure);
  const sectionEls = sections
    .map((section) => ({ section, el: findPpcSectionEl(root, section.id) }))
    .filter((item): item is { section: PpcSection; el: HTMLElement } => Boolean(item.el));

  if (sectionEls.length === 0) {
    throw new Error('Nenhum quadro da matriz encontrado para o PPC.');
  }

  const captured: Array<PpcSection & { dataUrl: string; widthPx: number; heightPx: number }> = [];

  try {
    for (let index = 0; index < sectionEls.length; index++) {
      const { section, el } = sectionEls[index];

      sectionEls.forEach((item) => setDisplay(item.el, item.el === el));
      setDisplay(header, index === 0);

      // Garante que a área de captura está no fluxo visível (html-to-image falha offscreen)
      root.scrollIntoView({ block: 'nearest' });
      await sleep(120);

      const shot = await captureElementAsPngDataUrl('curriculum-print-area');
      if (!shot.dataUrl || shot.widthPx < 10 || shot.heightPx < 10) {
        throw new Error(`Falha ao capturar o quadro "${section.title}".`);
      }
      captured.push({ ...section, ...shot });
    }
  } finally {
    sectionEls.forEach((item) => setDisplay(item.el, true));
    setDisplay(header, true);
  }

  return captured;
}

export async function exportPpcPngs(structure: CurriculumStructure): Promise<number> {
  const captured = await capturePpcSections(structure);
  const prefix = `${structure.code}_PPC`;
  for (const item of captured) {
    triggerDownload(item.dataUrl, `${prefix}_${item.slug}.png`);
    await sleep(400);
  }
  return captured.length;
}
