import React from 'react';
import { CurriculumStructure } from '../types/curriculum';
import {
  buildWorkloadSummary,
  formatWorkloadHours,
  formatWorkloadPercent,
} from '../services/workloadSummary';

interface WorkloadSummaryCardProps {
  structure: CurriculumStructure;
  className?: string;
}

export const WorkloadSummaryCard: React.FC<WorkloadSummaryCardProps> = ({
  structure,
  className = '',
}) => {
  const { rows } = buildWorkloadSummary(structure);
  const componentRows = rows.filter((row) => row.id !== 'total');
  const totalRow = rows.find((row) => row.id === 'total');

  return (
    <section
      data-workload-summary
      className={`rounded-xl border border-[#002B49]/12 bg-white shadow-sm overflow-hidden ${className}`}
    >
      <div className="bg-[#002B49] px-3 py-2">
        <h3 className="text-[11px] font-black tracking-wide text-white text-center uppercase">
          Carga Horária
        </h3>
        <p className="text-[9px] text-blue-200/90 text-center mt-0.5 leading-tight">
          Hora-relógio · {structure.courseName}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-[#002B49]/5 border-b border-[#002B49]/10">
              <th className="px-2.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-[#002B49] whitespace-nowrap">
                Componentes
              </th>
              {componentRows.map((row) => (
                <th
                  key={row.id}
                  className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#002B49] leading-tight"
                >
                  {row.shortLabel || row.label}
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
                Hora-relógio
              </th>
              {componentRows.map((row) => (
                <td
                  key={row.id}
                  className="px-2 py-1.5 text-center tabular-nums font-bold text-slate-800 whitespace-nowrap"
                >
                  {formatWorkloadHours(row.hours)}
                </td>
              ))}
            </tr>
            <tr>
              <th
                scope="row"
                className="px-2.5 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap"
              >
                Percentual
              </th>
              {componentRows.map((row) => (
                <td
                  key={row.id}
                  className="px-2 py-1.5 text-center tabular-nums text-slate-600 whitespace-nowrap"
                >
                  {formatWorkloadPercent(row.percent)}
                </td>
              ))}
            </tr>
          </tbody>
          {totalRow && (
            <tfoot>
              <tr className="bg-[#FF6B00]/8 border-t border-[#002B49]/10 font-bold text-[#002B49]">
                <td
                  colSpan={componentRows.length + 1}
                  className="relative px-2.5 py-1.5"
                >
                  <span className="uppercase tracking-wider">Total</span>
                  <span className="absolute inset-0 flex items-center justify-center tabular-nums whitespace-nowrap pointer-events-none">
                    {formatWorkloadHours(totalRow.hours)} horas
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
};
