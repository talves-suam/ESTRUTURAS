import { doc, getDoc, getDocs, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { CurriculumStructure, Course, AppSettings, getDisciplineChBreakdown } from '../types/curriculum';
import { initialCourses, initialStructures, initialSettings } from '../data/initialData';

const STRUCTURES_COLLECTION = 'curriculum_structures';
const COURSES_COLLECTION = 'curriculum_courses';
const SETTINGS_DOC = 'app_settings';

const LOCAL_STORAGE_STRUCTURES_KEY = 'unisuam_curriculum_structures';
const LOCAL_STORAGE_COURSES_KEY = 'unisuam_curriculum_courses';
const LOCAL_STORAGE_SETTINGS_KEY = 'unisuam_app_settings';

function canUseFirestore(): boolean {
  return isFirebaseConfigured && db !== null;
}

export function calculateStructureTotals(structure: CurriculumStructure): CurriculumStructure {
  let totalHours = 0;
  let coreHours = 0; // Somente Obrigatória + Eletiva (conta para CH mínima do curso)
  let presentialHours = 0;
  let eadHours = 0;
  let extensionHours = 0;
  let internshipHours = 0;
  let totalCredits = 0;

  if (structure.structureType === 'disciplinar' && structure.periods) {
    structure.periods.forEach((period) => {
      let pCredits = 0;
      let pHours = 0;

      period.disciplines.forEach((disc) => {
        const bd = getDisciplineChBreakdown(disc);
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
        eadHours += (bd.syncMediated + bd.async);

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
    // Para cursos modulares: soma os módulos do tronco comum e os de maior caminho ou disciplinas internas
    structure.modules.forEach((mod) => {
      let modHours = 0;
      if (mod.disciplines && mod.disciplines.length > 0) {
        mod.disciplines.forEach((disc) => {
          const hours = Number(disc.hours) || 0;
          const credits = Number(disc.credits) || 0;
          modHours += hours;
          totalCredits += credits;

          const isOptional = disc.type === 'Optativa';
          if (!isOptional) {
            coreHours += hours;
          }

          if (disc.modalityDelivery === 'presencial') {
            presentialHours += hours;
          } else {
            eadHours += hours;
          }

          if (disc.isExtension) {
            extensionHours += hours;
          }
          if (disc.isInternship) {
            internshipHours += hours;
          }
        });
      } else {
        modHours = Number(mod.hours) || 0;
        presentialHours += modHours * 0.8;
        eadHours += modHours * 0.2;
        coreHours += modHours; // Módulos sem disciplinas internas contam para o núcleo
      }
      mod.hours = modHours > 0 ? modHours : Number(mod.hours) || 0;
      totalHours += mod.hours;
    });
  }

  // Atividades Complementares (Course / Structure level)
  const complementaryHours = Number(structure.complementaryTotalHours) || 100;
  const compMod = structure.complementaryModality || 'assincrono';
  totalHours += complementaryHours;
  if (compMod === 'presencial') {
    presentialHours += complementaryHours;
  } else {
    eadHours += complementaryHours;
  }

  // Extensão (Course / Structure level)
  const extensionHoursInput = Number(structure.extensionTotalHours) || Math.round(totalHours * 0.1);
  const extMod = structure.extensionModality || 'presencial';
  totalHours += extensionHoursInput;
  extensionHours += extensionHoursInput;
  if (extMod === 'presencial') {
    presentialHours += extensionHoursInput;
  } else {
    eadHours += extensionHoursInput;
  }

  return {
    ...structure,
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

export async function getCurriculumStructures(): Promise<CurriculumStructure[]> {
  if (canUseFirestore()) {
    try {
      const colRef = collection(db!, STRUCTURES_COLLECTION);
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        const items: CurriculumStructure[] = [];
        snapshot.forEach((d) => items.push(d.data() as CurriculumStructure));
        localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(items));
        return items;
      }
    } catch (err) {
      console.warn('Firestore unavailable, falling back to local state', err);
    }
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_STRUCTURES_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  // Seed default structures to localStorage and firestore
  const seeded = initialStructures.map(calculateStructureTotals);
  localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(seeded));
  
  // Try async seed to firestore in background
  if (canUseFirestore()) {
    try {
      for (const struct of seeded) {
        await setDoc(doc(db!, STRUCTURES_COLLECTION, struct.id), struct);
      }
    } catch (seedErr) {
      console.warn('Could not seed to firestore immediately', seedErr);
    }
  }

  return seeded;
}

export async function saveCurriculumStructure(structure: CurriculumStructure): Promise<CurriculumStructure> {
  const calculated = calculateStructureTotals({
    ...structure,
    updatedAt: new Date().toISOString(),
  });

  // Local update first for instant UX
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_STRUCTURES_KEY);
    const list: CurriculumStructure[] = cached ? JSON.parse(cached) : [];
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

  // Remote Firestore update
  if (canUseFirestore()) {
    try {
      await setDoc(doc(db!, STRUCTURES_COLLECTION, calculated.id), calculated);
    } catch (err) {
      console.error('Error saving to Firestore:', err);
    }
  }

  return calculated;
}

export async function deleteCurriculumStructure(id: string): Promise<void> {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_STRUCTURES_KEY);
    if (cached) {
      const list: CurriculumStructure[] = JSON.parse(cached);
      const filtered = list.filter((s) => s.id !== id);
      localStorage.setItem(LOCAL_STORAGE_STRUCTURES_KEY, JSON.stringify(filtered));
    }
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
  if (canUseFirestore()) {
    try {
      const colRef = collection(db!, COURSES_COLLECTION);
      const snapshot = await getDocs(colRef);
      if (!snapshot.empty) {
        const items: Course[] = [];
        snapshot.forEach((d) => items.push(d.data() as Course));
        localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(items));
        return items;
      }
    } catch (err) {
      console.warn('Could not read courses from Firestore, checking local storage', err);
    }
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_COURSES_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  // Seed default courses
  localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(initialCourses));
  if (canUseFirestore()) {
    try {
      for (const c of initialCourses) {
        await setDoc(doc(db!, COURSES_COLLECTION, c.id), c);
      }
    } catch (e) {
      console.warn('Background course seed failed', e);
    }
  }

  return initialCourses;
}

export async function saveCourseItem(course: Course): Promise<Course> {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_COURSES_KEY);
    const list: Course[] = cached ? JSON.parse(cached) : [...initialCourses];
    const index = list.findIndex((c) => c.id === course.id);
    if (index >= 0) {
      list[index] = course;
    } else {
      list.push(course);
    }
    localStorage.setItem(LOCAL_STORAGE_COURSES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }

  if (canUseFirestore()) {
    try {
      await setDoc(doc(db!, COURSES_COLLECTION, course.id), course);
    } catch (err) {
      console.error('Error saving course to Firestore', err);
    }
  }

  return course;
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
        const data = snap.data() as AppSettings;
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
      return JSON.parse(cached);
    } catch {
      // ignore
    }
  }

  return initialSettings;
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  if (canUseFirestore()) {
    try {
      await setDoc(doc(db!, 'settings', SETTINGS_DOC), settings);
    } catch (err) {
      console.error('Error saving settings to Firestore', err);
    }
  }
  return settings;
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

