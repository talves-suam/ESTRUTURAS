import React, { useMemo } from 'react';
import { CurriculumStructure } from '../types/curriculum';
import {
  buildWorkloadSummary,
  buildModuleMeetingsSummary,
  formatWorkloadHours,
  formatWorkloadPercent,
  summaryTableDensity,
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
  const meetings = buildModuleMeetingsSummary(structure);

  const density = useMemo(() => {
    const cols = Math.max(
      componentRows.length,
      meetings?.rows.length ?? 0
    );
    return summaryTableDensity(cols);
  }, [componentRows.length, meetings?.rows.length]);

  return (
    <section
      data-workload-summary
      className={`rounded-xl border border-[#002B49]/12 bg-white shadow-sm overflow-hidden min-w-0 h-full flex flex-col ${className}`}
    >
      <div className="bg-[#002B49] px-3 py-2 shrink-0">
        <h3
          className={`${density.titleText} font-black tracking-wide text-white text-center uppercase`}
        >
          Carga Horária
        </h3>
        <p
          className={`${density.subtitleText} text-blue-200/90 text-center mt-0.5 leading-tight`}
        >
          Hora-relógio · {structure.courseName}
        </p>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <table
          className={`w-full table-fixed ${density.tableText} border-collapse`}
        >
          <thead>
            <tr className="bg-[#002B49]/5 border-b border-[#002B49]/10">
              <th
                className={`${density.cellPad} text-left ${density.headerText} font-bold uppercase tracking-wider text-[#002B49] ${density.labelCol}`}
              >
                Componentes
              </th>
              {componentRows.map((row) => (
                <th
                  key={row.id}
                  className={`${density.cellPad} text-center ${density.headerText} font-bold uppercase tracking-wider text-[#002B49] leading-tight`}
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
                className={`${density.cellPad} text-left font-semibold text-slate-500`}
              >
                Hora-relógio
              </th>
              {componentRows.map((row) => (
                <td
                  key={row.id}
                  className={`${density.cellPad} text-center tabular-nums font-bold text-slate-800`}
                >
                  {formatWorkloadHours(row.hours)}
                </td>
              ))}
            </tr>
            <tr>
              <th
                scope="row"
                className={`${density.cellPad} text-left font-semibold text-slate-500`}
              >
                Percentual
              </th>
              {componentRows.map((row) => (
                <td
                  key={row.id}
                  className={`${density.cellPad} text-center tabular-nums text-slate-600`}
                >
                  {formatWorkloadPercent(row.percent)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {totalRow && (
          <div className="mt-auto relative bg-[#FF6B00]/8 border-t border-[#002B49]/10 px-2 py-1.5 font-bold text-[#002B49]">
            <span className="uppercase tracking-wider text-[10px]">Total</span>
            <span
              className={`absolute inset-0 flex items-center justify-center tabular-nums whitespace-nowrap pointer-events-none ${density.footerText}`}
            >
              {formatWorkloadHours(totalRow.hours)} horas
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
