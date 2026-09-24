/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Navbar, type NavbarTab } from './components/Navbar';
import { StructuresList } from './components/StructuresList';
import { CurriculumTable } from './components/CurriculumTable';
import { CurriculumGraphView } from './components/CurriculumGraphView';
import { CurriculumForm } from './components/CurriculumForm';
import { SettingsModal } from './components/SettingsModal';
import { LoginScreen } from './components/LoginScreen';
import { BillingAlertBanner } from './components/BillingAlertBanner';
import { CurriculumStructure, Course, AppSettings } from './types/curriculum';
import { useAuth } from './auth/AuthProvider';
import {
  FIREBASE_CHANGED_EVENT,
  applyRuntimeFirebaseConfig,
  isFirebaseConfigured,
  notifyFirebaseChanged,
  parseFirebaseConfigPaste,
  usesBuiltInFirebase,
} from './firebase/config';
import { 
  getSettingsFromFirestore, 
  saveStructureToFirestore, 
  deleteStructureFromFirestore, 
  saveCourseToFirestore, 
  saveAllCoursesToFirestore, 
  saveSettingsToFirestore,
  calculateStructureTotals,
  getCachedStructures,
  getCachedCourses,
  getCachedSettings,
  applyLocalAppBackup,
  subscribeCurriculumData,
  pushLocalCacheToServer,
  testFirestoreConnection,
} from './services/curriculumService';
import { ensureCourseForStructure, courseBaseName, dcnsToRefString, structureWithCourseDcns } from './utils/courseBatch';
import { 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CloudOff,
  Loader2,
} from 'lucide-react';

export default function App() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#002B49] text-white gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-[#FF6B00]" />
        <span className="text-sm font-semibold">Verificando acesso…</span>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
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
  const [firebaseOnline, setFirebaseOnline] = useState(isFirebaseConfigured);
  const [connectingServer, setConnectingServer] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);
  const toastTimerRef = useRef<number>(0);

  const showToast = (
    text: string,
    type: 'success' | 'error' | 'warning' = 'success'
  ) => {
    setToastMessage({ text, type });
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(
      () => setToastMessage(null),
      type === 'error' || type === 'warning' ? 8000 : 5500
    );
  };

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

    let stop = () => {};
    const startListening = () => {
      setFirebaseOnline(isFirebaseConfigured);
      stop();
      stop = subscribeCurriculumData({
        onStructures: (loadedStructures) => {
          setStructures(loadedStructures);
          if (loadedStructures.length > 0) {
            setSelectedStructure((prev) => {
              if (prev && loadedStructures.some((s) => s.id === prev.id)) {
                return loadedStructures.find((s) => s.id === prev.id) || loadedStructures[0];
              }
              return loadedStructures[0];
            });
          }
          setLoading(false);
        },
        onCourses: (loadedCourses) => {
          setCourses(loadedCourses);
          setLoading(false);
        },
        onError: (err) => {
          console.error('Erro ao sincronizar:', err);
          showToast(err.message, 'error');
          setLoading(false);
        },
      });
      void getSettingsFromFirestore().then(setSettings);
    };

    startListening();
    window.addEventListener(FIREBASE_CHANGED_EVENT, startListening);
    return () => {
      stop();
      window.removeEventListener(FIREBASE_CHANGED_EVENT, startListening);
    };
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

      if (firebaseOnline) {
        if (created) {
          const cloneNote = clonedFromModality
            ? ` (a partir do cadastro ${clonedFromModality})`
            : '';
          showToast(
            `Estrutura [${calculated.code}] salva no Firebase. Curso ${course.name} (${course.modality}) incluído${cloneNote}.`
          );
        } else {
          showToast(`Estrutura [${calculated.code}] salva no Firebase.`);
        }
      } else {
        showToast(
          `Estrutura [${calculated.code}] salva SÓ neste navegador. Conecte o Firebase em Configurações.`,
          'warning'
        );
      }

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
      setEditingStructure(calculated);
      setCurrentViewMode('table');
      setActiveTab('structures');
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Erro ao salvar estrutura.', 'error');
      throw err;
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
    const stamp = Date.now();
    const baseCode = structure.code.replace(/-COPIA\d*$/i, '').replace(/-CLONE\d*$/i, '');
    const usedCodes = new Set(structures.map((s) => s.code.toLowerCase()));
    let code = `${baseCode}-COPIA`;
    let n = 2;
    while (usedCodes.has(code.toLowerCase())) {
      code = `${baseCode}-COPIA${n}`;
      n += 1;
    }

    const duplicated: CurriculumStructure = {
      ...JSON.parse(JSON.stringify(structure)),
      id: `struct-${stamp}`,
      code,
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

  const handleBatchUpdateCourses = async (
    updatedCourses: Course[],
    options?: { allowEmptyWipe?: boolean }
  ) => {
    const saved = await saveAllCoursesToFirestore(updatedCourses, options);
    setCourses(saved);

    // Propaga DCNs/nomes alterados no curso para as estruturas vinculadas
    const byId = new Map(saved.map((c) => [c.id, c]));
    const patched = structures.map((s) => {
      const course = s.courseId ? byId.get(s.courseId) : undefined;
      if (!course?.dcns || course.dcns.length === 0) return s;
      const nextRef = dcnsToRefString(course.dcns);
      const unchanged =
        (nextRef || s.dcnRef) === (s.dcnRef || '') &&
        JSON.stringify(s.dcns || []) === JSON.stringify(course.dcns);
      if (unchanged) return s;
      return {
        ...s,
        dcns: course.dcns,
        dcnRef: nextRef || s.dcnRef,
      };
    });
    const toSave = patched.filter((s, i) => s !== structures[i]);
    if (toSave.length > 0) {
      setStructures(patched);
      if (selectedStructure) {
        const next = patched.find((s) => s.id === selectedStructure.id);
        if (next && next !== selectedStructure) setSelectedStructure(next);
      }
      await Promise.all(toSave.map((s) => saveStructureToFirestore(s)));
    }
  };

  const handleSaveSettings = async (newSettings: AppSettings, opts?: { silent?: boolean }) => {
    const saved = await saveSettingsToFirestore(newSettings);
    setSettings(saved);
    if (!opts?.silent) {
      showToast('Configurações atualizadas com sucesso!');
    }
  };

  const handleRestoreLocalBackup = (raw: string) => {
    try {
      const result = applyLocalAppBackup(raw);
      setStructures(getCachedStructures());
      setCourses(getCachedCourses());
      const restoredSettings = getCachedSettings();
      if (restoredSettings) setSettings(restoredSettings);
      const list = getCachedStructures();
      if (list.length > 0) setSelectedStructure(list[0]);
      showToast(
        `Restauradas ${result.structures} estrutura(s) e ${result.courses} curso(s) neste navegador.`
      );
      if (isFirebaseConfigured) {
        void pushLocalCacheToServer()
          .then(() => showToast('Backup também enviado ao Firebase.'))
          .catch((err) =>
            showToast(err instanceof Error ? err.message : 'Backup local ok, mas o Firebase recusou.', 'error')
          );
      }
      setActiveTab('structures');
      setCurrentViewMode('list');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup inválido.';
      showToast(message, 'error');
      throw err;
    }
  };

  const handleConnectFirebase = async (paste: string) => {
    setConnectingServer(true);
    try {
      const config = parseFirebaseConfigPaste(paste);
      await applyRuntimeFirebaseConfig(config);
      await testFirestoreConnection();
      await pushLocalCacheToServer();
      notifyFirebaseChanged();
      setFirebaseOnline(true);
      showToast(
        'Firebase ativo neste navegador. Para todos conectarem sozinhos, grave o firebaseConfig em src/firebase/projectConfig.ts.'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível conectar.';
      showToast(message, 'error');
      throw err;
    } finally {
      setConnectingServer(false);
    }
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
        serverOnline={firebaseOnline}
      />

      <BillingAlertBanner />

      {!firebaseOnline && !usesBuiltInFirebase() && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-950 font-medium flex items-center gap-2">
              <CloudOff className="w-4 h-4 text-amber-700 shrink-0" />
              Firebase ainda não embutido — cadastros ficam só neste navegador até gravar o firebaseConfig.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1.5 rounded-lg bg-[#002B49] text-white text-[11px] font-black"
            >
              Configurar
            </button>
          </div>
        </div>
      )}

      {!firebaseOnline && usesBuiltInFirebase() && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-950 font-medium flex items-center gap-2">
              <CloudOff className="w-4 h-4 text-amber-700 shrink-0" />
              Firebase offline — cadastros ficam só neste navegador. Confira Auth Google e regras do Firestore.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1.5 rounded-lg bg-[#002B49] text-white text-[11px] font-black"
            >
              Ver status
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[200] pointer-events-none px-4 w-full max-w-xl">
          <div
            className={`pointer-events-auto px-5 py-3.5 rounded-xl shadow-2xl flex items-start gap-3 text-sm font-bold border-2 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white border-emerald-400'
                : toastMessage.type === 'warning'
                  ? 'bg-amber-500 text-amber-950 border-amber-300'
                  : 'bg-rose-800 text-white border-rose-500'
            }`}
            role="status"
            aria-live="polite"
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" />
            ) : toastMessage.type === 'warning' ? (
              <AlertCircle className="w-5 h-5 text-amber-950 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-200 shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{toastMessage.text}</span>
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
                serverOnline={firebaseOnline}
                onOpenSettings={() => setActiveTab('settings')}
                onSelectStructure={(struct, view) => {
                  setSelectedStructure(structureWithCourseDcns(struct, courses));
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
              />
            )}

            {/* Atalhos de rolagem na visualização (tabela / mapa) */}
            {activeTab === 'structures' &&
              (currentViewMode === 'table' || currentViewMode === 'graph') &&
              selectedStructure && (
                <div className="fixed bottom-6 right-4 z-40 flex flex-col items-center gap-1.5 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    title="Ir ao topo"
                    className="w-9 h-9 rounded-full bg-white/95 border border-slate-200 text-slate-500 hover:text-[#002B49] hover:border-[#002B49]/40 shadow-md flex items-center justify-center transition"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: 'smooth',
                      })
                    }
                    title="Ir ao final"
                    className="w-9 h-9 rounded-full bg-white/95 border border-slate-200 text-slate-500 hover:text-[#002B49] hover:border-[#002B49]/40 shadow-md flex items-center justify-center transition"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
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

            {/* View: Configurações & Carga em Lote */}
            {activeTab === 'settings' && (
              <SettingsModal
                settings={settings}
                courses={courses}
                serverOnline={firebaseOnline}
                connectingServer={connectingServer}
                onConnectFirebase={handleConnectFirebase}
                onSaveSettings={handleSaveSettings}
                onBatchUpdateCourses={handleBatchUpdateCourses}
                onRestoreLocalBackup={handleRestoreLocalBackup}
                onNotify={showToast}
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
