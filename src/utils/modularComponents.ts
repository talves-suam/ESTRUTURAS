import type { Discipline, KnowledgeItem, ModuleData } from '../types/curriculum';
import { getDisciplineChBreakdown } from '../types/curriculum';

/**
 * Em estrutura modular o formulário edita `knowledges`.
 * Importação SAGA e a tabela/totais historicamente usavam `disciplines`.
 * Quando há conhecimentos, eles são a fonte da verdade — disciplinas espelham essa lista.
 */

/** Optativa aparece na lista com a própria CH, mas não entra em nenhuma soma. */
export function countsTowardModuleHours(type: string | undefined): boolean {
  return type !== 'Optativa';
}
export function knowledgeToDiscipline(
  know: KnowledgeItem,
  existing?: Discipline
): Discipline {
  return {
    id: know.id,
    code: '',
    name: know.name,
    type: know.type || existing?.type || 'Obrigatória',
    credits: existing?.credits ?? 0,
    hours: know.hours || 0,
    modalityDelivery: know.modalityDelivery,
    hasLaboratory: know.hasLaboratory ?? existing?.hasLaboratory,
    hasClinical: know.hasClinical ?? existing?.hasClinical,
    chTheoretical: know.chTheoretical,
    chLaboratory: know.chLaboratory,
    chClinical: know.chClinical,
    chPresential: know.chPresential,
    chSyncMediated: know.chSyncMediated,
    chAsync: know.chAsync,
    isExtension: existing?.isExtension,
    isInternship: existing?.isInternship,
    isFinalPaper: existing?.isFinalPaper,
    pedagogicalNature: existing?.pedagogicalNature,
    evaluationForm: existing?.evaluationForm,
    flags: existing?.flags,
  };
}

function findMatchingDiscipline(
  know: KnowledgeItem,
  disciplines: Discipline[] | undefined
): Discipline | undefined {
  if (!disciplines?.length) return undefined;
  const byId = disciplines.find((d) => d.id === know.id);
  if (byId) return byId;
  const name = know.name.trim().toLowerCase();
  return disciplines.find((d) => d.name.trim().toLowerCase() === name);
}

/** Componentes do módulo para CH / tabela / export (sem duplicar knowledges+disciplines). */
export function getModularComponents(mod: ModuleData): Discipline[] {
  const knowledges = mod.knowledges || [];
  if (knowledges.length > 0) {
    return knowledges.map((k) =>
      knowledgeToDiscipline(k, findMatchingDiscipline(k, mod.disciplines))
    );
  }
  return [...(mod.disciplines || [])];
}

/** Componentes que entram na CH do módulo (exclui Optativa). */
export function getCountableModularComponents(mod: ModuleData): Discipline[] {
  return getModularComponents(mod).filter((d) => countsTowardModuleHours(d.type));
}

/**
 * CH do módulo = soma das modalidades dos componentes contáveis.
 * Optativa não entra — só é exibida com a própria CH.
 */
export function sumModuleComponentHours(
  mod: ModuleData,
  flags?: { hasLaboratory?: boolean; hasClinical?: boolean }
): number {
  const components = getCountableModularComponents(mod);
  if (components.length === 0) {
    // Sem componentes contáveis: não usa hours stale se só houver optativas
    const all = getModularComponents(mod);
    if (all.length > 0) return 0;
    return Number(mod.hours) || 0;
  }
  return components.reduce((acc, d) => {
    const bd = getDisciplineChBreakdown({
      ...d,
      hasLaboratory: flags?.hasLaboratory ?? d.hasLaboratory,
      hasClinical: flags?.hasClinical ?? d.hasClinical,
    });
    return acc + (Number(bd.total) || 0);
  }, 0);
}

/** Mantém disciplines alinhadas aos knowledges (após editar no formulário). */
export function syncModuleKnowledgesToDisciplines(mod: ModuleData): ModuleData {
  const knowledges = mod.knowledges || [];
  if (knowledges.length === 0) {
    const hours = sumModuleComponentHours(mod);
    return {
      ...mod,
      hours: hours || (getModularComponents(mod).length > 0 ? 0 : mod.hours),
    };
  }
  const disciplines = getModularComponents(mod);
  const hours = sumModuleComponentHours({ ...mod, knowledges, disciplines });
  return { ...mod, knowledges, disciplines, hours };
}
