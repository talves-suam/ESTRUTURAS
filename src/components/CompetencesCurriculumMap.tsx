import React, { useMemo, useState } from 'react';
import {
  CurriculumStructure,
  ModuleData,
  GraduateProfileAspect,
  ModuleCompetenceItem,
  getGraduateProfileAspects,
  normalizeModuleCompetences,
  aspectShortLabel,
} from '../types/curriculum';
import { formatModuleName, formatBranchLabel } from '../utils/roman';
import { showsModuleMeetings } from '../services/workloadSummary';

const CARD_W = 'w-[168px]';

function sortModuleChain(list: ModuleData[]): ModuleData[] {
  if (list.length <= 1) return list;
  const ids = new Set(list.map((m) => m.id));
  const roots = list.filter((m) => !m.parentModuleId || !ids.has(m.parentModuleId));
  if (roots.length === 0) {
    return [...list].sort((a, b) => a.number - b.number || a.code.localeCompare(b.code));
  }
  const childrenOf = new Map<string, ModuleData[]>();
  list.forEach((m) => {
    if (m.parentModuleId && ids.has(m.parentModuleId)) {
      const arr = childrenOf.get(m.parentModuleId) || [];
      arr.push(m);
      childrenOf.set(m.parentModuleId, arr);
    }
  });
  const ordered: ModuleData[] = [];
  const visit = (m: ModuleData) => {
    ordered.push(m);
    (childrenOf.get(m.id) || [])
      .sort((a, b) => a.number - b.number || a.code.localeCompare(b.code))
      .forEach(visit);
  };
  roots
    .sort((a, b) => a.number - b.number || a.code.localeCompare(b.code))
    .forEach(visit);
  list.forEach((m) => {
    if (!ordered.find((o) => o.id === m.id)) ordered.push(m);
  });
  return ordered;
}

function partitionBranches(modules: ModuleData[]) {
  const trunk = sortModuleChain(modules.filter((m) => !m.branch));
  const branchKeys = Array.from(
    new Set(modules.map((m) => m.branch).filter(Boolean) as string[])
  ).sort();
  const branches = branchKeys.map((key) => ({
    key,
    modules: sortModuleChain(modules.filter((m) => m.branch === key)),
  }));
  return { trunk, branches };
}

/** Emparelha 1-2, 3-4… (ímpar à esquerda, par à direita). */
function pairModules(chain: ModuleData[]): Array<{ left?: ModuleData; right?: ModuleData }> {
  const pairs: Array<{ left?: ModuleData; right?: ModuleData }> = [];
  for (let i = 0; i < chain.length; i += 2) {
    pairs.push({ left: chain[i], right: chain[i + 1] });
  }
  return pairs;
}

type Dir = 'ltr' | 'rtl';

const LINE = 'bg-[#002B49]/40';

function CardText({
  children,
  className = '',
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'center';
}) {
  return (
    <p
      className={`font-bold leading-snug whitespace-normal ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
      style={{ wordBreak: 'normal', overflowWrap: 'break-word', hyphens: 'none' }}
    >
      {children}
    </p>
  );
}

/**
 * Bracket ortogonal.
 * side="right": filhos à direita da espinha (fluxo LTR)
 * side="left":  filhos à esquerda da espinha (fluxo RTL)
 */
function SideBracket({
  children,
  side,
}: {
  children: React.ReactNode;
  side: 'left' | 'right';
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  const reverse = side === 'left';

  if (items.length === 1) {
    return (
      <div className={`flex items-center ${reverse ? 'flex-row-reverse' : ''}`}>
        <div className={`w-5 h-px shrink-0 ${LINE}`} />
        {items[0]}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((child, i) => {
        const isFirst = i === 0;
        const isLast = i === items.length - 1;
        return (
          <div
            key={i}
            className={`flex items-center ${reverse ? 'flex-row-reverse' : ''}`}
          >
            <div className="relative w-5 shrink-0 self-stretch">
              <div
                className={`absolute w-px ${LINE} ${reverse ? 'right-0' : 'left-0'}`}
                style={{
                  top: isFirst ? '50%' : 0,
                  bottom: isLast ? '50%' : 0,
                }}
              />
              <div
                className={`absolute left-0 right-0 top-1/2 h-px -translate-y-px ${LINE}`}
              />
            </div>
            <div className="py-1.5">{child}</div>
          </div>
        );
      })}
    </div>
  );
}

function BranchFrom({
  parent,
  children,
  dir,
  bodyHidden,
  bodyAttrs,
}: {
  parent: React.ReactNode;
  children: React.ReactNode;
  dir: Dir;
  bodyHidden?: boolean;
  bodyAttrs?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) {
    return <div className="flex items-center" data-map-branch="1">{parent}</div>;
  }

  const bracket = (
    <SideBracket side={dir === 'ltr' ? 'right' : 'left'}>{items}</SideBracket>
  );
  const stem = <div className={`w-5 h-px shrink-0 ${LINE}`} />;
  const body = (
    <div
      {...bodyAttrs}
      aria-hidden={bodyHidden}
      className={`flex items-center transition-[opacity,filter,transform] duration-300 ease-out ${
        bodyHidden
          ? 'opacity-0 pointer-events-none blur-[1px] scale-[0.985]'
          : 'opacity-100'
      } ${bodyAttrs?.className || ''}`}
    >
      {dir === 'ltr' ? (
        <>
          {stem}
          {bracket}
        </>
      ) : (
        <>
          {bracket}
          {stem}
        </>
      )}
    </div>
  );

  return (
    <div className="flex items-center" data-map-branch="1">
      {dir === 'ltr' ? (
        <>
          <div className="shrink-0">{parent}</div>
          {body}
        </>
      ) : (
        <>
          {body}
          <div className="shrink-0">{parent}</div>
        </>
      )}
    </div>
  );
}

/** Perfil — envelope 168px, papel quente, detalhe azul. */
const ProfileBox: React.FC<{
  aspect: GraduateProfileAspect;
  index: number;
}> = ({ aspect, index }) => {
  const title = aspect.title?.trim() || aspectShortLabel(aspect, index);
  return (
    <div
      className={`relative ${CARD_W} rounded-xl px-3 py-2.5 text-center shadow-sm border border-[#c4b5a0]/55 bg-gradient-to-b from-[#fffbf5] to-[#f3ebe0]`}
      data-map-role="perfil"
      title={aspect.text || title}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 rounded-full bg-[#002B49]" />
      <p className="text-[9px] font-bold uppercase tracking-wider text-[#5a6b78] mb-1">
        Perfil
      </p>
      <CardText align="center" className="text-[12px] text-[#2c3a42] line-clamp-4">
        {title}
      </CardText>
    </div>
  );
};

function CompetenceBox({
  text,
  onToggle,
  collapsed,
}: {
  text: string;
  onToggle?: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      data-map-toggle="competence"
      data-map-role="competencia"
      aria-expanded={!collapsed}
      title={collapsed ? 'Mostrar perfil do egresso' : 'Ocultar perfil do egresso'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`relative ${CARD_W} rounded-xl px-3 py-2.5 text-center shadow-md shadow-[#002B49]/25 cursor-pointer transition-[filter,box-shadow,transform] duration-200 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c45a1a]/50 bg-[#002B49] ${
        collapsed ? 'ring-1 ring-[#c45a1a]/45' : ''
      }`}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 rounded-full bg-[#c45a1a]" />
      <p className="text-[9px] font-bold uppercase tracking-wider text-blue-200/85 mb-1">
        Competência
      </p>
      <CardText align="center" className="text-[12px] text-white line-clamp-4">
        {text}
      </CardText>
    </button>
  );
}

/** Envelope 168px — laranja institucional sóbrio. */
function ModuleBox({
  mod,
  hideMeetings,
  onToggle,
  collapsed,
}: {
  mod: ModuleData;
  hideMeetings?: boolean;
  onToggle?: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      data-map-toggle="module"
      data-map-role="modulo"
      aria-expanded={!collapsed}
      title={collapsed ? 'Mostrar competências e perfis' : 'Ocultar competências e perfis'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      className={`relative z-10 ${CARD_W} rounded-xl bg-gradient-to-b from-[#c45a1a] to-[#a84a14] text-center shadow-md shadow-[#8a3c10]/30 cursor-pointer hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#002B49]/50 ${
        collapsed ? 'ring-1 ring-[#002B49]/40' : ''
      }`}
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 rounded-full bg-[#002B49] pointer-events-none" />
      <div className="relative z-10 px-3 py-2.5">
        {mod.branch && (
          <span className="inline-block mb-1 text-[9px] font-bold text-[#ffe0c8] tracking-wide">
            {formatBranchLabel(mod.branch)}
          </span>
        )}
        <CardText align="center" className="text-[12px] text-white line-clamp-3">
          {formatModuleName(mod.number, mod.title, mod.branch)}
        </CardText>
        <p className="text-[10px] text-orange-100/85 mt-1 font-medium leading-snug">
          {hideMeetings ? `${mod.hours}h` : `${mod.hours}h · ${mod.meetings ?? 0} encontros`}
        </p>
      </div>
    </button>
  );
}

type LinkedProfile = { asp: GraduateProfileAspect; i: number };

const CompetenceBranch: React.FC<{
  competence: ModuleCompetenceItem;
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
  dir: Dir;
}> = ({ competence, aspects, aspectIndex, dir }) => {
  const [profilesHidden, setProfilesHidden] = useState(false);
  const linked = (competence.aspectIds || [])
    .map((id) => {
      const i = aspectIndex.get(id);
      return i === undefined ? null : { asp: aspects[i], i };
    })
    .filter((x): x is LinkedProfile => !!x);

  return (
    <BranchFrom
      dir={dir}
      bodyHidden={profilesHidden}
      bodyAttrs={{ 'data-map-collapse': 'profiles' } as React.HTMLAttributes<HTMLDivElement>}
      parent={
        <CompetenceBox
          text={competence.text}
          collapsed={profilesHidden}
          onToggle={() => setProfilesHidden((v) => !v)}
        />
      }
    >
      {linked.length === 0 ? (
        <span className="text-[10px] text-slate-400 italic px-1 w-[168px] text-center">
          Sem perfil
        </span>
      ) : (
        linked.map(({ asp, i }) => <ProfileBox key={asp.id} aspect={asp} index={i} />)
      )}
    </BranchFrom>
  );
};

const ModuleCompetenceBranches: React.FC<{
  mod: ModuleData;
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
  dir: Dir;
  bodyHidden: boolean;
}> = ({ mod, aspects, aspectIndex, dir, bodyHidden }) => {
  const comps = normalizeModuleCompetences(mod);
  const items =
    comps.length === 0
      ? [
          <span key="empty" className="text-[11px] text-slate-400 italic px-1">
            Sem competências
          </span>,
        ]
      : comps.map((c) => (
          <CompetenceBranch
            key={c.id}
            competence={c}
            aspects={aspects}
            aspectIndex={aspectIndex}
            dir={dir}
          />
        ));

  const bracket = (
    <SideBracket side={dir === 'ltr' ? 'right' : 'left'}>{items}</SideBracket>
  );
  const stem = <div className={`w-5 h-px shrink-0 ${LINE}`} />;

  return (
    <div
      data-map-collapse="module-body"
      aria-hidden={bodyHidden}
      className={`flex items-center transition-[opacity,filter,transform] duration-300 ease-out ${
        bodyHidden
          ? 'opacity-0 pointer-events-none blur-[1px] scale-[0.985]'
          : 'opacity-100'
      }`}
    >
      {dir === 'ltr' ? (
        <>
          {stem}
          {bracket}
        </>
      ) : (
        <>
          {bracket}
          {stem}
        </>
      )}
    </div>
  );
};

/** Lado LTR/RTL: módulo em coluna fixa + ramos, alinhados ao centro vertical do par. */
const ModuleCompetenceSide: React.FC<{
  mod: ModuleData;
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
  dir: Dir;
  hideMeetings?: boolean;
}> = ({ mod, aspects, aspectIndex, dir, hideMeetings }) => {
  const [bodyHidden, setBodyHidden] = useState(false);
  const box = (
    <ModuleBox
      mod={mod}
      hideMeetings={hideMeetings}
      collapsed={bodyHidden}
      onToggle={() => setBodyHidden((v) => !v)}
    />
  );
  const branches = (
    <ModuleCompetenceBranches
      mod={mod}
      aspects={aspects}
      aspectIndex={aspectIndex}
      dir={dir}
      bodyHidden={bodyHidden}
    />
  );

  if (dir === 'ltr') {
    return (
      <>
        <div className="flex items-center justify-center self-center">{box}</div>
        <div className="flex items-center justify-start min-w-0 self-center">{branches}</div>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center justify-end min-w-0 self-center">{branches}</div>
      <div className="flex items-center justify-center self-center">{box}</div>
    </>
  );
};

/** Uma linha espelhada: módulos nas colunas externas (alinhados entre pares e entre si). */
const MirroredModulePair: React.FC<{
  left?: ModuleData;
  right?: ModuleData;
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
  hideMeetings?: boolean;
}> = ({ left, right, aspects, aspectIndex, hideMeetings }) => (
  <div
    className="grid w-full items-center"
    style={{
      gridTemplateColumns: '168px minmax(min-content, 1fr) 2.5rem minmax(min-content, 1fr) 168px',
    }}
    data-map-pair="1"
  >
    {left ? (
      <ModuleCompetenceSide
        mod={left}
        aspects={aspects}
        aspectIndex={aspectIndex}
        dir="ltr"
        hideMeetings={hideMeetings}
      />
    ) : (
      <>
        <div />
        <div />
      </>
    )}
    <div className="w-10 justify-self-center" aria-hidden />
    {right ? (
      <ModuleCompetenceSide
        mod={right}
        aspects={aspects}
        aspectIndex={aspectIndex}
        dir="rtl"
        hideMeetings={hideMeetings}
      />
    ) : (
      <>
        <div />
        <div />
      </>
    )}
  </div>
);

/** Linhas espelhadas: ímpar LTR | espaço | par RTL. Módulos sempre alinhados. */
const MirroredModuleRows: React.FC<{
  chain: ModuleData[];
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
  label?: string;
  hideMeetings?: boolean;
}> = ({ chain, aspects, aspectIndex, label, hideMeetings }) => {
  if (chain.length === 0) return null;
  const pairs = pairModules(chain);

  return (
    <div className="w-max max-w-none min-w-full space-y-3">
      {label && (
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#002B49]/70 px-1 text-center">
          {label}
        </p>
      )}
      <div className="flex flex-col gap-14 items-stretch">
        {pairs.map((pair, idx) => (
          <MirroredModulePair
            key={pair.left?.id || pair.right?.id || idx}
            left={pair.left}
            right={pair.right}
            aspects={aspects}
            aspectIndex={aspectIndex}
            hideMeetings={hideMeetings}
          />
        ))}
      </div>
    </div>
  );
};

export function CompetencesMapLegend() {
  const items = [
    { color: 'bg-[#c45a1a]', label: 'Módulo' },
    { color: 'bg-[#002B49]', label: 'Competência' },
    { color: 'bg-[#f3ebe0] border border-[#c4b5a0]/60', label: 'Perfil do Egresso' },
  ];
  return (
    <div
      className="absolute bottom-3 left-3 z-30 flex flex-row flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#002B49]/12 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 shadow-sm pointer-events-auto max-w-[calc(100%-1.5rem)]"
      data-map-legend="competences"
    >
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${item.color}`} aria-hidden />
          <span className="text-[10px] font-semibold text-slate-600 whitespace-nowrap">
            {item.label}
          </span>
        </div>
      ))}
      <span className="text-[9px] text-slate-400 leading-snug whitespace-nowrap border-l border-slate-200 pl-3">
        Clique no módulo ou na competência
      </span>
    </div>
  );
}

interface CompetencesCurriculumMapProps {
  structure: CurriculumStructure;
}

export const CompetencesCurriculumMap: React.FC<CompetencesCurriculumMapProps> = ({
  structure,
}) => {
  const modules = structure.modules || [];
  const aspects = useMemo(() => getGraduateProfileAspects(structure), [structure]);
  const aspectIndex = useMemo(
    () => new Map(aspects.map((a, i) => [a.id, i])),
    [aspects]
  );
  const { trunk, branches } = useMemo(() => partitionBranches(modules), [modules]);
  const hideMeetings = !showsModuleMeetings(structure);

  /** Mesmo número de módulo em cada ênfase, lado a lado (VIII com VIII, IX com IX…). */
  const emphasisSteps = useMemo(() => {
    if (branches.length === 0) return [];
    const numbers = Array.from(
      new Set(branches.flatMap((b) => b.modules.map((m) => m.number)))
    ).sort((a, b) => a - b);
    return numbers.map((num) => ({
      number: num,
      modules: branches
        .map((b) => b.modules.find((m) => m.number === num))
        .filter((m): m is ModuleData => !!m),
    }));
  }, [branches]);

  if (modules.length === 0) {
    return (
      <div className="text-center text-slate-400 text-sm py-20">
        Nenhum módulo cadastrado nesta estrutura.
      </div>
    );
  }

  return (
    <div
      className="relative w-full space-y-12 pb-2 pt-3 px-1 flex flex-col items-center"
      data-map-canvas="competences"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 75% 50% at 15% 5%, rgba(168,196,176,0.12), transparent 55%), radial-gradient(ellipse 65% 45% at 92% 95%, rgba(255,107,0,0.06), transparent 50%), radial-gradient(ellipse 50% 40% at 55% 40%, rgba(0,43,73,0.03), transparent 60%)',
      }}
    >
      <MirroredModuleRows
        chain={trunk}
        aspects={aspects}
        aspectIndex={aspectIndex}
        hideMeetings={hideMeetings}
        label={trunk.length > 0 && branches.length > 0 ? 'Tronco comum' : undefined}
      />
      {emphasisSteps.length > 0 && (
        <div className="w-max max-w-none min-w-full space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#002B49]/70 px-1 text-center">
            Ênfases
          </p>
          <div className="flex flex-col gap-14 items-stretch">
            {emphasisSteps.map((step) => {
              if (step.modules.length >= 2) {
                const [left, right, ...rest] = step.modules;
                return (
                  <div key={`enf-${step.number}`} className="space-y-10">
                    <MirroredModulePair
                      left={left}
                      right={right}
                      aspects={aspects}
                      aspectIndex={aspectIndex}
                      hideMeetings={hideMeetings}
                    />
                    {rest.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-10">
                        {rest.map((mod) => (
                          <div
                            key={mod.id}
                            className="inline-grid items-center"
                            style={{ gridTemplateColumns: '168px auto' }}
                          >
                            <ModuleCompetenceSide
                              mod={mod}
                              aspects={aspects}
                              aspectIndex={aspectIndex}
                              dir="ltr"
                              hideMeetings={hideMeetings}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              const only = step.modules[0];
              if (!only) return null;
              return (
                <div
                  key={`enf-${step.number}`}
                  className="flex justify-center"
                >
                  <div
                    className="inline-grid items-center"
                    style={{ gridTemplateColumns: '168px auto' }}
                  >
                    <ModuleCompetenceSide
                      mod={only}
                      aspects={aspects}
                      aspectIndex={aspectIndex}
                      dir="ltr"
                      hideMeetings={hideMeetings}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
