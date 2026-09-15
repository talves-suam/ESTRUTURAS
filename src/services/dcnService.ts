import jsPDF from 'jspdf';
import { DcnDocument } from '../types/curriculum';

/**
 * Generates an official, beautifully formatted MEC / CNE Diretrizes Curriculares Nacionais (DCN) PDF.
 * Returns a base64 Data URL suitable for embedded iframe / object viewing and downloading.
 */
export function generateOfficialDcnPdf(
  courseName: string,
  resolutionTitle: string,
  resolutionNumber: string,
  year: string | number,
  specificArticles?: string[]
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Header: República / MEC / CNE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 43, 73); // #002B49 UNISUAM navy
  doc.text('REPÚBLICA FEDERATIVA DO BRASIL', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.text('MINISTÉRIO DA EDUCAÇÃO • CONSELHO NACIONAL DE EDUCAÇÃO', pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('CÂMARA DE EDUCAÇÃO SUPERIOR (CES) / CONSELHO PLENO (CP)', pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Decorative Rule
  doc.setDrawColor(255, 107, 0); // #FF6B00
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Resolution Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 43, 73);
  doc.text(resolutionNumber.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  const subtitle = `Diretrizes Curriculares Nacionais do Curso de Graduação em ${courseName} (Ano ${year})`;
  doc.text(subtitle, pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Ementa Box (Right-aligned standard MEC format)
  const ementaText = `Institui as Diretrizes Curriculares Nacionais para o curso de graduação em ${courseName}, definindo os princípios, fundamentos, condições de ensino e aprendizagem, competências pedagógicas (CHA/Zabala) e procedimentos para o planejamento curricular das Instituições de Educação Superior.`;
  const ementaLines = doc.splitTextToSize(ementaText, contentWidth * 0.55);
  
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin + contentWidth * 0.42, y, contentWidth * 0.58, ementaLines.length * 4.5 + 6, 'FD');
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(ementaLines, margin + contentWidth * 0.45, y + 5);
  y += ementaLines.length * 4.5 + 14;

  // Body text - Articles
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 43, 73);
  doc.text('O Presidente da Câmara de Educação Superior do Conselho Nacional de Educação, no uso de suas atribuições:', margin, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('RESOLVE:', margin, y);
  y += 7;

  const defaultArticles = [
    `Art. 1º A presente Resolução institui as Diretrizes Curriculares Nacionais do Curso de Graduação em ${courseName}, a serem observadas na organização pedagógica, no Projeto Pedagógico do Curso (PPC) e na estrutura curricular de todas as Instituições de Ensino Superior brasileiras.`,
    `Art. 2º O curso de ${courseName} deve propiciar formação generalista, humanista, crítica e reflexiva, capacitando o profissional a atuar pautado em princípios éticos, responsabilidade social e compromisso com o desenvolvimento sustentável.`,
    `Art. 3º A estrutura curricular deve articular a indissociabilidade entre Ensino, Pesquisa e Extensão, assegurando no mínimo 10% (dez por cento) da carga horária total para atividades de Extensão Universitária, nos termos da Resolução CNE/CES nº 7/2018.`,
    `Art. 4º Os componentes curriculares devem ser estruturados preferencialmente por competências formativas, contemplando a tríade de Conhecimentos, Habilidades e Atitudes (CHA) e a matriz dimensional Conceitual, Procedimental e Atitudinal preconizada pelas diretrizes institucionais.`,
    `Art. 5º É admitida a oferta de componentes curriculares na modalidade a distância (EAD), observados os limites e tetos estabelecidos pelas portarias normativas do Ministério da Educação vigentes e o percentual mínimo presencial mandatório.`,
    `Art. 6º A avaliação do desempenho discente deve assumir caráter formativo, diagnóstico e cumulativo, contemplando diferentes instrumentos que aferem tanto o domínio teórico-conceitual quanto as habilidades procedimentais e atitudes profissionais.`,
  ];

  const articlesToPrint = specificArticles && specificArticles.length > 0 ? specificArticles : defaultArticles;

  articlesToPrint.forEach((art) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 43, 73);
    const artHeader = art.substring(0, 7);
    const artRest = art.substring(7);

    doc.text(artHeader, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);

    const artLines = doc.splitTextToSize(artRest, contentWidth - 16);
    doc.text(artLines, margin + 16, y);
    y += artLines.length * 4.2 + 5;
  });

  // Official Signature Footer
  if (y > 250) {
    doc.addPage();
    y = 25;
  } else {
    y += 10;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 43, 73);
  doc.text('CONSELHO NACIONAL DE EDUCAÇÃO', pageWidth / 2, y, { align: 'center' });
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Câmara de Educação Superior • Diário Oficial da União (DOU)', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`Documento de Referência Normativa Vinculado ao Sistema Curricular UNISUAM`, pageWidth / 2, y, { align: 'center' });

  return doc.output('datauristring');
}

/**
 * Default sample DCNs bundled for UNISUAM courses.
 */
export function getSampleDcnsForCourse(courseCode: string, courseName: string): DcnDocument[] {
  const normalized = (courseCode + ' ' + courseName).toLowerCase();

  if (normalized.includes('psi') || normalized.includes('psicologia')) {
    return [
      {
        id: 'dcn-psi-5-2011',
        title: 'Resolução CNE/CES nº 5/2011 - DCN Psicologia (Bacharelado e Formação de Psicólogo)',
        resolutionNumber: 'Resolução CNE/CES nº 5/2011',
        year: '2011',
        description: 'Institui as Diretrizes Curriculares Nacionais para os cursos de graduação em Psicologia, estabelecendo eixos estruturantes e práticas supervisionadas clínicas e sociais.',
        pdfUrl: generateOfficialDcnPdf(
          'Psicologia',
          'Diretrizes Curriculares Nacionais para o Curso de Graduação em Psicologia',
          'Resolução CNE/CES nº 5, de 15 de março de 2011',
          '2011'
        ),
        fileName: 'DCN_Psicologia_CNE_CES_5_2011.pdf',
        fileSize: '420 KB',
        isMain: true,
        uploadedAt: '2025-01-10',
      },
      {
        id: 'dcn-ext-7-2018',
        title: 'Resolução CNE/CES nº 7/2018 - Extensão Universitária Curricular (Mínimo 10%)',
        resolutionNumber: 'Resolução CNE/CES nº 7/2018',
        year: '2018',
        description: 'Estabelece as diretrizes para a Extensão na Educação Superior Brasileira e regulamenta a exigência mandatória de 10% da carga horária total.',
        pdfUrl: generateOfficialDcnPdf(
          'Educação Superior - Extensão Curricular',
          'Diretrizes para a Extensão na Educação Superior Brasileira',
          'Resolução CNE/CES nº 7, de 18 de dezembro de 2018',
          '2018',
          [
            'Art. 1º A presente Resolução estabelece as Diretrizes para a Extensão na Educação Superior Brasileira e regimenta o disposto na Meta 12.7 do Plano Nacional de Educação (PNE).',
            'Art. 2º As atividades de extensão devem compor, no mínimo, 10% (dez por cento) do total da carga horária curricular estudantil dos cursos de graduação, as quais devem constar da matriz curricular.',
            'Art. 3º A extensão na educação superior é a atividade que se integra à matriz curricular e à organização da pesquisa, constituindo-se em processo interdisciplinar, político educacional, cultural, científico e tecnológico.',
            'Art. 4º São consideradas modalidades de extensão: programas, projetos, cursos, oficinas, eventos e prestação de serviços tecnológicos e sociais com impacto comunitário relevante.',
          ]
        ),
        fileName: 'Resolucao_CNE_CES_7_2018_Extensao_MEC.pdf',
        fileSize: '360 KB',
        isMain: false,
        uploadedAt: '2025-01-10',
      },
    ];
  }

  if (normalized.includes('proc') || normalized.includes('gerenciais') || normalized.includes('tecnol')) {
    return [
      {
        id: 'dcn-cst-cncst',
        title: 'Catálogo Nacional de Cursos Superiores de Tecnologia (CNCST/MEC) - Gestão e Negócios',
        resolutionNumber: 'Portaria MEC nº 413/2016 e CNCST 4ª Edição',
        year: '2020',
        description: 'Parâmetros curriculares para Tecnologia em Processos Gerenciais, exigência mínima de 1.600 horas e perfil de egresso focado em gestão operacional e estratégica.',
        pdfUrl: generateOfficialDcnPdf(
          'Processos Gerenciais (Tecnológico)',
          'Catálogo Nacional de Cursos Superiores de Tecnologia - Eixo Gestão e Negócios',
          'Portaria Normativa MEC / CNCST 4ª Edição',
          '2020'
        ),
        fileName: 'CNCST_MEC_Processos_Gerenciais.pdf',
        fileSize: '390 KB',
        isMain: true,
        uploadedAt: '2025-01-10',
      },
      {
        id: 'dcn-cst-1-2021',
        title: 'Resolução CNE/CP nº 1/2021 - Diretrizes Curriculares da Educação Profissional e Tecnológica',
        resolutionNumber: 'Resolução CNE/CP nº 1/2021',
        year: '2021',
        description: 'Define as diretrizes gerais para cursos de graduação tecnológica, articulação com o setor produtivo e certificações intermediárias.',
        pdfUrl: generateOfficialDcnPdf(
          'Educação Profissional e Tecnológica',
          'Diretrizes Curriculares Gerais para a Educação Profissional e Tecnológica',
          'Resolução CNE/CP nº 1, de 5 de janeiro de 2021',
          '2021'
        ),
        fileName: 'Resolucao_CNE_CP_1_2021_Tecnologia.pdf',
        fileSize: '410 KB',
        isMain: false,
        uploadedAt: '2025-01-10',
      },
    ];
  }

  // Default: Administração / Gestão
  return [
    {
      id: 'dcn-adm-4-2005',
      title: 'Resolução CNE/CES nº 4/2005 - DCN Graduação em Administração (Bacharelado)',
      resolutionNumber: 'Resolução CNE/CES nº 4/2005',
      year: '2005',
      description: 'Institui as Diretrizes Curriculares Nacionais do Curso de Graduação em Administração, estabelecendo conteúdos de formação básica, profissional, quantitativos e estágio supervisionado.',
      pdfUrl: generateOfficialDcnPdf(
        'Administração',
        'Diretrizes Curriculares Nacionais do Curso de Graduação em Administração',
        'Resolução CNE/CES nº 4, de 13 de julho de 2005',
        '2005'
      ),
      fileName: 'DCN_Administracao_CNE_CES_4_2005.pdf',
      fileSize: '440 KB',
      isMain: true,
      uploadedAt: '2025-01-10',
    },
    {
      id: 'dcn-ext-7-2018-adm',
      title: 'Resolução CNE/CES nº 7/2018 - Diretrizes de Extensão Curricular (10% Obrigatório)',
      resolutionNumber: 'Resolução CNE/CES nº 7/2018',
      year: '2018',
      description: 'Regulamenta a creditação curricular da extensão universitária em no mínimo 10% da carga horária total do curso.',
      pdfUrl: generateOfficialDcnPdf(
        'Educação Superior - Extensão Universitária',
        'Diretrizes para a Extensão na Educação Superior Brasileira',
        'Resolução CNE/CES nº 7, de 18 de dezembro de 2018',
        '2018'
      ),
      fileName: 'Resolucao_CNE_CES_7_2018_Extensao.pdf',
      fileSize: '360 KB',
      isMain: false,
      uploadedAt: '2025-01-10',
    },
  ];
}
