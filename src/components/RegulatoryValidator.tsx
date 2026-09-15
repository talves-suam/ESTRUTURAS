import React from 'react';
import { CurriculumStructure } from '../types/curriculum';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, HelpCircle } from 'lucide-react';

interface RegulatoryValidatorProps {
  structure: CurriculumStructure;
}

export const RegulatoryValidator: React.FC<RegulatoryValidatorProps> = ({ structure }) => {
  const total = structure.calculatedTotalHours || 0;
  const reqTotal = structure.requiredTotalHours || 0;
  const isTotalValid = total >= reqTotal;

  const presPercent = total > 0 ? Math.round((structure.calculatedPresentialHours / total) * 100) : 0;
  const isPresentialValid = presPercent >= structure.minPresentialHoursPercent;

  const eadPercent = total > 0 ? Math.round((structure.calculatedEadHours / total) * 100) : 0;
  const isEadValid = eadPercent <= structure.maxEadHoursPercent;

  const extPercent = total > 0 ? Math.round((structure.calculatedExtensionHours / total) * 100) : 0;
  const minExt = structure.minExtensionPercent ?? 10;
  const isExtensionValid = extPercent >= minExt;

  const isApproved = isTotalValid && isPresentialValid && isEadValid && isExtensionValid;
  const hasCriticalIssue = !isTotalValid || !isPresentialValid;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      {/* Header Status */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#002B49]" />
          <div>
            <h4 className="text-sm font-bold text-slate-900">Validação Regulatória & DCN</h4>
            <p className="text-[11px] text-slate-500">MEC • DCN Ativa • CINE Brasil • Resolução Extensão 7/2018</p>
          </div>
        </div>

        <div>
          {isApproved ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              STATUS: APROVADO
            </span>
          ) : hasCriticalIssue ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
              <XCircle className="w-3.5 h-3.5" />
              STATUS: IMPEDIDO / PENDENTE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              STATUS: EM AJUSTE
            </span>
          )}
        </div>
      </div>

      {/* Grid of indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* CH Total */}
        <div className={`p-3 rounded-lg border ${isTotalValid ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-300'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600">CH Total do Curso</span>
            {isTotalValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <div className="text-base font-black text-slate-900">
            {total}h <span className="text-xs font-normal text-slate-500">/ {reqTotal}h mín.</span>
          </div>
          <p className="text-[11px] mt-1 text-slate-600">
            {isTotalValid ? 'Carga horária suficiente.' : `Faltam ${reqTotal - total}h para o mínimo.`}
          </p>
        </div>

        {/* Presencialidade */}
        <div className={`p-3 rounded-lg border ${isPresentialValid ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-300'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600">CH Presencial ({presPercent}%)</span>
            {isPresentialValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <div className="text-base font-black text-slate-900">
            {structure.calculatedPresentialHours}h <span className="text-xs font-normal text-slate-500">(mín. {structure.minPresentialHoursPercent}%)</span>
          </div>
          <p className="text-[11px] mt-1 text-slate-600">
            {isPresentialValid ? 'Percentual presencial cumprido.' : `Abaixo do mínimo de ${structure.minPresentialHoursPercent}%.`}
          </p>
        </div>

        {/* EAD / Limite Portaria MEC */}
        <div className={`p-3 rounded-lg border ${isEadValid ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600">CH a Distância ({eadPercent}%)</span>
            {isEadValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div className="text-base font-black text-slate-900">
            {structure.calculatedEadHours}h <span className="text-xs font-normal text-slate-500">(teto {structure.maxEadHoursPercent}%)</span>
          </div>
          <p className="text-[11px] mt-1 text-slate-600">
            {isEadValid ? 'Dentro do teto regulatório de EAD.' : `Excede o teto de ${structure.maxEadHoursPercent}%.`}
          </p>
        </div>

        {/* Extensão 10% */}
        <div className={`p-3 rounded-lg border ${isExtensionValid ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-600">Extensão ({extPercent}%)</span>
            {isExtensionValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div className="text-base font-black text-[#FF6B00]">
            {structure.calculatedExtensionHours}h <span className="text-xs font-normal text-slate-500">(mín. {minExt}%)</span>
          </div>
          <p className="text-[11px] mt-1 text-slate-600">
            {isExtensionValid ? 'Atende a Resolução CNE 7/2018.' : 'Requer mínimo de 10% de extensão.'}
          </p>
        </div>
      </div>

      {/* DCN and CINE Brasil Badges */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100 gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[#002B49]">DCN Ativa:</span>
          <span className="bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-200 font-mono text-[11px]">
            {structure.dcnRef || 'Resolução CNE/CES Geral'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[#002B49]">Classificação CINE Brasil:</span>
          <span className="bg-orange-50 text-orange-900 px-2 py-0.5 rounded border border-orange-200 font-mono text-[11px]">
            {structure.cineBrasilRef || 'Geral'}
          </span>
        </div>
      </div>
    </div>
  );
};
