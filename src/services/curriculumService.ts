import { doc, getDoc, getDocs, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { CurriculumStructure, Course, AppSettings, getDisciplineChBreakdown, withStructurePresentialFlags } from '../types/curriculum';
import { initialSettings } from '../data/initialData';
import { normalizeReportNotesTitle } from './reportNotes';
import { getModularComponents, syncModuleKnowledgesToDisciplines } from '../utils/modularComponents';

const STRUCTURES_COLLECTION = 'curriculum_structures';
const COURSES_COLLECTION = 'curriculum_courses';
const SETTINGS_DOC = 'app_settings';

const LOCAL_STORAGE_STRUCTURES_KEY = 'unisuam_curriculum_structures';
const LOCAL_STORAGE_COURSES_KEY = 'unisuam_curriculum_courses';
const LOCAL_STORAGE_SETTINGS_KEY = 'unisuam_app_settings';

function canUseFirestore(): boolean {
  return isFirebaseConfigured && db !== null;
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    reportNotesTitle: normalizeReportNotesTitle(settings.reportNotesTitle),
  };
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
      await setDoc(doc(db!, collectionName, item.id), item as Record<string, unknown>);
    }
  } catch (err) {
    console.error(`Erro ao gravar ${collectionName} no Firestore`, err);
  }
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
    // Preferir knowledges (formulário) e espelhar em disciplines para não perder itens manuais
    syncedModules = structure.modules.map((mod) => {
      const synced = syncModuleKnowledgesToDisciplines(mod);
      let modHours = 0;

      getModularComponents(synced).forEach((disc) => {
        const bd = getDisciplineChBreakdown(withStructurePresentialFlags(disc, structure));
        const hours = bd.total;
        const credits = Number(disc.credits) || 0;
        modHours += hours;
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
        presentialHours += modHours * 0.8;
        eadHours += modHours * 0.2;
        coreHours += modHours;
      }

      const hours = modHours > 0 ? modHours : Number(synced.hours) || 0;
      totalHours += hours;
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

  await upsertFirestoreDocs(STRUCTURES_COLLECTION, [calculated]);
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

  await upsertFirestoreDocs(COURSES_COLLECTION, [stamped]);
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
  if (canUseFirestore()) {
    try {
      const docRef = doc(db!, 'settings', SETTINGS_DOC);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = normalizeAppSettings(snap.data() as AppSettings);
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(data));
        return data;
      }
    } catch (err) {
      console.warn('Could not read settings from Firestore', err);
    }
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
  if (cached) {
    try {
      return normalizeAppSettings(JSON.parse(cached) as AppSettings);
    } catch {
      // ignore
    }
  }

  return initialSettings;
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings);
  localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(normalized));
  if (canUseFirestore()) {
    try {
      await setDoc(doc(db!, 'settings', SETTINGS_DOC), normalized);
    } catch (err) {
      console.error('Error saving settings to Firestore', err);
    }
  }
  return normalized;
}

// Aliases for seamless imports
export const getStructuresFromFirestore = getCurriculumStructures;
export const saveStructureToFirestore = saveCurriculumStructure;
export const deleteStructureFromFirestore = deleteCurriculumStructure;
export const getCoursesFromFirestore = getCoursesList;
export const saveCourseToFirestore = saveCourseItem;
export const saveAllCoursesToFirestore = async (courses: Course[]): Promise<void> => {
  localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(courses));
  if (canUseFirestore()) {
    try {
      const existing = await getDocs(collection(db!, COURSES_COLLECTION));
      const keepIds = new Set(courses.map((c) => c.id));
      for (const snap of existing.docs) {
        if (!keepIds.has(snap.id)) {
          await deleteDoc(snap.ref);
        }
      }
      for (const c of courses) {
        await setDoc(doc(db!, COURSES_COLLECTION, c.id), c);
      }
    } catch (e) {
      console.warn('Error saving all courses to firestore', e);
    }
  }
};
export const getSettingsFromFirestore = getAppSettings;
export const saveSettingsToFirestore = saveAppSettings;

