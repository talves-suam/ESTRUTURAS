import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { CurriculumStructure, Course, AppSettings, ReportNoteBlock, getDisciplineChBreakdown, withStructurePresentialFlags } from '../types/curriculum';
import { initialSettings } from '../data/initialData';
import { normalizeReportNotesTitle } from './reportNotes';
import { getModularComponents, syncModuleKnowledgesToDisciplines } from '../utils/modularComponents';
import { moduleCountsTowardStructureTotals } from '../utils/modularBranches';
import { trackFirestoreOp } from './firestoreUsage';

const STRUCTURES_COLLECTION = 'curriculum_structures';
const COURSES_COLLECTION = 'curriculum_courses';
const SETTINGS_DOC = 'app_settings';

const LOCAL_STORAGE_STRUCTURES_KEY = 'unisuam_curriculum_structures';
const LOCAL_STORAGE_COURSES_KEY = 'unisuam_curriculum_courses';
const LOCAL_STORAGE_SETTINGS_KEY = 'unisuam_app_settings';

function canUseFirestore(): boolean {
  return isFirebaseConfigured && db !== null;
}

/**
 * Remove PDFs/base64 embutidos (data:) para caber no Spark e evitar docs gigantes.
 * O arquivo original continua só no navegador/localStorage se existir.
 */
function stripHeavyFields(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > 4096) return '';
    if (value.length > 900_000) return value.slice(0, 900_000);
    return value;
  }
  if (Array.isArray(value)) return value.map(stripHeavyFields);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripHeavyFields(v);
    }
    return out;
  }
  return value;
}

function toFirestorePayload(item: object): Record<string, unknown> {
  return stripHeavyFields(JSON.parse(JSON.stringify(item))) as Record<string, unknown>;
}

export function firestoreErrorMessage(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
  const message = err instanceof Error ? err.message : String(err);
  if (code.includes('permission-denied') || /permission/i.test(message)) {
    return 'O banco recusou a escrita. No Firebase, abra Firestore → Regras, cole as regras de teste e clique em Publicar.';
  }
  if (code.includes('not-found') || /not found|404/i.test(message)) {
    return 'O Firestore ainda não existe. No Console do Firebase: Build → Firestore Database → Criar banco (modo de teste).';
  }
  if (code.includes('resource-exhausted') || /resource.?exhausted|quota/i.test(message)) {
    return 'Cota do plano Spark esgotada por hoje. Evite reenviar toda a base; tente amanhã ou ative o Blaze com alerta de R$ 0,01.';
  }
  return message || 'Falha ao falar com o servidor.';
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    reportNotesTitle: normalizeReportNotesTitle(settings.reportNotesTitle),
    reportNotesDisciplinar: Array.isArray(settings.reportNotesDisciplinar)
      ? settings.reportNotesDisciplinar
      : [],
    reportNotesModular: Array.isArray(settings.reportNotesModular)
      ? settings.reportNotesModular
      : [],
  };
}

/** Conteúdo “útil” das observações (ignora blocos vazios). */
function notesContentScore(blocks?: ReportNoteBlock[]): number {
  if (!Array.isArray(blocks) || blocks.length === 0) return 0;
  return blocks.reduce((acc, b) => {
    const t = `${b?.title || ''} ${b?.text || ''}`.trim();
    return acc + (t ? t.length + 1 : 0);
  }, 0);
}

/**
 * Une settings remoto + local.
 * Observações: nunca deixa um lado vazio apagar o outro com conteúdo.
 */
function mergeAppSettings(
  remote: AppSettings | null | undefined,
  local: AppSettings | null | undefined
): AppSettings {
  const r = remote ? normalizeAppSettings(remote) : null;
  const l = local ? normalizeAppSettings(local) : null;
  if (!r && !l) return normalizeAppSettings(initialSettings);
  if (!r) return l!;
  if (!l) return r;

  const pickNotes = (
    remoteBlocks?: ReportNoteBlock[],
    localBlocks?: ReportNoteBlock[]
  ): ReportNoteBlock[] => {
    const rScore = notesContentScore(remoteBlocks);
    const lScore = notesContentScore(localBlocks);
    if (lScore > 0 && rScore === 0) return localBlocks || [];
    if (rScore > 0 && lScore === 0) return remoteBlocks || [];
    if (lScore >= rScore) return localBlocks || remoteBlocks || [];
    return remoteBlocks || localBlocks || [];
  };

  const remoteTitle = normalizeReportNotesTitle(r.reportNotesTitle);
  const localTitle = normalizeReportNotesTitle(l.reportNotesTitle);
  const defaultTitle = normalizeReportNotesTitle(undefined);
  const title =
    localTitle !== defaultTitle
      ? localTitle
      : remoteTitle !== defaultTitle
        ? remoteTitle
        : localTitle;

  return normalizeAppSettings({
    ...r,
    ...l,
    reportNotesTitle: title,
    reportNotesDisciplinar: pickNotes(r.reportNotesDisciplinar, l.reportNotesDisciplinar),
    reportNotesModular: pickNotes(r.reportNotesModular, l.reportNotesModular),
  });
}

function readLocalList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function itemTimestamp(item: { updatedAt?: string; createdAt?: string }): number {
  return Date.parse(item.updatedAt || item.createdAt || '') || 0;
}

/** Une listas por id. Em conflito, o local prevalece se for mais novo ou igual. */
function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  remote: T[],
  local: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of remote) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of local) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev || itemTimestamp(item) >= itemTimestamp(prev)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

async function fetchFirestoreList<T extends { id?: string }>(
  collectionName: string
): Promise<T[] | null> {
  if (!canUseFirestore()) return null;
  try {
    const snapshot = await getDocs(collection(db!, collectionName));
    trackFirestoreOp('read', Math.max(snapshot.size, 1));
    const items: T[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as T;
      items.push({ ...data, id: (data.id as string | undefined) || d.id });
    });
    return items;
  } catch (err) {
    console.warn(`Firestore indisponível (${collectionName}), usando cache local`, err);
    return null;
  }
}

async function upsertFirestoreDocs<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (!canUseFirestore() || items.length === 0) return;
  try {
    for (const item of items) {
      await setDoc(doc(db!, collectionName, item.id), toFirestorePayload(item));
      trackFirestoreOp('write', 1);
    }
  } catch (err) {
    console.error(`Erro ao gravar ${collectionName} no Firestore`, err);
    throw new Error(firestoreErrorMessage(err));
  }
}

function cacheList<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.error('Error saving to localStorage', err);
  }
}

/** Teste só com leitura — não gasta escrita no Spark. */
export async function testFirestoreConnection(): Promise<void> {
  if (!canUseFirestore()) {
    throw new Error('O Firebase não inicializou. Confira o firebaseConfig colado.');
  }
  try {
    const snap = await getDoc(doc(db!, 'settings', SETTINGS_DOC));
    trackFirestoreOp('read', 1);
    void snap;
  } catch (err) {
    throw new Error(firestoreErrorMessage(err));
  }
}

export async function pushLocalCacheToServer(): Promise<void> {
  if (!canUseFirestore()) {
    throw new Error('Servidor ainda não está conectado.');
  }
  const structures = readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY);
  const courses = readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY);
  const remoteStructures =
    (await fetchFirestoreList<CurriculumStructure>(STRUCTURES_COLLECTION)) || [];
  const remoteCourses = (await fetchFirestoreList<Course>(COURSES_COLLECTION)) || [];
  // Sobe só o que falta ou está mais novo — evita reescrever a coleção inteira.
  await syncMissingOrNewerToFirestore(STRUCTURES_COLLECTION, remoteStructures, structures);
  await syncMissingOrNewerToFirestore(COURSES_COLLECTION, remoteCourses, courses);
  const settings = getCachedSettings();
  if (settings) {
    await setDoc(doc(db!, 'settings', SETTINGS_DOC), toFirestorePayload(settings), { merge: true });
    trackFirestoreOp('write', 1);
  }
}

export function subscribeCurriculumData(handlers: {
  onStructures: (items: CurriculumStructure[]) => void;
  onCourses: (items: Course[]) => void;
  onError?: (err: Error) => void;
}): () => void {
  if (!canUseFirestore()) {
    handlers.onStructures(getCachedStructures());
    handlers.onCourses(getCachedCourses());
    return () => {};
  }

  let offeredLocalStructures = false;
  let offeredLocalCourses = false;

  const unsubStructures = onSnapshot(
    collection(db!, STRUCTURES_COLLECTION),
    (snapshot) => {
      const items: CurriculumStructure[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as CurriculumStructure;
        items.push({ ...data, id: data.id || d.id });
      });
      trackFirestoreOp('read', Math.max(snapshot.docChanges().length, 1));
      const local = readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY);

      // Remoto vazio + local com dados → sobe o local (uma vez) e não apaga o cache
      if (items.length === 0 && local.length > 0) {
        if (!offeredLocalStructures) {
          offeredLocalStructures = true;
          void upsertFirestoreDocs(STRUCTURES_COLLECTION, local).catch((err) =>
            handlers.onError?.(new Error(firestoreErrorMessage(err)))
          );
        }
        const withTotals = local.map((s) => calculateStructureTotals(s));
        handlers.onStructures(withTotals);
        return;
      }

      const merged = mergeById(items, local);
      const withTotals = merged.map((s) => calculateStructureTotals(s));
      cacheList(LOCAL_STORAGE_STRUCTURES_KEY, withTotals);
      handlers.onStructures(withTotals);
      void syncMissingOrNewerToFirestore(STRUCTURES_COLLECTION, items, merged).catch((err) =>
        handlers.onError?.(new Error(firestoreErrorMessage(err)))
      );
    },
    (err) => handlers.onError?.(new Error(firestoreErrorMessage(err)))
  );

  const unsubCourses = onSnapshot(
    collection(db!, COURSES_COLLECTION),
    (snapshot) => {
      const items: Course[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as Course;
        items.push({ ...data, id: data.id || d.id });
      });
      trackFirestoreOp('read', Math.max(snapshot.docChanges().length, 1));
      const local = readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY);

      // Remoto vazio + local com dados → sobe o local; NUNCA sobrescreve o cache com []
      if (items.length === 0 && local.length > 0) {
        if (!offeredLocalCourses) {
          offeredLocalCourses = true;
          void upsertFirestoreDocs(COURSES_COLLECTION, local).catch((err) =>
            handlers.onError?.(new Error(firestoreErrorMessage(err)))
          );
        }
        handlers.onCourses(local);
        return;
      }

      const merged = mergeById(items, local);
      cacheList(LOCAL_STORAGE_COURSES_KEY, merged);
      handlers.onCourses(merged);
      void syncMissingOrNewerToFirestore(COURSES_COLLECTION, items, merged).catch((err) =>
        handlers.onError?.(new Error(firestoreErrorMessage(err)))
      );
    },
    (err) => handlers.onError?.(new Error(firestoreErrorMessage(err)))
  );

  return () => {
    unsubStructures();
    unsubCourses();
  };
}

export function calculateStructureTotals(structure: CurriculumStructure): CurriculumStructure {
  let totalHours = 0;
  let coreHours = 0; // Somente Obrigatória + Eletiva (conta para CH mínima do curso)
  let presentialHours = 0;
  let eadHours = 0;
  let extensionHours = 0;
  let internshipHours = 0;
  let totalCredits = 0;
  let syncedModules = structure.modules;

  if (structure.structureType === 'disciplinar' && structure.periods) {
    structure.periods.forEach((period) => {
      let pCredits = 0;
      let pHours = 0;

      period.disciplines.forEach((disc) => {
        const bd = getDisciplineChBreakdown(withStructurePresentialFlags(disc, structure));
        const hours = bd.total;
        const credits = Number(disc.credits) || 0;
        totalHours += hours;
        totalCredits += credits;
        pHours += hours;
        pCredits += credits;

        const isOptional = disc.type === 'Optativa';
        if (!isOptional) {
          coreHours += hours;
        }

        // Presencial = contato direto / presencial regulatório
        presentialHours += bd.presential;
        // Síncrono-Mediado + Assíncrono = mediação a distância
        eadHours += bd.syncMediated + bd.async;

        if (disc.isExtension || disc.flags?.extension === 'presencial' || disc.flags?.extension === 'sincrono-mediado') {
          extensionHours += hours;
        }
        if (disc.isInternship) {
          internshipHours += hours;
        }
      });

      period.totalCredits = pCredits;
      period.totalHours = pHours;
    });
  } else if (structure.structureType === 'modular' && structure.modules) {
    const allModules = structure.modules;
    // Preferir knowledges (formulário) e espelhar em disciplines para não perder itens manuais
    syncedModules = allModules.map((mod) => {
      const synced = syncModuleKnowledgesToDisciplines(mod);
      let modHours = 0;
      const countsTowardCourse = moduleCountsTowardStructureTotals(synced, allModules);

      getModularComponents(synced).forEach((disc) => {
        const bd = getDisciplineChBreakdown(withStructurePresentialFlags(disc, structure));
        const hours = bd.total;
        const credits = Number(disc.credits) || 0;
        modHours += hours;

        // CH do módulo (mapa/UI) sempre; totais do curso só tronco + uma ênfase.
        if (!countsTowardCourse) return;

        totalCredits += credits;

        const isOptional = disc.type === 'Optativa';
        if (!isOptional) {
          coreHours += hours;
        }

        presentialHours += bd.presential;
        eadHours += bd.syncMediated + bd.async + (bd.sync || 0);

        if (disc.isExtension) {
          extensionHours += hours;
        }
        if (disc.isInternship) {
          internshipHours += hours;
        }
      });

      if (modHours <= 0 && !(synced.knowledges?.length || synced.disciplines?.length)) {
        modHours = Number(synced.hours) || 0;
        if (countsTowardCourse) {
          presentialHours += modHours * 0.8;
          eadHours += modHours * 0.2;
          coreHours += modHours;
        }
      }

      const hours = modHours > 0 ? modHours : Number(synced.hours) || 0;
      if (countsTowardCourse) {
        totalHours += hours;
      }
      return { ...synced, hours };
    });
  }

  // Atividades Complementares (não inventar 100h se o campo estiver vazio)
  const complementaryHours = Number(structure.complementaryTotalHours) || 0;
  const compMod = structure.complementaryModality || 'assincrono';
  if (complementaryHours > 0) {
    totalHours += complementaryHours;
    if (compMod === 'presencial') {
      presentialHours += complementaryHours;
    } else {
      eadHours += complementaryHours;
    }
  }

  // Extensão declarada: só entra no total se ainda não estiver nas componentes (isExtension)
  const extensionDeclared = Number(structure.extensionTotalHours) || 0;
  const extMod = structure.extensionModality || 'presencial';
  if (extensionHours > 0) {
    // Já contabilizada nos componentes — usa o maior valor só para o indicador regulatório
    extensionHours = Math.max(extensionHours, extensionDeclared);
  } else if (extensionDeclared > 0) {
    totalHours += extensionDeclared;
    extensionHours = extensionDeclared;
    if (extMod === 'presencial') {
      presentialHours += extensionDeclared;
    } else {
      eadHours += extensionDeclared;
    }
  }

  return {
    ...structure,
    ...(structure.structureType === 'modular' && syncedModules ? { modules: syncedModules } : {}),
    calculatedTotalHours: Math.round(totalHours * 100) / 100,
    calculatedCoreHours: Math.round(coreHours * 100) / 100,
    calculatedPresentialHours: Math.round(presentialHours * 100) / 100,
    calculatedEadHours: Math.round(eadHours * 100) / 100,
    calculatedExtensionHours: Math.round(extensionHours * 100) / 100,
    calculatedComplementaryHours: complementaryHours,
    calculatedInternshipHours: Math.round(internshipHours * 100) / 100,
    totalCredits,
  };
}

async function syncMissingOrNewerToFirestore<
  T extends { id: string; updatedAt?: string; createdAt?: string }
>(collectionName: string, remote: T[], merged: T[]): Promise<void> {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const toSync = merged.filter((item) => {
    const existing = remoteById.get(item.id);
    if (!existing) return true; // só no local → sobe
    return itemTimestamp(item) > itemTimestamp(existing); // local mais novo → sobe
  });
  if (toSync.length > 0) {
    await upsertFirestoreDocs(collectionName, toSync);
  }
}

export function getCachedStructures(): CurriculumStructure[] {
  return readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY).map((s) =>
    calculateStructureTotals(s)
  );
}

export function getCachedCourses(): Course[] {
  return readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY);
}

export function getCachedSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (!raw) return null;
    return normalizeAppSettings(JSON.parse(raw) as AppSettings);
  } catch {
    return null;
  }
}

export async function getCurriculumStructures(): Promise<CurriculumStructure[]> {
  const remote = await fetchFirestoreList<CurriculumStructure>(STRUCTURES_COLLECTION);
  const local = readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY);

  // Firestore com erro de rede → só local (nunca seed de exemplo)
  if (remote === null) {
    return local.map((s) => calculateStructureTotals(s));
  }

  const merged = mergeById(remote, local).map((s) => calculateStructureTotals(s));
  localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(merged));

  // NÃO regrava a coleção inteira a cada load (isso deixava o app lento no plano free)
  await syncMissingOrNewerToFirestore(STRUCTURES_COLLECTION, remote, merged);

  return merged;
}

export async function saveCurriculumStructure(structure: CurriculumStructure): Promise<CurriculumStructure> {
  const calculated = calculateStructureTotals({
    ...structure,
    updatedAt: new Date().toISOString(),
    createdAt: structure.createdAt || new Date().toISOString(),
  });

  try {
    const list = readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY);
    const index = list.findIndex((s) => s.id === calculated.id);
    if (index >= 0) {
      list[index] = calculated;
    } else {
      list.unshift(calculated);
    }
    localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Error saving to localStorage', e);
  }

  if (canUseFirestore()) {
    await upsertFirestoreDocs(STRUCTURES_COLLECTION, [calculated]);
  }
  return calculated;
}

export async function deleteCurriculumStructure(id: string): Promise<void> {
  try {
    const list = readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY).filter(
      (s) => s.id !== id
    );
    localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }

  if (canUseFirestore()) {
    try {
      await deleteDoc(doc(db!, STRUCTURES_COLLECTION, id));
    } catch (err) {
      console.error('Error deleting from Firestore', err);
    }
  }
}

export async function getCoursesList(): Promise<Course[]> {
  const remote = await fetchFirestoreList<Course>(COURSES_COLLECTION);
  const local = readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY);

  if (remote === null) {
    return local;
  }

  const merged = mergeById(remote, local);
  localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(merged));

  // Só envia cursos novos/ausentes no remoto — evita rewrite em massa no free tier
  await syncMissingOrNewerToFirestore(COURSES_COLLECTION, remote, merged);

  return merged;
}

export async function saveCourseItem(course: Course): Promise<Course> {
  const stamped: Course = {
    ...course,
    // Course type may not have updatedAt — keep id stable and persist as-is
  };

  try {
    const list = readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY);
    const index = list.findIndex((c) => c.id === stamped.id);
    if (index >= 0) {
      list[index] = stamped;
    } else {
      list.push(stamped);
    }
    localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }

  if (canUseFirestore()) {
    await upsertFirestoreDocs(COURSES_COLLECTION, [stamped]);
  }
  return stamped;
}

export async function bulkUpdateCourseHours(
  data: {
    code: string;
    name?: string;
    modality?: Course['modality'];
    degrees?: Course['degrees'];
    minTotalHours: number;
    minInternshipHours?: number;
    complementaryTotalHours?: number;
    extensionTotalHours?: number;
    minPresentialPercent?: number;
    maxEadPercent?: number;
    minExtensionPercent?: number;
    activeDcn?: string;
    dcnLink?: string;
    cineBrasilCode?: string;
    cineBrasilArea?: string;
  }[]
): Promise<number> {
  const currentCourses = await getCoursesList();
  let updatedCount = 0;

  for (const item of data) {
    const existing = currentCourses.find(
      (c) =>
        c.code.toLowerCase() === item.code.toLowerCase() ||
        (item.name && c.name.toLowerCase() === item.name.toLowerCase())
    );

    if (existing) {
      existing.minTotalHours = item.minTotalHours;
      if (item.name) existing.name = item.name;
      if (item.modality) existing.modality = item.modality;
      if (item.degrees) existing.degrees = item.degrees;
      if (item.minInternshipHours !== undefined) existing.minInternshipHours = item.minInternshipHours;
      if (item.complementaryTotalHours !== undefined)
        existing.complementaryTotalHours = item.complementaryTotalHours;
      if (item.extensionTotalHours !== undefined) existing.extensionTotalHours = item.extensionTotalHours;
      if (item.minPresentialPercent !== undefined) existing.minPresentialPercent = item.minPresentialPercent;
      if (item.maxEadPercent !== undefined) existing.maxEadPercent = item.maxEadPercent;
      if (item.minExtensionPercent !== undefined) existing.minExtensionPercent = item.minExtensionPercent;
      if (item.activeDcn) existing.activeDcn = item.activeDcn;
      if (item.dcnLink !== undefined) existing.dcnLink = item.dcnLink;
      if (item.cineBrasilCode) existing.cineBrasilCode = item.cineBrasilCode;
      if (item.cineBrasilArea) existing.cineBrasilArea = item.cineBrasilArea;
      await saveCourseItem(existing);
      updatedCount++;
    } else if (item.name) {
      const newCourse: Course = {
        id: `course-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        code: item.code,
        name: item.name,
        modality: item.modality || 'Presencial',
        cineBrasilCode: item.cineBrasilCode || '0413A01',
        cineBrasilArea: item.cineBrasilArea || 'Área Acadêmica Geral',
        activeDcn: item.activeDcn || 'Diretriz Curricular Geral',
        dcnLink: item.dcnLink || '',
        minTotalHours: item.minTotalHours,
        minInternshipHours: item.minInternshipHours ?? 0,
        complementaryTotalHours: item.complementaryTotalHours ?? 0,
        extensionTotalHours: item.extensionTotalHours ?? 0,
        minPresentialPercent: item.minPresentialPercent ?? 60,
        maxEadPercent: item.maxEadPercent ?? 40,
        minExtensionPercent: item.minExtensionPercent ?? 10,
        degrees: item.degrees || 'Bacharelado',
        totalSemesters: 8,
      };
      await saveCourseItem(newCourse);
      updatedCount++;
    }
  }

  return updatedCount;
}

export async function getAppSettings(): Promise<AppSettings> {
  const local = getCachedSettings();

  if (canUseFirestore()) {
    try {
      const docRef = doc(db!, 'settings', SETTINGS_DOC);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remote = normalizeAppSettings(snap.data() as AppSettings);
        const merged = mergeAppSettings(remote, local);
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(merged));

        // Se o local tinha observações e o remoto estava vazio, sobe de volta
        const needPushNotes =
          (notesContentScore(local?.reportNotesDisciplinar) > 0 &&
            notesContentScore(remote.reportNotesDisciplinar) === 0) ||
          (notesContentScore(local?.reportNotesModular) > 0 &&
            notesContentScore(remote.reportNotesModular) === 0);
        if (needPushNotes) {
          void setDoc(docRef, toFirestorePayload(merged), { merge: true }).catch((err) =>
            console.warn('Falha ao reenviar observações locais ao servidor', err)
          );
        }
        return merged;
      }

      // Remoto sem documento: sobe o cache local se houver
      if (local) {
        void setDoc(docRef, toFirestorePayload(local), { merge: true }).catch((err) =>
          console.warn('Falha ao criar settings no servidor a partir do cache', err)
        );
        return local;
      }
    } catch (err) {
      console.warn('Could not read settings from Firestore', err);
    }
  }

  if (local) return local;
  return normalizeAppSettings(initialSettings);
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const incoming = normalizeAppSettings(settings);
  let toSave = incoming;

  if (canUseFirestore()) {
    try {
      const docRef = doc(db!, 'settings', SETTINGS_DOC);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remote = normalizeAppSettings(snap.data() as AppSettings);
        // Protege observações: save parcial/vazio não apaga o que já está no servidor
        toSave = mergeAppSettings(remote, incoming);
      }
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(toSave));
      await setDoc(docRef, toFirestorePayload(toSave), { merge: true });
    } catch (err) {
      console.error('Error saving settings to Firestore', err);
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(incoming));
      throw new Error(firestoreErrorMessage(err));
    }
  } else {
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(toSave));
  }
  return toSave;
}

// Aliases for seamless imports
export const getStructuresFromFirestore = getCurriculumStructures;
export const saveStructureToFirestore = saveCurriculumStructure;
export const deleteStructureFromFirestore = deleteCurriculumStructure;
export const getCoursesFromFirestore = getCoursesList;
export const saveCourseToFirestore = saveCourseItem;

export type SaveAllCoursesOptions = {
  /** Permite lista vazia (apaga todos os cursos no servidor). Padrão: false. */
  allowEmptyWipe?: boolean;
};

export const saveAllCoursesToFirestore = async (
  courses: Course[],
  options: SaveAllCoursesOptions = {}
): Promise<Course[]> => {
  const { allowEmptyWipe = false } = options;

  if (courses.length === 0 && !allowEmptyWipe) {
    // Evita o bug clássico: modal abriu antes do load e “Salvar” mandava [] ao servidor
    if (canUseFirestore()) {
      try {
        const existing = await getDocs(collection(db!, COURSES_COLLECTION));
        trackFirestoreOp('read', Math.max(existing.size, 1));
        if (!existing.empty) {
          throw new Error(
            'Lista de cursos vazia — nada foi enviado ao servidor para não apagar os cadastros. Se quiser apagar todos, use “Apagar todos” e confirme ao salvar.'
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Lista de cursos vazia')) throw err;
        console.warn('Não foi possível verificar cursos remotos antes do save vazio', err);
      }
    }
    const local = readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY);
    if (local.length > 0) {
      throw new Error(
        'Lista de cursos vazia — nada foi enviado para não apagar os cadastros locais/remotos.'
      );
    }
    localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify([]));
    return [];
  }

  localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(courses));
  if (canUseFirestore()) {
    try {
      const existing = await getDocs(collection(db!, COURSES_COLLECTION));
      trackFirestoreOp('read', Math.max(existing.size, 1));
      const keepIds = new Set(courses.map((c) => c.id));
      for (const snap of existing.docs) {
        if (!keepIds.has(snap.id)) {
          await deleteDoc(snap.ref);
          trackFirestoreOp('write', 1);
        }
      }
      for (const c of courses) {
        await setDoc(doc(db!, COURSES_COLLECTION, c.id), toFirestorePayload(c), { merge: true });
        trackFirestoreOp('write', 1);
      }
    } catch (e) {
      console.warn('Error saving all courses to firestore', e);
      throw new Error(firestoreErrorMessage(e));
    }
  }
  return courses;
};
export const getSettingsFromFirestore = getAppSettings;
export const saveSettingsToFirestore = saveAppSettings;

export type LocalAppBackup = {
  version: 1;
  exportedAt: string;
  structures: CurriculumStructure[];
  courses: Course[];
  settings: AppSettings | null;
};

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function exportLocalAppBackup(): LocalAppBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    structures: readLocalList<CurriculumStructure>(LOCAL_STORAGE_STRUCTURES_KEY),
    courses: readLocalList<Course>(LOCAL_STORAGE_COURSES_KEY),
    settings: getCachedSettings(),
  };
}

/** Aceita backup deste app ou dump cru do localStorage (porta 3000). */
export function applyLocalAppBackup(raw: string): { structures: number; courses: number } {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const structures = asList<CurriculumStructure>(
    data.structures ?? data.unisuam_curriculum_structures
  );
  const courses = asList<Course>(data.courses ?? data.unisuam_curriculum_courses);
  const settingsRaw = data.settings ?? data.unisuam_app_settings;

  if (structures.length === 0 && courses.length === 0 && !settingsRaw) {
    throw new Error('O arquivo não contém estruturas nem cursos.');
  }

  if (structures.length > 0) {
    localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(structures));
  }
  if (courses.length > 0) {
    localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(courses));
  }
  if (settingsRaw) {
    const settings =
      typeof settingsRaw === 'string' ? JSON.parse(settingsRaw) : settingsRaw;
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  }

  return { structures: structures.length, courses: courses.length };
}

