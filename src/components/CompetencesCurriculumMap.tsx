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
import { formatModuleName } from '../utils/roman';
import { showsModuleMeetings } from '../services/workloadSummary';

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

const LINE = 'bg-[#002B49]/45';

function MapLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-bold leading-snug text-left whitespace-normal ${className}`}
      style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}
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

/** Pai + bracket (LTR: pai|filhos · RTL: filhos|pai). */
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
      style={{
        ...((bodyAttrs?.style as React.CSSProperties) || {}),
      }}
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

const ProfileBox: React.FC<{
  aspect: GraduateProfileAspect;
  index: number;
}> = ({ aspect, index }) => {
  const title = aspect.title?.trim() || aspectShortLabel(aspect, index);
  return (
    <div
      className="rounded-lg bg-[#4a7fa3] px-3.5 py-2 shadow-sm w-max min-w-[8.5rem] max-w-[18rem]"
      data-map-role="perfil"
    >
      <MapLabel className="flex items-start gap-2 text-[11px] text-white">
        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-white/90 shrink-0" aria-hidden />
        <span>{title}</span>
      </MapLabel>
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
      className={`rounded-lg bg-[#2a5f87] px-3.5 py-2.5 shadow-sm w-max min-w-[10rem] max-w-[22rem] text-left cursor-pointer hover:brightness-110 transition-[filter,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]/60 ${
        collapsed ? 'ring-1 ring-white/25' : ''
      }`}
    >
      <MapLabel className="text-[12px] text-white">{text}</MapLabel>
    </button>
  );
}

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
      className="relative rounded-xl bg-[#002B49] px-4 py-3 shadow-md shadow-[#002B49]/20 w-max min-w-[11rem] max-w-[20rem] text-left cursor-pointer hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]/60"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 rounded-full bg-[#FF6B00]" />
      {mod.branch && (
        <span className="inline-block mb-1 text-[10px] font-bold text-amber-300 border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 rounded-full">
          Trilha {mod.branch}
        </span>
      )}
      <MapLabel className="text-[13px] text-white">
        {formatModuleName(mod.number, mod.title, mod.branch)}
      </MapLabel>
      <p className="text-[10px] text-blue-200/80 mt-1 font-medium leading-snug">
        {hideMeetings ? `${mod.hours}h` : `${mod.hours}h · ${mod.meetings ?? 0} encontros`}
      </p>
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
        <span className="text-[10px] text-slate-400 italic px-1">Sem perfil</span>
      ) : (
        linked.map(({ asp, i }) => (
          <ProfileBox key={asp.id} aspect={asp} index={i} />
        ))
      )}
    </BranchFrom>
  );
};

const ModuleCompetenceTree: React.FC<{
  mod: ModuleData;
  aspects: GraduateProfileAspect[];
  aspectIndex: Map<string, number>;
  dir: Dir;
  hideMeetings?: boolean;
}> = ({ mod, aspects, aspectIndex, dir, hideMeetings }) => {
  const [bodyHidden, setBodyHidden] = useState(false);
  const comps = normalizeModuleCompetences(mod);

  if (comps.length === 0) {
    return (
      <BranchFrom
        dir={dir}
        bodyHidden={bodyHidden}
        bodyAttrs={{ 'data-map-collapse': 'module-body' } as React.HTMLAttributes<HTMLDivElement>}
        parent={
          <ModuleBox
            mod={mod}
            hideMeetings={hideMeetings}
            collapsed={bodyHidden}
            onToggle={() => setBodyHidden((v) => !v)}
          />
        }
      >
        <span className="text-[11px] text-slate-400 italic px-1">Sem competências</span>
      </BranchFrom>
    );
  }

  return (
    <BranchFrom
      dir={dir}
      bodyHidden={bodyHidden}
      bodyAttrs={{ 'data-map-collapse': 'module-body' } as React.HTMLAttributes<HTMLDivElement>}
      parent={
        <ModuleBox
          mod={mod}
          hideMeetings={hideMeetings}
          collapsed={bodyHidden}
          onToggle={() => setBodyHidden((v) => !v)}
        />
      }
    >
      {comps.map((c) => (
        <CompetenceBranch
          key={c.id}
          competence={c}
          aspects={aspects}
          aspectIndex={aspectIndex}
          dir={dir}
        />
      ))}
    </BranchFrom>
  );
};

/** Linhas espelhadas: ímpar LTR | espaço | par RTL. */
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
    <div className="space-y-3">
      {label && (
        <p className="text-[12px] font-bold uppercase tracking-wider text-[#002B49]/70 px-1">
          {label}
        </p>
      )}
      <div className="flex flex-col gap-14">
        {pairs.map((pair, idx) => (
          <div
            key={pair.left?.id || pair.right?.id || idx}
            className="inline-flex w-max max-w-none items-start"
          >
            <div className="flex shrink-0 justify-end pr-5">
              {pair.left && (
                <ModuleCompetenceTree
                  mod={pair.left}
                  aspects={aspects}
                  aspectIndex={aspectIndex}
                  dir="ltr"
                  hideMeetings={hideMeetings}
                />
              )}
            </div>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex shrink-0 justify-start pl-5">
              {pair.right && (
                <ModuleCompetenceTree
                  mod={pair.right}
                  aspects={aspects}
                  aspectIndex={aspectIndex}
                  dir="rtl"
                  hideMeetings={hideMeetings}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export function CompetencesMapLegend() {
  const items = [
    { color: 'bg-[#002B49]', label: 'Módulo' },
    { color: 'bg-[#2a5f87]', label: 'Competência' },
    { color: 'bg-[#4a7fa3]', label: 'Perfil do Egresso' },
  ];
  return (
    <div
      className="absolute bottom-3 left-3 z-30 flex flex-row flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[#002B49]/10 bg-white/95 backdrop-blur-sm px-2.5 py-1.5 shadow-sm pointer-events-auto max-w-[calc(100%-1.5rem)]"
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

  if (modules.length === 0) {
    return (
      <div className="text-center text-slate-400 text-sm py-20">
        Nenhum módulo cadastrado nesta estrutura.
      </div>
    );
  }

  return (
    <div className="relative w-max min-w-full space-y-12 pb-2 pt-2" data-map-canvas="competences">
      <MirroredModuleRows
        chain={trunk}
        aspects={aspects}
        aspectIndex={aspectIndex}
        hideMeetings={hideMeetings}
        label={trunk.length > 0 && branches.length > 0 ? 'Tronco comum' : undefined}
      />
      {branches.map((b) => (
        <MirroredModuleRows
          key={b.key}
          chain={b.modules}
          aspects={aspects}
          aspectIndex={aspectIndex}
          hideMeetings={hideMeetings}
          label={`Trilha ${b.key}`}
        />
      ))}
    </div>
  );
};
