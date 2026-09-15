import React, { useState, useEffect } from 'react';
import { Course, DcnDocument, CurriculumStructure } from '../types/curriculum';
import { generateOfficialDcnPdf, getSampleDcnsForCourse } from '../services/dcnService';
import { googleDrivePreviewUrl } from '../utils/courseBatch';
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Printer, 
  Plus, 
  Trash2, 
  X, 
  CheckCircle2, 
  BookOpen, 
  UploadCloud, 
  AlertCircle,
  FileCheck,
  Sparkles,
  Layers,
  ChevronRight
} from 'lucide-react';

interface DcnViewerModalProps {
  course?: Course | null;
  structure?: CurriculumStructure | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateCourseDcns?: (courseId: string, updatedDcns: DcnDocument[]) => Promise<void>;
  onUpdateStructureDcns?: (structureId: string, updatedDcns: DcnDocument[]) => Promise<void>;
}

export const DcnViewerModal: React.FC<DcnViewerModalProps> = ({
  course,
  structure,
  isOpen,
  onClose,
  onUpdateCourseDcns,
  onUpdateStructureDcns,
}) => {
  // Determine course name and code
  const courseName = course?.name || structure?.courseName || 'Curso de Graduação';
  const courseCode = course?.code || structure?.code || 'UNISUAM';
  const courseId = course?.id || structure?.courseId || '';

  // Get initial DCNs: from structure, or from course, or fallback sample
  const [dcns, setDcns] = useState<DcnDocument[]>([]);
  const [selectedDcnId, setSelectedDcnId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'view' | 'add'>('view');

  // Form state for adding new DCN
  const [newTitle, setNewTitle] = useState('');
  const [newResolution, setNewResolution] = useState('');
  const [newYear, setNewYear] = useState(new Date().getFullYear().toString());
  const [newDescription, setNewDescription] = useState('');
  const [newPdfUrl, setNewPdfUrl] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileSize, setNewFileSize] = useState('');
  const [isMainDcn, setIsMainDcn] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'generate' | 'url'>('file');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialize DCNs when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let initialList: DcnDocument[] = [];
    if (structure?.dcns && structure.dcns.length > 0) {
      initialList = structure.dcns;
    } else if (course?.dcns && course.dcns.length > 0) {
      initialList = course.dcns;
    } else {
      // Load bundled sample DCNs for this specific course
      initialList = getSampleDcnsForCourse(courseCode, courseName);
    }

    setDcns(initialList);
    if (initialList.length > 0) {
      setSelectedDcnId(initialList[0].id);
    }
  }, [isOpen, course, structure, courseCode, courseName]);

  if (!isOpen) return null;

  const selectedDcn = dcns.find((d) => d.id === selectedDcnId) || dcns[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Por favor, selecione um arquivo em formato PDF.');
      return;
    }

    setNewFileName(file.name);
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    setNewFileSize(`${sizeInMb} MB`);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setNewPdfUrl(dataUrl);
      if (!newTitle) {
        setNewTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveNewDcn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      alert('Informe o título da DCN.');
      return;
    }

    setIsSaving(true);
    let finalPdfUrl = newPdfUrl;
    let fileName = newFileName || `${newTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    let fileSize = newFileSize || '380 KB';

    if (uploadMode === 'generate' || !finalPdfUrl) {
      // Generate official PDF on the fly using jsPDF
      finalPdfUrl = generateOfficialDcnPdf(
        courseName,
        newTitle,
        newResolution || newTitle,
        newYear || '2025'
      );
      fileName = `DCN_${newTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      fileSize = '410 KB';
    }

    const newDcn: DcnDocument = {
      id: `dcn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: newTitle.trim(),
      resolutionNumber: newResolution.trim() || newTitle.trim(),
      year: newYear.trim() || new Date().getFullYear().toString(),
      description: newDescription.trim() || `Diretriz Curricular Nacional vinculada ao curso ${courseName}.`,
      pdfUrl: finalPdfUrl,
      fileName,
      fileSize,
      isMain: isMainDcn || dcns.length === 0,
      uploadedAt: new Date().toISOString().split('T')[0],
    };

    const updated = isMainDcn 
      ? [newDcn, ...dcns.map((d) => ({ ...d, isMain: false }))]
      : [...dcns, newDcn];

    setDcns(updated);
    setSelectedDcnId(newDcn.id);

    // Save to persistence
    if (onUpdateCourseDcns && courseId) {
      await onUpdateCourseDcns(courseId, updated);
    }
    if (onUpdateStructureDcns && structure?.id) {
      await onUpdateStructureDcns(structure.id, updated);
    }

    setIsSaving(false);
    setActiveTab('view');
    setSuccessMessage(`DCN "${newDcn.resolutionNumber}" cadastrada com sucesso no curso!`);
    setTimeout(() => setSuccessMessage(null), 3500);

    // Reset form
    setNewTitle('');
    setNewResolution('');
    setNewDescription('');
    setNewPdfUrl('');
    setNewFileName('');
    setNewFileSize('');
    setIsMainDcn(false);
  };

  const handleDeleteDcn = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja remover esta DCN vinculada?')) return;

    const updated = dcns.filter((d) => d.id !== id);
    setDcns(updated);
    if (selectedDcnId === id && updated.length > 0) {
      setSelectedDcnId(updated[0].id);
    }

    if (onUpdateCourseDcns && courseId) {
      await onUpdateCourseDcns(courseId, updated);
    }
    if (onUpdateStructureDcns && structure?.id) {
      await onUpdateStructureDcns(structure.id, updated);
    }
  };

  const openInNewTab = (pdfUrl: string) => {
    const win = window.open();
    if (win) {
      win.document.write(
        `<iframe src="${pdfUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
      );
      win.document.title = selectedDcn?.title || 'DCN PDF UNISUAM';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Modal */}
        <div className="bg-[#002B49] text-white px-5 py-3.5 flex items-center justify-between border-b-2 border-[#FF6B00] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-[#FF7A00] flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">
                  Diretrizes Curriculares Nacionais (DCNs)
                </h3>
                <span className="px-2 py-0.5 rounded bg-[#FF6B00] text-white text-[10px] font-extrabold uppercase">
                  {dcns.length} {dcns.length === 1 ? 'DCN' : 'DCNs'} Vinculadas
                </span>
              </div>
              <p className="text-xs text-blue-200">
                Curso: <strong className="text-white">{courseName}</strong> • {courseCode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'view' ? 'add' : 'view')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'add'
                  ? 'bg-white text-[#002B49]'
                  : 'bg-[#FF6B00] hover:bg-[#e05e00] text-white shadow-xs'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              {activeTab === 'add' ? 'Voltar para Visualizador' : 'Cadastrar Nova DCN'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
              title="Fechar Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success toast inside modal */}
        {successMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center gap-2 text-xs font-bold text-emerald-800 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* TAB 1: Visualizador de DCNs */}
          {activeTab === 'view' && (
            <>
              {/* Left sidebar: Lista de DCNs vinculadas */}
              <div className="w-full md:w-80 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0 overflow-y-auto">
                <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    DCNs do Curso ({dcns.length})
                  </span>
                  <span className="text-[10px] text-slate-400">Pode conter múltiplas</span>
                </div>

                <div className="p-2 space-y-2 flex-1">
                  {dcns.map((dcn) => {
                    const isSelected = dcn.id === selectedDcnId;
                    return (
                      <div
                        key={dcn.id}
                        onClick={() => setSelectedDcnId(dcn.id)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition relative group ${
                          isSelected
                            ? 'bg-white border-[#FF6B00] shadow-md ring-1 ring-[#FF6B00]'
                            : 'bg-white/70 border-slate-200 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="space-y-0.5 flex-1 pr-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-slate-800 text-[11px]">
                                {dcn.resolutionNumber || 'DCN Oficial'}
                              </span>
                              {dcn.year && (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {dcn.year}
                                </span>
                              )}
                              {dcn.isMain && (
                                <span className="text-[9px] font-extrabold text-[#002B49] bg-blue-100 px-1.5 py-0.2 rounded border border-blue-200">
                                  Principal
                                </span>
                              )}
                            </div>
                            <h4 className="font-semibold text-slate-700 text-[11px] line-clamp-2 leading-tight">
                              {dcn.title}
                            </h4>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDcn(dcn.id);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 opacity-0 group-hover:opacity-100 transition"
                            title="Remover DCN"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {dcn.description && (
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 italic">
                            {dcn.description}
                          </p>
                        )}

                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-red-500" />
                            {dcn.fileSize || 'PDF'}
                          </span>
                          <span className="font-bold text-[#FF6B00]">
                            {isSelected ? 'Visualizando' : 'Clique p/ abrir'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {dcns.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                      <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                      <p>Nenhuma DCN vinculada a este curso ainda.</p>
                      <button
                        onClick={() => setActiveTab('add')}
                        className="text-xs font-bold text-[#FF6B00] hover:underline"
                      >
                        Cadastrar a 1ª DCN agora
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom Add shortcut */}
                <div className="p-3 border-t border-slate-200 bg-white">
                  <button
                    onClick={() => setActiveTab('add')}
                    className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-300"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#FF6B00]" />
                    Adicionar Outra DCN ao Curso
                  </button>
                </div>
              </div>

              {/* Right: PDF Viewer & Document Actions */}
              <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden">
                {selectedDcn ? (
                  <>
                    {/* Viewer Top Action Bar */}
                    <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-red-600" />
                          {selectedDcn.title}
                        </h4>
                        <span className="text-[10px] text-slate-500">
                          {selectedDcn.resolutionNumber} • Publicação: {selectedDcn.year || 'MEC/CNE'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <a
                          href={selectedDcn.pdfUrl}
                          download={selectedDcn.fileName || `${selectedDcn.resolutionNumber}.pdf`}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 border border-slate-300"
                          title="Baixar arquivo PDF"
                        >
                          <Download className="w-3.5 h-3.5 text-slate-600" />
                          Download
                        </a>

                        <button
                          onClick={() => openInNewTab(selectedDcn.pdfUrl)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#002B49] hover:bg-[#003860] text-white text-xs font-semibold flex items-center gap-1 shadow-2xs"
                          title="Abrir PDF em tela cheia / nova aba"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[#FF6B00]" />
                          Nova Aba
                        </button>
                      </div>
                    </div>

                    {/* PDF Embedded Frame */}
                    <div className="flex-1 p-2 sm:p-3 relative bg-slate-200 overflow-hidden">
                      <iframe
                        src={
                          googleDrivePreviewUrl(selectedDcn.pdfUrl) || selectedDcn.pdfUrl
                        }
                        className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-inner"
                        title={selectedDcn.title}
                        allow="autoplay"
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-300 mb-2" />
                    <h3 className="font-bold text-slate-700 text-sm">Selecione uma DCN</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Escolha uma diretriz na lista ao lado ou cadastre uma nova DCN com arquivo PDF vinculado.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: Form para Cadastrar Nova DCN */}
          {activeTab === 'add' && (
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
              <div className="max-w-2xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div className="border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-[#FF6B00] text-white flex items-center justify-center font-bold text-xs">
                      +
                    </span>
                    <h3 className="text-base font-bold text-[#002B49]">
                      Cadastrar Nova Diretriz Curricular Nacional (DCN)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Vincule múltiplos documentos oficiais, pareceres e resoluções do CNE/MEC ao curso de <strong>{courseName}</strong>.
                  </p>
                </div>

                <form onSubmit={handleSaveNewDcn} className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Título Completo da DCN / Resolução *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Resolução CNE/CES nº 4/2005 - DCN Graduação em Administração"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-[#002B49]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Número da Resolução / Parecer
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Resolução CNE/CES nº 4/2005"
                        value={newResolution}
                        onChange={(e) => setNewResolution(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Ano de Publicação
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 2005"
                        value={newYear}
                        onChange={(e) => setNewYear(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Descrição / Ementa do Documento
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ex: Institui as Diretrizes Curriculares Nacionais do curso, prevendo 10% de extensão e formação por competências..."
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                    />
                  </div>

                  {/* Mode Selector for PDF */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-2">
                      Fonte do Documento PDF *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadMode('file')}
                        className={`p-2.5 rounded-lg border text-center font-bold transition ${
                          uploadMode === 'file'
                            ? 'bg-[#002B49] text-white border-[#002B49]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Upload de PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadMode('generate')}
                        className={`p-2.5 rounded-lg border text-center font-bold transition ${
                          uploadMode === 'generate'
                            ? 'bg-[#002B49] text-white border-[#002B49]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Gerar Oficial MEC
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadMode('url')}
                        className={`p-2.5 rounded-lg border text-center font-bold transition ${
                          uploadMode === 'url'
                            ? 'bg-[#002B49] text-white border-[#002B49]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Link / URL
                      </button>
                    </div>
                  </div>

                  {/* Upload File Input */}
                  {uploadMode === 'file' && (
                    <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center bg-slate-50 hover:bg-slate-100 transition">
                      <input
                        type="file"
                        id="dcn-pdf-upload"
                        accept=".pdf,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label htmlFor="dcn-pdf-upload" className="cursor-pointer space-y-2 block">
                        <UploadCloud className="w-8 h-8 text-[#FF6B00] mx-auto" />
                        <span className="font-bold text-slate-800 block text-xs">
                          {newFileName ? `Arquivo: ${newFileName} (${newFileSize})` : 'Clique para selecionar o PDF da DCN ou arraste aqui'}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Formato aceito: .pdf • Visualização em tempo real na ferramenta
                        </span>
                      </label>
                    </div>
                  )}

                  {uploadMode === 'generate' && (
                    <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-xl space-y-1">
                      <div className="flex items-center gap-2 text-[#002B49] font-bold">
                        <Sparkles className="w-4 h-4 text-[#FF6B00]" />
                        <span>Gerador Normativo Oficial MEC / CNE</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        O sistema gerará um PDF autêntico e diagramado no padrão oficial da República Federativa do Brasil, com artigos pedagógicos, indissociabilidade de extensão (10%) e competências CHA para <strong>{courseName}</strong>.
                      </p>
                    </div>
                  )}

                  {uploadMode === 'url' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        URL Pública do PDF
                      </label>
                      <input
                        type="url"
                        placeholder="https://portal.mec.gov.br/cne/arquivos/pdf/..."
                        value={newPdfUrl}
                        onChange={(e) => setNewPdfUrl(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-[#002B49]"
                      />
                    </div>
                  )}

                  {/* Main DCN checkbox */}
                  <div className="pt-2">
                    <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMainDcn}
                        onChange={(e) => setIsMainDcn(e.target.checked)}
                        className="rounded accent-[#002B49] w-4 h-4"
                      />
                      <span>Definir como DCN Principal de Referência para o Curso</span>
                    </label>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('view')}
                      className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2 rounded-lg bg-[#FF6B00] hover:bg-[#e05e00] text-white font-bold transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
                    >
                      {isSaving ? 'Salvando Documento...' : 'Salvar DCN no Curso'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
