import { Course, DcnDocument, ModalityType, RequirementLevel, CurriculumStructure } from '../types/curriculum';
import { normalizeAuthorizationActs } from './authorizationActs';

export const COURSE_BATCH_HEADERS = [
  'Curso',
  'Grau',
  'Modalidade',
  'Carga Horária Mínima',
  'Obrigatoriedade de Estágio Supervisionado',
  'CH Mínima de Estágio Supervisionado',
  'Extensão',
  'Atividade Complementar',
  'CH Mínima de Atividade Complementar',
  'TCC/Projeto Final',
  'Código Cine',
  'Cine Área',
  'Nome Coordenador',
  'E-mail Coordenador',
  'Ato Autorizativo',
  'Laboratório',
  'Clínica',
  'Nome DCN',
  'Link DCN',
] as const;

/** Monta o rótulo CINE exibido na estrutura: "0211D01 - Produção audiovisual..." */
export function formatCineBrasilLabel(code?: string, area?: string): string {
  const c = String(code || '').trim();
  const a = String(area || '').trim();
  if (c && a) return `${c} - ${a}`;
  return c || a || '';
}

/** Separa "código - área" (ou só código / só área) a partir do campo concatenado. */
export function parseCineBrasilLabel(ref?: string): { code: string; area: string } {
  const s = String(ref || '').trim();
  if (!s) return { code: '', area: '' };
  const idx = s.indexOf(' - ');
  if (idx >= 0) {
    return { code: s.slice(0, idx).trim(), area: s.slice(idx + 3).trim() };
  }
  if (/^\d{4}[A-Za-z0-9]+$/.test(s)) return { code: s, area: '' };
  return { code: '', area: s };
}

export function normalizeCourseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove prefixos acadêmicos para casar com o nome cadastrado (ex.: CST em Design Gráfico → Design Gráfico). */
export function stripAcademicCoursePrefix(name: string): string {
  return String(name || '')
    .replace(
      /^(curso\s+superior\s+de\s+tecnologia\s+em|curso\s+superior\s+de\s+tecnologia|cst\s+em|tecn[oó]logo\s+em|tecnologia\s+em|bacharelado\s+em|licenciatura\s+em|curso\s+de\s+gradua[cç][aã]o\s+em|curso\s+de|gradua[cç][aã]o\s+em)\s+/i,
      ''
    )
    .replace(/\s*[—–-]\s*estrutura\s+curricular.*$/i, '')
    .trim();
}

/** Remove sufixo de modalidade do nome (EAD/Presencial), pois isso vai em campo próprio. */
export function courseBaseName(name: string): string {
  return String(name || '')
    .replace(/\s*\((EAD|Presencial|Semipresencial|A Dist[âa]ncia|H[ií]brido)\)\s*$/i, '')
    .trim();
}

export function uniqueCourseOptions(courses: Course[]): { key: string; name: string }[] {
  const map = new Map<string, string>();
  for (const c of courses) {
    const name = courseBaseName(c.name);
    const key = normalizeCourseName(name);
    if (name && !map.has(key)) map.set(key, name);
  }
  return [...map.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Lista completa de cursos para o select (nome + modalidade), sem ocultar variantes. */
export function courseSelectOptions(
  courses: Course[]
): { id: string; label: string }[] {
  return [...courses]
    .sort((a, b) => {
      const byName = courseBaseName(a.name).localeCompare(courseBaseName(b.name), 'pt-BR');
      if (byName !== 0) return byName;
      return a.modality.localeCompare(b.modality, 'pt-BR');
    })
    .map((c) => ({
      id: c.id,
      label: `${courseBaseName(c.name)} (${c.modality})`,
    }));
}

export function resolveCourseByNameAndModality(
  courses: Course[],
  nameOrIdOrKey: string,
  modality: ModalityType
): Course | undefined {
  const byId = courses.find((c) => c.id === nameOrIdOrKey);
  const base = courseBaseName(byId?.name || nameOrIdOrKey);
  const key = normalizeCourseName(base);
  const group = courses.filter((c) => normalizeCourseName(courseBaseName(c.name)) === key);
  if (group.length === 0) return byId;
  return group.find((c) => c.modality === modality) || group[0];
}

/** Curso com mesmo nome-base e mesma modalidade. */
export function findCourseByNameAndModality(
  courses: Course[],
  name: string,
  modality: ModalityType
): Course | undefined {
  const key = normalizeCourseName(stripAcademicCoursePrefix(courseBaseName(name)));
  if (!key) return undefined;
  const group = courses.filter((c) => {
    const ck = normalizeCourseName(stripAcademicCoursePrefix(courseBaseName(c.name)));
    return ck === key || ck.includes(key) || key.includes(ck);
  });
  if (group.length === 0) return undefined;
  return group.find((c) => c.modality === modality) || undefined;
}

/** Qualquer cadastro do mesmo curso (outra modalidade), para clonar parâmetros. */
export function findCourseTemplateByName(courses: Course[], name: string): Course | undefined {
  const key = normalizeCourseName(stripAcademicCoursePrefix(courseBaseName(name)));
  if (!key) return undefined;
  const group = courses.filter((c) => {
    const ck = normalizeCourseName(stripAcademicCoursePrefix(courseBaseName(c.name)));
    return ck === key || ck.includes(key) || key.includes(ck);
  });
  if (group.length === 0) return undefined;
  // Preferência: match exato de nome, senão o primeiro parcial
  const exact = group.find(
    (c) => normalizeCourseName(stripAcademicCoursePrefix(courseBaseName(c.name))) === key
  );
  return exact || group[0];
}

function modalityCodeSuffix(modality: ModalityType): string {
  if (modality === 'EAD') return 'EAD';
  if (modality === 'Semipresencial') return 'SEMI';
  return 'PRES';
}

/**
 * Garante curso na lista para a estrutura: cria se não existir o par nome+modalidade.
 * Se o nome já existir em outra modalidade, clona os dados do cadastro existente.
 */
export function ensureCourseForStructure(
  structure: CurriculumStructure,
  courses: Course[]
): { course: Course; created: boolean; clonedFromModality?: ModalityType } {
  const name = courseBaseName(structure.courseName || '').trim();
  const modality = structure.modality;

  const exact = findCourseByNameAndModality(courses, name, modality);
  if (exact) {
    return { course: exact, created: false };
  }

  const template = findCourseTemplateByName(courses, name);
  const baseCode = template?.code
    ? template.code.replace(/-(EAD|SEMI|PRES)$/i, '')
    : generateCourseCodeFromName(name || 'CURSO');

  const course: Course = {
    id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code: `${baseCode}-${modalityCodeSuffix(modality)}`,
    name: name || 'Curso sem nome',
    modality,
    cineBrasilCode: (() => {
      const fromRef = parseCineBrasilLabel(structure.cineBrasilRef);
      return fromRef.code || template?.cineBrasilCode || '0413A01';
    })(),
    cineBrasilArea: (() => {
      const fromRef = parseCineBrasilLabel(structure.cineBrasilRef);
      return fromRef.area || template?.cineBrasilArea || 'Área Acadêmica Geral';
    })(),
    activeDcn: structure.dcnRef || template?.activeDcn || '',
    dcnLink: template?.dcnLink,
    authorizationAct: structure.authorizationAct || template?.authorizationAct || '',
    authorizationActs:
      structure.authorizationActs || template?.authorizationActs,
    activeAuthorizationActId:
      structure.activeAuthorizationActId || template?.activeAuthorizationActId,
    dcns: structure.dcns || template?.dcns,
    minTotalHours:
      structure.requiredTotalHours || template?.minTotalHours || structure.calculatedTotalHours || 0,
    minPresentialPercent:
      structure.minPresentialHoursPercent ||
      template?.minPresentialPercent ||
      (modality === 'EAD' ? 10 : 60),
    maxEadPercent:
      structure.maxEadHoursPercent || template?.maxEadPercent || (modality === 'EAD' ? 90 : 40),
    minExtensionPercent: structure.minExtensionPercent ?? template?.minExtensionPercent ?? 10,
    minInternshipHours: structure.minInternshipHours ?? template?.minInternshipHours,
    complementaryTotalHours:
      structure.complementaryTotalHours ?? template?.complementaryTotalHours,
    complementaryModality: structure.complementaryModality ?? template?.complementaryModality,
    extensionTotalHours: structure.extensionTotalHours ?? template?.extensionTotalHours,
    extensionModality: structure.extensionModality ?? template?.extensionModality,
    degrees: structure.degrees ?? template?.degrees,
    internshipRequirement: structure.internshipRequirement ?? template?.internshipRequirement,
    complementaryRequirement:
      structure.complementaryRequirement ?? template?.complementaryRequirement,
    finalPaperRequirement: structure.finalPaperRequirement ?? template?.finalPaperRequirement,
    coordinatorName: structure.coordinatorName ?? template?.coordinatorName,
    coordinatorEmail: structure.coordinatorEmail ?? template?.coordinatorEmail,
    totalSemesters: template?.totalSemesters,
    hasLaboratory: structure.hasLaboratory ?? template?.hasLaboratory,
    hasClinical: structure.hasClinical ?? template?.hasClinical,
  };

  return {
    course,
    created: true,
    clonedFromModality: template?.modality,
  };
}

export function generateCourseCodeFromName(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return `CURSO${Date.now().toString().slice(-4)}`;
  if (parts.length === 1) return parts[0].slice(0, 6);
  return parts
    .slice(0, 3)
    .map((p) => p.slice(0, 3))
    .join('')
    .slice(0, 8);
}

export function parseModality(raw: string): ModalityType | undefined {
  const list = parseModalities(raw);
  return list[0];
}

/**
 * Aceita "EaD / Presencial", "Presencial e EAD", etc. — gera um cadastro por modalidade.
 */
export function parseModalities(raw: string): ModalityType[] {
  const v = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!v) return [];
  const hasSemi = /semipresencial|semi[\s-]?presencial|hibrido/.test(v);
  const hasEad = /\bead\b|a\s*distancia|educacao a distancia/.test(v);
  const hasPres = /\bpresencial\b/.test(v);
  if (hasSemi) return ['Semipresencial'];
  if (hasEad && hasPres) return ['Presencial', 'EAD'];
  if (hasEad) return ['EAD'];
  if (hasPres) return ['Presencial'];
  return [];
}

export function parseDegree(raw: string): Course['degrees'] | undefined {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('bacharel')) return 'Bacharelado';
  if (v.startsWith('licenc')) return 'Licenciatura';
  if (v.startsWith('tecnol')) return 'Tecnológico';
  return undefined;
}

export function parseRequirement(raw: string): RequirementLevel | undefined {
  const v = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!v) return undefined;
  if (v.startsWith('obrig')) return 'Obrigatório';
  if (v.startsWith('opcion') || v.startsWith('recomend')) return 'Opcional';
  if (
    v.includes('nao inform') ||
    v.includes('nao defin') ||
    v === 'ni' ||
    v === '-' ||
    v === 'n/a' ||
    v === 'na'
  ) {
    return 'Não Informado';
  }
  return undefined;
}

/** Número ou undefined quando vazio / "Não Informado". */
export function parseHoursOrNotInformed(raw: string): number | undefined {
  const v = String(raw || '').trim();
  if (!v) return undefined;
  const lower = v.toLowerCase();
  if (lower.includes('não inform') || lower.includes('nao inform') || lower === 'ni' || lower === '-') {
    return undefined;
  }
  const n = parseInt(v.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Interpreta Sim/Não (ou x/1) para flags do curso. */
export function parseYesNoFlag(raw: string): boolean | undefined {
  const v = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (!v) return undefined;
  if (/^(s|sim|yes|y|1|x|true|verdadeiro)$/.test(v)) return true;
  if (/^(n|nao|no|0|false|falso)$/.test(v)) return false;
  return undefined;
}

export function parseDcnLinksFromCell(raw: string): DcnDocument[] {
  return parseDcnsFromNameAndLinkCells('', raw);
}

/** Separa nomes de DCN (|, ;, quebra de linha — não parte URLs). */
export function splitDcnNames(raw: string): string[] {
  if (!raw?.trim()) return [];
  return String(raw)
    .replace(/\u00a0/g, ' ')
    .split(/\s*[|\n;]+\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^https?:\/\//i.test(s) && !/drive\.google\.com/i.test(s));
}

/** Extrai apenas URLs de uma célula. */
export function extractUrlsFromCell(raw: string): string[] {
  if (!raw?.trim()) return [];
  const text = String(raw)
    .replace(/\u00a0/g, ' ')
    .replace(/HYPERLINK\s*\(\s*"([^"]+)"/gi, '$1 ')
    .replace(/HYPERLINK\s*\(\s*'([^']+)'/gi, '$1 ');

  const links: string[] = [];
  const pushUrl = (candidate: string) => {
    let url = candidate.trim().replace(/^<|>$/g, '');
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && /(?:drive|docs)\.google\.com/i.test(url)) {
      url = `https://${url.replace(/^\/\//, '')}`;
    }
    if (!/^https?:\/\//i.test(url)) return;
    url = url.replace(/[)\].,;]+$/g, '');
    url = normalizeGoogleDriveUrl(url);
    if (!links.includes(url)) links.push(url);
  };

  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  let match: RegExpExecArray | null;
  while ((match = urlRe.exec(text)) !== null) pushUrl(match[0]);

  const bareDriveRe = /(?:^|[\s,;|])((?:drive|docs)\.google\.com\/[^\s<>"']+)/gi;
  while ((match = bareDriveRe.exec(text)) !== null) pushUrl(match[1]);

  return links;
}

/**
 * Monta DCNs a partir das colunas Nome DCN + Link DCN.
 * Vários itens na mesma linha: nomes e links na mesma ordem.
 */
export function parseDcnsFromNameAndLinkCells(
  namesRaw: string,
  linksRaw: string
): DcnDocument[] {
  const names = splitDcnNames(namesRaw);
  const links = extractUrlsFromCell(linksRaw);

  // Célula única no formato "Nome - url" ou "Nome | url"
  if (names.length === 0 && links.length === 0 && (namesRaw || linksRaw)?.trim()) {
    const combined = `${namesRaw || ''}\n${linksRaw || ''}`.trim();
    const pairRe =
      /([^|\n;]+?)\s*[-–—:|]\s*(https?:\/\/[^\s<>"']+|(?:drive|docs)\.google\.com\/[^\s<>"']+)/gi;
    const paired: DcnDocument[] = [];
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = pairRe.exec(combined)) !== null) {
      const title = m[1].trim();
      let url = m[2].trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      url = normalizeGoogleDriveUrl(url.replace(/[)\].,;]+$/g, ''));
      paired.push(buildDcnDoc(title || `DCN ${idx + 1}`, url, idx));
      idx++;
    }
    if (paired.length) return paired;
  }

  const count = Math.max(names.length, links.length);
  if (count === 0) return [];

  const docs: DcnDocument[] = [];
  for (let i = 0; i < count; i++) {
    const url = links[i] || '';
    const title =
      names[i]?.trim() ||
      (url ? titleFromDcnUrl(url, i) : `DCN ${i + 1}`);
    if (!url && !names[i]) continue;
    docs.push(buildDcnDoc(title, url, i));
  }
  return docs;
}

function buildDcnDoc(title: string, url: string, idx: number): DcnDocument {
  let fileName = `dcn-${idx + 1}.pdf`;
  if (url) {
    try {
      const u = new URL(url);
      const last = decodeURIComponent(u.pathname.split('/').pop() || '');
      if (last && last !== 'view' && last !== 'open' && last !== 'uc') {
        fileName = last.includes('.') ? last : `${last}.pdf`;
      }
    } catch {
      /* ignore */
    }
  }
  return {
    id: `dcn-link-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.length > 120 ? title.slice(0, 117) + '…' : title,
    resolutionNumber: title.slice(0, 60) || `DCN ${idx + 1}`,
    description: /drive\.google\.com|docs\.google\.com/i.test(url)
      ? 'Documento hospedado no Google Drive (vinculado no lote)'
      : url
        ? 'Documento vinculado via link no cadastro em lote'
        : 'DCN informada sem link no lote',
    pdfUrl: url || '',
    fileName,
    isMain: idx === 0,
    uploadedAt: new Date().toISOString(),
  };
}

/** Normaliza links de compartilhamento do Google Drive para URL estável de visualização. */
export function normalizeGoogleDriveUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (!/drive\.google\.com|docs\.google\.com/i.test(u.hostname)) return url.trim();

    const filePath = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (filePath?.[1]) {
      return `https://drive.google.com/file/d/${filePath[1]}/view`;
    }
    const openId = u.searchParams.get('id');
    if (openId) {
      return `https://drive.google.com/file/d/${openId}/view`;
    }
    return url.trim();
  } catch {
    return url.trim();
  }
}

/** Extrai o ID do arquivo no Google Drive (se for link do Drive). */
export function googleDriveFileId(url: string): string | null {
  try {
    const normalized = normalizeGoogleDriveUrl(url);
    const u = new URL(normalized);
    if (!/drive\.google\.com|docs\.google\.com/i.test(u.hostname)) return null;
    return u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id');
  } catch {
    return null;
  }
}

/** URL adequada para embed/iframe do PDF no Google Drive (mostra o documento, não a página do Drive). */
export function googleDrivePreviewUrl(url: string): string | null {
  const id = googleDriveFileId(url);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

/** Download direto do arquivo no Drive (quando compartilhado). */
export function googleDriveDownloadUrl(url: string): string | null {
  const id = googleDriveFileId(url);
  if (!id) return null;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

/**
 * Src do iframe na janela de DCN: preview do Drive, data:URL, ou PDF http direto.
 * Nunca devolve a página /view do Drive (que só mostra “Abrir no Drive”).
 */
export function resolveDcnEmbedUrl(url: string | undefined | null): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  const drivePreview = googleDrivePreviewUrl(raw);
  if (drivePreview) return drivePreview;
  return raw;
}

/** Href para “abrir em nova aba” priorizando o preview embutível do Drive. */
export function resolveDcnOpenUrl(url: string | undefined | null): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  return googleDrivePreviewUrl(raw) || normalizeGoogleDriveUrl(raw) || raw;
}

/** Href de download: uc?export=download no Drive; senão a própria URL. */
export function resolveDcnDownloadUrl(url: string | undefined | null): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  return googleDriveDownloadUrl(raw) || raw;
}

function titleFromDcnUrl(url: string, idx: number): string {
  try {
    const u = new URL(url);
    if (/drive\.google\.com|docs\.google\.com/i.test(u.hostname)) {
      const id =
        u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ||
        u.searchParams.get('id') ||
        '';
      return id ? `DCN ${idx + 1} (Google Drive)` : `DCN ${idx + 1}`;
    }
    const last = decodeURIComponent(u.pathname.split('/').pop() || '');
    if (last && last !== 'view' && last !== 'open') {
      const title = last.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
      if (title) return title.length > 80 ? `DCN ${idx + 1}` : title;
    }
  } catch {
    /* ignore */
  }
  return `DCN ${idx + 1}`;
}

export type CourseBatchField =
  | 'curso'
  | 'grau'
  | 'modalidade'
  | 'chMinima'
  | 'estagioReq'
  | 'chEstagio'
  | 'extensao'
  | 'ativCompReq'
  | 'chAtivComp'
  | 'tcc'
  | 'cineCodigo'
  | 'cineArea'
  | 'coordenador'
  | 'email'
  | 'ato'
  | 'laboratorio'
  | 'clinica'
  | 'dcnNome'
  | 'dcnLink';

/** Identifica o campo da planilha pelo texto do cabeçalho. */
export function mapBatchHeaderToField(header: string): CourseBatchField | null {
  const h = header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (!h) return null;
  if (h === 'curso' || h.includes('nome do curso') || (h === 'nome' && !h.includes('dcn') && !h.includes('coordenador'))) {
    return 'curso';
  }
  if (h.includes('grau') || h.includes('titulacao')) return 'grau';
  if (h.includes('modalidade')) return 'modalidade';
  if (
    (h.includes('carga horaria minima') || h.includes('ch minima') || h === 'ch' || h.includes('ch total')) &&
    !h.includes('estagio') &&
    !h.includes('ativ') &&
    !h.includes('complement')
  ) {
    return 'chMinima';
  }
  if (h.includes('obrigatoriedade') && h.includes('estagio')) return 'estagioReq';
  if ((h.includes('ch') || h.includes('carga')) && h.includes('estagio')) return 'chEstagio';
  if (h.includes('estagio') && (h.includes('obrig') || h.includes('opcion'))) return 'estagioReq';
  // Planilha do gestor: "ESTÁGIO SUPERVIOSIONADO" / "ESTÁGIO SUPERVISIONADO" (só o requisito)
  if (
    h.includes('estagio') &&
    !h.includes('ch') &&
    !h.includes('carga') &&
    !h.includes('hora') &&
    !h.includes('minima')
  ) {
    return 'estagioReq';
  }
  if (h === 'extensao' || (h.includes('extensao') && !h.includes('ch'))) return 'extensao';
  if (h.includes('extensao') && (h.includes('ch') || h.includes('carga') || h.includes('hora'))) {
    return 'extensao';
  }
  if (h.includes('atividade complementar') && !h.includes('ch') && !h.includes('carga')) {
    return 'ativCompReq';
  }
  if ((h.includes('ativ') && h.includes('comp')) && (h.includes('ch') || h.includes('carga') || h.includes('minima'))) {
    return 'chAtivComp';
  }
  if (h.includes('ativ') && h.includes('comp') && (h.includes('obrig') || h.includes('opcion'))) {
    return 'ativCompReq';
  }
  if (h.includes('tcc') || h.includes('projeto final') || h.includes('trabalho de conclusao')) {
    return 'tcc';
  }
  if (
    (h.includes('codigo') && h.includes('cine')) ||
    h === 'codigo cine' ||
    h === 'cine codigo' ||
    h === 'cine code'
  ) {
    return 'cineCodigo';
  }
  if (
    (h.includes('cine') && h.includes('area')) ||
    h === 'cine area' ||
    h === 'area cine' ||
    h === 'cine brasil area'
  ) {
    return 'cineArea';
  }
  if (h.includes('coordenador') && h.includes('mail')) return 'email';
  if (h.includes('e-mail') || h.includes('email')) return 'email';
  if (h.includes('coordenador') || h.includes('coord.')) return 'coordenador';
  if (h.includes('ato autoriz') || h.includes('autorizativo') || h === 'ato') return 'ato';
  if (h.includes('laboratorio') || h === 'lab') return 'laboratorio';
  if (h.includes('clinica')) return 'clinica';

  // Nome DCN (identificação) — antes do link genérico
  if (
    (h.includes('nome') && h.includes('dcn')) ||
    h.includes('qual dcn') ||
    h.includes('identificacao dcn') ||
    h.includes('titulo dcn') ||
    h.includes('dcn nome') ||
    h === 'nome dcn'
  ) {
    return 'dcnNome';
  }
  if (
    h.includes('link dcn') ||
    h.includes('links dcn') ||
    h.includes('url dcn') ||
    h.includes('dcn link') ||
    (h.includes('drive') && h.includes('dcn')) ||
    h === 'link' ||
    (h.includes('link') && h.includes('dcn'))
  ) {
    return 'dcnLink';
  }
  // Coluna "DCN" do gestor costuma trazer nomes de PDF (não URL) → trata como nome
  if (h === 'dcn' || h.includes('diretriz curricular')) {
    return 'dcnNome';
  }
  if (h.includes('dcn') && h.includes('drive')) {
    return 'dcnLink';
  }
  if (h.includes('dcn')) return 'dcnNome';
  return null;
}

/** Planilha de matriz curricular (módulos/CH) — não é carga de cursos. */
export function looksLikeEstruturaMatrixForCourses(matrix: string[][]): boolean {
  if (matrix.length < 3) return false;
  const head = matrix
    .slice(0, 12)
    .map((r) => r.map(cellToString).join(' '))
    .join('\n')
    .toLowerCase();
  const hasModule = /m[oó]dulo\s+([ivxlcdm]+|\d+)/i.test(head);
  const hasEstrutura = /estrutura\s+curricular/i.test(head);
  const hasHourCols =
    /a\s*dist[aâ]ncia/i.test(head) && /presencial/i.test(head) && /te[oó]rico|pr[aá]tico|total/i.test(head);
  const courseHeader = findCourseBatchHeaderRowIndex(matrix) >= 0;
  if (courseHeader) return false;
  return hasModule || (hasEstrutura && hasHourCols) || (hasEstrutura && hasModule);
}

/** Nome que claramente não é curso de graduação. */
export function isJunkCourseBatchName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^m[oó]dulo\s+/i.test(n)) return true;
  if (/^estrutura\s+curricular/i.test(n)) return true;
  if (/^(total|subtotal|resumo|conhecimento|conhecimentos|componentes?|percentual|hora-?rel[oó]gio)$/i.test(n)) {
    return true;
  }
  if (/^(presencial|a\s*dist[aâ]ncia|te[oó]rico|pr[aá]tico|te[oó]rico-pr[aá]tico)$/i.test(n)) {
    return true;
  }
  if (/^extens[aã]o\s+[ivxlcdm\d]/i.test(n)) return true;
  return false;
}

/** Reordena colunas da planilha para a ordem canônica do lote. */
export function normalizeCourseBatchMatrix(matrix: string[][]): string[][] {
  if (matrix.length === 0) return [];

  if (looksLikeEstruturaMatrixForCourses(matrix)) {
    return [];
  }

  const headerIdx = findCourseBatchHeaderRowIndex(matrix);
  // Sem cabeçalho de cursos: não trata nomes de disciplina/módulo como curso
  if (headerIdx < 0) {
    return [];
  }

  const headerRow = matrix[headerIdx].map(cellToString);
  const fieldByCol = headerRow.map((h) => mapBatchHeaderToField(h));
  const hasMapped = fieldByCol.some((f) => f !== null);
  if (!hasMapped) {
    return [];
  }

  const ordered: CourseBatchField[] = [
    'curso',
    'grau',
    'modalidade',
    'chMinima',
    'estagioReq',
    'chEstagio',
    'extensao',
    'ativCompReq',
    'chAtivComp',
    'tcc',
    'cineCodigo',
    'cineArea',
    'coordenador',
    'email',
    'ato',
    'laboratorio',
    'clinica',
    'dcnNome',
    'dcnLink',
  ];

  const out: string[][] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (!row.some((c) => cellToString(c))) continue;

    const byField: Partial<Record<CourseBatchField, string[]>> = {};
    fieldByCol.forEach((field, colIdx) => {
      if (!field) return;
      const value = cellToString(row[colIdx]);
      if (!value) return;
      if (!byField[field]) byField[field] = [];
      byField[field]!.push(value);
    });

    // Se não há link DCN, procura URLs na linha (exceto células já usadas como nome)
    if (!byField.dcnLink?.length) {
      const scanned = row
        .map(cellToString)
        .filter((v) => /https?:\/\//i.test(v) || /drive\.google\.com/i.test(v));
      if (scanned.length) byField.dcnLink = scanned;
    }

    const canonical = ordered.map((field) => {
      const values = byField[field] || [];
      if (field === 'dcnNome' || field === 'dcnLink') return values.join('\n');
      return values[0] || '';
    });

    if (canonical[0] && !isJunkCourseBatchName(canonical[0])) out.push(canonical);
  }

  return out;
}

export function formatHoursDisplay(value: number | undefined): string {
  return value === undefined || value === null ? 'Não Informado' : String(value);
}

export function formatRequirementDisplay(value: RequirementLevel | undefined): string {
  return value || 'Não Informado';
}

export function summarizeCourseDcns(course: Course): string {
  if (course.dcns && course.dcns.length > 0) {
    return course.dcns.map((d, i) => `${i + 1}. ${d.title || d.fileName || d.pdfUrl}`).join(' | ');
  }
  if (course.dcnLink) return course.dcnLink;
  if (course.activeDcn) return course.activeDcn;
  return 'Nenhuma DCN vinculada';
}

/** Texto de exibição das DCNs (títulos de apresentação; não usa nome de arquivo). */
export function formatDcnsDisplayLabel(
  dcns?: DcnDocument[] | null,
  fallback?: string
): string {
  if (dcns && dcns.length > 0) {
    const labels = dcns
      .map((d) => {
        const title = (d.title || '').trim();
        const resolution = (d.resolutionNumber || '').trim();
        // Prefere título; se título for só o .pdf, tenta resolução
        if (title && !/\.pdf$/i.test(title)) return title;
        if (resolution && !/\.pdf$/i.test(resolution)) return resolution;
        if (title) return title.replace(/\.pdf$/i, '').trim();
        return resolution.replace(/\.pdf$/i, '').trim();
      })
      .filter(Boolean);
    if (labels.length > 0) return labels.join('; ');
  }
  const fb = (fallback || '').trim();
  return fb || '—';
}

/** Atualiza o campo de referência a partir da lista de DCNs (nomes alterados). */
export function dcnsToRefString(dcns: DcnDocument[]): string {
  const label = formatDcnsDisplayLabel(dcns, '');
  return label === '—' ? '' : label;
}

/** Preferência: DCNs (e nomes) do curso vinculado, para o cabeçalho oficial. */
export function structureWithCourseDcns(
  structure: CurriculumStructure,
  courses: Course[]
): CurriculumStructure {
  if (!courses?.length) return structure;
  const course =
    (structure.courseId && courses.find((c) => c.id === structure.courseId)) ||
    courses.find(
      (c) =>
        courseBaseName(c.name) === courseBaseName(structure.courseName) &&
        c.modality === structure.modality
    );
  if (!course?.dcns?.length) return structure;
  const nextRef = dcnsToRefString(course.dcns);
  return {
    ...structure,
    dcns: course.dcns,
    dcnRef: nextRef || structure.dcnRef,
  };
}


export function courseDcnLinksCell(course: Course): string {
  if (course.dcns && course.dcns.length > 0) {
    return course.dcns.map((d) => d.pdfUrl).filter(Boolean).join(', ');
  }
  return course.dcnLink || '';
}

export function courseDcnNamesCell(course: Course): string {
  if (course.dcns && course.dcns.length > 0) {
    return course.dcns.map((d) => d.title || d.resolutionNumber || d.fileName || '').filter(Boolean).join(' | ');
  }
  return course.activeDcn || '';
}

export function courseToBatchRow(course: Course): (string | number)[] {
  return [
    course.name || '',
    course.degrees || 'Bacharelado',
    course.modality || 'Presencial',
    course.minTotalHours ?? 0,
    formatRequirementDisplay(course.internshipRequirement),
    formatHoursDisplay(course.minInternshipHours),
    formatHoursDisplay(course.extensionTotalHours),
    formatRequirementDisplay(course.complementaryRequirement),
    formatHoursDisplay(course.complementaryTotalHours),
    formatRequirementDisplay(course.finalPaperRequirement),
    course.cineBrasilCode || '',
    course.cineBrasilArea || '',
    course.coordinatorName || '',
    course.coordinatorEmail || '',
    course.authorizationAct || '',
    course.hasLaboratory ? 'Sim' : 'Não',
    course.hasClinical ? 'Sim' : 'Não',
    courseDcnNamesCell(course),
    courseDcnLinksCell(course),
  ];
}

export function isCourseBatchHeaderRow(parts: string[]): boolean {
  const joined = parts
    .map((p) =>
      cellToString(p)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    )
    .join(' | ');
  const first = (parts[0] ? cellToString(parts[0]) : '').toLowerCase();
  if (first.includes('curso') || first === 'nome') return true;
  // Cabeçalho típico do relatório mesmo se a 1ª coluna não for "Curso"
  const hits = ['curso', 'modalidade', 'grau', 'dcn', 'coordenador', 'carga', 'cine'].filter((k) =>
    joined.includes(k)
  );
  return hits.length >= 2;
}

/** Localiza a linha de cabeçalho em uma matriz (pula títulos do modelo). */
export function findCourseBatchHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (isCourseBatchHeaderRow(rows[i] || [])) return i;
  }
  return -1;
}

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

export interface CourseBatchApplyResult {
  courses: Course[];
  matchedCount: number;
  createdCount: number;
}

function courseBatchMatchIndex(
  list: Course[],
  name: string,
  modality: ModalityType,
  degrees: Course['degrees']
): number {
  const key = normalizeCourseName(name);
  return list.findIndex(
    (c) =>
      normalizeCourseName(c.name) === key &&
      c.modality === modality &&
      (c.degrees || 'Bacharelado') === (degrees || 'Bacharelado')
  );
}

function stampCourseNow<T extends Course>(course: T): T {
  const now = new Date().toISOString();
  return {
    ...course,
    updatedAt: now,
    createdAt: course.createdAt || now,
  };
}

/** Aplica linhas do lote (já sem cabeçalho) sobre a lista de cursos. */
export function applyCourseBatchRows(
  existing: Course[],
  dataRows: string[][],
  opts?: { replace?: boolean }
): CourseBatchApplyResult {
  const updated: Course[] = opts?.replace ? [] : [...existing];
  let matchedCount = 0;
  let createdCount = 0;

  for (const parts of dataRows) {
    const [
      nameRaw = '',
      degreeRaw = '',
      modalityRaw = '',
      chTotalRaw = '',
      internshipReqRaw = '',
      chInternshipRaw = '',
      chExtensionRaw = '',
      complementaryReqRaw = '',
      chComplementaryRaw = '',
      finalPaperReqRaw = '',
      cineCodigoRaw = '',
      cineAreaRaw = '',
      coordinatorNameRaw = '',
      coordinatorEmailRaw = '',
      authorizationActRaw = '',
      laboratorioRaw = '',
      clinicaRaw = '',
      dcnNamesCell = '',
      dcnLinksCell = '',
    ] = parts.map(cellToString);

    if (!nameRaw || isJunkCourseBatchName(nameRaw)) continue;

    let dcnNamesRaw = dcnNamesCell;
    let dcnLinksRaw = dcnLinksCell;

    // Compat: planilha antiga com só a coluna DCN (links) na posição de nomes
    if (
      !dcnLinksRaw &&
      dcnNamesRaw &&
      (/https?:\/\//i.test(dcnNamesRaw) || /drive\.google\.com/i.test(dcnNamesRaw))
    ) {
      dcnLinksRaw = dcnNamesRaw;
      dcnNamesRaw = '';
    }

    const parsedCh = parseInt(String(chTotalRaw).replace(/\D/g, ''), 10);
    const degrees = parseDegree(degreeRaw) || 'Bacharelado';
    const modalities = parseModalities(modalityRaw);
    const modalityList: ModalityType[] =
      modalities.length > 0 ? modalities : ['Presencial'];

    const internshipRequirement = parseRequirement(internshipReqRaw) || 'Não Informado';
    const complementaryRequirement = parseRequirement(complementaryReqRaw) || 'Não Informado';
    const finalPaperRequirement = parseRequirement(finalPaperReqRaw) || 'Não Informado';
    const minInternshipHours = parseHoursOrNotInformed(chInternshipRaw);
    const complementaryTotalHours = parseHoursOrNotInformed(chComplementaryRaw);
    const extensionTotalHours = parseHoursOrNotInformed(chExtensionRaw) ?? 0;
    const hasLaboratory = parseYesNoFlag(laboratorioRaw);
    const hasClinical = parseYesNoFlag(clinicaRaw);
    const dcns = parseDcnsFromNameAndLinkCells(dcnNamesRaw, dcnLinksRaw);

    for (const modality of modalityList) {
      const courseIndex = courseBatchMatchIndex(updated, nameRaw, modality, degrees);
      let minTotalHours = parsedCh;
      if (Number.isNaN(minTotalHours)) {
        minTotalHours = courseIndex !== -1 ? updated[courseIndex].minTotalHours : 0;
      }

      if (courseIndex !== -1) {
        const current = { ...updated[courseIndex] };
        current.name = nameRaw;
        current.modality = modality;
        if (degreeRaw) current.degrees = degrees;
        if (!Number.isNaN(parsedCh)) current.minTotalHours = minTotalHours;
        if (internshipReqRaw) current.internshipRequirement = internshipRequirement;
        if (chInternshipRaw) current.minInternshipHours = minInternshipHours;
        if (chExtensionRaw) current.extensionTotalHours = extensionTotalHours;
        if (complementaryReqRaw) current.complementaryRequirement = complementaryRequirement;
        if (chComplementaryRaw) current.complementaryTotalHours = complementaryTotalHours;
        if (finalPaperReqRaw) current.finalPaperRequirement = finalPaperRequirement;
        if (cineCodigoRaw) current.cineBrasilCode = cineCodigoRaw;
        if (cineAreaRaw) current.cineBrasilArea = cineAreaRaw;
        if (coordinatorNameRaw) current.coordinatorName = coordinatorNameRaw;
        if (coordinatorEmailRaw) current.coordinatorEmail = coordinatorEmailRaw;
        if (authorizationActRaw) {
          current.authorizationAct = authorizationActRaw;
          if (!(current.authorizationActs || []).length) {
            const normalized = normalizeAuthorizationActs({
              authorizationAct: authorizationActRaw,
            });
            current.authorizationActs = normalized.authorizationActs;
            current.activeAuthorizationActId = normalized.activeAuthorizationActId;
          }
        }
        if (hasLaboratory !== undefined) current.hasLaboratory = hasLaboratory;
        if (hasClinical !== undefined) current.hasClinical = hasClinical;
        if (dcns.length > 0) {
          current.dcns = dcns;
          current.dcnLink = dcns.map((d) => d.pdfUrl).filter(Boolean).join(' | ');
          current.activeDcn = dcns.map((d) => d.title).filter(Boolean).join('; ');
        } else if (dcnNamesRaw && !current.activeDcn) {
          current.activeDcn = dcnNamesRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('; ');
        }
        // Percentuais padrão por modalidade
        if (modality === 'EAD') {
          current.minPresentialPercent = current.minPresentialPercent || 10;
          current.maxEadPercent = current.maxEadPercent || 90;
        } else if (!current.minPresentialPercent) {
          current.minPresentialPercent = 60;
          current.maxEadPercent = current.maxEadPercent || 40;
        }
        updated[courseIndex] = stampCourseNow(current);
        matchedCount++;
      } else {
        const codeBase = generateCourseCodeFromName(nameRaw);
        const suffix =
          modality === 'EAD' ? '-EAD' : modality === 'Semipresencial' ? '-SEMI' : '';
        const now = new Date().toISOString();
        updated.push(
          stampCourseNow({
            id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            code: `${codeBase}${suffix}`,
            name: nameRaw,
            modality,
            degrees,
            minTotalHours: Number.isNaN(minTotalHours) ? 0 : minTotalHours,
            internshipRequirement,
            minInternshipHours,
            extensionTotalHours,
            complementaryRequirement,
            complementaryTotalHours,
            finalPaperRequirement,
            coordinatorName: coordinatorNameRaw || '',
            coordinatorEmail: coordinatorEmailRaw || '',
            authorizationAct: authorizationActRaw || '',
            authorizationActs: authorizationActRaw
              ? normalizeAuthorizationActs({ authorizationAct: authorizationActRaw })
                  .authorizationActs
              : [],
            activeAuthorizationActId: authorizationActRaw
              ? normalizeAuthorizationActs({ authorizationAct: authorizationActRaw })
                  .activeAuthorizationActId
              : undefined,
            hasLaboratory: hasLaboratory ?? false,
            hasClinical: hasClinical ?? false,
            activeDcn:
              dcns.length > 0
                ? dcns.map((d) => d.title).filter(Boolean).join('; ')
                : dcnNamesRaw
                  ? dcnNamesRaw
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join('; ')
                  : '',
            dcnLink: dcns.map((d) => d.pdfUrl).filter(Boolean).join(' | '),
            dcns,
            cineBrasilCode: cineCodigoRaw || '',
            cineBrasilArea: cineAreaRaw || '',
            minPresentialPercent: modality === 'EAD' ? 10 : 60,
            maxEadPercent: modality === 'EAD' ? 90 : 40,
            minExtensionPercent: 10,
            totalSemesters: 8,
            createdAt: now,
          })
        );
        createdCount++;
      }
    }
  }

  return { courses: updated, matchedCount, createdCount };
}

/** Converte texto colado (CSV/TSV/; ) em linhas de dados. */
export function parseCourseBatchText(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const matrix = lines.map((line) => {
    if (line.includes('\t')) return line.split('\t').map((p) => p.trim());
    if (line.includes(';')) return line.split(';').map((p) => p.trim());
    // Não partir por vírgula se a linha tem URLs (vírgulas em querystring ou entre links)
    if (/https?:\/\//i.test(line) || /drive\.google\.com/i.test(line)) {
      // Tenta manter colunas por ; já tratado; se só vírgulas entre campos sem URL no meio...
      return line.split(';').map((p) => p.trim());
    }
    return line.split(',').map((p) => p.trim());
  });

  return normalizeCourseBatchMatrix(matrix);
}
