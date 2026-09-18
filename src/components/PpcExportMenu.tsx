import React, { useState } from 'react';
import { FileImage } from 'lucide-react';
import { CurriculumStructure } from '../types/curriculum';
import { exportPpcPngs, listPpcSections } from '../services/ppcExport';

interface PpcExportMenuProps {
  structure: CurriculumStructure;
  disabled?: boolean;
  onToast: (message: string, type: 'info' | 'success' | 'error') => void;
  prepareCapture?: () => Promise<void>;
}

/** Gera PNGs fatiados por período/módulo no visual da tabela (cabeçalho só na 1ª). */
export const PpcExportMenu: React.FC<PpcExportMenuProps> = ({
  structure,
  disabled = false,
  onToast,
  prepareCapture,
}) => {
  const [busy, setBusy] = useState(false);
  const sectionCount = listPpcSections(structure).length;
  const unit = structure.structureType === 'modular' ? 'módulo' : 'período';

  const handlePng = async () => {
    setBusy(true);
    onToast(`Gerando ${sectionCount} PNG(s) por ${unit}...`, 'info');
    try {
      await prepareCapture?.();
      const count = await exportPpcPngs(structure);
      onToast(`${count} PNG(s) gerados (cabeçalho só na primeira imagem).`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao gerar PNG do PPC';
      onToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePng}
      disabled={busy || disabled}
      title={`Gerar ${sectionCount} PNG(s) no visual da tabela, um por ${unit}`}
      className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-[#002B49] text-xs font-bold transition flex items-center gap-1 shadow-xs border border-[#002B49]/20 disabled:opacity-50"
    >
      <FileImage className="w-3.5 h-3.5 text-[#FF6B00]" />
      {busy ? 'Gerando PPC...' : 'PPC PNG'}
    </button>
  );
};
