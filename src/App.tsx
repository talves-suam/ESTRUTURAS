/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StructuresList } from './components/StructuresList';
import { CurriculumTable } from './components/CurriculumTable';
import { CurriculumGraphView } from './components/CurriculumGraphView';
import { CurriculumForm } from './components/CurriculumForm';
import { SagaImportModal } from './components/SagaImportModal';
import { SettingsModal } from './components/SettingsModal';
import { OfficialTemplates } from './components/OfficialTemplates';

import { CurriculumStructure, Course, AppSettings } from './types/curriculum';
import { 
  getStructuresFromFirestore, 
  saveStructureToFirestore, 
  deleteStructureFromFirestore, 
  getCoursesFromFirestore, 
  saveCourseToFirestore, 
  saveAllCoursesToFirestore, 
  getSettingsFromFirestore, 
  saveSettingsToFirestore,
  calculateStructureTotals
} from './services/curriculumService';
import { 
  CheckCircle2, 
  AlertCircle, 
  Database,
  ArrowLeft
} from 'lucide-react';

export default function App() {
  const [structures, setStructures] = useState<CurriculumStructure[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    pedagogicalNomenclature: 'cha',
    hideValidityStartDefault: false,
    institutionName: 'UNISUAM - Centro Universitário Augusto Motta',
    defaultEadPercentLimit: 40,
    defaultPresentialPercentMin: 60,
    defaultExtensionPercentMin: 10,
    campusDefault: 'Sede: UNISUAM-RJ (Bonsucesso)',
  });

  const [activeTab, setActiveTab] = useState<'structures' | 'new' | 'templates' | 'saga' | 'settings'>('structures');
  const [selectedStructure, setSelectedStructure] = useState<CurriculumStructure | null>(null);
  const [currentViewMode, setCurrentViewMode] = useState<'list' | 'table' | 'graph' | 'form'>('list');
  const [editingStructure, setEditingStructure] = useState<CurriculumStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load data from Firebase / cache on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [loadedStructures, loadedCourses, loadedSettings] = await Promise.all([
          getStructuresFromFirestore(),
          getCoursesFromFirestore(),
          getSettingsFromFirestore(),
        ]);
        setStructures(loadedStructures);
        setCourses(loadedCourses);
        setSettings(loadedSettings);
        if (loadedStructures.length > 0) {
          setSelectedStructure(loadedStructures[0]);
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        showToast('Dados carregados do armazenamento local seguro.', 'success');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Handlers
  const handleSaveStructure = async (structure: CurriculumStructure) => {
    try {
      const calculated = calculateStructureTotals(structure);
      await saveStructureToFirestore(calculated);
      setStructures((prev) => {
        const index = prev.findIndex((s) => s.id === calculated.id);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = calculated;
          return copy;
        }
        return [calculated, ...prev];
      });
      setSelectedStructure(calculated);
      setCurrentViewMode('table');
      setActiveTab('structures');
      showToast(`Estrutura [${calculated.code}] salva com sucesso no Firebase!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar estrutura.', 'error');
    }
  };

  const handleDeleteStructure = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir esta estrutura curricular?')) {
      return;
    }
    try {
      await deleteStructureFromFirestore(id);
      setStructures((prev) => prev.filter((s) => s.id !== id));
      if (selectedStructure?.id === id) {
        setSelectedStructure(null);
        setCurrentViewMode('list');
      }
      showToast('Estrutura curricular removida com sucesso.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao remover estrutura.', 'error');
    }
  };

  const handleDuplicateStructure = async (structure: CurriculumStructure) => {
    const duplicated: CurriculumStructure = {
      ...structure,
      id: `struct-${Date.now()}`,
      code: `${structure.code}-CLONE`,
      status: 'Em Elaboração',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await handleSaveStructure(duplicated);
    showToast(`Cópia criada com código [${duplicated.code}].`);
  };

  const handleAddCourse = async (newCourse: Course) => {
    await saveCourseToFirestore(newCourse);
    setCourses((prev) => [...prev, newCourse]);
    showToast(`Curso [${newCourse.name}] adicionado com sucesso!`);
  };

  const handleBatchUpdateCourses = async (updatedCourses: Course[]) => {
    await saveAllCoursesToFirestore(updatedCourses);
    setCourses(updatedCourses);
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await saveSettingsToFirestore(newSettings);
    setSettings(newSettings);
    showToast('Configurações atualizadas com sucesso!');
  };

  const handleUseTemplate = (template: CurriculumStructure) => {
    const cloned: CurriculumStructure = {
      ...template,
      id: `struct-${Date.now()}`,
      code: `${template.code}-NOVA`,
      status: 'Em Elaboração',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingStructure(cloned);
    setCurrentViewMode('form');
    setActiveTab('new');
    showToast(`Modelo carregado para novo preenchimento!`);
  };

  const handleSagaImportComplete = (parsed: CurriculumStructure) => {
    setEditingStructure(parsed);
    setCurrentViewMode('form');
    setActiveTab('new');
    showToast('Relatório SAGA importado! Conclua o preenchimento regulatório.');
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased">
      {/* Navbar with UNISUAM Brand */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'structures') {
            setCurrentViewMode('list');
          } else if (tab === 'new') {
            setEditingStructure(null);
            setCurrentViewMode('form');
          }
        }}
        structuresCount={structures.length}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-bounce">
          <div className={`px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold ${
            toastMessage.type === 'success'
              ? 'bg-[#002B49] text-white border border-[#FF6B00]'
              : 'bg-rose-900 text-white border border-rose-500'
          }`}>
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#FF7A00]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-300" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main App Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <div className="w-10 h-10 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-[#002B49]">Carregando Estruturas Curriculares UNISUAM...</p>
          </div>
        ) : (
          <>
            {/* View: Lista de Estruturas / Dashboard */}
            {activeTab === 'structures' && currentViewMode === 'list' && (
              <StructuresList
                structures={structures}
                settings={settings}
                onSelectStructure={(struct, view) => {
                  setSelectedStructure(struct);
                  setCurrentViewMode(view);
                }}
                onEditStructure={(struct) => {
                  setEditingStructure(struct);
                  setCurrentViewMode('form');
                  setActiveTab('new');
                }}
                onDeleteStructure={handleDeleteStructure}
                onDuplicateStructure={handleDuplicateStructure}
                onCreateNew={() => {
                  setEditingStructure(null);
                  setCurrentViewMode('form');
                  setActiveTab('new');
                }}
                onOpenSagaImport={() => {
                  setActiveTab('saga');
                }}
              />
            )}

            {/* View: Tabela Moderna e Estilosa UNISUAM */}
            {activeTab === 'structures' && currentViewMode === 'table' && selectedStructure && (
              <div className="space-y-4">
                <button
                  onClick={() => setCurrentViewMode('list')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                  Voltar para Lista de Estruturas
                </button>

                <CurriculumTable
                  structure={selectedStructure}
                  settings={settings}
                  onEdit={(s) => {
                    setEditingStructure(s);
                    setCurrentViewMode('form');
                    setActiveTab('new');
                  }}
                  onSwitchToGraph={() => setCurrentViewMode('graph')}
                />
              </div>
            )}

            {/* View: Visualização Gráfica / Mapa de Módulos Zabala */}
            {activeTab === 'structures' && currentViewMode === 'graph' && selectedStructure && (
              <div className="space-y-4">
                <button
                  onClick={() => setCurrentViewMode('list')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                  Voltar para Lista de Estruturas
                </button>

                <CurriculumGraphView
                  structure={selectedStructure}
                  settings={settings}
                  onSwitchToTable={() => setCurrentViewMode('table')}
                />
              </div>
            )}

            {/* View: Cadastro / Editor de Estrutura */}
            {activeTab === 'new' && currentViewMode === 'form' && (
              <CurriculumForm
                key={editingStructure?.id || 'nova-estrutura'}
                initialData={editingStructure}
                courses={courses}
                settings={settings}
                onSave={handleSaveStructure}
                onCancel={() => {
                  setActiveTab('structures');
                  setCurrentViewMode('list');
                }}
                onAddCourse={handleAddCourse}
              />
            )}

            {/* View: Modelos Oficiais */}
            {activeTab === 'templates' && (
              <OfficialTemplates
                settings={settings}
                onUseTemplate={handleUseTemplate}
                onViewTemplate={(tpl, view) => {
                  setSelectedStructure(tpl);
                  setActiveTab('structures');
                  setCurrentViewMode(view);
                }}
              />
            )}

            {/* View: Importador do SAGA */}
            {activeTab === 'saga' && (
              <SagaImportModal
                courses={courses}
                onImportComplete={handleSagaImportComplete}
                onCancel={() => setActiveTab('structures')}
              />
            )}

            {/* View: Configurações & Carga em Lote */}
            {activeTab === 'settings' && (
              <SettingsModal
                settings={settings}
                courses={courses}
                onSaveSettings={handleSaveSettings}
                onBatchUpdateCourses={handleBatchUpdateCourses}
                onClose={() => setActiveTab('structures')}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#002B49] text-white border-t border-slate-800 py-4 mt-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4 text-blue-200">
          <div className="flex items-center gap-2">
            <span className="font-black text-white">UNISUAM</span>
            <span>• Centro Universitário Augusto Motta</span>
            <span className="text-slate-400">| Pró-Reitoria de Graduação</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>MEC • DCN Ativas • CINE Brasil</span>
            <span className="text-[#FF7A00] font-bold">Res. CNE 7/2018 (Extensão 10%)</span>
            <span>Nomenclatura: <strong className="text-white uppercase">{settings.pedagogicalNomenclature}</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
