import ExcelJS from 'exceljs';
import {
  CurriculumStructure,
  AppSettings,
  Discipline,
  getDisciplineChBreakdown,
  getModuleCompetences,
  structureHasPresentialSplit,
  getPresentialSplitFlags,
  withStructurePresentialFlags,
  showsComponentCodeColumn,
} from '../types/curriculum';
import { buildWorkloadSummary, buildModuleMeetingsSummary } from './workloadSummary';
import { getSaberesLabels, labelForCategory } from '../utils/nomenclature';
import { formatModuleName, toRoman, formatBranchLabel } from '../utils/roman';
import { formatDcnsDisplayLabel } from '../utils/courseBatch';
import { getActiveAuthorizationActLabel } from '../utils/authorizationActs';
import { getModularComponents } from '../utils/modularComponents';
import logoUnisuamUrl from '../assets/logo-unisuam.png';

const C = {
  navy: 'FF002B49',
  orange: 'FFFF6B00',
  white: 'FFFFFFFF',
  gray: 'FFF1F5F9',
  navySoft: 'FFE8EEF3',
  orangeSoft: 'FFFFF0E6',
  orangeCell: 'FFFF6B00',
  border: 'FF002B49',
  periodColors: [
    'FF002B49',
    'FFFF6B00',
    'FF003A63',
    'FFE55A00',
    'FF1A4A6B',
    'FFD45500',
    'FF254D6E',
    'FFC44D00',
  ],
};

function thinBorder(): ExcelJS.Borders {
  const edge: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: C.border },
  };
  return { top: edge, left: edge, bottom: edge, right: edge } as ExcelJS.Borders;
}

function styleRange(
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  style: Partial<ExcelJS.Style>
) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = thinBorder();
      if (style.fill) cell.fill = style.fill as ExcelJS.Fill;
      if (style.font) cell.font = { ...cell.font, ...style.font };
      if (style.alignment) cell.alignment = { ...cell.alignment, ...style.alignment };
    }
  }
}

function getModuleComponents(
  mod: NonNullable<CurriculumStructure['modules']>[number],
  structure: Pick<CurriculumStructure, 'hasLaboratory' | 'hasClinical'>
): Discipline[] {
  return getModularComponents(mod).map((d) => withStructurePresentialFlags(d, structure));
}

async function fetchLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(logoUnisuamUrl);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function buildCurriculumIdentificationSheet(
  wb: ExcelJS.Workbook,
  structure: CurriculumStructure
): Promise<void> {
  const isModular = structure.structureType === 'modular';
  const splitFlags = getPresentialSplitFlags(structure);
  const useSplit = splitFlags.enabled;
  const showCode = showsComponentCodeColumn(structure);
  const nameCol = showCode ? 2 : 1;
  // Colunas CH (após [Código] + Unidade [+ Créditos no disciplinar]):
  // Com split: Teórico | [Laboratório] | [Clínica] | Síncrono-Mediado | Assíncrono
  // Sem split: Presencial | Síncrono-Mediado | Assíncrono
  const prefixCols = isModular ? ([] as string[]) : (['Créditos'] as string[]);
  const presentialCols = useSplit
    ? ([
        'Teórico',
        ...(splitFlags.hasLaboratory ? (['Laboratório'] as string[]) : []),
        ...(splitFlags.hasClinical ? (['Clínica'] as string[]) : []),
      ] as string[])
    : (['Presencial'] as string[]);
  const distanceCols = ['Síncrono-Mediado', 'Assíncrono'];
  const chDetailCols = [...presentialCols, ...distanceCols];
  const allMidCols = [...prefixCols, ...chDetailCols];
  const totalCol = nameCol + allMidCols.length + 1;
  const lastCol = totalCol;
  const sidePeriodCol = lastCol + 2;
  const sidePubCol = lastCol + 3;
  const midStart = nameCol + 1;
  const midEnd = nameCol + allMidCols.length;
  const presStart = midStart + prefixCols.length;
  const presEnd = presStart + presentialCols.length - 1;
  const syncMedCol = presEnd + 1;
  const asyncCol = syncMedCol + 1;

  const ws = wb.addWorksheet('Estrutura Curricular', {
    views: [{ showGridLines: false }],
  });

  if (showCode) {
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 42;
  } else {
    ws.getColumn(1).width = 42;
  }
  for (let c = nameCol + 1; c < totalCol; c++) ws.getColumn(c).width = 13;
  ws.getColumn(totalCol).width = 10;
  ws.getColumn(lastCol + 1).width = 3;
  ws.getColumn(sidePeriodCol).width = 10;
  ws.getColumn(sidePubCol).width = 24;

  const logoBuf = await fetchLogoBuffer();
  if (logoBuf) {
    const imgId = wb.addImage({
      buffer: new Uint8Array(logoBuf),
      extension: 'png',
    });
    ws.addImage(imgId, {
      tl: { col: 0, row: 0 },
      ext: { width: 72, height: 72 },
    });
  }

  let row = 1;
  // Curso header spanning
  ws.mergeCells(row, 1, row, lastCol);
  const courseCell = ws.getCell(row, 1);
  courseCell.value = `Curso: ${structure.courseName}`;
  courseCell.font = { bold: true, color: { argb: C.white }, size: 15 };
  courseCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
  courseCell.alignment = { horizontal: 'left', vertical: 'middle', indent: logoBuf ? 10 : 0 };
  styleRange(ws, row, 1, row, lastCol, {});
  ws.getRow(row).height = 28;
  row++;

  ws.mergeCells(row, 1, row, lastCol);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = 'IDENTIFICAÇÃO DA ESTRUTURA CURRICULAR';
  titleCell.font = { bold: true, size: 17, color: { argb: C.navy } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  styleRange(ws, row, 1, row, lastCol, {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } },
  });
  ws.getRow(row).height = 22;
  row++;

  ws.mergeCells(row, 1, row, lastCol);
  const ato = getActiveAuthorizationActLabel(structure);
  const dcn = formatDcnsDisplayLabel(structure.dcns, structure.dcnRef);
  ws.getCell(row, 1).value =
    `Código: ${structure.code}  |  Curso e Modalidade: ${structure.courseName} (${structure.modality})  |  Ato Autorizativo: ${ato}  |  DCN do Curso: ${dcn}`;
  ws.getCell(row, 1).font = { size: 11, italic: true, color: { argb: C.navy } };
  ws.getCell(row, 1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  styleRange(ws, row, 1, row, lastCol, {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gray } },
  });
  row += 2;

  type Block = {
    label: string;
    subtitle?: string;
    components: Discipline[];
    fallbackHours: number;
  };

  const blocks: Block[] = isModular
    ? (structure.modules || []).map((mod) => ({
        label: formatModuleName(mod.number, mod.title),
        components: getModuleComponents(mod, structure),
        fallbackHours: mod.hours,
      }))
    : (structure.periods || []).map((period) => ({
        label: `${period.number}º Período`,
        components: (period.disciplines || []).map((d) =>
          withStructurePresentialFlags(d, structure)
        ),
        fallbackHours: period.totalHours,
      }));

  const sideStartRow = row;
  const sideItems = isModular
    ? (structure.modules || []).map((m) => {
        const comps = getModuleCompetences(m);
        const pubBase = comps[0] || m.title;
        return {
          period: toRoman(m.number),
          pub: `${pubBase.slice(0, 42)}${m.hours ? ` — ${m.hours}H` : ''}`,
        };
      })
    : (structure.periods || []).map((p) => ({
        period: `${p.number}º`,
        pub: `${p.totalHours}H`,
      }));

  for (const block of blocks) {
    ws.mergeCells(row, 1, row, lastCol);
    const modHeader = ws.getCell(row, 1);
    modHeader.value = block.label;
    modHeader.font = { bold: true, size: 13, color: { argb: C.white } };
    modHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    styleRange(ws, row, 1, row, lastCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
    });
    ws.getRow(row).height = 18;
    row++;

    // Header: with split → 2 rows (Presencial spanning); without → single CH Presencial
    if (useSplit) {
      if (showCode) ws.mergeCells(row, 1, row + 1, 1);
      ws.mergeCells(row, nameCol, row + 1, nameCol);
      if (!isModular) {
        ws.mergeCells(row, midStart, row + 1, midStart);
      }
      ws.mergeCells(row, totalCol, row + 1, totalCol);
      ws.mergeCells(row, syncMedCol, row + 1, syncMedCol);
      ws.mergeCells(row, asyncCol, row + 1, asyncCol);
      if (presEnd > presStart) ws.mergeCells(row, presStart, row, presEnd);

      if (showCode) ws.getCell(row, 1).value = 'Código';
      ws.getCell(row, nameCol).value = 'Unidade Curricular';
      if (!isModular) ws.getCell(row, midStart).value = 'Créditos';
      ws.getCell(row, presStart).value = 'Presencial';
      ws.getCell(row, syncMedCol).value = 'Síncrono-Mediado';
      ws.getCell(row, asyncCol).value = 'Assíncrono';
      ws.getCell(row, totalCol).value = 'Total';
      styleRange(ws, row, 1, row, lastCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
        font: { bold: true, size: 11, color: { argb: C.white } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      });
      row++;

      presentialCols.forEach((label, i) => {
        const cell = ws.getCell(row, presStart + i);
        cell.value = label;
        cell.font = { bold: true, size: 10, color: { argb: C.navy } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: i % 2 === 0 ? C.navySoft : C.orangeSoft },
        };
        cell.border = thinBorder();
      });
      styleRange(ws, row, 1, row, nameCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
      });
      if (!isModular) {
        styleRange(ws, row, midStart, row, midStart, {
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
        });
      }
      styleRange(ws, row, syncMedCol, row, asyncCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
      });
      styleRange(ws, row, totalCol, row, totalCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
      });
      ws.getRow(row).height = 28;
      row++;
    } else {
      if (showCode) ws.getCell(row, 1).value = 'Código';
      ws.getCell(row, nameCol).value = 'Unidade Curricular';
      allMidCols.forEach((label, i) => {
        ws.getCell(row, midStart + i).value = label.startsWith('Presencial')
          ? 'CH Presencial'
          : label === 'Síncrono-Mediado'
          ? 'CH Síncrona-Mediada'
          : label === 'Assíncrono'
          ? 'CH Assíncrona'
          : label;
      });
      ws.getCell(row, totalCol).value = 'Total';
      styleRange(ws, row, 1, row, lastCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
        font: { bold: true, size: 11, color: { argb: C.white } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      });
      ws.getRow(row).height = 22;
      row++;
    }

    const sums = {
      credits: 0,
      theoretical: 0,
      laboratory: 0,
      clinical: 0,
      presential: 0,
      syncMediated: 0,
      async: 0,
      total: 0,
    };

    if (block.components.length === 0) {
      if (showCode) ws.getCell(row, 1).value = '—';
      ws.getCell(row, nameCol).value = '(Sem unidades cadastradas)';
      for (let c = nameCol + 1; c <= lastCol; c++) ws.getCell(row, c).value = null;
      styleRange(ws, row, 1, row, lastCol, {
        font: { size: 11, italic: true },
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      ws.getCell(row, nameCol).alignment = { horizontal: 'left', vertical: 'middle' };
      row++;
    } else {
      for (const disc of block.components) {
        const bd = getDisciplineChBreakdown(disc);
        const syncMed = (bd.syncMediated || 0) + (bd.sync || 0);
        sums.credits += Number(disc.credits) || 0;
        sums.theoretical += bd.theoretical;
        sums.laboratory += bd.laboratory;
        sums.clinical += bd.clinical;
        sums.presential += bd.presential;
        sums.syncMediated += syncMed;
        sums.async += bd.async;
        sums.total += bd.total;

        const midValues = (() => {
          const presentialVals = useSplit
            ? [
                bd.theoretical || null,
                ...(splitFlags.hasLaboratory ? [bd.laboratory || null] : []),
                ...(splitFlags.hasClinical ? [bd.clinical || null] : []),
              ]
            : [bd.presential || null];
          const tail = [syncMed || null, bd.async || null];
          return isModular
            ? [...presentialVals, ...tail]
            : [disc.credits || null, ...presentialVals, ...tail];
        })();

        if (showCode) ws.getCell(row, 1).value = disc.code || '';
        ws.getCell(row, nameCol).value = disc.name;
        midValues.forEach((v, i) => {
          ws.getCell(row, midStart + i).value = v;
        });
        ws.getCell(row, totalCol).value = bd.total || null;

        for (let c = 1; c <= lastCol; c++) {
          const cell = ws.getCell(row, c);
          cell.font = { size: 11, color: { argb: C.navy } };
          cell.border = thinBorder();
          cell.alignment = {
            horizontal: c === nameCol ? 'left' : 'center',
            vertical: 'middle',
            wrapText: c === nameCol,
          };
          if (c >= midStart && c < totalCol) {
            const idx = c - midStart;
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: idx % 2 === 0 ? C.navySoft : C.orangeSoft },
            };
          }
        }
        row++;
      }
    }

    // SUBTOTAL
    if (showCode) ws.mergeCells(row, 1, row, nameCol);
    ws.getCell(row, 1).value = 'SUBTOTAL';
    const subVals = (() => {
      const presentialVals = useSplit
        ? [
            sums.theoretical,
            ...(splitFlags.hasLaboratory ? [sums.laboratory] : []),
            ...(splitFlags.hasClinical ? [sums.clinical] : []),
          ]
        : [sums.presential];
      const tail = [sums.syncMediated, sums.async];
      return isModular
        ? [...presentialVals, ...tail]
        : [sums.credits, ...presentialVals, ...tail];
    })();
    subVals.forEach((v, i) => {
      ws.getCell(row, midStart + i).value = v || null;
    });
    ws.getCell(row, totalCol).value = sums.total || null;
    styleRange(ws, row, 1, row, lastCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gray } },
      font: { bold: true, size: 11, color: { argb: C.navy } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    row++;

    // Total
    if (showCode) ws.mergeCells(row, 1, row, nameCol);
    ws.getCell(row, 1).value = 'Total';
    if (midEnd > midStart) ws.mergeCells(row, midStart, row, midEnd);
    const grand = sums.total || block.fallbackHours || 0;
    ws.getCell(row, midStart).value = useSplit
      ? [
          `Teór. ${sums.theoretical}h`,
          splitFlags.hasLaboratory ? `Lab. ${sums.laboratory}h` : null,
          splitFlags.hasClinical ? `Clín. ${sums.clinical}h` : null,
          `Sínc.-Med. ${sums.syncMediated}h`,
          `Assínc. ${sums.async}h`,
        ]
          .filter(Boolean)
          .join(' · ')
      : `Presencial ${sums.presential}h · Sínc.-Med. ${sums.syncMediated}h · Assínc. ${sums.async}h`;
    ws.getCell(row, totalCol).value = grand || null;

    styleRange(ws, row, 1, row, midEnd, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navySoft } },
      font: { bold: true, size: 11, color: { argb: C.navy } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
    const yellow = ws.getCell(row, totalCol);
    yellow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.orangeCell } };
    yellow.font = { bold: true, size: 14, color: { argb: C.white } };
    yellow.alignment = { horizontal: 'center', vertical: 'middle' };
    yellow.border = thinBorder();
    ws.getRow(row).height = 22;

    row += 2;
  }

  if (sideItems.length > 0) {
    let sRow = sideStartRow;
    ws.getCell(sRow, sidePeriodCol).value = 'PERÍODO';
    ws.getCell(sRow, sidePubCol).value = 'PUB';
    styleRange(ws, sRow, sidePeriodCol, sRow, sidePubCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
      font: { bold: true, size: 11, color: { argb: C.white } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    sRow++;
    sideItems.forEach((item, idx) => {
      ws.getCell(sRow, sidePeriodCol).value = item.period;
      ws.getCell(sRow, sidePubCol).value = item.pub;
      const color = C.periodColors[idx % C.periodColors.length];
      styleRange(ws, sRow, sidePeriodCol, sRow, sidePeriodCol, {
        font: { bold: true, size: 11, color: { argb: C.navy } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gray } },
      });
      styleRange(ws, sRow, sidePubCol, sRow, sidePubCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } },
        font: { bold: true, size: 10, color: { argb: C.white } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      });
      ws.getRow(sRow).height = 28;
      sRow++;
    });
  }
}

export async function exportCurriculumToXlsx(
  structure: CurriculumStructure,
  settings?: AppSettings
): Promise<void> {
  const labels = getSaberesLabels(settings?.pedagogicalNomenclature);
  const workload = buildWorkloadSummary(structure);
  const hoursOf = (id: string) => workload.rows.find((r) => r.id === id)?.hours || 0;
  const splitFlags = getPresentialSplitFlags(structure);
  const useSplit = splitFlags.enabled;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UNISUAM Estruturas Curriculares';
  await buildCurriculumIdentificationSheet(wb, structure);

  const wsSummary = wb.addWorksheet('Resumo Geral');
  const summaryRows: (string | number)[][] = [
    ['UNISUAM - CENTRO UNIVERSITÁRIO AUGUSTO MOTTA'],
    ['ESTRUTURA CURRICULAR OFICIAL'],
    [],
    ['Código da Estrutura:', structure.code, 'Status:', structure.status],
    ['Curso e Modalidade:', `${structure.courseName} (${structure.modality})`],
    [
      'Ano/Semestre Vigência:',
      structure.activeYearSemester,
      'Início Vigência:',
      structure.hideValidity ? 'Oculto' : structure.validityStart || '-',
    ],
    [
      'Ato Autorizativo:',
      getActiveAuthorizationActLabel(structure),
      'DCN do Curso:',
      formatDcnsDisplayLabel(structure.dcns, structure.dcnRef),
    ],
    [
      'Tipo de Estrutura:',
      structure.structureType.toUpperCase(),
      'Classificação CINE Brasil:',
      structure.cineBrasilRef || 'Geral',
    ],
    ...(structure.structureType === 'disciplinar'
      ? [['Créditos Totais:', structure.totalCredits]]
      : []),
    [
      'CH Atividades Complementares:',
      structure.complementaryTotalHours || structure.calculatedComplementaryHours || 0,
    ],
    ['Observações:', structure.notes || '-'],
    [],
    ['QUADRO DEMONSTRATIVO DE CARGA HORÁRIA'],
    ['Indicador', 'Valor Apurado (Horas)', 'Exigência Mínima', 'Percentual Realizado'],
    [
      'Carga Horária Total',
      structure.calculatedTotalHours,
      structure.requiredTotalHours,
      `${Math.round((structure.calculatedTotalHours / (structure.requiredTotalHours || 1)) * 100)}%`,
    ],
    [
      'Carga Horária Presencial',
      structure.calculatedPresentialHours,
      `${structure.minPresentialHoursPercent}%`,
      `${Math.round((structure.calculatedPresentialHours / (structure.calculatedTotalHours || 1)) * 100)}%`,
    ],
    ...(useSplit
      ? ([
          ['  └ Teórico', hoursOf('teorico'), 'Frações da presencial', '-'],
          ...(splitFlags.hasLaboratory
            ? ([['  └ Laboratório', hoursOf('laboratorio'), 'Frações da presencial', '-']] as (string | number)[][])
            : []),
          ...(splitFlags.hasClinical
            ? ([['  └ Clínica', hoursOf('clinica'), 'Frações da presencial', '-']] as (string | number)[][])
            : []),
        ] as (string | number)[][])
      : []),
    [
      'Carga Horária a Distância',
      structure.calculatedEadHours,
      `Máx. ${structure.maxEadHoursPercent}%`,
      `${Math.round((structure.calculatedEadHours / (structure.calculatedTotalHours || 1)) * 100)}%`,
    ],
    [
      'Extensão Curricular (MEC 10%)',
      structure.calculatedExtensionHours,
      'Mín. 10%',
      `${Math.round((structure.calculatedExtensionHours / (structure.calculatedTotalHours || 1)) * 100)}%`,
    ],
    [
      'Atividades Complementares (CH)',
      structure.calculatedComplementaryHours || structure.complementaryTotalHours || 0,
      'Conforme cadastro',
      '-',
    ],
    ['Estágio Supervisionado', structure.calculatedInternshipHours, 'Conforme DCN', '-'],
  ];
  summaryRows.forEach((r, i) => {
    r.forEach((v, j) => {
      wsSummary.getCell(i + 1, j + 1).value = v;
    });
  });
  wsSummary.getColumn(1).width = 48;
  wsSummary.getColumn(2).width = 28;

  if (
    structure.structureType === 'modular' &&
    structure.modules &&
    !structure.hideCompetenciesInReport
  ) {
    const saberRows: (string | number)[][] = [
      ['Módulo', 'Código do Módulo', 'Ênfase / Ramificação', 'Categoria', 'Descrição'],
    ];
    let hasSaberes = false;
    structure.modules.forEach((mod) => {
      const branchText = mod.branch
        ? `${formatBranchLabel(mod.branch)}${mod.branchName ? ` — ${mod.branchName}` : ''}`
        : 'Tronco Comum';
      (mod.competencies || []).forEach((comp) => {
        hasSaberes = true;
        saberRows.push([
          formatModuleName(mod.number, mod.title, mod.branch),
          mod.code,
          branchText,
          labelForCategory(comp.category, settings?.pedagogicalNomenclature),
          comp.name,
        ]);
      });
    });
    if (hasSaberes) {
      const wsSaberes = wb.addWorksheet(labels.sectionTitle);
      saberRows.forEach((r, i) =>
        r.forEach((v, j) => {
          wsSaberes.getCell(i + 1, j + 1).value = v;
        })
      );
      wsSaberes.getColumn(1).width = 36;
      wsSaberes.getColumn(5).width = 48;
    }
  }

  if (!structure.hideWorkloadSummaryInReport) {
    const { rows } = buildWorkloadSummary(structure);
    const componentRows = rows.filter((r) => r.id !== 'total');
    const totalRow = rows.find((r) => r.id === 'total');
    const pct = (value: number) => `${Math.round(value * 100) / 100}%`;
    const wsCh = wb.addWorksheet('Carga Horária');
    const chRows: (string | number)[][] = [
      ['CARGA HORÁRIA'],
      [`Curso: ${structure.courseName}`, `Código: ${structure.code}`],
      [],
      ['Componentes', ...componentRows.map((r) => r.shortLabel || r.label)],
      ['Hora-relógio', ...componentRows.map((r) => r.hours)],
      ['Percentual', ...componentRows.map((r) => (r.excludeFromTotal ? '—' : pct(r.percent)))],
      ...(totalRow ? [['Total', totalRow.hours]] : []),
    ];
    chRows.forEach((r, i) =>
      r.forEach((v, j) => {
        wsCh.getCell(i + 1, j + 1).value = v;
      })
    );
    wsCh.getColumn(1).width = 40;

    const meetings = buildModuleMeetingsSummary(structure);
    if (meetings && meetings.rows.length > 0) {
      const wsMeet = wb.addWorksheet('Encontros por Módulo');
      const meetRows: (string | number)[][] = [
        ['ENCONTROS POR MÓDULO'],
        [`Curso: ${structure.courseName}`, `Código: ${structure.code}`],
        [],
        ['Módulos', ...meetings.rows.map((r) => r.shortLabel)],
        ['Encontros', ...meetings.rows.map((r) => r.meetings)],
        ['Total', meetings.totalMeetings],
      ];
      meetRows.forEach((r, i) =>
        r.forEach((v, j) => {
          wsMeet.getCell(i + 1, j + 1).value = v;
        })
      );
      wsMeet.getColumn(1).width = 40;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${structure.code}_${structure.courseName.replace(/\s+/g, '_')}_Estrutura_UNISUAM.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
