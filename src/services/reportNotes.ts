import { AppSettings, CurriculumStructure, ReportNoteBlock } from '../types/curriculum';
import { formatDcnsDisplayLabel } from '../utils/courseBatch';
import { getActiveAuthorizationActLabel } from '../utils/authorizationActs';

export const DEFAULT_REPORT_NOTES_TITLE = 'Observações, Regras e Explicações da Estrutura';

/** Corrige título legado que ainda fala em “ementa”. */
export function normalizeReportNotesTitle(title?: string | null): string {
  const trimmed = (title || '').trim();
  if (!trimmed) return DEFAULT_REPORT_NOTES_TITLE;
  return trimmed.replace(/\bda\s+Ementa\b/gi, 'da Estrutura');
}

export interface ReportNotesContent {
  title: string;
  blocks: ReportNoteBlock[];
}

export function createReportNoteBlock(): ReportNoteBlock {
  return {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    text: '',
  };
}

/** Observações cadastradas para o tipo da estrutura, já sem blocos vazios. */
export function getReportNotes(
  structureType: CurriculumStructure['structureType'],
  settings?: AppSettings
): ReportNotesContent {
  const source =
    structureType === 'modular' ? settings?.reportNotesModular : settings?.reportNotesDisciplinar;

  const blocks = (source || [])
    .map((block) => ({
      id: block.id,
      title: (block.title || '').trim(),
      text: (block.text || '').trim(),
    }))
    .filter((block) => block.title || block.text);

  return {
    title: normalizeReportNotesTitle(settings?.reportNotesTitle),
    blocks,
  };
}

export function hasReportNotes(
  structureType: CurriculumStructure['structureType'],
  settings?: AppSettings
): boolean {
  return getReportNotes(structureType, settings).blocks.length > 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Texto com parágrafos e listas simples (linhas iniciadas por -, • ou *). */
function renderNoteText(text: string): string {
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    html.push(
      `<ul style="margin:4px 0 8px 18px;padding:0;color:#334155;font-size:14.5px;line-height:1.55;">${listItems
        .map((item) => `<li style="margin:2px 0;">${escapeHtml(item)}</li>`)
        .join('')}</ul>`
    );
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    const bullet = line.match(/^[-•*]\s*(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    html.push(
      `<p style="margin:0 0 8px 0;color:#334155;font-size:14.5px;line-height:1.6;text-align:justify;">${escapeHtml(
        line
      )}</p>`
    );
  });

  flushList();
  return html.join('');
}

/**
 * Página de observações.
 * - standalone: cabeçalho institucional completo (HTML / página separada)
 * - append: só o bloco de observações, mesma largura da matriz (PNG sem 2º cabeçalho / bordas)
 */
export function renderReportNotesPageHtml(
  structure: CurriculumStructure,
  settings?: AppSettings,
  options: {
    widthPx?: number;
    logoDataUrl?: string;
    mode?: 'standalone' | 'append';
  } = {}
): string {
  const notes = getReportNotes(structure.structureType, settings);
  if (notes.blocks.length === 0) return '';

  const { widthPx, logoDataUrl, mode = 'standalone' } = options;
  const institution = settings?.institutionName || 'UNISUAM - Centro Universitário Augusto Motta';
  const widthStyle = widthPx ? `width:${widthPx}px;max-width:${widthPx}px;` : 'width:100%;';

  const notesBody = `
    <div style="box-sizing:border-box;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#002B49;padding:10px 20px;">
        <h2 style="margin:0;font-size:16px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;">${escapeHtml(
          notes.title
        )}</h2>
        <p style="margin:2px 0 0 0;font-size:12px;color:#bfdbfe;">${escapeHtml(structure.courseName)} · Estrutura ${escapeHtml(
          structure.structureType === 'modular' ? 'Modular' : 'Disciplinar'
        )}</p>
      </div>
      <div style="padding:20px;">
        ${notes.blocks
          .map(
            (block) => `<div style="margin-bottom:16px;">
          ${
            block.title
              ? `<h3 style="margin:0 0 6px 0;font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#002B49;border-left:3px solid #FF6B00;padding-left:8px;">${escapeHtml(
                  block.title
                )}</h3>`
              : ''
          }
          ${block.text ? renderNoteText(block.text) : ''}
        </div>`
          )
          .join('')}
      </div>
    </div>`;

  if (mode === 'append') {
    return `<section data-report-notes-page style="box-sizing:border-box;${widthStyle}background:#ffffff;padding:0;margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  ${notesBody}
</section>`;
  }

  const logo = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="UNISUAM" style="height:56px;width:auto;object-fit:contain;flex-shrink:0;" />`
    : `<div style="font-size:27px;font-weight:900;letter-spacing:-0.5px;"><span style="color:#FF6B00;">UNI</span><span style="color:#002B49;">SUAM</span></div>`;

  return `<section data-report-notes-page style="box-sizing:border-box;${widthStyle}background:#ffffff;padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="box-sizing:border-box;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #FF6B00;padding-bottom:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        ${logo}
        <div style="min-width:0;">
          <h3 style="margin:0;font-size:18px;font-weight:700;color:#002B49;">${escapeHtml(institution)}</h3>
          <p style="margin:2px 0 0 0;font-size:14px;font-weight:500;color:#64748b;">ESTRUTURA CURRICULAR OFICIAL</p>
        </div>
      </div>
      <div style="text-align:right;font-size:14px;color:#475569;">
        <div style="font-weight:600;color:#1e293b;">Carga Horária Total: <span style="color:#FF6B00;font-weight:900;font-size:16px;">${structure.calculatedTotalHours}h</span></div>
        ${
          structure.structureType === 'disciplinar'
            ? `<div>Total de Créditos: <span style="font-weight:700;color:#1e293b;">${structure.totalCredits}</span></div>`
            : ''
        }
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:14px;">
      <div style="flex:1 1 180px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Curso e Modalidade:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(structure.courseName)} (${escapeHtml(structure.modality)})</span>
      </div>
      <div style="flex:1 1 180px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Ato Autorizativo:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(
          getActiveAuthorizationActLabel(structure)
        )}</span>
      </div>
      <div style="flex:1 1 180px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">DCN do Curso:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(
          formatDcnsDisplayLabel(structure.dcns, structure.dcnRef)
        )}</span>
      </div>
      <div style="flex:1 1 180px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Código da Estrutura:</span>
        <span style="font-weight:700;color:#002B49;">${escapeHtml(structure.code)}${
          !structure.hideStatus ? ` (${escapeHtml(structure.status)})` : ''
        }</span>
      </div>
    </div>
  </div>

  <div style="margin-top:16px;">
  ${notesBody}
  </div>
</section>`;
}
