import type {
  CampusAuthorizationAct,
  Course,
  CurriculumStructure,
} from '../types/curriculum';

/** Unidades sugeridas no cadastro (datalist); o usuário pode informar outras. */
export const DEFAULT_CAMPUS_UNITS = ['Bangu', 'Bonsucesso', 'Campo Grande'] as const;

export function createCampusAuthorizationAct(
  partial?: Partial<CampusAuthorizationAct>
): CampusAuthorizationAct {
  return {
    id:
      partial?.id ||
      `ato-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    // Não usar trim aqui: o editor normaliza a cada tecla e trim impede espaços ao digitar.
    unitName: String(partial?.unitName ?? ''),
    act: String(partial?.act ?? ''),
  };
}

type AuthorizationSource = {
  authorizationAct?: string;
  recognitionPortaria?: string;
  authorizationActs?: CampusAuthorizationAct[];
  activeAuthorizationActId?: string;
};

export interface NormalizedAuthorizationActs {
  authorizationActs: CampusAuthorizationAct[];
  activeAuthorizationActId: string;
  authorizationAct: string;
}

/** Garante lista + id ativo + espelho do texto do ato (migra campo legado). */
export function normalizeAuthorizationActs(
  source: AuthorizationSource | null | undefined
): NormalizedAuthorizationActs {
  const legacy = String(
    source?.authorizationAct || source?.recognitionPortaria || ''
  ).trim();
  let acts = (source?.authorizationActs || [])
    .map((a) =>
      createCampusAuthorizationAct({
        id: a.id,
        unitName: a.unitName,
        act: a.act,
      })
    )
    .filter((a) => a.id);

  if (acts.length === 0 && legacy) {
    acts = [
      createCampusAuthorizationAct({
        unitName: '',
        act: legacy,
      }),
    ];
  }

  let activeId = String(source?.activeAuthorizationActId || '').trim();
  if (!activeId || !acts.some((a) => a.id === activeId)) {
    activeId = acts[0]?.id || '';
  }

  const active = acts.find((a) => a.id === activeId);
  const mirror = String(active?.act || legacy || '').trim();

  return {
    authorizationActs: acts,
    activeAuthorizationActId: activeId,
    authorizationAct: mirror,
  };
}

/** Texto do ato ativo para cabeçalho/exports (só a resolução — unidade fica só no cadastro). */
export function getActiveAuthorizationActLabel(
  source: AuthorizationSource | null | undefined
): string {
  const normalized = normalizeAuthorizationActs(source);
  const active = normalized.authorizationActs.find(
    (a) => a.id === normalized.activeAuthorizationActId
  );
  const act = (active?.act || normalized.authorizationAct || '').trim();
  return act || '—';
}

/** Alias: texto do ato ativo (sem unidade). */
export function getActiveAuthorizationActText(
  source: AuthorizationSource | null | undefined
): string {
  return getActiveAuthorizationActLabel(source);
}

export function summarizeAuthorizationActs(
  source: AuthorizationSource | null | undefined
): string {
  const { authorizationActs } = normalizeAuthorizationActs(source);
  if (authorizationActs.length === 0) return 'Nenhum ato cadastrado';
  const withUnit = authorizationActs.filter((a) => a.unitName || a.act);
  if (withUnit.length === 0) return 'Nenhum ato cadastrado';
  return `${withUnit.length} unidade(s)`;
}

/** Aplica lista + seleção e devolve campos prontos para Course/Structure. */
export function withAuthorizationActsFields<T extends AuthorizationSource>(
  base: T,
  acts: CampusAuthorizationAct[],
  activeId?: string
): T & NormalizedAuthorizationActs {
  const normalized = normalizeAuthorizationActs({
    ...base,
    authorizationActs: acts,
    activeAuthorizationActId: activeId ?? base.activeAuthorizationActId,
  });
  return {
    ...base,
    ...normalized,
    recognitionPortaria: normalized.authorizationAct,
  };
}

export function seedAuthorizationActsFromCourse(
  structure: Pick<
    CurriculumStructure,
    | 'authorizationAct'
    | 'recognitionPortaria'
    | 'authorizationActs'
    | 'activeAuthorizationActId'
  >,
  course: Pick<
    Course,
    | 'authorizationAct'
    | 'authorizationActs'
    | 'activeAuthorizationActId'
  > | null
    | undefined
): NormalizedAuthorizationActs {
  const structureHasList = (structure.authorizationActs || []).length > 0;
  if (structureHasList) {
    return normalizeAuthorizationActs(structure);
  }
  if (course && ((course.authorizationActs || []).length > 0 || course.authorizationAct)) {
    return normalizeAuthorizationActs(course);
  }
  return normalizeAuthorizationActs(structure);
}
