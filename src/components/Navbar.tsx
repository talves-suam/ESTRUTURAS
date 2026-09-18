import React from 'react';
import {
  Layers,
  Plus,
  Settings,
  UploadCloud,
  Database,
} from 'lucide-react';
import logoUnisuam from '../assets/logo-unisuam.png';

export type NavbarTab = 'structures' | 'new' | 'saga' | 'settings';

interface NavbarProps {
  activeTab: NavbarTab;
  setActiveTab: (tab: NavbarTab) => void;
  structuresCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, structuresCount }) => {
  const navItem = (
    id: string,
    tab: NavbarTab,
    label: string,
    icon: React.ReactNode,
    opts?: { badge?: string; accent?: boolean }
  ) => {
    const active = activeTab === tab;
    if (opts?.accent) {
      return (
        <button
          id={id}
          type="button"
          onClick={() => setActiveTab(tab)}
          className={`px-3.5 py-2 rounded-full text-sm font-bold transition flex items-center gap-2 ${
            active
              ? 'bg-[#FF6B00] text-white shadow-md shadow-orange-500/25'
              : 'bg-[#FF6B00]/10 text-[#c2410c] hover:bg-[#FF6B00] hover:text-white border border-[#FF6B00]/25'
          }`}
        >
          {icon}
          {label}
        </button>
      );
    }
    return (
      <button
        id={id}
        type="button"
        onClick={() => setActiveTab(tab)}
        className={`px-3.5 py-2 rounded-full text-sm font-semibold transition flex items-center gap-2 ${
          active
            ? 'bg-[#002B49] text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-[#002B49]'
        }`}
      >
        {icon}
        {label}
        {opts?.badge !== undefined && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              active ? 'bg-white/20 text-orange-200' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {opts.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-[0_1px_0_0_rgba(255,107,0,0.35)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[4.25rem] gap-4">
          <div
            id="brand-logo-btn"
            onClick={() => setActiveTab('structures')}
            className="flex items-center gap-3 cursor-pointer group select-none min-w-0"
          >
            <div className="shrink-0 rounded-xl bg-white border border-slate-200/80 shadow-sm px-2.5 py-1.5 ring-1 ring-slate-100">
              <img
                src={logoUnisuam}
                alt="UNISUAM"
                className="h-9 w-auto object-contain transition-transform group-hover:scale-[1.03]"
              />
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-[13px] font-black text-[#002B49] tracking-tight leading-tight truncate">
                Estruturas Curriculares
              </p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                UNISUAM · Graduação
              </p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1.5">
            {navItem(
              'nav-structures-btn',
              'structures',
              'Estruturas',
              <Layers className={`w-4 h-4 ${activeTab === 'structures' ? 'text-[#FF7A00]' : 'text-slate-400'}`} />,
              { badge: String(structuresCount) }
            )}
            {navItem(
              'nav-new-structure-btn',
              'new',
              'Nova',
              <Plus className="w-4 h-4" />,
              { accent: true }
            )}
            {navItem(
              'nav-saga-btn',
              'saga',
              'Importar SAGA',
              <UploadCloud className={`w-4 h-4 ${activeTab === 'saga' ? 'text-emerald-300' : 'text-emerald-600'}`} />
            )}
            {navItem(
              'nav-settings-btn',
              'settings',
              'Configurações',
              <Settings className={`w-4 h-4 ${activeTab === 'settings' ? 'text-slate-200' : 'text-slate-400'}`} />
            )}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Database className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span className="hidden lg:inline">Online</span>
            </span>
          </div>
        </div>

        <div className="flex md:hidden items-center justify-around gap-1 pb-2.5 -mt-1">
          {(
            [
              ['structures', `Estruturas (${structuresCount})`],
              ['new', '+ Nova'],
              ['saga', 'SAGA'],
              ['settings', 'Config'],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${
                activeTab === tab
                  ? tab === 'new'
                    ? 'bg-[#FF6B00] text-white'
                    : 'bg-[#002B49] text-white'
                  : 'text-slate-500 bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
