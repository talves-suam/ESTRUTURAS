import {
  AppSettings,
  CurriculumStructure,
  getGraduateProfileAspects,
  getGraduateProfilePlainText,
  normalizeModuleCompetences,
  aspectShortLabel,
  ASPECT_BADGE_COLORS,
} from '../types/curriculum';
import { formatModuleName } from '../utils/roman';
import { formatDcnsDisplayLabel } from '../utils/courseBatch';
import { getActiveAuthorizationActLabel } from '../utils/authorizationActs';

export const PPC_SUMMARY_PAGE_TITLE = 'Perfil do Egresso';

export interface PpcSummaryContent {
  title: string;
  graduateProfile: string;
  aspects: Array<{ id: string; title: string; text: string; shortLabel: string }>;
  modules: Array<{
    id: string;
    label: string;
    branch?: string;
    competences: Array<{
      id: string;
      text: string;
      aspects: Array<{ id: string; shortLabel: string; colorIndex: number }>;
    }>;
  }>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Texto com parágrafos e listas simples (linhas iniciadas por -, • ou *). */
function renderMultilineText(text: string): string {
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

export function getPpcSummaryContent(structure: CurriculumStructure): PpcSummaryContent {
  const aspectsRaw = getGraduateProfileAspects(structure);
  const aspectIndex = new Map(aspectsRaw.map((a, i) => [a.id, i]));
  const aspects = aspectsRaw.map((a, i) => ({
    id: a.id,
    title: (a.title || '').trim() || `Aspecto ${i + 1}`,
    text: (a.text || '').trim(),
    shortLabel: aspectShortLabel(a, i),
  }));
  const graduateProfile = getGraduateProfilePlainText(structure);

  const modules = (structure.modules || [])
    .map((mod) => {
      const comps = normalizeModuleCompetences(mod);
      return {
        id: mod.id,
        label: formatModuleName(mod.number, mod.title, mod.branch),
        branch: mod.branch,
        competences: comps.map((c) => ({
          id: c.id,
          text: c.text,
          aspects: c.aspectIds
            .map((aid) => {
              const idx = aspectIndex.get(aid);
              if (idx === undefined) return null;
              const asp = aspectsRaw[idx];
              return {
                id: asp.id,
                shortLabel: aspectShortLabel(asp, idx),
                colorIndex: idx % ASPECT_BADGE_COLORS.length,
              };
            })
            .filter((x): x is { id: string; shortLabel: string; colorIndex: number } => !!x),
        })),
      };
    })
    .filter((m) => m.competences.length > 0);

  return {
    title: PPC_SUMMARY_PAGE_TITLE,
    graduateProfile,
    aspects,
    modules,
  };
}

export function hasPpcSummary(structure: CurriculumStructure): boolean {
  const content = getPpcSummaryContent(structure);
  return !!content.graduateProfile || content.aspects.length > 0;
}

/**
 * Página 1 — Perfil do Egresso (somente impressão da estrutura).
 */
export function renderPpcSummaryPageHtml(
  structure: CurriculumStructure,
  settings?: AppSettings,
  options: {
    widthPx?: number;
    logoDataUrl?: string;
    mode?: 'standalone' | 'append';
  } = {}
): string {
  const content = getPpcSummaryContent(structure);
  if (!content.graduateProfile && content.aspects.length === 0) return '';

  const { widthPx, logoDataUrl, mode = 'standalone' } = options;
  const institution = settings?.institutionName || 'UNISUAM - Centro Universitário Augusto Motta';
  const widthStyle = widthPx ? `width:${widthPx}px;max-width:${widthPx}px;` : 'width:100%;';

  const profileBlock = content.aspects.length > 0
    ? `<div style="display:flex;flex-direction:column;gap:12px;">
          ${content.aspects
            .map(
              (asp) => `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
            <div style="font-size:13px;font-weight:800;color:#002B49;margin-bottom:4px;">${escapeHtml(
              asp.title
            )}</div>
            ${asp.text ? renderMultilineText(asp.text) : ''}
          </div>`
            )
            .join('')}
        </div>`
    : content.graduateProfile
    ? renderMultilineText(content.graduateProfile)
    : '';

  const summaryBody = `
    <div style="box-sizing:border-box;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#002B49;padding:10px 20px;">
        <h2 style="margin:0;font-size:16px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;">${escapeHtml(
          content.title
        )}</h2>
      </div>
      <div style="padding:20px;">
        ${profileBlock}
      </div>
    </div>`;

  if (mode === 'append') {
    return `<section data-ppc-summary-page style="box-sizing:border-box;${widthStyle}background:#ffffff;padding:0;margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  ${summaryBody}
</section>`;
  }

  const logo = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="UNISUAM" style="height:56px;width:auto;object-fit:contain;flex-shrink:0;" />`
    : `<div style="font-size:27px;font-weight:900;letter-spacing:-0.5px;"><span style="color:#FF6B00;">UNI</span><span style="color:#002B49;">SUAM</span></div>`;

  return `<section data-ppc-summary-page style="box-sizing:border-box;${widthStyle}background:#ffffff;padding:24px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="box-sizing:border-box;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;border-bottom:2px solid #FF6B00;padding-bottom:16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        ${logo}
        <div style="min-width:0;">
          <h3 style="margin:0;font-size:18px;font-weight:700;color:#002B49;">${escapeHtml(institution)}</h3>
          <p style="margin:2px 0 0 0;font-size:14px;font-weight:500;color:#64748b;">Resumo do Projeto Pedagógico do Curso</p>
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
      <div style="flex:1 1 160px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Curso e Modalidade:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(structure.courseName)} (${escapeHtml(structure.modality)})</span>
      </div>
      <div style="flex:1 1 140px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Grau:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(
          structure.degrees === 'Tecnólogo' ? 'Tecnológico' : structure.degrees || '—'
        )}</span>
      </div>
      <div style="flex:1 1 140px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Estrutura:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(
          structure.structureType === 'modular' ? 'Modular' : 'Disciplinar'
        )}</span>
      </div>
      <div style="flex:1 1 160px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Ato Autorizativo:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(
          getActiveAuthorizationActLabel(structure)
        )}</span>
      </div>
      <div style="flex:1 1 160px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">DCN do Curso:</span>
        <span style="font-weight:600;color:#1e293b;">${escapeHtml(
          formatDcnsDisplayLabel(structure.dcns, structure.dcnRef)
        )}</span>
      </div>
      <div style="flex:1 1 160px;">
        <span style="display:block;color:#94a3b8;font-weight:500;">Código da Estrutura:</span>
        <span style="font-weight:700;color:#002B49;">${escapeHtml(structure.code)}${
          !structure.hideStatus ? ` (${escapeHtml(structure.status)})` : ''
        }</span>
      </div>
    </div>
  </div>

  <div style="margin-top:16px;">
  ${summaryBody}
  </div>
</section>`;
}
