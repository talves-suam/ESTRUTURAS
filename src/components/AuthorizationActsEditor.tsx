import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CampusAuthorizationAct } from '../types/curriculum';
import {
  DEFAULT_CAMPUS_UNITS,
  createCampusAuthorizationAct,
  normalizeAuthorizationActs,
} from '../utils/authorizationActs';

interface AuthorizationActsEditorProps {
  acts: CampusAuthorizationAct[];
  activeId: string;
  onChange: (acts: CampusAuthorizationAct[], activeId: string) => void;
  compact?: boolean;
  datalistId?: string;
}

/** Lista editável Unidade + Ato com seleção do que aparece no documento. */
export const AuthorizationActsEditor: React.FC<AuthorizationActsEditorProps> = ({
  acts,
  activeId,
  onChange,
  compact = false,
  datalistId = 'campus-unit-suggestions',
}) => {
  const normalized = normalizeAuthorizationActs({
    authorizationActs: acts,
    activeAuthorizationActId: activeId,
  });
  const list = normalized.authorizationActs;
  const active = normalized.activeAuthorizationActId;

  const emit = (nextActs: CampusAuthorizationAct[], nextActive: string) => {
    const n = normalizeAuthorizationActs({
      authorizationActs: nextActs,
      activeAuthorizationActId: nextActive,
    });
    onChange(n.authorizationActs, n.activeAuthorizationActId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className={`font-bold text-slate-700 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          Atos por unidade
        </p>
        <button
          type="button"
          onClick={() => {
            const row = createCampusAuthorizationAct({ unitName: '', act: '' });
            emit([...list, row], active || row.id);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 border border-slate-200"
        >
          <Plus className="w-3 h-3 text-[#FF6B00]" />
          Adicionar
        </button>
      </div>

      <datalist id={datalistId}>
        {DEFAULT_CAMPUS_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div
        className={`space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 ${
          compact ? 'p-2' : 'p-2.5'
        }`}
      >
        {list.length === 0 && (
          <p className="text-[11px] text-slate-500 px-1 py-2">
            Cadastre o ato de cada unidade (Bangu, Bonsucesso, Campo Grande ou outra) e marque qual
            aparece no documento.
          </p>
        )}
        {list.map((row) => {
          const isActive = row.id === active;
          return (
            <div
              key={row.id}
              className={`grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto_auto] gap-2 items-center rounded-lg border bg-white p-2 ${
                isActive ? 'border-[#FF6B00] ring-1 ring-[#FF6B00]/30' : 'border-slate-200'
              }`}
            >
              <input
                type="text"
                list={datalistId}
                placeholder="Unidade (ex.: Bangu)"
                value={row.unitName}
                onChange={(e) => {
                  const v = e.target.value;
                  emit(
                    list.map((a) => (a.id === row.id ? { ...a, unitName: v } : a)),
                    active
                  );
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
              />
              <input
                type="text"
                placeholder="Ato autorizativo (ex.: Portaria SERES/MEC nº …)"
                value={row.act}
                onChange={(e) => {
                  const v = e.target.value;
                  emit(
                    list.map((a) => (a.id === row.id ? { ...a, act: v } : a)),
                    active
                  );
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
              />
              <label className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer whitespace-nowrap px-1">
                <input
                  type="radio"
                  name={`${datalistId}-active`}
                  checked={isActive}
                  onChange={() => emit(list, row.id)}
                  className="accent-[#FF6B00]"
                />
                No documento
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = list.filter((a) => a.id !== row.id);
                  emit(next, active === row.id ? next[0]?.id || '' : active);
                }}
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                title="Remover"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
