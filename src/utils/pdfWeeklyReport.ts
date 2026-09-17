/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Gerador de Relatório Semanal em PDF para a Gestão
 * Inclui médias de produtividade por colaborador (VPH - Volumes por Hora / UPH - Unidades por Hora)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OperatorSummary, ActivitySummary } from '../services/followupService';

export interface WeeklyPdfReportParams {
  selectedWeek: number;
  weekPeriodStr: string;
  activeSectorId: string;
  kpis: {
    totalVolumes: number;
    totalHoras: number;
    horasDiretas: number;
    horasIndiretas: number;
    vphNet: string;
    vphBruto: string;
    logCount: number;
  };
  operatorsSummary: OperatorSummary[];
  activitiesSummary: ActivitySummary[];
  streetSummary?: Array<{
    rua: string;
    count: number;
    enderecos: number;
    volumes: number;
    horas: number;
    eph: string;
    vph: string;
  }>;
}

export function generateWeeklyReportPdf(params: WeeklyPdfReportParams): void {
  const {
    selectedWeek,
    weekPeriodStr,
    activeSectorId,
    kpis,
    operatorsSummary,
    activitiesSummary,
    streetSummary = []
  } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cores institucionais
  const primaryNavy = [15, 23, 42]; // slate-900
  const emeraldAccent = [16, 185, 129]; // emerald-500
  const textDark = [30, 41, 59]; // slate-800
  const textMuted = [100, 116, 139]; // slate-500

  // 1. CABEÇALHO DO DOCUMENTO
  doc.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Linha de acento verde esmeralda
  doc.setFillColor(emeraldAccent[0], emeraldAccent[1], emeraldAccent[2]);
  doc.rect(0, 27, pageWidth, 1.5, 'F');

  // Título e Subtítulo
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('REAPRO IA // TORRE DE CONTROLE LOGÍSTICO', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text('RELATÓRIO EXECUTIVO SEMANAL DE PRODUTIVIDADE OPERACIONAL', 14, 17);
  doc.text('Acompanhamento Individual de Colaboradores e Médias de Desempenho (VPH / UPH)', 14, 22);

  // Data de Emissão à Direita
  const emissaoStr = new Date().toLocaleString('pt-PT');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Emissão: ${emissaoStr}`, pageWidth - 14, 12, { align: 'right' });
  doc.text(`Semana Operacional: S${selectedWeek}`, pageWidth - 14, 17, { align: 'right' });
  doc.text(`Setor: ${activeSectorId.toUpperCase()}`, pageWidth - 14, 22, { align: 'right' });

  // 2. QUADRO DE METADADOS & CONTEXTO DA SEMANA
  let yPos = 34;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, yPos, pageWidth - 28, 14, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('PERÍODO ANALISADO:', 18, yPos + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(weekPeriodStr || 'Semana selecionada', 52, yPos + 6);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('COLABORADORES ATIVOS:', 110, yPos + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`${operatorsSummary.length} operadores`, 152, yPos + 6);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('REGISTOS ANALISADOS:', 18, yPos + 11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`${kpis.logCount} apontamentos`, 55, yPos + 11);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('LEGENDA DE MÉTRICAS:', 110, yPos + 11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(emeraldAccent[0], emeraldAccent[1], emeraldAccent[2]);
  doc.text('VPH = Volumes por Hora  |  UPH = Unidades por Hora', 148, yPos + 11);

  // 3. CARDS DE KPIS CONSOLIDADOS
  yPos = 52;
  const cardWidth = (pageWidth - 28 - 9) / 4;
  const cardHeight = 18;

  const kpiCards = [
    {
      title: 'TOTAL ENDEREÇOS / VOLUMES',
      value: kpis.totalVolumes.toLocaleString('pt-PT'),
      sub: 'Volumes Registados',
      color: [2, 132, 199] // sky-600
    },
    {
      title: 'HORAS TOTAIS UTILIZADAS',
      value: `${kpis.totalHoras.toFixed(1)}h`,
      sub: `Dir: ${kpis.horasDiretas.toFixed(1)}h | Ind: ${kpis.horasIndiretas.toFixed(1)}h`,
      color: [217, 119, 6] // amber-600
    },
    {
      title: 'PRODUTIVIDADE MÉDIA (VPH)',
      value: `${kpis.vphNet} VPH`,
      sub: 'Volumes / Hora Líquida',
      color: [16, 185, 129] // emerald-600
    },
    {
      title: 'ESTIMATIVA MÉDIA (UPH)',
      value: `${(parseFloat(kpis.vphNet || '0') * 1.0).toFixed(2)} UPH`,
      sub: 'Unidades / Hora Operacional',
      color: [147, 51, 234] // purple-600
    }
  ];

  kpiCards.forEach((card, idx) => {
    const cardX = 14 + idx * (cardWidth + 3);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cardX, yPos, cardWidth, cardHeight, 1, 1, 'FD');

    // Barra superior colorida do card
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.rect(cardX, yPos, cardWidth, 1.2, 'F');

    doc.setFontSize(5.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(card.title, cardX + 3, yPos + 5);

    doc.setFontSize(10.5);
    doc.setTextColor(card.color[0], card.color[1], card.color[2]);
    doc.text(card.value, cardX + 3, yPos + 11.5);

    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(card.sub, cardX + 3, yPos + 15.5);
  });

  // 4. TABELA PRINCIPAL: DESEMPENHO E MÉDIAS POR COLABORADOR
  yPos = 74;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text('1. MÉDIAS DE PRODUTIVIDADE POR COLABORADOR (SEMANA ' + selectedWeek + ')', 14, yPos);

  const avgVph = parseFloat(kpis.vphNet) || 0;

  const operatorsTableBody = operatorsSummary.map((op, idx) => {
    const opVph = parseFloat(op.vphNet) || 0;
    let classification = 'Na Média';
    if (avgVph > 0) {
      if (opVph >= avgVph * 1.15) {
        classification = 'Alta Performance (+15%)';
      } else if (opVph < avgVph * 0.85) {
        classification = 'Abaixo da Média (-15%)';
      }
    }
    // UPH estimada (Unidades por Hora)
    const opUph = (opVph * 1.0).toFixed(2);

    return [
      `#${(idx + 1).toString().padStart(2, '0')}`,
      op.name.toUpperCase(),
      op.volumes.toLocaleString('pt-PT'),
      `${op.hDir.toFixed(2)}h`,
      `${op.hInd.toFixed(2)}h`,
      `${op.hTot.toFixed(2)}h`,
      `${op.vphNet} Vol/h`,
      `${opUph} Unid/h`,
      classification
    ];
  });

  autoTable(doc, {
    startY: yPos + 3,
    head: [[
      '#',
      'Colaborador',
      'Volumes (Endereços)',
      'Horas Diretas',
      'Horas Indiretas',
      'Horas Totais',
      'VPH (Vol/Hora)',
      'UPH (Unid/Hora)',
      'Classificação Operacional'
    ]],
    body: operatorsTableBody.length > 0 ? operatorsTableBody : [['-', 'Nenhum registo nesta semana', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 2
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 42, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 23 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
      6: { halign: 'right', cellWidth: 22, textColor: [5, 150, 105], fontStyle: 'bold' },
      7: { halign: 'right', cellWidth: 22, textColor: [124, 58, 237] },
      8: { halign: 'center', cellWidth: 29 }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: { left: 14, right: 14 }
  });

  // 5. SEGUNDA TABELA: RESUMO POR ATIVIDADE
  let finalY = (doc as any).lastAutoTable?.finalY || 140;

  if (finalY > pageHeight - 65) {
    doc.addPage();
    finalY = 20;
  } else {
    finalY += 8;
  }

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  doc.text('2. RESUMO OPERACIONAL POR ATIVIDADE EXECUTADA', 14, finalY);

  const activitiesTableBody = activitiesSummary.map(act => [
    act.activity.toUpperCase(),
    act.isInd ? 'INDIRETA' : 'DIRETA',
    act.isInd ? '-' : act.volumes.toLocaleString('pt-PT'),
    `${act.horas.toFixed(2)}h`,
    act.isInd ? 'INDIRETA' : `${act.vph} Vol/h`,
    act.isInd ? 'INDIRETA' : `${(parseFloat(act.vph) || 0).toFixed(2)} Unid/h`
  ]);

  autoTable(doc, {
    startY: finalY + 3,
    head: [[
      'Atividade',
      'Classificação',
      'Volumes Realizados',
      'Horas Gastas',
      'VPH (Volumes por Hora)',
      'UPH (Unidades por Hora)'
    ]],
    body: activitiesTableBody.length > 0 ? activitiesTableBody : [['Sem atividades registadas', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.2,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 1.8
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 65, fontStyle: 'bold' },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 30, textColor: [5, 150, 105], fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 30, textColor: [124, 58, 237] }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: { left: 14, right: 14 }
  });

  // 6. BLOCO DE APROVAÇÃO E ASSINATURA DOS GESTORES
  let signY = (doc as any).lastAutoTable?.finalY || 200;

  if (signY > pageHeight - 45) {
    doc.addPage();
    signY = 25;
  } else {
    signY += 12;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, signY, pageWidth - 28, 28, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('VALIDAÇÃO E ENCAMINHAMENTO DA GESTÃO DE OPERAÇÕES', 18, signY + 6);

  // Linhas para assinatura
  const line1X = 20;
  const line2X = 110;
  const lineY = signY + 19;

  doc.setDrawColor(148, 163, 184);
  doc.line(line1X, lineY, line1X + 70, lineY);
  doc.line(line2X, lineY, line2X + 70, lineY);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('Visto do Gestor / Coordenador de Logística', line1X, lineY + 4);
  doc.text('Data: _____ / _____ / _________', line1X, lineY + 7);

  doc.text('Visto da Supervisão de Turno / Armazém', line2X, lineY + 4);
  doc.text('Data: _____ / _____ / _________', line2X, lineY + 7);

  // 7. RODAPÉ EM TODAS AS PÁGINAS COM NUMERAÇÃO
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(6.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(
      `REAPRO IA // Relatório Semanal de Produtividade (S${selectedWeek}) - Emitido em ${emissaoStr}`,
      14,
      pageHeight - 8
    );
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - 14,
      pageHeight - 8,
      { align: 'right' }
    );
  }

  // Nome do arquivo gerado
  const safeDate = new Date().toISOString().slice(0, 10);
  const fileName = `Relatorio_Semanal_Produtividade_S${selectedWeek}_${activeSectorId}_${safeDate}.pdf`;

  // Download automático
  doc.save(fileName);
}
