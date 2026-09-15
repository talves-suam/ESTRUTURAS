import { CurriculumStructure, Discipline, PeriodData, ModuleData } from '../types/curriculum';

export function parseSagaReportText(
  rawText: string,
  params: {
    courseName: string;
    courseId: string;
    modality: 'Presencial' | 'Semipresencial' | 'EAD';
    code: string;
    activeYearSemester: string;
    structureType: 'disciplinar' | 'modular';
    requiredTotalHours?: number;
  }
): CurriculumStructure {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  if (params.structureType === 'disciplinar') {
    const periods: PeriodData[] = [];
    let currentPeriod: PeriodData | null = null;
    let periodIndex = 1;

    for (const line of lines) {
      // Período detection
      const periodMatch = line.match(/(\d+)º\s*Per[íi]odo/i);
      if (periodMatch) {
        const pNum = parseInt(periodMatch[1], 10);
        currentPeriod = {
          id: `p-${pNum}-${Date.now()}`,
          number: pNum,
          disciplines: [],
          totalCredits: 0,
          totalHours: 0,
        };
        periods.push(currentPeriod);
        periodIndex = pNum;
        continue;
      }

      if (!currentPeriod) {
        currentPeriod = {
          id: `p-1-${Date.now()}`,
          number: 1,
          disciplines: [],
          totalCredits: 0,
          totalHours: 0,
        };
        periods.push(currentPeriod);
      }

      // Check for discipline pattern like:
      // "EXTN0001 (B) Extensão 1 Obrigatória" or "TCSA0021 (B) Contabilidade Básica Obrigatória"
      // or tabular row
      const discMatch = line.match(/^([A-Z]{3,5}\d{3,5}(?:\s*\([A-Z0-9]\))?)\s+(.+?)(?:\s+(Obrigat[oó]ria|Eletiva|Optativa))?$/i);
      if (discMatch) {
        const code = discMatch[1].trim();
        const name = discMatch[2].trim();
        const type = (discMatch[3]?.toLowerCase().includes('eletiva') ? 'Eletiva' : 'Obrigatória') as 'Obrigatória' | 'Eletiva';

        const isExt = code.toLowerCase().startsWith('ext') || name.toLowerCase().includes('extensão');
        const isIntern = name.toLowerCase().includes('estágio') || name.toLowerCase().includes('prática supervisionada');

        const hours = isExt ? 60 : 80;
        const credits = isExt ? 3 : 4;

        currentPeriod.disciplines.push({
          id: `disc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          code,
          name,
          type,
          credits,
          hours,
          evaluationForm: params.modality === 'EAD' ? 'Nota (EAD)' : 'Resultado Final',
          modalityDelivery: params.modality === 'EAD' ? 'assincrono' : 'presencial',
          isExtension: isExt,
          isInternship: isIntern,
          flags: {
            classroom: params.modality === 'EAD' ? 'assincrono' : 'presencial',
            internship: 'presencial',
            complementaryActivity: 'presencial',
            extension: isExt ? 'sincrono-mediado' : 'presencial',
          },
        });
      }
    }

    // Recalculate period totals
    periods.forEach((p) => {
      p.totalCredits = p.disciplines.reduce((acc, d) => acc + (d.credits || 0), 0);
      p.totalHours = p.disciplines.reduce((acc, d) => acc + (d.hours || 0), 0);
    });

    const totalHours = periods.reduce((acc, p) => acc + p.totalHours, 0);

    return {
      id: `saga-${Date.now()}`,
      code: params.code,
      courseId: params.courseId,
      courseName: params.courseName,
      modality: params.modality,
      activeYearSemester: params.activeYearSemester,
      structureType: 'disciplinar',
      status: 'Ativa',
      validityStart: new Date().toISOString().split('T')[0],
      hideValidity: false,
      requiredTotalHours: params.requiredTotalHours || totalHours || 3000,
      minPresentialHoursPercent: params.modality === 'EAD' ? 10 : 60,
      maxEadHoursPercent: params.modality === 'EAD' ? 90 : 40,
      minExtensionPercent: 10,
      calculatedTotalHours: totalHours,
      calculatedPresentialHours: Math.round(totalHours * (params.modality === 'EAD' ? 0.2 : 0.8)),
      calculatedEadHours: Math.round(totalHours * (params.modality === 'EAD' ? 0.8 : 0.2)),
      calculatedExtensionHours: periods.reduce((sum, p) => sum + p.disciplines.filter(d => d.isExtension).reduce((s, d) => s + d.hours, 0), 0),
      calculatedComplementaryHours: 100,
      calculatedInternshipHours: 0,
      totalCredits: periods.reduce((acc, p) => acc + p.totalCredits, 0),
      periods,
      institutionName: 'UNISUAM - Centro Universitário Augusto Motta',
      campusName: 'Sede: UNISUAM-RJ',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Modular
    const modules: ModuleData[] = [];
    let currentModule: ModuleData | null = null;
    let modNumber = 1;

    for (const line of lines) {
      if (line.toLowerCase().startsWith('módulo') || line.toLowerCase().startsWith('modulo') || line.toLowerCase().startsWith('conhecimentos')) {
        const title = line.replace(/^(m[oó]dulo\s*\d*[:\-]?|conhecimentos[:\-]?)\s*/i, '').trim() || `Módulo ${modNumber}`;
        currentModule = {
          id: `mod-${modNumber}-${Date.now()}`,
          number: modNumber,
          code: `MOD-${String(modNumber).padStart(2, '0')}`,
          title,
          hours: 325,
          disciplines: [],
          competencies: [
            { id: `c-c-${Date.now()}`, category: 'conhecimento', name: `Fundamentos teóricos de ${title}`, hours: 40 },
            { id: `c-h-${Date.now()}`, category: 'habilidade', name: `Aplicação prática e resolução de problemas em ${title}`, hours: 35 },
            { id: `c-a-${Date.now()}`, category: 'atitude', name: 'Postura colaborativa, crítica e ética', hours: 15 },
          ],
        };
        modules.push(currentModule);
        modNumber++;
        continue;
      }

      const discMatch = line.match(/^([A-Z]{3,5}\d{3,5})\s+(.+?)(?:\s+(Obrigat[oó]ria|Eletiva))?$/i);
      if (discMatch && currentModule) {
        currentModule.disciplines.push({
          id: `mdisc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          code: discMatch[1],
          name: discMatch[2],
          type: 'Obrigatória',
          credits: 4,
          hours: 80,
          modalityDelivery: 'presencial',
          flags: { classroom: 'presencial', internship: 'presencial', complementaryActivity: 'presencial', extension: 'presencial' },
        });
      }
    }

    if (modules.length === 0) {
      // Default 8 modules if raw text couldn't be parsed
      for (let i = 1; i <= 8; i++) {
        modules.push({
          id: `mod-${i}-${Date.now()}`,
          number: i,
          code: `MOD-${String(i).padStart(2, '0')}`,
          title: `Módulo Integrado ${i}`,
          hours: 375,
          disciplines: [],
          competencies: [
            { id: `c-1-${i}`, category: 'conhecimento', name: `Conceitos essenciais do módulo ${i}`, hours: 40 },
            { id: `c-2-${i}`, category: 'habilidade', name: `Habilidades de diagnóstico e execução no módulo ${i}`, hours: 30 },
            { id: `c-3-${i}`, category: 'atitude', name: 'Atitude profissional ética e orientada a resultados', hours: 15 },
          ],
        });
      }
    }

    const totalHours = modules.reduce((acc, m) => acc + m.hours, 0);

    return {
      id: `saga-${Date.now()}`,
      code: params.code,
      courseId: params.courseId,
      courseName: params.courseName,
      modality: params.modality,
      activeYearSemester: params.activeYearSemester,
      structureType: 'modular',
      status: 'Ativa',
      validityStart: new Date().toISOString().split('T')[0],
      hideValidity: false,
      requiredTotalHours: params.requiredTotalHours || totalHours,
      minPresentialHoursPercent: 60,
      maxEadHoursPercent: 40,
      minExtensionPercent: 10,
      calculatedTotalHours: totalHours,
      calculatedPresentialHours: Math.round(totalHours * 0.8),
      calculatedEadHours: Math.round(totalHours * 0.2),
      calculatedExtensionHours: Math.round(totalHours * 0.1),
      calculatedComplementaryHours: 100,
      calculatedInternshipHours: 0,
      totalCredits: Math.round(totalHours / 20),
      modules,
      institutionName: 'UNISUAM - Centro Universitário Augusto Motta',
      campusName: 'Sede: UNISUAM-RJ',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
