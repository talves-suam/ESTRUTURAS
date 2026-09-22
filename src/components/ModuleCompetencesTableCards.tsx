import React from 'react';
import {
  ModuleData,
  GraduateProfileAspect,
  normalizeModuleCompetences,
  aspectShortLabel,
} from '../types/curriculum';

interface ModuleCompetencesTableCardsProps {
  mod: ModuleData;
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
}

/**
 * Competências na tabela da estrutura (estilo saberes):
 * até 4 cards lado a lado; título = competência; conteúdo = perfis vinculados.
 * Texto completo, sem reticências.
 */
export const ModuleCompetencesTableCards: React.FC<ModuleCompetencesTableCardsProps> = ({
  mod,
  aspects,
  aspectIndex,
}) => {
  const comps = normalizeModuleCompetences(mod);
  if (comps.length === 0) return null;

  return (
    <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-br from-orange-50/30 to-blue-50/20">
      <div className="flex items-center gap-2 border-b border-orange-200/60 pb-2 mb-3">
        <h5 className="text-[15px] font-bold uppercase tracking-wider text-slate-800">
          Competências
        </h5>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {comps.map((c) => {
          const linked = (c.aspectIds || [])
            .map((id) => {
              const i = aspectIndex.get(id);
              return i === undefined ? null : { asp: aspects[i], i };
            })
            .filter((x): x is { asp: GraduateProfileAspect; i: number } => !!x);

          return (
            <div
              key={c.id}
              className="bg-white p-3 rounded-lg border border-[#002B49]/12 shadow-2xs flex flex-col gap-2 min-w-0"
            >
              <p className="text-[14px] font-bold text-[#002B49] leading-snug [overflow-wrap:anywhere]">
                {c.text}
              </p>
              <div className="border-t border-slate-100 pt-2 space-y-1.5">
                {linked.length === 0 ? (
                  <p className="text-[13px] text-slate-400 italic leading-snug">
                    Sem perfil vinculado
                  </p>
                ) : (
                  linked.map(({ asp, i }) => {
                    const title = asp.title?.trim() || aspectShortLabel(asp, i);
                    return (
                      <p
                        key={asp.id}
                        className="text-[13px] text-slate-700 leading-snug font-medium [overflow-wrap:anywhere]"
                      >
                        {title}
                      </p>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
