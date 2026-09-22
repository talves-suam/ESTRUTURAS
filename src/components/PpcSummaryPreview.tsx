import React from 'react';
import { CurriculumStructure } from '../types/curriculum';
import { getPpcSummaryContent, hasPpcSummary, PPC_SUMMARY_PAGE_TITLE } from '../services/ppcSummary';

interface PpcSummaryPreviewProps {
  structure: CurriculumStructure;
  /** Quando true, a seção é omitida da captura da matriz (página separada no PDF/PNG). */
  excludeFromMatrixCapture?: boolean;
}

/** Pré-visualização do Perfil do Egresso (1ª página — só impressão da estrutura). */
export const PpcSummaryPreview: React.FC<PpcSummaryPreviewProps> = ({
  structure,
  excludeFromMatrixCapture = true,
}) => {
  if (!hasPpcSummary(structure)) return null;

  const content = getPpcSummaryContent(structure);

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${
        excludeFromMatrixCapture ? 'no-export' : ''
      }`}
    >
      <div className="bg-[#002B49] px-5 py-2.5">
        <h3 className="text-[17px] font-black uppercase tracking-wider text-white">
          {PPC_SUMMARY_PAGE_TITLE}
        </h3>
      </div>

      <div className="p-4 space-y-3">
        {content.aspects.length > 0 ? (
          content.aspects.map((asp) => (
            <div key={asp.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-[14px] font-bold text-[#002B49] mb-1">{asp.title}</p>
              {asp.text && (
                <div className="text-[15px] text-slate-600 leading-relaxed whitespace-pre-wrap text-justify">
                  {asp.text}
                </div>
              )}
            </div>
          ))
        ) : content.graduateProfile ? (
          <div className="text-[15px] text-slate-600 leading-relaxed whitespace-pre-wrap text-justify">
            {content.graduateProfile}
          </div>
        ) : null}
      </div>
    </div>
  );
};
