import React from 'react';
import { CurriculumStructure } from '../types/curriculum';
import logoUnisuam from '../assets/logo-unisuam.png';

interface StructureOfficialHeaderProps {
  structure: CurriculumStructure;
  className?: string;
}

/** Cabeçalho institucional compartilhado (tabela e mapa). */
export const StructureOfficialHeader: React.FC<StructureOfficialHeaderProps> = ({
  structure,
  className = '',
}) => (
  <div className={`bg-white rounded-xl border border-slate-200 p-5 shadow-xs ${className}`}>
    <div className="flex flex-wrap items-center justify-between border-b-2 border-[#FF6B00] pb-4 mb-4 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={logoUnisuam}
          alt="UNISUAM"
          className="h-14 w-auto object-contain shrink-0"
        />
        <div className="min-w-0">
          <h3 className="font-bold text-base text-[#002B49]">
            UNISUAM - Centro Universitário Augusto Motta
          </h3>
          <p className="text-xs text-slate-500 font-medium">ESTRUTURA CURRICULAR OFICIAL</p>
        </div>
      </div>

      <div className="text-right text-xs text-slate-600">
        <div className="font-semibold text-slate-800">
          Carga Horária Total:{' '}
          <span className="text-[#FF6B00] font-black text-sm">
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

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
      <div>
        <span className="text-slate-400 block font-medium">Curso e Modalidade:</span>
        <span className="font-semibold text-slate-800">
          {structure.courseName} ({structure.modality})
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium">Ato Autorizativo:</span>
        <span className="font-semibold text-slate-800">
          {structure.authorizationAct || structure.recognitionPortaria || '—'}
        </span>
      </div>
      <div>
        <span className="text-slate-400 block font-medium">Código da Estrutura:</span>
        <span className="font-bold text-[#002B49]">
          {structure.code}
          {!structure.hideStatus ? ` (${structure.status})` : ''}
        </span>
      </div>
    </div>
  </div>
);
