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

  return (
    <section
      data-workload-summary
      className={`rounded-xl border border-[#002B49]/12 bg-white shadow-sm overflow-hidden max-w-md ${className}`}
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
              <th className="px-2.5 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-[#002B49]">
                Componentes
              </th>
              <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#002B49] w-16">
                Horas
              </th>
              <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#002B49] w-14">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-slate-100 last:border-0 ${
                  row.emphasize
                    ? 'bg-[#FF6B00]/8 font-bold text-[#002B49]'
                    : 'hover:bg-slate-50/80 text-slate-700'
                }`}
              >
                <td className="px-2.5 py-1 text-left font-medium leading-snug whitespace-normal">
                  {row.label}
                </td>
                <td className="px-2 py-1 text-center tabular-nums font-semibold whitespace-nowrap">
                  {formatWorkloadHours(row.hours)}
                </td>
                <td
                  className={`px-2 py-1 text-center tabular-nums whitespace-nowrap ${
                    row.emphasize ? 'text-[#FF6B00]' : 'text-slate-600'
                  }`}
                >
                  {formatWorkloadPercent(row.percent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
