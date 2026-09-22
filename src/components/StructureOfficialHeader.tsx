import React from 'react';
import { CurriculumStructure } from '../types/curriculum';
import logoUnisuam from '../assets/logo-unisuam.png';

interface StructureOfficialHeaderProps {
  structure: CurriculumStructure;
  className?: string;
  /** Subtítulo sob o nome da instituição. */
  documentTitle?: string;
}

function formatDegree(degrees?: string): string {
  if (!degrees) return '—';
  if (degrees === 'Tecnólogo') return 'Tecnológico';
  return degrees;
}

/** Cabeçalho institucional compartilhado (tabela e mapa). */
export const StructureOfficialHeader: React.FC<StructureOfficialHeaderProps> = ({
  structure,
  className = '',
  documentTitle = 'ESTRUTURA CURRICULAR OFICIAL',
}) => (
  <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-xs ${className}`}>
    <div className="flex flex-wrap items-center justify-between border-b-2 border-[#FF6B00] pb-3 mb-3 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={logoUnisuam}
          alt="UNISUAM"
          className="h-14 w-auto object-contain shrink-0"
        />
        <div className="min-w-0">
          <h3 className="font-bold text-[19px] leading-snug text-[#002B49]">
            UNISUAM - Centro Universitário Augusto Motta
          </h3>
          <p className="text-[15px] text-slate-500 font-medium">{documentTitle}</p>
        </div>
      </div>

      <div className="text-right text-[15px] text-slate-600">
        <div className="font-semibold text-slate-800">
          Carga Horária Total:{' '}
          <span className="text-[#FF6B00] font-black text-[17px]">
            {structure.calculatedTotalHours}h
          </span>
        </div>
        {structure.structureType === 'disciplinar' && (
          <div>
            Total de Créditos:{' '}
            <span className="font-bold text-slate-800">{structure.totalCredits}</span>
          </div>
        )}
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-[15px]">
      <div>
        <span className="text-slate-400 block font-medium text-[14px]">Curso e Modalidade:</span>
        <span className="font-semibold text-slate-800 leading-snug">
          {structure.courseName} ({structure.modality})
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium text-[14px]">Grau:</span>
        <span className="font-semibold text-slate-800 leading-snug">
          {formatDegree(structure.degrees)}
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium text-[14px]">Estrutura:</span>
        <span className="font-semibold text-slate-800 leading-snug">
          {structure.structureType === 'modular' ? 'Modular' : 'Disciplinar'}
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium text-[14px]">Ato Autorizativo:</span>
        <span className="font-semibold text-slate-800 leading-snug">
          {structure.authorizationAct || structure.recognitionPortaria || '—'}
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium text-[14px]">DCN do Curso:</span>
        <span className="font-semibold text-slate-800 leading-snug">
          {structure.dcnRef || '—'}
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium text-[14px]">Código da Estrutura:</span>
        <span className="font-bold text-[#002B49]">
          {structure.code}
          {!structure.hideStatus ? ` (${structure.status})` : ''}
        </span>
      </div>
    </div>
  </div>
);
