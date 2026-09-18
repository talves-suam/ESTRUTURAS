/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar, type NavbarTab } from './components/Navbar';
import { StructuresList } from './components/StructuresList';
import { CurriculumTable } from './components/CurriculumTable';
import { CurriculumGraphView } from './components/CurriculumGraphView';
import { CurriculumForm } from './components/CurriculumForm';
import { SagaImportModal } from './components/SagaImportModal';
import { SettingsModal } from './components/SettingsModal';

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
  calculateStructureTotals,
  getCachedStructures,
  getCachedCourses,
  getCachedSettings,
} from './services/curriculumService';
import { ensureCourseForStructure, courseBaseName } from './utils/courseBatch';
import { 
  CheckCircle2, 
  AlertCircle, 
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

  const [activeTab, setActiveTab] = useState<NavbarTab>('structures');
  const [selectedStructure, setSelectedStructure] = useState<CurriculumStructure | null>(null);
  const [currentViewMode, setCurrentViewMode] = useState<'list' | 'table' | 'graph' | 'form'>('list');
  const [editingStructure, setEditingStructure] = useState<CurriculumStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load data: pinta cache local na hora, depois sincroniza com Firestore em background
  useEffect(() => {
    const cachedStructures = getCachedStructures();
    const cachedCourses = getCachedCourses();
    const cachedSettings = getCachedSettings();

    if (cachedStructures.length > 0 || cachedCourses.length > 0) {
      setStructures(cachedStructures);
      setCourses(cachedCourses);
      if (cachedSettings) setSettings(cachedSettings);
      if (cachedStructures.length > 0) setSelectedStructure(cachedStructures[0]);
      setLoading(false);
    }

    async function loadData() {
      try {
        if (cachedStructures.length === 0 && cachedCourses.length === 0) {
          setLoading(true);
        }
        const [loadedStructures, loadedCourses, loadedSettings] = await Promise.all([
          getStructuresFromFirestore(),
          getCoursesFromFirestore(),
          getSettingsFromFirestore(),
        ]);
        setStructures(loadedStructures);
        setCourses(loadedCourses);
        setSettings(loadedSettings);
        if (loadedStructures.length > 0) {
          setSelectedStructure((prev) => {
            if (prev && loadedStructures.some((s) => s.id === prev.id)) {
              return loadedStructures.find((s) => s.id === prev.id) || loadedStructures[0];
            }
            return loadedStructures[0];
          });
        }
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        if (cachedStructures.length === 0) {
          showToast('Não foi possível sincronizar. Usando dados locais, se houver.', 'error');
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Handlers
  const handleSaveStructure = async (structure: CurriculumStructure) => {
    try {
      const { course, created, clonedFromModality } = ensureCourseForStructure(
        structure,
        courses
      );

      if (created) {
        await saveCourseToFirestore(course);
        setCourses((prev) => {
          if (prev.some((c) => c.id === course.id)) return prev;
          return [...prev, course];
        });
      }

      const calculated = calculateStructureTotals({
        ...structure,
        courseId: course.id,
        courseName: courseBaseName(course.name),
        modality: course.modality,
      });
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

      if (created) {
        const cloneNote = clonedFromModality
          ? ` (a partir do cadastro ${clonedFromModality})`
          : '';
        showToast(
          `Estrutura [${calculated.code}] salva. Curso ${course.name} (${course.modality}) incluído no cadastro${cloneNote}.`
        );
      } else {
        showToast(`Estrutura [${calculated.code}] salva com sucesso no Firebase!`);
      }
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
