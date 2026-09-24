import {
  CompetencyCHA,
  GraduateProfileAspect,
  ModuleCompetenceItem,
  ModuleData,
  PedagogicalNomenclature,
  createGraduateProfileAspect,
  createModuleCompetenceItem,
} from '../types/curriculum';
import { defaultSaberCategory, type SaberesColumn } from '../utils/nomenclature';

export interface ImportedModulePedagogy {
  /** Número do módulo (1, 2…) quando detectado */
  moduleNumber?: number;
  /** Trecho do título após "Módulo X — …" */
  moduleTitleHint?: string;
  competences: string[];
  saberes: Array<{ name: string; column: SaberesColumn }>;
  /** Vínculos competência → títulos dos aspectos do perfil (seção Associação). */
  competenceAspectLinks: Array<{ competenceTitle: string; aspectTitles: string[] }>;
}


export interface ProfileDocImportResult {
  aspects: GraduateProfileAspect[];
  modules: ImportedModulePedagogy[];
  warnings: string[];
}

type Block = {
  kind: 'heading' | 'para' | 'item';
  text: string;
  level: number;
};

function romanOrDigitToNumber(token: string): number {
  const t = token.trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const map: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
    xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
  };
  return map[t] || 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converte listas aninhadas da seção Associação em itens planos legíveis:
 *   <li><strong>Comp:</strong><ul><li>Aspecto A</li></ul></li>
 * → <li>__ASSOC__::Comp::Aspecto A;;Aspecto B</li>
 *
 * Importante: o conteúdo de <strong> é só texto ([^<]*) para não “vazar”
 * de um <li> a outro via backtracking do regex.
 */
function expandAssociationHtml(html: string): string {
  let cur = html;
  let prev = '';
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(
      /<li\b[^>]*>\s*<strong\b[^>]*>([^<]*)<\/strong>\s*<ul\b[^>]*>((?:(?!<ul\b)[\s\S])*?)<\/ul>\s*<\/li>/gi,
      (_full, titleHtml: string, inner: string) => {
        const title = stripHtml(titleHtml)
          .replace(/:\s*$/, '')
          .trim();
        const aspectTitles: string[] = [];
        const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
        let m: RegExpExecArray | null;
        while ((m = liRe.exec(inner))) {
          const t = stripHtml(m[1]).replace(/:\s*$/, '').trim();
          if (t) aspectTitles.push(t);
        }
        if (!title || aspectTitles.length === 0) {
          return title ? `<li>${title}</li>` : '';
        }
        return `<li>__ASSOC__::${title}::${aspectTitles.join(';;')}</li>`;
      }
    );
  }
  return cur;
}

/**
 * Extrai blocos do HTML Mammoth (títulos, parágrafos e itens de lista de 1º nível).
 */
export function htmlToBlocks(html: string): Block[] {
  if (!html?.trim()) return [];
  const blocks: Block[] = [];
  const flat = expandAssociationHtml(html);

  const re = /<(h([1-6])|p|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    const tag = m[1].toLowerCase();
    if (tag === 'li' && /<ul\b/i.test(m[3])) continue;

    const text = stripHtml(m[3] || '');
    if (!text) continue;

    if (tag.startsWith('h')) {
      blocks.push({ kind: 'heading', level: Number(m[2]) || 2, text });
    } else if (tag === 'li') {
      blocks.push({ kind: 'item', level: 9, text });
    } else {
      blocks.push({ kind: 'para', level: 9, text });
    }
  }
  return blocks;
}

/** Fallback: linhas de texto puro. */
export function textToBlocks(raw: string): Block[] {
  return String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => {
      const isHeading =
        /^(perfil\s+do\s+egresso|m[oó]dulo\s+|compet[eê]ncia|saberes?|associa)/i.test(text) ||
        (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][^.!?]{2,80}$/.test(text) && text.length < 90);
      return {
        kind: isHeading ? ('heading' as const) : ('para' as const),
        level: isHeading ? 2 : 9,
        text,
      };
    });
}

function isProfileDocTitle(text: string): boolean {
  return /^perfil\s+do\s+egresso\b/i.test(text.trim());
}

function isProfileAspectsSection(text: string): boolean {
  return /compet[eê]ncias?\s+e\s+habilidades\s+do\s+perfil/i.test(text);
}

function isVisaoGeral(text: string): boolean {
  return /^vis[aã]o\s+geral\s+do\s+perfil\b/i.test(text.trim());
}

function isModuleMapSection(text: string): boolean {
  return /mapeamento\s+por\s+m[oó]dulo/i.test(text);
}

function parseModuleHeader(text: string): { number: number; titleHint: string } | null {
  const m = text.match(/^m[oó]dulo\s+([ivxlcdm]+|\d+)\s*[—–:\-.]?\s*(.*)$/i);
  if (!m) return null;
  const number = romanOrDigitToNumber(m[1]);
  if (!number) return null;
  return { number, titleHint: (m[2] || '').replace(/\s+/g, ' ').trim() };
}

/** Competência geral — NÃO cadastrar. */
function isCompetenciaGeralHeader(text: string): boolean {
  return /compet[eê]ncia\s+geral(\s+do\s+m[oó]dulo)?\b/i.test(text.trim());
}

/** Competências de mercado / lista operacional — cadastrar. */
function isCompetenciasMercadoHeader(text: string): boolean {
  const t = text.trim();
  return (
    /compet[eê]ncias?\s+voltadas?\s+ao\s+mercado/i.test(t) ||
    /^compet[eê]ncias?\s+(espec[ií]ficas|do\s+m[oó]dulo|operacionais)\b/i.test(t) ||
    /^(compet[eê]ncias?)\s*:?\s*$/i.test(t)
  );
}

function isSaberesHeader(text: string): boolean {
  return /^(saberes?)\s*:?\s*$/i.test(text.trim()) || /^saberes?\s*:\s*.+/i.test(text.trim());
}

function isAssociacaoHeader(text: string): boolean {
  return /associa[cç][aã]o\s+(das\s+)?compet/i.test(text);
}

function detectSaberesColumn(raw: string): { column: SaberesColumn; rest: string } | null {
  const t = raw.trim();
  const m = t.match(
    /^(conceitual|procedimental|atitudinal|conhecimento|habilidade|atitude|saber\s+conceitual|saber\s+fazer|saber\s+ser|c|h|a)\s*[:\-–—]\s*(.+)$/i
  );
  if (!m) return null;
  const key = m[1]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  let column: SaberesColumn = 'c';
  if (/proced|habil|fazer|^h$/.test(key)) column = 'h';
  else if (/atitud|atitude|ser|^a$/.test(key)) column = 'a';
  else column = 'c';
  return { column, rest: m[2].trim() };
}

/** Parte "a; b; c" em saberes, opcionalmente com prefixo de categoria na linha. */
export function parseSaberesLine(
  line: string,
  defaultColumn: SaberesColumn = 'c'
): Array<{ name: string; column: SaberesColumn }> {
  const trimmed = line.replace(/^saberes?\s*:\s*/i, '').trim();
  if (!trimmed) return [];

  const detected = detectSaberesColumn(trimmed);
  const column = detected?.column ?? defaultColumn;
  const body = detected?.rest ?? trimmed;

  return body
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((name) => {
      const nested = detectSaberesColumn(name);
      if (nested) return { name: nested.rest, column: nested.column };
      return { name, column };
    })
    .filter((s) => s.name.length > 0);
}

/** "Título: texto" → aspecto ou competência. */
function splitTitleBody(text: string): { title: string; body: string } | null {
  const m = text.match(/^(.{2,120}?)\s*:\s+(.+)$/);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, ' ').trim();
  const body = m[2].replace(/\s+/g, ' ').trim();
  if (!title || !body) return null;
  // Evita confundir "Conceitual: a; b" (saber) com aspecto
  if (detectSaberesColumn(text)) return null;
  return { title, body };
}

/** Item plano gerado por expandAssociationHtml. */
function parseAssocEncodedItem(
  text: string
): { competenceTitle: string; aspectTitles: string[] } | null {
  if (!text.startsWith('__ASSOC__::')) return null;
  const rest = text.slice('__ASSOC__::'.length);
  const sep = rest.indexOf('::');
  if (sep < 0) return null;
  const competenceTitle = rest.slice(0, sep).trim();
  const aspectTitles = rest
    .slice(sep + 2)
    .split(';;')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!competenceTitle || aspectTitles.length === 0) return null;
  return { competenceTitle, aspectTitles };
}

/**
 * Interpreta documento no formato Biomedicina (e variantes).
 * - Aspectos do perfil: lista "Título: texto" (não cadastra "Competência Geral").
 * - Por módulo: competências de mercado + saberes + associação aos aspectos.
 */
export function parseProfilePedagogyDocument(input: {
  html?: string;
  text?: string;
}): ProfileDocImportResult {
  const warnings: string[] = [];
  let blocks = input.html ? htmlToBlocks(input.html) : [];
  if (blocks.length < 5 && input.text) {
    const fromText = textToBlocks(input.text);
    if (fromText.length > blocks.length) blocks = fromText;
  }
  if (blocks.length === 0) {
    return {
      aspects: [],
      modules: [],
      warnings: ['Não foi possível ler o conteúdo do documento.'],
    };
  }

  type Mode =
    | 'idle'
    | 'visao'
    | 'profile_aspects'
    | 'module'
    | 'skip_geral'
    | 'competences_mercado'
    | 'saberes'
    | 'assoc';

  let mode: Mode = 'idle';
  const aspects: GraduateProfileAspect[] = [];
  const modules: ImportedModulePedagogy[] = [];
  let currentModule: ImportedModulePedagogy | null = null;
  let visaoText: string[] = [];
  /** Em modo assoc via texto puro: competência atual aguardando aspectos. */
  let assocCurrentTitle: string | null = null;

  const pushModule = () => {
    if (currentModule) {
      modules.push(currentModule);
      currentModule = null;
    }
    assocCurrentTitle = null;
  };

  const addCompetenceFromItem = (text: string) => {
    if (!currentModule) return;
    if (text.startsWith('__ASSOC__::')) return;
    const split = splitTitleBody(text);
    // Só o título (antes de ":"); a descrição após os dois-pontos não é cadastrada
    const title = (split?.title || text.replace(/:\s*$/, '').trim()).trim();
    if (title.length > 2) currentModule.competences.push(title);
  };

  const addAssocLink = (competenceTitle: string, aspectTitles: string[]) => {
    if (!currentModule || !competenceTitle || aspectTitles.length === 0) return;
    const key = normalizeTitle(competenceTitle);
    const existing = currentModule.competenceAspectLinks.find(
      (l) => normalizeTitle(l.competenceTitle) === key
    );
    if (existing) {
      const set = new Set(existing.aspectTitles.map(normalizeTitle));
      for (const t of aspectTitles) {
        if (!set.has(normalizeTitle(t))) existing.aspectTitles.push(t);
      }
    } else {
      currentModule.competenceAspectLinks.push({ competenceTitle, aspectTitles: [...aspectTitles] });
    }
  };

  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;

    // --- Mudanças de seção (heading ou título forte) ---
    if (block.kind === 'heading' || block.kind === 'para') {
      if (isProfileDocTitle(text) && !parseModuleHeader(text)) {
        pushModule();
        mode = 'idle';
        continue;
      }
      if (isVisaoGeral(text)) {
        pushModule();
        mode = 'visao';
        visaoText = [];
        continue;
      }
      if (isProfileAspectsSection(text)) {
        pushModule();
        mode = 'profile_aspects';
        continue;
      }
      if (isModuleMapSection(text)) {
        if (visaoText.length > 0) {
          aspects.unshift(
            createGraduateProfileAspect({
              title: 'Visão Geral do Perfil',
              text: visaoText.join('\n\n').trim(),
            })
          );
          visaoText = [];
        }
        mode = 'idle';
        continue;
      }

      const modHeader = parseModuleHeader(text);
      if (modHeader) {
        if (visaoText.length > 0) {
          aspects.unshift(
            createGraduateProfileAspect({
              title: 'Visão Geral do Perfil',
              text: visaoText.join('\n\n').trim(),
            })
          );
          visaoText = [];
        }
        pushModule();
        currentModule = {
          moduleNumber: modHeader.number,
          moduleTitleHint: modHeader.titleHint,
          competences: [],
          saberes: [],
          competenceAspectLinks: [],
        };
        mode = 'module';
        continue;
      }

      if (isCompetenciaGeralHeader(text)) {
        mode = 'skip_geral';
        continue;
      }
      // Associação antes de “Competências do Módulo” (substring do título da seção Associação)
      if (isAssociacaoHeader(text)) {
        mode = 'assoc';
        assocCurrentTitle = null;
        continue;
      }
      if (isCompetenciasMercadoHeader(text)) {
        mode = 'competences_mercado';
        continue;
      }
      if (isSaberesHeader(text)) {
        mode = 'saberes';
        const inline = text.replace(/^saberes?\s*:\s*/i, '').trim();
        if (inline && inline.toLowerCase() !== 'saberes' && currentModule) {
          currentModule.saberes.push(...parseSaberesLine(inline));
        }
        continue;
      }
    }

    // --- Conteúdo ---
    if (mode === 'visao') {
      if (block.kind === 'para' || block.kind === 'item') visaoText.push(text);
      continue;
    }

    if (mode === 'profile_aspects') {
      if (block.kind === 'item' || block.kind === 'para') {
        const split = splitTitleBody(text);
        if (split) {
          aspects.push(
            createGraduateProfileAspect({ title: split.title, text: split.body })
          );
        } else if (text.length > 40) {
          aspects.push(
            createGraduateProfileAspect({
              title: `Aspecto ${aspects.length + 1}`,
              text,
            })
          );
        }
      }
      continue;
    }

    if (mode === 'skip_geral') {
      continue;
    }

    if (mode === 'assoc' && currentModule) {
      if (block.kind === 'item' || block.kind === 'para') {
        const encoded = parseAssocEncodedItem(text);
        if (encoded) {
          addAssocLink(encoded.competenceTitle, encoded.aspectTitles);
          continue;
        }
        // Fallback texto puro: "Título da competência:" seguido de nomes de aspectos
        if (/:\s*$/.test(text) && text.length < 160) {
          assocCurrentTitle = text.replace(/:\s*$/, '').trim();
          continue;
        }
        if (assocCurrentTitle && text.length > 2 && text.length < 160) {
          addAssocLink(assocCurrentTitle, [text.replace(/:\s*$/, '').trim()]);
        }
      }
      continue;
    }

    if (mode === 'competences_mercado' && currentModule) {
      if (block.kind === 'item' || block.kind === 'para') {
        addCompetenceFromItem(text);
      }
      continue;
    }

    if (mode === 'saberes' && currentModule) {
      if (block.kind === 'item' || block.kind === 'para') {
        currentModule.saberes.push(...parseSaberesLine(text));
      }
      continue;
    }
  }

  if (visaoText.length > 0) {
    aspects.unshift(
      createGraduateProfileAspect({
        title: 'Visão Geral do Perfil',
        text: visaoText.join('\n\n').trim(),
      })
    );
  }
  pushModule();

  const cleanedAspects = aspects.filter(
    (a) =>
      !isProfileAspectsSection(a.title) &&
      !isModuleMapSection(a.title) &&
      !isProfileDocTitle(a.title) &&
      (a.title.trim() || a.text.trim())
  );

  if (cleanedAspects.length === 0 && modules.length === 0) {
    warnings.push(
      'Nada reconhecido. Use “Competências e Habilidades do Perfil”, “Módulo I…”, “Competências voltadas ao Mercado” e “Saberes”.'
    );
  } else {
    if (cleanedAspects.length === 0) {
      warnings.push('Nenhum aspecto de perfil encontrado na lista do perfil.');
    }
    if (modules.length === 0) {
      warnings.push('Nenhum bloco de módulo encontrado (ex.: “Módulo I: …”).');
    }
  }

  return { aspects: cleanedAspects, modules, warnings };
}

/** Lê .docx/.doc e devolve aspectos + pedagogia por módulo. */
export async function importProfilePedagogyFromWord(
  file: File
): Promise<ProfileDocImportResult> {
  const buffer = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  const mammoth = await import('mammoth');

  if (name.endsWith('.docx') || isZip(buffer)) {
    const [raw, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }),
      mammoth.convertToHtml({ arrayBuffer: buffer }),
    ]);
    return parseProfilePedagogyDocument({
      html: html.value || '',
      text: raw.value || '',
    });
  }

  if (name.endsWith('.doc')) {
    const { extractFromWord } = await import('./sagaImportService');
    const { text, warnings } = await extractFromWord(buffer, file.name);
    const parsed = parseProfilePedagogyDocument({ text });
    return {
      ...parsed,
      warnings: [
        ...warnings,
        ...parsed.warnings,
        'Arquivo .doc: prefira .docx para títulos e seções mais precisos.',
      ],
    };
  }

  throw new Error('Use um arquivo Word (.docx preferencialmente).');
}

function isZip(data: ArrayBuffer): boolean {
  const u8 = new Uint8Array(data);
  return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b;
}

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Título da competência (parte antes de ":") para casar com a seção Associação. */
export function competenceTitleKey(text: string): string {
  const split = splitTitleBody(text);
  const raw = split?.title ?? text.replace(/:\s*$/, '').trim();
  return normalizeTitle(raw);
}

function resolveAspectIds(
  aspectTitles: string[],
  aspects: GraduateProfileAspect[]
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const title of aspectTitles) {
    const key = normalizeTitle(title);
    const match =
      aspects.find((a) => normalizeTitle(a.title) === key) ||
      aspects.find((a) => {
        const t = normalizeTitle(a.title);
        return t.includes(key) || key.includes(t);
      });
    if (match?.id && !seen.has(match.id)) {
      seen.add(match.id);
      ids.push(match.id);
    }
  }
  return ids;
}

/** Associa bloco importado a um módulo já existente na estrutura. */
export function matchImportedModuleIndex(
  modules: ModuleData[],
  imported: ImportedModulePedagogy
): number {
  if (imported.moduleNumber != null) {
    const byNum = modules.findIndex((m) => m.number === imported.moduleNumber);
    if (byNum >= 0) return byNum;
  }
  const hint = normalizeTitle(imported.moduleTitleHint || '');
  if (hint.length >= 3) {
    const byTitle = modules.findIndex((m) => {
      const t = normalizeTitle(m.title || '');
      return t.includes(hint) || hint.includes(t);
    });
    if (byTitle >= 0) return byTitle;
  }
  return -1;
}

export function saberesToCompetencyCha(
  saberes: Array<{ name: string; column: SaberesColumn }>,
  nomenclature: PedagogicalNomenclature
): CompetencyCHA[] {
  return saberes.map((s, i) => ({
    id: `saber-imp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
    name: s.name,
    category: defaultSaberCategory(s.column, nomenclature),
  }));
}

export function competenceTextsToItems(
  texts: string[],
  options?: {
    links?: Array<{ competenceTitle: string; aspectTitles: string[] }>;
    aspects?: GraduateProfileAspect[];
  }
): ModuleCompetenceItem[] {
  const links = options?.links || [];
  const aspects = options?.aspects || [];

  return texts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => {
      const key = competenceTitleKey(text);
      const link = links.find((l) => {
        const lk = normalizeTitle(l.competenceTitle);
        return lk === key || key.includes(lk) || lk.includes(key);
      });
      const aspectIds = link ? resolveAspectIds(link.aspectTitles, aspects) : [];
      return createModuleCompetenceItem({ text, aspectIds });
    });
}

/** Texto de ajuda exibido na UI (formato sugerido do Word). */
export const PROFILE_DOC_FORMAT_HINT = `Modelo alinhado ao documento de Biomedicina (.docx):

Perfil do Egresso: Curso…

Visão Geral do Perfil
(parágrafo introdutório — vira um aspecto)

Competências e Habilidades do Perfil do Egresso
• Título do aspecto: texto do aspecto…
• Outro aspecto: texto…

Mapeamento por Módulo…

Módulo I: Nome do módulo

Competência Geral do Módulo
(texto — NÃO é cadastrado)

Competências voltadas ao Mercado de Trabalho
• Título da competência: descrição (só o título é cadastrado)
• …

Saberes
• Conceitual: item A; item B; item C
• Procedimental: …
• Atitudinal: …

Associação das Competências do Módulo ao Perfil do Egresso
• Título da competência:
  – Título do aspecto do perfil
  – Outro aspecto…

Módulo II: …
…`;
