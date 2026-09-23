import React from 'react';
import { Briefcase } from 'lucide-react';
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
 * cards em linha; com menos de 4, ocupam toda a largura disponível.
 * Título = competência; conteúdo = perfis vinculados (texto completo).
 */
export const ModuleCompetencesTableCards: React.FC<ModuleCompetencesTableCardsProps> = ({
  mod,
  aspects,
  aspectIndex,
}) => {
  const comps = normalizeModuleCompetences(mod);
  if (comps.length === 0) return null;

  const colCount = Math.min(Math.max(comps.length, 1), 4);
  const gridClass =
    colCount === 1
      ? 'grid grid-cols-1 gap-3'
      : colCount === 2
        ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
        : colCount === 3
          ? 'grid grid-cols-1 sm:grid-cols-3 gap-3'
          : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3';

  return (
    <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-gradient-to-br from-orange-50/30 to-blue-50/20">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-orange-200/60 pb-2 mb-3">
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-[#FF6B00] shrink-0" aria-hidden />
          <span className="text-[15px] font-bold tracking-wide text-slate-800">
            Competências e Perfil do Egresso
          </span>
        </span>
      </div>

      <div className={gridClass}>
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
                        className="flex items-start gap-2 text-[13px] text-slate-700 leading-snug font-medium [overflow-wrap:anywhere]"
                      >
                        <span
                          className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#FF6B00] shrink-0"
                          aria-hidden
                        />
                        <span>{title}</span>
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
