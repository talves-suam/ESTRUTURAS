import { Course, DcnDocument, ModalityType, RequirementLevel } from '../types/curriculum';

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
  'Nome Coordenador',
  'E-mail Coordenador',
  'Ato Autorizativo',
  'Laboratório',
  'Clínica',
  'Nome DCN',
  'Link DCN',
] as const;

export function normalizeCourseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove sufixo de modalidade do nome (EAD/Presencial), pois isso vai em campo próprio. */
export function courseBaseName(name: string): string {
  return String(name || '')
    .replace(/\s*\((EAD|Presencial|Semipresencial|A Dist[âa]ncia)\)\s*$/i, '')
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
  const v = raw.trim().toLowerCase();
  if (v === 'presencial') return 'Presencial';
  if (v === 'semipresencial' || v === 'semi-presencial') return 'Semipresencial';
  if (v === 'ead' || v === 'a distância' || v === 'a distancia' || v.includes('distancia')) return 'EAD';
  return undefined;
}

export function parseDegree(raw: string): Course['degrees'] | undefined {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('bacharel')) return 'Bacharelado';
  if (v.startsWith('licenc')) return 'Licenciatura';
  if (v.startsWith('tecnol')) return 'Tecnológico';
  return undefined;
}

export function parseRequirement(raw: string): RequirementLevel | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (v.startsWith('obrig')) return 'Obrigatório';
  if (v.startsWith('opcion')) return 'Opcional';
  if (v.includes('não inform') || v.includes('nao inform') || v === 'ni' || v === '-') {
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
    const u = new URL(url);
    if (!/drive\.google\.com|docs\.google\.com/i.test(u.hostname)) return url;

    const filePath = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (filePath?.[1]) {
      return `https://drive.google.com/file/d/${filePath[1]}/view`;
    }
    const openId = u.searchParams.get('id');
    if (openId) {
      return `https://drive.google.com/file/d/${openId}/view`;
    }
    return url;
  } catch {
    return url;
  }
}

/** URL adequada para embed/iframe do PDF no Google Drive. */
export function googleDrivePreviewUrl(url: string): string | null {
  try {
    const normalized = normalizeGoogleDriveUrl(url);
    const u = new URL(normalized);
    if (!/drive\.google\.com/i.test(u.hostname)) return null;
    const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id');
    if (!id) return null;
    return `https://drive.google.com/file/d/${id}/preview`;
  } catch {
    return null;
  }
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
  if (h === 'curso' || h.includes('nome do curso') || (h === 'nome' && !h.includes('dcn'))) {
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
  // Coluna antiga só "DCN": trata como link (compatibilidade); se também houver Nome DCN, ok
  if (h === 'dcn' || h.includes('diretriz curricular') || (h.includes('dcn') && h.includes('drive'))) {
    return 'dcnLink';
  }
  if (h.includes('dcn')) return 'dcnNome';
  return null;
}

/** Reordena colunas da planilha para a ordem canônica do lote. */
export function normalizeCourseBatchMatrix(matrix: string[][]): string[][] {
  if (matrix.length === 0) return [];

  const headerIdx = findCourseBatchHeaderRowIndex(matrix);
  if (headerIdx < 0) {
    return matrix.filter((row) => row.some((c) => cellToString(c)));
  }

  const headerRow = matrix[headerIdx].map(cellToString);
  const fieldByCol = headerRow.map((h) => mapBatchHeaderToField(h));
  const hasMapped = fieldByCol.some((f) => f !== null);
  if (!hasMapped) {
    return matrix.slice(headerIdx + 1).filter((row) => row.some((c) => cellToString(c)));
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

    if (canonical[0]) out.push(canonical);
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
  const hits = ['curso', 'modalidade', 'grau', 'dcn', 'coordenador', 'carga'].filter((k) =>
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

/** Aplica linhas do lote (já sem cabeçalho) sobre a lista de cursos. */
export function applyCourseBatchRows(
  existing: Course[],
  dataRows: string[][]
): CourseBatchApplyResult {
  const updated = [...existing];
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
      coordinatorNameRaw = '',
      coordinatorEmailRaw = '',
      authorizationActRaw = '',
      laboratorioRaw = '',
      clinicaRaw = '',
      dcnNamesCell = '',
      dcnLinksCell = '',
    ] = parts.map(cellToString);

    if (!nameRaw) continue;

    let dcnNamesRaw = dcnNamesCell;
    let dcnLinksRaw = dcnLinksCell;

    // Compat: planilha antiga com só a coluna DCN (links) na 14ª posição
    if (!dcnLinksRaw && dcnNamesRaw && (/https?:\/\//i.test(dcnNamesRaw) || /drive\.google\.com/i.test(dcnNamesRaw))) {
      dcnLinksRaw = dcnNamesRaw;
      dcnNamesRaw = '';
    }

    // CH mínima: se vier vazia, mantém a do curso existente ou 0 (não descarta a linha — DCNs ainda devem entrar)
    let minTotalHours = parseInt(String(chTotalRaw).replace(/\D/g, ''), 10);
    const courseIndex = updated.findIndex(
      (c) => normalizeCourseName(c.name) === normalizeCourseName(nameRaw)
    );
    if (Number.isNaN(minTotalHours)) {
      minTotalHours = courseIndex !== -1 ? updated[courseIndex].minTotalHours : 0;
    }

    const modality = parseModality(modalityRaw) || 'Presencial';
    const degrees = parseDegree(degreeRaw) || 'Bacharelado';
    const internshipRequirement = parseRequirement(internshipReqRaw) || 'Não Informado';
    const complementaryRequirement = parseRequirement(complementaryReqRaw) || 'Não Informado';
    const finalPaperRequirement = parseRequirement(finalPaperReqRaw) || 'Não Informado';
    const minInternshipHours = parseHoursOrNotInformed(chInternshipRaw);
    const complementaryTotalHours = parseHoursOrNotInformed(chComplementaryRaw);
    const extensionTotalHours = parseHoursOrNotInformed(chExtensionRaw) ?? 0;
    const hasLaboratory = parseYesNoFlag(laboratorioRaw);
    const hasClinical = parseYesNoFlag(clinicaRaw);
    const dcns = parseDcnsFromNameAndLinkCells(dcnNamesRaw, dcnLinksRaw);

    if (courseIndex !== -1) {
      const current = { ...updated[courseIndex] };
      current.name = nameRaw;
      if (modalityRaw) current.modality = modality;
      if (degreeRaw) current.degrees = degrees;
      if (!Number.isNaN(parseInt(String(chTotalRaw).replace(/\D/g, ''), 10))) {
        current.minTotalHours = minTotalHours;
      }
      if (internshipReqRaw) current.internshipRequirement = internshipRequirement;
      if (chInternshipRaw) current.minInternshipHours = minInternshipHours;
      if (chExtensionRaw) current.extensionTotalHours = extensionTotalHours;
      if (complementaryReqRaw) current.complementaryRequirement = complementaryRequirement;
      if (chComplementaryRaw) current.complementaryTotalHours = complementaryTotalHours;
      if (finalPaperReqRaw) current.finalPaperRequirement = finalPaperRequirement;
      if (coordinatorNameRaw) current.coordinatorName = coordinatorNameRaw;
      if (coordinatorEmailRaw) current.coordinatorEmail = coordinatorEmailRaw;
      if (authorizationActRaw) current.authorizationAct = authorizationActRaw;
      if (hasLaboratory !== undefined) current.hasLaboratory = hasLaboratory;
      if (hasClinical !== undefined) current.hasClinical = hasClinical;
      if (dcns.length > 0) {
        current.dcns = dcns;
        current.dcnLink = dcns.map((d) => d.pdfUrl).join(' | ');
        current.activeDcn = dcns.map((d) => d.title).join('; ');
      }
      updated[courseIndex] = current;
      matchedCount++;
    } else {
      const code = generateCourseCodeFromName(nameRaw);
      updated.push({
        id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code,
        name: nameRaw,
        modality,
        degrees,
        minTotalHours,
        internshipRequirement,
        minInternshipHours,
        extensionTotalHours,
        complementaryRequirement,
        complementaryTotalHours,
        finalPaperRequirement,
        coordinatorName: coordinatorNameRaw || '',
        coordinatorEmail: coordinatorEmailRaw || '',
        authorizationAct: authorizationActRaw || '',
        hasLaboratory: hasLaboratory ?? false,
        hasClinical: hasClinical ?? false,
        activeDcn: dcns.length ? dcns.map((d) => d.title).join('; ') : '',
        dcnLink: dcns.map((d) => d.pdfUrl).join(' | '),
        dcns,
        cineBrasilCode: '',
        cineBrasilArea: '',
        minPresentialPercent: 60,
        maxEadPercent: 40,
        minExtensionPercent: 10,
        totalSemesters: 8,
      });
      createdCount++;
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
