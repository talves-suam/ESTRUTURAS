import type { Discipline, KnowledgeItem, ModuleData } from '../types/curriculum';

/**
 * Em estrutura modular o formulário edita `knowledges`.
 * Importação SAGA e a tabela/totais historicamente usavam `disciplines`.
 * Quando há conhecimentos, eles são a fonte da verdade — disciplinas espelham essa lista.
 */
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

/** Mantém disciplines alinhadas aos knowledges (após editar no formulário). */
export function syncModuleKnowledgesToDisciplines(mod: ModuleData): ModuleData {
  const knowledges = mod.knowledges || [];
  if (knowledges.length === 0) {
    return {
      ...mod,
      hours: (mod.disciplines || []).reduce((acc, d) => acc + (Number(d.hours) || 0), 0) || mod.hours,
    };
  }
  const disciplines = getModularComponents(mod);
  const hours = knowledges.reduce((acc, k) => acc + (Number(k.hours) || 0), 0);
  return { ...mod, knowledges, disciplines, hours };
}
