import type { PedagogicalNomenclature } from '../types/curriculum';

export interface SaberesLabels {
  /** Título curto da seção */
  sectionTitle: 'Saberes';
  /** Rótulo da 1ª coluna/categoria */
  c: string;
  /** Rótulo da 2ª coluna/categoria */
  h: string;
  /** Rótulo da 3ª coluna/categoria */
  a: string;
  /** Lista usada em textos longos (Zabala); CHA usa apenas "Saberes" */
  full: string;
}

/** Nomenclatura oficial de Saberes no site e em todos os relatórios. */
export function getSaberesLabels(
  nomenclature: PedagogicalNomenclature = 'cha'
): SaberesLabels {
  if (nomenclature === 'zabala') {
    return {
      sectionTitle: 'Saberes',
      c: 'Conceitual',
      h: 'Procedimental',
      a: 'Atitudinal',
      full: 'Conceitual, Procedimental e Atitudinal',
    };
  }
  return {
    sectionTitle: 'Saberes',
    c: 'Saber Conceitual',
    h: 'Saber Fazer',
    a: 'Saber Ser',
    full: 'Saberes',
  };
}

export function labelForCategory(
  category: string,
  nomenclature: PedagogicalNomenclature = 'cha'
): string {
  const labels = getSaberesLabels(nomenclature);
  const c = category.toLowerCase();
  if (c.includes('conceitual') || c.includes('conhecimento')) return labels.c;
  if (c.includes('procedimental') || c.includes('habilidade')) return labels.h;
  if (c.includes('atitudinal') || c.includes('atitude')) return labels.a;
  return category;
}
