import ExcelJS from 'exceljs';
import {
  CurriculumStructure,
  AppSettings,
  Discipline,
  getDisciplineChBreakdown,
} from '../types/curriculum';
import { buildWorkloadSummary } from './workloadSummary';
import { getSaberesLabels, labelForCategory } from '../utils/nomenclature';
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

function toRoman(num: number): string {
  const vals = [10, 9, 5, 4, 1];
  const syms = ['X', 'IX', 'V', 'IV', 'I'];
  let n = Math.max(1, Math.min(39, num));
  let out = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      out += syms[i];
      n -= vals[i];
    }
  }
  return out;
}

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
  mod: NonNullable<CurriculumStructure['modules']>[number]
): Discipline[] {
  if (mod.disciplines && mod.disciplines.length > 0) return mod.disciplines;
  return (mod.knowledges || []).map(
    (k): Discipline => ({
      id: k.id,
      code: mod.code || '',
      name: k.name,
      type: 'Obrigatória',
      credits: 0,
      hours: k.hours || 0,
      modalityDelivery: k.modalityDelivery,
      chPresential: k.chPresential,
      chSyncMediated: k.chSyncMediated,
      chAsync: k.chAsync,
    })
  );
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
  // Colunas: A Código | B Unidade | C.. CH fields | last Total
  // Modular: Presencial, Síncrona-Mediada, Assíncrona, Total  => cols 3-6 (total col 6)
  // Disciplinar: Créditos, Presencial, Síncrona, Síncrona-Mediada, Assíncrona, Total => 3-8
  const chCols = isModular
    ? ['CH Presencial', 'CH Síncrona-Mediada', 'CH Assíncrona']
    : ['Créditos', 'CH Presencial', 'CH Síncrona', 'CH Síncrona-Mediada', 'CH Assíncrona'];
  const totalCol = 2 + chCols.length + 1; // after code+name+ch
  const lastCol = totalCol;
  const sidePeriodCol = lastCol + 2;
  const sidePubCol = lastCol + 3;

  const ws = wb.addWorksheet('Estrutura Curricular', {
    views: [{ showGridLines: false }],
  });

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 42;
  for (let c = 3; c < totalCol; c++) ws.getColumn(c).width = 14;
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
  courseCell.font = { bold: true, color: { argb: C.white }, size: 12 };
  courseCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
  courseCell.alignment = { horizontal: 'left', vertical: 'middle', indent: logoBuf ? 10 : 0 };
  styleRange(ws, row, 1, row, lastCol, {});
  ws.getRow(row).height = 28;
  row++;

  ws.mergeCells(row, 1, row, lastCol);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = 'IDENTIFICAÇÃO DA ESTRUTURA CURRICULAR';
  titleCell.font = { bold: true, size: 14, color: { argb: C.navy } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  styleRange(ws, row, 1, row, lastCol, {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.white } },
  });
  ws.getRow(row).height = 22;
  row++;

  ws.mergeCells(row, 1, row, lastCol);
  const ato = structure.authorizationAct || structure.recognitionPortaria || '—';
  ws.getCell(row, 1).value =
    `Código: ${structure.code}  |  Curso e Modalidade: ${structure.courseName} (${structure.modality})  |  Ato Autorizativo: ${ato}`;
  ws.getCell(row, 1).font = { size: 9, italic: true, color: { argb: C.navy } };
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
        label: `Módulo ${toRoman(mod.number)} - ${mod.title}`,
        subtitle: mod.competence || undefined,
        components: getModuleComponents(mod),
        fallbackHours: mod.hours,
      }))
    : (structure.periods || []).map((period) => ({
        label: `${period.number}º Período`,
        components: period.disciplines || [],
        fallbackHours: period.totalHours,
      }));

  const sideStartRow = row;
  const sideItems = isModular
    ? (structure.modules || []).map((m) => ({
        period: `${m.number}º`,
        pub: `${(m.competence || m.title).slice(0, 42)}${m.hours ? ` — ${m.hours}H` : ''}`,
      }))
    : (structure.periods || []).map((p) => ({
        period: `${p.number}º`,
        pub: `${p.totalHours}H`,
      }));

  for (const block of blocks) {
    ws.mergeCells(row, 1, row, lastCol);
    const modHeader = ws.getCell(row, 1);
    modHeader.value = block.subtitle
      ? `${block.label}\n${block.subtitle}`
      : block.label;
    modHeader.font = { bold: true, size: 10, color: { argb: C.white } };
    modHeader.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    styleRange(ws, row, 1, row, lastCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
    });
    ws.getRow(row).height = block.subtitle ? 28 : 18;
    row++;

    // Header row 1: Código | Unidade | Carga Horária (merged) | Total
    const chStart = 3;
    const chEnd = 2 + chCols.length;
    ws.mergeCells(row, 1, row + 1, 1);
    ws.mergeCells(row, 2, row + 1, 2);
    if (chEnd > chStart) ws.mergeCells(row, chStart, row, chEnd);
    ws.mergeCells(row, totalCol, row + 1, totalCol);

    ws.getCell(row, 1).value = 'Código';
    ws.getCell(row, 2).value = 'Unidade Curricular';
    ws.getCell(row, chStart).value = 'Carga Horária';
    ws.getCell(row, totalCol).value = 'Total';
    styleRange(ws, row, 1, row, lastCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
      font: { bold: true, size: 9, color: { argb: C.white } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
    row++;

    // Header row 2: individual CH columns
    chCols.forEach((label, i) => {
      const cell = ws.getCell(row, chStart + i);
      cell.value = label;
      cell.font = { bold: true, size: 8, color: { argb: C.navy } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: i % 2 === 0 ? C.navySoft : C.orangeSoft },
      };
      cell.border = thinBorder();
    });
    styleRange(ws, row, 1, row, 2, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
    });
    styleRange(ws, row, totalCol, row, totalCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } },
    });
    ws.getRow(row).height = 28;
    row++;

    const sums = {
      credits: 0,
      presential: 0,
      sync: 0,
      syncMediated: 0,
      async: 0,
      total: 0,
    };

    if (block.components.length === 0) {
      ws.getCell(row, 1).value = '—';
      ws.getCell(row, 2).value = '(Sem unidades cadastradas)';
      for (let c = 3; c <= lastCol; c++) ws.getCell(row, c).value = null;
      styleRange(ws, row, 1, row, lastCol, {
        font: { size: 9, italic: true },
        alignment: { horizontal: 'center', vertical: 'middle' },
      });
      ws.getCell(row, 2).alignment = { horizontal: 'left', vertical: 'middle' };
      row++;
    } else {
      for (const disc of block.components) {
        const bd = getDisciplineChBreakdown(disc);
        sums.credits += Number(disc.credits) || 0;
        sums.presential += bd.presential;
        sums.sync += bd.sync;
        sums.syncMediated += bd.syncMediated;
        sums.async += bd.async;
        sums.total += bd.total;

        const chValues = isModular
          ? [bd.presential || null, bd.syncMediated || null, bd.async || null]
          : [
              disc.credits || null,
              bd.presential || null,
              bd.sync || null,
              bd.syncMediated || null,
              bd.async || null,
            ];

        ws.getCell(row, 1).value = disc.code || '';
        ws.getCell(row, 2).value = disc.name;
        chValues.forEach((v, i) => {
          ws.getCell(row, chStart + i).value = v;
        });
        ws.getCell(row, totalCol).value = bd.total || null;

        for (let c = 1; c <= lastCol; c++) {
          const cell = ws.getCell(row, c);
          cell.font = { size: 9, color: { argb: C.navy } };
          cell.border = thinBorder();
          cell.alignment = {
            horizontal: c === 2 ? 'left' : 'center',
            vertical: 'middle',
            wrapText: c === 2,
          };
          if (c >= chStart && c < totalCol) {
            const idx = c - chStart;
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
    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = 'SUBTOTAL';
    const subVals = isModular
      ? [sums.presential, sums.syncMediated, sums.async]
      : [sums.credits, sums.presential, sums.sync, sums.syncMediated, sums.async];
    subVals.forEach((v, i) => {
      ws.getCell(row, chStart + i).value = v || null;
    });
    ws.getCell(row, totalCol).value = sums.total || null;
    styleRange(ws, row, 1, row, lastCol, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gray } },
      font: { bold: true, size: 9, color: { argb: C.navy } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    row++;

    // Total
    ws.mergeCells(row, 1, row, 2);
    ws.getCell(row, 1).value = 'Total';
    if (chEnd > chStart) ws.mergeCells(row, chStart, row, chEnd);
    const grand = sums.total || block.fallbackHours || 0;
    ws.getCell(row, chStart).value = isModular
      ? `Presencial ${sums.presential}h · Sínc.-Med. ${sums.syncMediated}h · Assínc. ${sums.async}h`
      : `Presencial ${sums.presential}h · Distância ${sums.sync + sums.syncMediated + sums.async}h`;
    ws.getCell(row, totalCol).value = grand || null;

    styleRange(ws, row, 1, row, chEnd, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navySoft } },
      font: { bold: true, size: 9, color: { argb: C.navy } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    });
    const yellow = ws.getCell(row, totalCol);
    yellow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.orangeCell } };
    yellow.font = { bold: true, size: 11, color: { argb: C.white } };
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
      font: { bold: true, size: 9, color: { argb: C.white } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    sRow++;
    sideItems.forEach((item, idx) => {
      ws.getCell(sRow, sidePeriodCol).value = item.period;
      ws.getCell(sRow, sidePubCol).value = item.pub;
      const color = C.periodColors[idx % C.periodColors.length];
      styleRange(ws, sRow, sidePeriodCol, sRow, sidePeriodCol, {
        font: { bold: true, size: 9, color: { argb: C.navy } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gray } },
      });
      styleRange(ws, sRow, sidePubCol, sRow, sidePubCol, {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } },
        font: { bold: true, size: 8, color: { argb: C.white } },
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
      structure.authorizationAct || structure.recognitionPortaria || '-',
      'Tipo de Estrutura:',
      structure.structureType.toUpperCase(),
    ],
    [
      'Diretriz DCN Ativa:',
      structure.dcnRef || 'DCN Geral',
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
      ['Módulo', 'Código do Módulo', 'Trilha / Ramificação', 'Categoria', 'Descrição'],
    ];
    let hasSaberes = false;
    structure.modules.forEach((mod) => {
      const branchText = mod.branch
        ? `Trilha ${mod.branch}${mod.branchName ? ` — ${mod.branchName}` : ''}`
        : 'Tronco Comum';
      (mod.competencies || []).forEach((comp) => {
        hasSaberes = true;
        saberRows.push([
          `${mod.number}º Módulo: ${mod.title}`,
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
    const wsCh = wb.addWorksheet('Carga Horária');
    const chRows: (string | number)[][] = [
      ['CARGA HORÁRIA'],
      [`Curso: ${structure.courseName}`, `Código: ${structure.code}`],
      [],
      ['Componentes', 'Hora-relógio', 'Percentual'],
      ...rows.map((r) => [r.label, r.hours, `${Math.round(r.percent * 100) / 100}%`]),
    ];
    chRows.forEach((r, i) =>
      r.forEach((v, j) => {
        wsCh.getCell(i + 1, j + 1).value = v;
      })
    );
    wsCh.getColumn(1).width = 40;
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
