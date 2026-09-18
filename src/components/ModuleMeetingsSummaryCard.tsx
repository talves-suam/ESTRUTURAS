import React from 'react';
import { CurriculumStructure } from '../types/curriculum';
import { buildModuleMeetingsSummary } from '../services/workloadSummary';

interface ModuleMeetingsSummaryCardProps {
  structure: CurriculumStructure;
  className?: string;
}

/** Quadro horizontal de encontros por módulo (ao lado da carga horária). */
export const ModuleMeetingsSummaryCard: React.FC<ModuleMeetingsSummaryCardProps> = ({
  structure,
  className = '',
}) => {
  const summary = buildModuleMeetingsSummary(structure);
  if (!summary || summary.rows.length === 0) return null;

  const { rows, totalMeetings } = summary;

  return (
    <section
      data-module-meetings-summary
      className={`rounded-xl border border-[#002B49]/12 bg-white shadow-sm overflow-hidden ${className}`}
    >
      <div className="bg-[#002B49] px-3 py-2">
        <h3 className="text-[11px] font-black tracking-wide text-white text-center uppercase">
          Encontros por Módulo
        </h3>
        <p className="text-[9px] text-blue-200/90 text-center mt-0.5 leading-tight">
          Quantidade de encontros · {structure.courseName}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-[#002B49]/5 border-b border-[#002B49]/10">
              <th className="px-2.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-[#002B49] whitespace-nowrap">
                Módulos
              </th>
              {rows.map((row) => (
                <th
                  key={row.id}
                  className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#002B49] leading-tight"
                  title={row.label}
                >
                  {row.shortLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <th
                scope="row"
                className="px-2.5 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap"
              >
                Encontros
              </th>
              {rows.map((row) => (
                <td
                  key={row.id}
                  className="px-2 py-1.5 text-center tabular-nums font-bold text-slate-800 whitespace-nowrap"
                >
                  {row.meetings}
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-[#FF6B00]/8 border-t border-[#002B49]/10 font-bold text-[#002B49]">
              <th scope="row" className="px-2.5 py-1.5 text-left uppercase tracking-wider">
                Total
              </th>
              <td
                colSpan={rows.length}
                className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap"
              >
                {totalMeetings} {totalMeetings === 1 ? 'encontro' : 'encontros'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};
