import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CurriculumStructure,
  ModuleData,
  AppSettings,
  Discipline,
  CompetencyCHA,
  PeriodData,
  isFilledComponentCode,
} from '../types/curriculum';
import { getModularComponents } from '../utils/modularComponents';
import {
  Table as TableIcon,
  FileText,
  Download,
  Share2,
  BookOpen,
  Shield,
  Network,
  Eye,
  EyeOff,
  Layers3,
  ArrowRight,
  Clock,
  GitBranch,
  Hand,
} from 'lucide-react';
import { exportToPNG, exportElementToPDF, exportMapToHTML } from '../services/exportService';
import { WorkloadSummaryCard } from './WorkloadSummaryCard';
import { ModuleMeetingsSummaryCard } from './ModuleMeetingsSummaryCard';
import { StructureOfficialHeader } from './StructureOfficialHeader';
import { CompetencesCurriculumMap } from './CompetencesCurriculumMap';
import { showsModuleMeetings } from '../services/workloadSummary';
import { labelForCategory } from '../utils/nomenclature';
import { formatModuleName } from '../utils/roman';

type GraphMapMode = 'pedagogical' | 'competences';

interface CurriculumGraphViewProps {
  structure: CurriculumStructure;
  settings: AppSettings;
  onSwitchToTable: () => void;
}

function SaberIcon({ category, className }: { category: string; className?: string }) {
  const c = category.toLowerCase();
  if (c.includes('atitude') || c.includes('atitudinal')) return <Shield className={className} />;
  if (c.includes('habilidade') || c.includes('procedimental')) return <Network className={className} />;
  return <BookOpen className={className} />;
}

function getModuleConhecimentos(mod: ModuleData): Array<{
  id: string;
  name: string;
  code?: string;
  hours: number;
  category?: string;
}> {
  return getModularComponents(mod).map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    hours: d.hours || 0,
    category: 'conhecimento',
  }));
}

/** Ordena uma cadeia usando parentModuleId quando disponível; senão por number. */
function sortModuleChain(list: ModuleData[]): ModuleData[] {
  if (list.length <= 1) return list;

  const ids = new Set(list.map((m) => m.id));

  // Raízes: sem parent na mesma lista (ou sem parent)
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
    const kids = (childrenOf.get(m.id) || []).sort(
      (a, b) => a.number - b.number || a.code.localeCompare(b.code)
    );
    kids.forEach(visit);
  };

  roots
    .sort((a, b) => a.number - b.number || a.code.localeCompare(b.code))
    .forEach(visit);

  // Inclui órfãos não alcançados
  list.forEach((m) => {
    if (!ordered.find((o) => o.id === m.id)) ordered.push(m);
  });

  return ordered;
}

interface BranchGroup {
  key: string;
  name: string;
  modules: ModuleData[];
}

/** Particiona qualquer estrutura modular: tronco + N ramificações (A, B, C…). */
function partitionModules(modules: ModuleData[]): {
  trunk: ModuleData[];
  branches: BranchGroup[];
} {
  const trunk = sortModuleChain(modules.filter((m) => !m.branch));
  const map = new Map<string, ModuleData[]>();

  modules.forEach((m) => {
    if (!m.branch) return;
    const key = String(m.branch).toUpperCase();
    const arr = map.get(key) || [];
    arr.push(m);
    map.set(key, arr);
  });

  const branches: BranchGroup[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({
      key,
      name: list.find((m) => m.branchName)?.branchName || `Trilha ${key}`,
      modules: sortModuleChain(list),
    }));

  return { trunk, branches };
}

function ItemNode({
  kind,
  label,
  name,
  hours,
  category,
}: {
  kind: 'conhecimento' | 'saber';
  label: string;
  name: string;
  hours?: number;
  category?: string;
}) {
  const isConhecimento = kind === 'conhecimento';

  return (
    <div
      className={`w-full min-w-[170px] max-w-[200px] rounded-xl px-2.5 py-2 border ${
        isConhecimento
          ? 'bg-white border-[#002B49]/12 shadow-sm'
          : 'bg-white border-[#FF6B00]/20 shadow-sm'
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
            isConhecimento ? 'bg-[#002B49]/8 text-[#002B49]' : 'bg-[#FF6B00]/10 text-[#FF6B00]'
          }`}
        >
          <SaberIcon
            category={
              isConhecimento
                ? 'conhecimento'
                : category ||
                  (label.toLowerCase().includes('fazer') || label.toLowerCase().includes('procedimental')
                    ? 'habilidade'
                    : label.toLowerCase().includes('ser') || label.toLowerCase().includes('atitudinal')
                    ? 'atitude'
                    : 'conceitual')
            }
            className="w-3 h-3"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <p
              className={`text-[9px] font-semibold uppercase tracking-wide break-words ${
                isConhecimento ? 'text-[#002B49]/70' : 'text-[#FF6B00]'
              }`}
            >
              {label}
            </p>
            {hours !== undefined && hours > 0 && (
              <span
                className={`text-[9px] font-bold tabular-nums shrink-0 whitespace-nowrap ${
                  isConhecimento ? 'text-[#002B49]' : 'text-[#FF6B00]'
                }`}
              >
                {hours}h
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-700 leading-snug mt-0.5 font-medium break-words whitespace-normal">
            {name}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stem({ direction }: { direction: 'up' | 'down' }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div
        className={`w-px h-6 ${
          direction === 'up'
            ? 'bg-gradient-to-t from-[#002B49]/40 to-[#002B49]/10'
            : 'bg-gradient-to-b from-[#FF6B00]/50 to-[#FF6B00]/15'
        }`}
      />
    </div>
  );
}

function ModuleNode({
  mod,
  nodeRef,
  hideMeetings,
}: {
  mod: ModuleData;
  nodeRef?: React.Ref<HTMLDivElement>;
  hideMeetings?: boolean;
}) {
  return (
    <div
      ref={nodeRef}
      data-module-anchor
      className="relative z-10 w-[168px] rounded-xl bg-[#002B49] px-3 py-2.5 text-center shadow-md shadow-[#002B49]/25"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 rounded-full bg-[#FF6B00]" />
      <p className="text-[12px] font-bold text-white leading-snug">
        {formatModuleName(mod.number, mod.title, mod.branch)}
      </p>
      <p className="text-[10px] text-blue-200/80 mt-1 font-medium leading-snug">
        {hideMeetings ? `${mod.hours}h` : `${mod.hours}h · ${mod.meetings ?? 0} encontros`}
      </p>
    </div>
  );
}

function ModuleConnector() {
  return (
    <div className="flex items-center self-center shrink-0 px-1 h-full">
      <div className="w-7 h-px bg-[#002B49]/20" />
      <div className="w-7 h-7 rounded-full bg-white border border-[#002B49]/12 flex items-center justify-center shadow-sm">
        <ArrowRight className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={2.5} />
      </div>
      <div className="w-7 h-px bg-[#002B49]/20" />
    </div>
  );
}

/**
 * Cadeia com módulos SEMPRE alinhados na mesma linha horizontal.
 * Conhecimentos ficam acima e saberes abaixo, sem empurrar o nó do módulo.
 */
function ModuleChain({
  modules,
  showConhecimentos,
  showSaberes,
  firstModuleRef,
  lastModuleRef,
  nomenclature = 'cha',
  hideMeetings = false,
}: {
  modules: ModuleData[];
  showConhecimentos: boolean;
  showSaberes: boolean;
  firstModuleRef?: React.Ref<HTMLDivElement>;
  lastModuleRef?: React.Ref<HTMLDivElement>;
  nomenclature?: AppSettings['pedagogicalNomenclature'];
  hideMeetings?: boolean;
}) {
  if (modules.length === 0) return null;

  const colTemplate = modules
    .map((_, i) => (i < modules.length - 1 ? '188px auto' : '188px'))
    .join(' ');

  return (
    <div
      className="inline-grid items-stretch"
      style={{
        gridTemplateColumns: colTemplate,
        gridTemplateRows: `${showConhecimentos ? 'auto' : '0fr'} auto ${showSaberes ? 'auto' : '0fr'}`,
      }}
    >
      {/* Linha 1 — conhecimentos */}
      {showConhecimentos &&
        modules.map((mod, idx) => {
          const items = getModuleConhecimentos(mod);
          return (
            <React.Fragment key={`k-${mod.id}`}>
              <div
                className="flex flex-col items-center justify-end gap-2 px-1 pb-0 self-end"
                style={{ gridColumn: idx * 2 + 1, gridRow: 1 }}
              >
                {items.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Sem conhecimentos</p>
                ) : (
                  items.map((item) => (
                    <div key={item.id}>
                      <ItemNode
                        kind="conhecimento"
                        label="Conhecimento"
                        name={item.name}
                        hours={item.hours}
                        category={item.category}
                      />
                    </div>
                  ))
                )}
                <Stem direction="up" />
              </div>
              {idx < modules.length - 1 && (
                <div style={{ gridColumn: idx * 2 + 2, gridRow: 1 }} />
              )}
            </React.Fragment>
          );
        })}

      {/* Linha 2 — módulos alinhados + conectores */}
      {modules.map((mod, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === modules.length - 1;
        const ref =
          isFirst && isLast
            ? (el: HTMLDivElement | null) => {
                if (typeof firstModuleRef === 'function') firstModuleRef(el);
                else if (firstModuleRef && 'current' in firstModuleRef)
                  (firstModuleRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                if (typeof lastModuleRef === 'function') lastModuleRef(el);
                else if (lastModuleRef && 'current' in lastModuleRef)
                  (lastModuleRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }
            : isFirst
            ? firstModuleRef
            : isLast
            ? lastModuleRef
            : undefined;

        return (
          <React.Fragment key={`m-${mod.id}`}>
            <div
              className="flex items-center justify-center px-1"
              style={{ gridColumn: idx * 2 + 1, gridRow: 2 }}
            >
              <ModuleNode mod={mod} nodeRef={ref} hideMeetings={hideMeetings} />
            </div>
            {idx < modules.length - 1 && (
              <div
                className="flex items-center justify-center"
                style={{ gridColumn: idx * 2 + 2, gridRow: 2 }}
              >
                <ModuleConnector />
              </div>
            )}
          </React.Fragment>
        );
      })}

      {/* Linha 3 — saberes */}
      {showSaberes &&
        modules.map((mod, idx) => {
          const saberes = mod.competencies || [];
          return (
            <React.Fragment key={`s-${mod.id}`}>
              <div
                className="flex flex-col items-center justify-start gap-2 px-1 self-start"
                style={{ gridColumn: idx * 2 + 1, gridRow: 3 }}
              >
                <Stem direction="down" />
                {saberes.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Sem saberes</p>
                ) : (
                  saberes.map((s: CompetencyCHA) => (
                    <div key={s.id}>
                      <ItemNode
                        kind="saber"
                        label={labelForCategory(s.category, nomenclature)}
                        name={s.name}
                        category={s.category}
                      />
                    </div>
                  ))
                )}
              </div>
              {idx < modules.length - 1 && (
                <div style={{ gridColumn: idx * 2 + 2, gridRow: 3 }} />
              )}
            </React.Fragment>
          );
        })}
    </div>
  );
}

function BranchLaneLabel({
  lane,
  name,
}: {
  lane: 'cima' | 'baixo';
  name: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-1.5 w-full ${
        lane === 'cima' ? 'mt-3 text-[#002B49]' : 'mb-3 text-[#FF6B00]'
      }`}
    >
      <GitBranch className="w-3 h-3 shrink-0" />
      <span className="text-[9px] font-bold uppercase tracking-wider text-center">{name}</span>
    </div>
  );
}

/** Divide períodos em 2 linhas: se ímpar, sobra na de cima; a de baixo fica centralizada. */
function splitPeriodsInTwoRows(periods: PeriodData[]): {
  top: PeriodData[];
  bottom: PeriodData[];
} {
  const sorted = [...periods].sort((a, b) => a.number - b.number);
  const topCount = Math.ceil(sorted.length / 2);
  return {
    top: sorted.slice(0, topCount),
    bottom: sorted.slice(topCount),
  };
}

function PeriodColumn({
  period,
  title,
  disciplines,
  defaultExpanded = true,
}: {
  period: PeriodData;
  title?: string;
  disciplines: Discipline[];
  defaultExpanded?: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center self-start w-[200px] shrink-0 px-1.5"
      data-period-card
    >
      <button
        type="button"
        data-period-toggle
        className="relative w-full max-w-[188px] min-h-[72px] rounded-xl bg-[#002B49] px-3 py-2.5 text-center shadow-md shadow-[#002B49]/25 hover:bg-[#003a63] transition"
        aria-expanded={defaultExpanded ? 'true' : 'false'}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-1 rounded-full bg-[#FF6B00]" />
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#FF6B00]">
          {title ? 'Bloco Curricular' : `Período ${period.number}`}
        </p>
        <p className="text-[12px] font-bold text-white mt-1 leading-snug">
          {title || `${period.number}º Período Letivo`}
        </p>
        <p className="text-[10px] text-blue-200/80 mt-1 leading-snug">{period.totalHours}h</p>
      </button>
      <Stem direction="down" />
      <div data-period-body className="flex flex-col gap-1.5 w-full items-center">
        {disciplines.length === 0 ? (
          <p className="text-[10px] text-slate-400 italic">Sem disciplinas</p>
        ) : (
          disciplines.map((d) => (
            <div key={d.id} className="w-full flex justify-center">
              <ItemNode
                kind="conhecimento"
                label={isFilledComponentCode(d.code) ? d.code : 'Disciplina'}
                name={d.name}
                hours={d.hours}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PeriodRow({ periods }: { periods: PeriodData[] }) {
  if (periods.length === 0) return null;
  return (
    <div className="w-full flex justify-center">
      <div className="inline-flex items-start justify-center">
        {periods.map((period, idx) => {
          const regular = (period.disciplines || []).filter((d) => d.type !== 'Optativa');
          return (
            <React.Fragment key={period.id}>
              <PeriodColumn
                period={{
                  ...period,
                  totalHours: regular.reduce((s, d) => s + (d.hours || 0), 0) || period.totalHours,
                  totalCredits:
                    regular.reduce((s, d) => s + (d.credits || 0), 0) || period.totalCredits,
                  disciplines: regular,
                }}
                disciplines={regular}
              />
              {idx < periods.length - 1 && (
                <div className="flex items-center shrink-0 self-start pt-[38px]">
                  <ModuleConnector />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function DisciplinaryCurriculumMap({ periods }: { periods: PeriodData[] }) {
  const allDisciplines = periods.flatMap((p) => p.disciplines || []);
  const optativas = allDisciplines.filter((d) => d.type === 'Optativa');
  const { top, bottom } = splitPeriodsInTwoRows(periods);

  const optativaPeriod: PeriodData = {
    id: 'optativas-bloco',
    number: 0,
    disciplines: optativas,
    totalCredits: optativas.reduce((s, d) => s + (Number(d.credits) || 0), 0),
    totalHours: optativas.reduce((s, d) => s + (Number(d.hours) || 0), 0),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-[#002B49]" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#002B49]">
            Períodos Letivos
          </h3>
        </div>
        <span className="no-export inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <Hand className="w-3.5 h-3.5" />
          Segure e arraste para navegar
        </span>
      </div>

      <PanViewport className="max-h-[min(75vh,820px)] rounded-2xl border border-[#002B49]/8 bg-white/40 p-4">
        <div className="mx-auto flex w-max min-w-full flex-col items-center justify-center gap-12 px-4 py-6">
          <PeriodRow periods={top} />
          {bottom.length > 0 && <PeriodRow periods={bottom} />}

          {optativas.length > 0 && (
            <div className="flex w-full justify-center pt-2">
              <PeriodColumn
                period={optativaPeriod}
                title="Disciplinas Optativas"
                disciplines={optativas}
              />
            </div>
          )}
        </div>
      </PanViewport>
    </div>
  );
}

function PanViewport({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const origin = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Não inicia pan em controles / nós clicáveis
    if (target.closest('button, a, input, label, select, textarea, [data-no-pan]')) return;

    const el = ref.current;
    if (!el) return;
    dragging.current = true;
    setIsDragging(true);
    origin.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !ref.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    ref.current.scrollLeft = origin.current.left - dx;
    ref.current.scrollTop = origin.current.top - dy;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`overflow-auto select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${className}`}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  );
}

function elbowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const midX = x1 + Math.max(36, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

/** Mapa contínuo com bifurcação Y até os módulos e alinhamento horizontal dos nós. */
function ModularCurriculumMap({
  modules,
  showConhecimentos,
  showSaberes,
  nomenclature = 'cha',
  hideMeetings = false,
}: {
  modules: ModuleData[];
  showConhecimentos: boolean;
  showSaberes: boolean;
  nomenclature?: AppSettings['pedagogicalNomenclature'];
  hideMeetings?: boolean;
}) {
  const { trunk, branches } = useMemo(() => partitionModules(modules), [modules]);

  const displayTrunk =
    trunk.length > 0
      ? trunk
      : branches.length === 0
      ? sortModuleChain(modules)
      : [];

  const upperBranch =
    branches.find((b) => b.key === 'A') || (branches.length > 0 ? branches[0] : null);
  const lowerBranch =
    branches.find((b) => b.key === 'B') ||
    (branches.length > 1 ? branches.find((b) => b !== upperBranch) || null : null);
  const extraBranches = branches.filter((b) => b !== upperBranch && b !== lowerBranch);
  const hasFork = branches.length > 0;

  const canvasRef = useRef<HTMLDivElement>(null);
  const trunkEndRef = useRef<HTMLDivElement>(null);
  const upperStartRef = useRef<HTMLDivElement>(null);
  const lowerStartRef = useRef<HTMLDivElement>(null);
  const [forkPaths, setForkPaths] = useState<{ upper?: string; lower?: string }>({});

  const redrawFork = useCallback(() => {
    const canvas = canvasRef.current;
    const from = trunkEndRef.current;
    if (!canvas || !from) {
      setForkPaths({});
      return;
    }
    const c = canvas.getBoundingClientRect();
    const f = from.getBoundingClientRect();
    const x1 = f.right - c.left;
    const y1 = f.top + f.height / 2 - c.top;

    const next: { upper?: string; lower?: string } = {};
    if (upperStartRef.current) {
      const u = upperStartRef.current.getBoundingClientRect();
      const x2 = u.left - c.left;
      const y2 = u.top + u.height / 2 - c.top;
      next.upper = elbowPath(x1, y1, x2, y2);
    }
    if (lowerStartRef.current) {
      const l = lowerStartRef.current.getBoundingClientRect();
      const x2 = l.left - c.left;
      const y2 = l.top + l.height / 2 - c.top;
      next.lower = elbowPath(x1, y1, x2, y2);
    }
    setForkPaths(next);
  }, []);

  useLayoutEffect(() => {
    redrawFork();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => redrawFork());
    ro.observe(canvas);
    if (trunkEndRef.current) ro.observe(trunkEndRef.current);
    if (upperStartRef.current) ro.observe(upperStartRef.current);
    if (lowerStartRef.current) ro.observe(lowerStartRef.current);

    window.addEventListener('resize', redrawFork);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', redrawFork);
    };
  }, [
    redrawFork,
    displayTrunk,
    upperBranch,
    lowerBranch,
    showConhecimentos,
    showSaberes,
  ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]" />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#002B49]">
            {hasFork ? 'Trilha Formativa com Ramificação' : 'Trilha Formativa'}
          </h3>
        </div>
        <span className="no-export inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <Hand className="w-3.5 h-3.5" />
          Segure e arraste para navegar
        </span>
      </div>

      <PanViewport className="max-h-[min(75vh,820px)] rounded-2xl border border-[#002B49]/8 bg-white/40 p-4">
        <div ref={canvasRef} className="relative inline-block min-w-full pr-4 pb-4">
          {/* SVG das setas da bifurcação — do módulo 8 até 9A/9B */}
          {hasFork && (forkPaths.upper || forkPaths.lower) && (
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width="100%"
              height="100%"
            >
              <defs>
                <marker
                  id="fork-arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="#FF6B00" />
                </marker>
              </defs>
              {forkPaths.upper && (
                <path
                  d={forkPaths.upper}
                  fill="none"
                  stroke="#002B49"
                  strokeWidth="1.75"
                  strokeOpacity="0.45"
                  markerEnd="url(#fork-arrow)"
                />
              )}
              {forkPaths.lower && (
                <path
                  d={forkPaths.lower}
                  fill="none"
                  stroke="#FF6B00"
                  strokeWidth="1.75"
                  strokeOpacity="0.7"
                  markerEnd="url(#fork-arrow)"
                />
              )}
            </svg>
          )}

          {!hasFork ? (
            <ModuleChain
              modules={displayTrunk}
              showConhecimentos={showConhecimentos}
              showSaberes={showSaberes}
              nomenclature={nomenclature}
              hideMeetings={hideMeetings}
            />
          ) : (
            <div
              className="inline-grid gap-x-10 gap-y-8 items-center"
              style={{
                gridTemplateColumns: 'auto auto',
                gridTemplateRows: 'auto auto auto',
              }}
            >
              {/* Tronco — módulos alinhados entre si */}
              <div className="row-span-3 flex items-center self-center">
                <ModuleChain
                  modules={displayTrunk}
                  showConhecimentos={showConhecimentos}
                  showSaberes={showSaberes}
                  nomenclature={nomenclature}
                  hideMeetings={hideMeetings}
                  lastModuleRef={trunkEndRef}
                />
              </div>

              {/* Trilha A — direita / cima; título ABAIXO do conteúdo (perto da bifurcação) */}
              <div className="row-start-1 col-start-2 flex flex-col items-center">
                {upperBranch && (
                  <>
                    <ModuleChain
                      modules={upperBranch.modules}
                      showConhecimentos={showConhecimentos}
                      showSaberes={showSaberes}
                      nomenclature={nomenclature}
                      hideMeetings={hideMeetings}
                      firstModuleRef={upperStartRef}
                    />
                    <BranchLaneLabel
                      lane="cima"
                      name={`Trilha ${upperBranch.key} — ${upperBranch.name}`}
                    />
                  </>
                )}
              </div>

              <div className="row-start-2 col-start-2 h-4" />

              {/* Trilha B — direita / baixo; título ACIMA do conteúdo (perto da bifurcação) */}
              <div className="row-start-3 col-start-2 flex flex-col items-center">
                {lowerBranch && (
                  <>
                    <BranchLaneLabel
                      lane="baixo"
                      name={`Trilha ${lowerBranch.key} — ${lowerBranch.name}`}
                    />
                    <ModuleChain
                      modules={lowerBranch.modules}
                      showConhecimentos={showConhecimentos}
                      showSaberes={showSaberes}
                      nomenclature={nomenclature}
                      hideMeetings={hideMeetings}
                      firstModuleRef={lowerStartRef}
                    />
                  </>
                )}
                {extraBranches.map((br) => (
                  <div key={br.key} className="mt-6 flex flex-col items-center">
                    <BranchLaneLabel lane="baixo" name={`Trilha ${br.key} — ${br.name}`} />
                    <ModuleChain
                      modules={br.modules}
                      showConhecimentos={showConhecimentos}
                      showSaberes={showSaberes}
                      nomenclature={nomenclature}
                      hideMeetings={hideMeetings}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PanViewport>
    </div>
  );
}


export const CurriculumGraphView: React.FC<CurriculumGraphViewProps> = ({
  structure,
  settings,
  onSwitchToTable,
}) => {
  const isModular = structure.structureType === 'modular';
  const modules = structure.modules || [];
  const periods = structure.periods || [];

  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<GraphMapMode>('pedagogical');
  const [showConhecimentosOnMap, setShowConhecimentosOnMap] = useState(true);
  const [showSaberesOnMap, setShowSaberesOnMap] = useState(true);
  const [showWorkloadSummaryOnMap, setShowWorkloadSummaryOnMap] = useState(
    !(structure.hideWorkloadSummaryInReport ?? false)
  );

  // Ao trocar de curso/estrutura, restaura visibilidade do mapa
  useEffect(() => {
    setShowConhecimentosOnMap(true);
    setShowSaberesOnMap(true);
    setShowWorkloadSummaryOnMap(!(structure.hideWorkloadSummaryInReport ?? false));
    setMapMode('pedagogical');
  }, [structure.id, structure.hideWorkloadSummaryInReport]);

  const mapExportBase =
    mapMode === 'competences'
      ? `${structure.code}_Mapa_Competencias`
      : `${structure.code}_Mapa_Curricular`;

  const handleExportPNG = async () => {
    setIsExporting(true);
    try {
      await exportToPNG('graph-export-container', mapExportBase, {
        structure,
        settings,
        includePpcSummary: false,
        includeReportNotes: false,
      });
      setExportToast('PNG do mapa gerado com sucesso.');
      setTimeout(() => setExportToast(null), 3000);
    } catch (e) {
      console.error(e);
      setExportToast('Erro ao gerar PNG do mapa.');
      setTimeout(() => setExportToast(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMapPDF = async () => {
    setIsExporting(true);
    try {
      await exportElementToPDF('graph-export-container', mapExportBase, {
        structure,
        settings,
        includePpcSummary: false,
        includeReportNotes: false,
      });
      setExportToast('PDF do mapa gerado com sucesso.');
      setTimeout(() => setExportToast(null), 3000);
    } catch (e) {
      console.error(e);
      setExportToast('Erro ao gerar PDF do mapa.');
      setTimeout(() => setExportToast(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMapHTML = async () => {
    try {
      await exportMapToHTML('graph-export-container', structure, undefined, settings);
      setExportToast(
        isModular
          ? 'HTML gerado com seletor dos dois mapas.'
          : 'HTML do mapa gerado e download iniciado.'
      );
      setTimeout(() => setExportToast(null), 3000);
    } catch (e) {
      console.error(e);
      setExportToast('Erro ao gerar HTML do mapa.');
      setTimeout(() => setExportToast(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-[#002B49] tracking-tight">
                {mapMode === 'competences' ? 'Mapa de Competências' : 'Mapa Curricular'}
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                Código: <strong className="text-[#002B49] font-mono">{structure.code}</strong>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FF6B00]/10 text-[#FF6B00] border border-[#FF6B00]/20">
                {isModular ? 'Modular' : 'Disciplinar'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {structure.courseName}
              {mapMode === 'competences'
                ? ' · Aspectos do perfil · Competências por módulo · Selos de vínculo'
                : isModular
                  ? ' · Conhecimentos acima · Módulo · Saberes abaixo'
                  : ' · Períodos em duas linhas · Disciplinas optativas centralizadas'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onSwitchToTable}
              className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 border border-slate-200"
            >
              <TableIcon className="w-3.5 h-3.5" />
              Tabela
            </button>
            <button
              onClick={handleExportMapPDF}
              disabled={isExporting}
              title={
                mapMode === 'competences'
                  ? 'Baixar PDF do Mapa de Competências (mapa atual)'
                  : 'Baixar PDF do Mapa Pedagógico (mapa atual)'
              }
              className="px-3.5 py-2 rounded-xl bg-[#002B49] hover:bg-[#003a63] text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-[#FF6B00]" />
              PDF
            </button>
            <button
              onClick={handleExportPNG}
              disabled={isExporting}
              title={
                mapMode === 'competences'
                  ? 'Baixar PNG do Mapa de Competências (mapa atual)'
                  : 'Baixar PNG do Mapa Pedagógico (mapa atual)'
              }
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-orange-50 text-[#FF6B00] text-xs font-bold transition flex items-center gap-1.5 border border-[#FF6B00]/30 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {isExporting ? 'Exportando...' : 'PNG'}
            </button>
            <button
              onClick={handleExportMapHTML}
              title={
                isModular
                  ? 'Baixar HTML com seletor dos dois mapas'
                  : 'Baixar HTML do Mapa Curricular'
              }
              className="px-3.5 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#e05e00] text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              HTML
            </button>
          </div>
        </div>

        {exportToast && (
          <div className="no-export text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {exportToast}
          </div>
        )}

        <div className="no-export flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100">
          {isModular && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setMapMode('pedagogical')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  mapMode === 'pedagogical'
                    ? 'bg-[#002B49] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Mapa Pedagógico
              </button>
              <button
                type="button"
                onClick={() => setMapMode('competences')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  mapMode === 'competences'
                    ? 'bg-[#FF6B00] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Mapa de Competências
              </button>
            </div>
          )}
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers3 className="w-3.5 h-3.5 text-[#002B49]" />
            Exibição no mapa (PDF / PNG · HTML traz os dois)
          </span>
          {isModular && mapMode === 'pedagogical' && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showConhecimentosOnMap}
                  onChange={(e) => setShowConhecimentosOnMap(e.target.checked)}
                  className="rounded text-[#002B49]"
                />
                <span className="flex items-center gap-1">
                  {showConhecimentosOnMap ? (
                    <Eye className="w-3.5 h-3.5 text-[#002B49]" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  Conhecimentos
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSaberesOnMap}
                  onChange={(e) => setShowSaberesOnMap(e.target.checked)}
                  className="rounded text-[#FF6B00]"
                />
                <span className="flex items-center gap-1">
                  {showSaberesOnMap ? (
                    <Eye className="w-3.5 h-3.5 text-[#FF6B00]" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  Saberes
                </span>
              </label>
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showWorkloadSummaryOnMap}
              onChange={(e) => setShowWorkloadSummaryOnMap(e.target.checked)}
              className="rounded text-[#002B49]"
            />
            <span className="flex items-center gap-1">
              {showWorkloadSummaryOnMap ? (
                <Eye className="w-3.5 h-3.5 text-[#002B49]" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              Resumo de Carga Horária
            </span>
          </label>
        </div>
      </div>

      <div
        id="graph-export-container"
        className="relative rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden"
        data-active-map={isModular ? mapMode : 'disciplinary'}
        style={{
          background: 'linear-gradient(165deg, #f7f9fc 0%, #eef3f9 45%, #fff7f0 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(0,43,73,0.06) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative p-4 md:p-6 space-y-5">
          <StructureOfficialHeader structure={structure} />

          {isModular ? (
            modules.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-20">
                Nenhum módulo cadastrado nesta estrutura.
              </div>
            ) : (
              <>
                <div
                  data-map-view="pedagogical"
                  data-map-title="Mapa Pedagógico"
                  style={{ display: mapMode === 'pedagogical' ? 'block' : 'none' }}
                >
                  <ModularCurriculumMap
                    modules={modules}
                    showConhecimentos={showConhecimentosOnMap}
                    showSaberes={showSaberesOnMap}
                    nomenclature={settings.pedagogicalNomenclature}
                    hideMeetings={!!structure.hideMeetings}
                  />
                </div>
                <div
                  data-map-view="competences"
                  data-map-title="Mapa de Competências"
                  style={{ display: mapMode === 'competences' ? 'block' : 'none' }}
                >
                  <PanViewport className="max-h-[min(75vh,820px)] rounded-2xl border border-[#002B49]/8 bg-white/40 p-4">
                    <CompetencesCurriculumMap structure={structure} />
                  </PanViewport>
                </div>
              </>
            )
          ) : periods.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-20">
              Nenhum período cadastrado nesta estrutura.
            </div>
          ) : (
            <DisciplinaryCurriculumMap periods={periods} />
          )}

          {showWorkloadSummaryOnMap && (
            <div
              className={`mt-4 grid gap-4 items-stretch ${
                showsModuleMeetings(structure)
                  ? 'grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)]'
                  : 'grid-cols-1'
              }`}
            >
              <WorkloadSummaryCard structure={structure} className="w-full" />
              {showsModuleMeetings(structure) && (
                <ModuleMeetingsSummaryCard structure={structure} className="w-full" />
              )}
            </div>
          )}
        </div>

        {(isModular ? modules.length > 0 : periods.length > 0) && (
          <p className="relative px-6 pb-4 text-center text-[10px] text-slate-400 no-export">
            Arraste o mapa para navegar
          </p>
        )}
      </div>
    </div>
  );
};
