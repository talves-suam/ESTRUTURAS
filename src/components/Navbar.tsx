import React from 'react';
import { 
  BookOpen, 
  PlusCircle, 
  Settings, 
  UploadCloud, 
  Database,
  Layers,
} from 'lucide-react';
import logoUnisuam from '../assets/logo-unisuam.png';

interface NavbarProps {
  activeTab: 'structures' | 'new' | 'templates' | 'saga' | 'settings';
  setActiveTab: (tab: 'structures' | 'new' | 'templates' | 'saga' | 'settings') => void;
  structuresCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, structuresCount }) => {
  return (
    <header className="bg-[#002B49] text-white shadow-lg border-b-4 border-[#FF6B00] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div 
            id="brand-logo-btn"
            onClick={() => setActiveTab('structures')}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <img
              src={logoUnisuam}
              alt="UNISUAM"
              className="h-12 w-auto object-contain transition-transform group-hover:scale-105"
            />
            <p className="text-sm text-blue-100 font-medium self-center leading-none">
              Gestão de Estruturas Curriculares
            </p>
          </div>

          {/* Navigation Items */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              id="nav-structures-btn"
              onClick={() => setActiveTab('structures')}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'structures'
                  ? 'bg-white/15 text-white shadow-inner'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4 text-[#FF7A00]" />
              Estruturas
              <span className="ml-1 text-xs px-2 py-0.2 rounded-full bg-blue-950/80 text-blue-200 font-mono">
                {structuresCount}
              </span>
            </button>

            <button
              id="nav-new-structure-btn"
              onClick={() => setActiveTab('new')}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                activeTab === 'new'
                  ? 'bg-[#FF6B00] text-white shadow-md'
                  : 'bg-[#FF6B00]/90 text-white hover:bg-[#FF6B00] shadow-xs'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              Nova Estrutura
            </button>

            <button
              id="nav-templates-btn"
              onClick={() => setActiveTab('templates')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'templates'
                  ? 'bg-white/15 text-white'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4 text-orange-300" />
              Modelos Oficiais
            </button>

            <button
              id="nav-saga-btn"
              onClick={() => setActiveTab('saga')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'saga'
                  ? 'bg-white/15 text-white'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <UploadCloud className="w-4 h-4 text-emerald-300" />
              Importar do SAGA
            </button>

            <button
              id="nav-settings-btn"
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'settings'
                  ? 'bg-white/15 text-white'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-300" />
              Configurações & Lote
            </button>
          </nav>

          {/* Firestore Connection Indicator */}
          <div className="flex items-center gap-2 text-xs text-blue-200">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-950/60 border border-blue-800 text-blue-200">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <Database className="w-3.5 h-3.5 text-orange-400" />
              <span className="hidden sm:inline font-mono">Firebase Online</span>
            </span>
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-blue-900/50 text-xs">
          <button
            onClick={() => setActiveTab('structures')}
            className={`px-2 py-1 rounded font-medium ${activeTab === 'structures' ? 'text-[#FF6B00] font-bold' : 'text-blue-100'}`}
          >
            Estruturas ({structuresCount})
          </button>
          <button
            onClick={() => setActiveTab('new')}
            className={`px-2 py-1 rounded font-medium ${activeTab === 'new' ? 'text-[#FF6B00] font-bold' : 'text-blue-100'}`}
          >
            + Criar
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-2 py-1 rounded font-medium ${activeTab === 'templates' ? 'text-[#FF6B00] font-bold' : 'text-blue-100'}`}
          >
            Modelos
          </button>
          <button
            onClick={() => setActiveTab('saga')}
            className={`px-2 py-1 rounded font-medium ${activeTab === 'saga' ? 'text-[#FF6B00] font-bold' : 'text-blue-100'}`}
          >
            SAGA
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-2 py-1 rounded font-medium ${activeTab === 'settings' ? 'text-[#FF6B00] font-bold' : 'text-blue-100'}`}
          >
            Configurações
          </button>
        </div>
      </div>
    </header>
  );
};
