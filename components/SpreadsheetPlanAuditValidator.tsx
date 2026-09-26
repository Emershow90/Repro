/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * VALIDADOR & AUDITOR OPERACIONAL: PLANILHA vs. SISTEMA REAL
 * Conciliação 100% Segura e Local (IndexedDB)
 * - Cobertura de Caixas Feita e Status de Finalização
 * - Quantas Horas Feitas no Reapro (Tempo Total Líquido)
 * - Produtividade Geral e Real (VPH & Minutos por Caixa)
 * - Quantas Horas por Rua & Ritmo Operacional Individual
 * - Inteligência Pré-Atividade: Quais artigos saíram antes de começar e como usar a nosso favor
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Zap,
  Target,
  ArrowUpDown,
  Filter,
  Layers,
  Sparkles,
  Download,
  Upload,
  Plus,
  Trash2,
  Building2,
  Boxes,
  HelpCircle,
  Eye,
  Info,
  Calendar,
  Users,
  Compass,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Search,
  ExternalLink
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Log } from '../types';
import { ArticleAddressRecord, auditArticleAddressRecord, parseStreetAndSectorFromAddress } from '../services/articleAddressService';
import { formatDateToBR, parseDateString } from '../utils/dateUtils';
import { SECTOR_87_STREETS, SECTOR_88_STREETS, SECTOR_89_STREETS, SECTOR_90_STREETS, ALL_CONFIGURED_STREETS } from '../data/streetData';
import { getState, saveState } from '../services/dbLocal';

const STORAGE_DEMANDS_KEY = 'repro_demands_v5';

interface SpreadsheetPlanAuditValidatorProps {
  logs: Log[];
  articleRecords: ArticleAddressRecord[];
  onRefreshRecords?: () => Promise<void>;
  onAddRecords?: (newRecords: ArticleAddressRecord[]) => Promise<void>;
  onNotify?: (message: string, color?: string) => void;
  onNavigateToStreet?: (street: string) => void;
}

interface StreetAuditRow {
  rua: string;
  setor: string;
  caixasPlanilha: number;
  caixasRealizadas: number;
  diferenca: number; // Realizado - Planilha
  coberturaPercent: number;
  status: 'FINALIZADO' | 'EM_ANDAMENTO' | 'PENDENTE' | 'EXCEDENTE' | 'NAO_PREVISTO';
  horasGastas: number; // em horas decimais
  horasFormatadas: string; // Ex: "01h 24m"
  vphReal: number; // cx/h
  minutosPorCaixa: number; // min/cx
  artigosDemandados: { artigo: string; caixas: number; enderecos: string[] }[];
  apontamentosRealizados: number;
}

export const SpreadsheetPlanAuditValidator: React.FC<SpreadsheetPlanAuditValidatorProps> = ({
  logs,
  articleRecords,
  onRefreshRecords,
  onAddRecords,
  onNotify,
  onNavigateToStreet
}) => {
  // 1. Filtros de Data e Setor
  const hojeIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(hojeIso);
  const [selectedSector, setSelectedSector] = useState<string>('TODOS');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Meta de produtividade esperada (cx/h)
  const [targetVph, setTargetVph] = useState<number>(56);
  // Simulação de operadores no dimensionamento
  const [simulatedOperators, setSimulatedOperators] = useState<number>(2);

  // Modais de Entrada Rápida de Planilha
  const [showPasteModal, setShowPasteModal] = useState<boolean>(false);
  const [showModelSpecsModal, setShowModelSpecsModal] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');
  const [isProcessingPaste, setIsProcessingPaste] = useState<boolean>(false);

  const [showQuickAddModal, setShowQuickAddModal] = useState<boolean>(false);
  const [quickRua, setQuickRua] = useState<string>('B4VD');
  const [quickCaixas, setQuickCaixas] = useState<string>('');
  const [quickArtigo, setQuickArtigo] = useState<string>('');
  const [quickEndereco, setQuickEndereco] = useState<string>('');

  // Demandas do REPRO do Google Sheets
  const [reproDemands, setReproDemands] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(process.env.GOOGLE_SHEETS_API_URL!);
        const data = await response.json();
        // Google Sheets API returns array of arrays, skip header, parse JSON string at col 2
        const demands: Record<string, any> = {};
        for (let i = 1; i < data.length; i++) {
          if (data[i][1]) {
            const rowData = JSON.parse(data[i][1]);
            Object.assign(demands, rowData);
          }
        }
        setReproDemands(demands);
      } catch (err) {
        console.warn('Erro ao carregar demandas do Google Sheets:', err);
      }
    })();
  }, []);

  // Normalização de Data em formato ISO (YYYY-MM-DD)
  const normalizeToIso = (dStr: string): string => {
    if (!dStr) return '';
    const clean = dStr.trim();
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        const year = parts[2].length === 4 ? parts[2] : `20${parts[2]}`;
        return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    return clean.split('T')[0];
  };

  // Extração de Rua a partir do Log
  const extractStreetFromLog = (l: Log): string => {
    if (l.rua && l.rua.trim()) return l.rua.trim().toUpperCase();
    const act = (l.atividade || '').toUpperCase();
    if (act.includes('REABASTECIMENTO')) {
      const cleaned = act.replace(/REABASTECIMENTO\s*[-–:]*\s*/i, '').trim();
      if (cleaned) {
        return cleaned.split(/[\s-]+/)[0].trim().toUpperCase();
      }
    }
    return 'OUTROS';
  };

  // Formatar Horas Decimais para HHh MMm
  const formatDecimalHours = (decimalHours: number): string => {
    if (!decimalHours || decimalHours <= 0) return '00h 00m';
    const totalMinutes = Math.round(decimalHours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  };

  // -------------------------------------------------------------
  // 2. CONCILIAÇÃO: PLANILHA vs. SISTEMA REAL PARA O DIA SELECIONADO
  // -------------------------------------------------------------
  const {
    rows,
    totalCaixasPlanilha,
    totalCaixasRealizadas,
    totalHorasReapro,
    vphGeralReal,
    minutosPorCaixaGeral,
    coberturaGeralPercent,
    statusGeral,
    horasNecessariasEstimadas,
    previsaoTerminoMinutos,
    topArtigosQueSairam,
    ruasCriticasGargalo,
    totalApontamentosDia,
    primeiroApontamento,
    ultimoApontamento
  } = useMemo(() => {
    const targetIso = selectedDate;
    const targetBr = formatDateToBR(parseDateString(targetIso) || new Date());

    // 1. Filtrar registros da Planilha (Artigos / Demandas prévias)
    const plannedRecordsToday = articleRecords.filter(r => {
      const rIso = normalizeToIso(r.data);
      return rIso === targetIso;
    });

    // 2. Filtrar logs reais do sistema para a data selecionada
    const realLogsToday = logs.filter(l => {
      const lIso = normalizeToIso(l.data);
      return (lIso === targetIso || l.data === targetBr) && 
             (l.atividade || '').toUpperCase().includes('REABASTECIMENTO');
    });

    // Mapeamento por Rua da Planilha (Caixas e Artigos que saíram)
    const planByStreet = new Map<string, {
      rua: string;
      setor: string;
      caixas: number;
      artigosMap: Map<string, { caixas: number; enderecos: Set<string> }>;
    }>();

    // Inserir registros de articleRecords da planilha
    plannedRecordsToday.forEach(r => {
      const streetKey = (r.rua || 'OUTROS').trim().toUpperCase();
      if (!planByStreet.has(streetKey)) {
        planByStreet.set(streetKey, {
          rua: streetKey,
          setor: r.setor || '87',
          caixas: 0,
          artigosMap: new Map()
        });
      }
      const item = planByStreet.get(streetKey)!;
      const ctnVal = Number(r.ctn) || 0;
      item.caixas += ctnVal;

      const artKey = (r.artigo || 'SEM_CODIGO').trim().toUpperCase();
      if (!item.artigosMap.has(artKey)) {
        item.artigosMap.set(artKey, { caixas: 0, enderecos: new Set() });
      }
      const artObj = item.artigosMap.get(artKey)!;
      artObj.caixas += ctnVal;
      if (r.endereco) artObj.enderecos.add(r.endereco.toUpperCase());
    });

    // Inserir também se houver demandas cadastradas em reproDemands para a mesma data
    Object.keys(reproDemands).forEach(demKey => {
      // Ex: "2026-09-16_87_B4VD"
      const parts = demKey.split('_');
      if (parts.length >= 3 && parts[0] === targetIso) {
        const sector = parts[1];
        const street = parts.slice(2).join('_').toUpperCase();
        const demandObj = reproDemands[demKey];
        const demVal = Number(demandObj?.demandaCalculada) || 0;

        if (!planByStreet.has(street)) {
          planByStreet.set(street, {
            rua: street,
            setor: sector,
            caixas: demVal,
            artigosMap: new Map()
          });
        } else {
          // Se na planilha de artigos tinha menos caixas que a demanda geral de rua do REPRO, ajustar
          const curr = planByStreet.get(street)!;
          if (curr.caixas === 0 && demVal > 0) {
            curr.caixas = demVal;
          }
        }
      }
    });

    // Mapeamento dos Logs Reais por Rua
    const realByStreet = new Map<string, {
      rua: string;
      setor: string;
      volumes: number;
      horas: number;
      apontamentos: number;
      artigosFeitos: Set<string>;
    }>();

    let earliestTime = '';
    let latestTime = '';

    realLogsToday.forEach(l => {
      const rua = extractStreetFromLog(l);
      if (!realByStreet.has(rua)) {
        realByStreet.set(rua, {
          rua,
          setor: l.setor || '87',
          volumes: 0,
          horas: 0,
          apontamentos: 0,
          artigosFeitos: new Set()
        });
      }
      const st = realByStreet.get(rua)!;
      st.volumes += Number(l.volumes) || 0;
      st.horas += Number(l.horas) || 0;
      st.apontamentos += 1;
      if (l.artigo) st.artigosFeitos.add(l.artigo.toUpperCase());

      // Identificar janela de horário
      const startTime = l.horaInicio || '';
      const endTime = l.horaFim || '';
      if (startTime && (!earliestTime || startTime < earliestTime)) earliestTime = startTime;
      if (endTime && (!latestTime || endTime > latestTime)) latestTime = endTime;
    });

    // Unir todas as ruas presentes (seja na Planilha ou no Real)
    const allStreetsSet = new Set<string>();
    planByStreet.forEach((_, k) => allStreetsSet.add(k));
    realByStreet.forEach((_, k) => allStreetsSet.add(k));

    // Se a base estiver sem ruas para a data, trazer ruas padrões do setor para facilitar planejamento
    if (allStreetsSet.size === 0) {
      if (selectedSector === '87') SECTOR_87_STREETS.forEach(s => allStreetsSet.add(s));
      else if (selectedSector === '88') SECTOR_88_STREETS.forEach(s => allStreetsSet.add(s));
      else if (selectedSector === '89') SECTOR_89_STREETS.forEach(s => allStreetsSet.add(s));
      else if (selectedSector === '90') SECTOR_90_STREETS.forEach(s => allStreetsSet.add(s));
      else SECTOR_87_STREETS.slice(0, 10).forEach(s => allStreetsSet.add(s));
    }

    const calculatedRows: StreetAuditRow[] = [];

    allStreetsSet.forEach(rua => {
      const plan = planByStreet.get(rua);
      const real = realByStreet.get(rua);

      const caixasPlanilha = plan ? plan.caixas : 0;
      const caixasRealizadas = real ? real.volumes : 0;
      const diferenca = caixasRealizadas - caixasPlanilha;
      const horasGastas = real ? Number(real.horas.toFixed(2)) : 0;
      const apontamentosRealizados = real ? real.apontamentos : 0;

      // Cálculo de Cobertura
      let coberturaPercent = 0;
      if (caixasPlanilha > 0) {
        coberturaPercent = Number(((caixasRealizadas / caixasPlanilha) * 100).toFixed(1));
      } else if (caixasRealizadas > 0) {
        coberturaPercent = 100;
      }

      // Status da Rua
      let status: 'FINALIZADO' | 'EM_ANDAMENTO' | 'PENDENTE' | 'EXCEDENTE' | 'NAO_PREVISTO' = 'PENDENTE';
      if (caixasPlanilha > 0) {
        if (caixasRealizadas > caixasPlanilha) status = 'EXCEDENTE';
        else if (caixasRealizadas === caixasPlanilha || coberturaPercent >= 100) status = 'FINALIZADO';
        else if (caixasRealizadas > 0) status = 'EM_ANDAMENTO';
        else status = 'PENDENTE';
      } else {
        if (caixasRealizadas > 0) status = 'NAO_PREVISTO';
        else status = 'PENDENTE';
      }

      // Produtividade (VPH) e Ritmo (minutos por caixa)
      const vphReal = horasGastas > 0 ? Number((caixasRealizadas / horasGastas).toFixed(1)) : 0;
      const minutosPorCaixa = caixasRealizadas > 0 && horasGastas > 0 
        ? Number(((horasGastas * 60) / caixasRealizadas).toFixed(1)) 
        : 0;

      // Setor inferido
      let setor = plan?.setor || real?.setor || '87';
      if (rua.startsWith('B4') || SECTOR_87_STREETS.includes(rua)) setor = '87';
      else if (rua.startsWith('B5') || SECTOR_88_STREETS.includes(rua)) setor = '88';
      else if (rua.startsWith('B6') || SECTOR_89_STREETS.includes(rua)) setor = '89';
      else if (rua.startsWith('B7') || SECTOR_90_STREETS.includes(rua)) setor = '90';

      // Artigos demandados da planilha
      const artigosDemandados: { artigo: string; caixas: number; enderecos: string[] }[] = [];
      if (plan && plan.artigosMap) {
        plan.artigosMap.forEach((artVal, artCode) => {
          artigosDemandados.push({
            artigo: artCode,
            caixas: artVal.caixas,
            enderecos: Array.from(artVal.enderecos)
          });
        });
        artigosDemandados.sort((a, b) => b.caixas - a.caixas);
      }

      calculatedRows.push({
        rua,
        setor,
        caixasPlanilha,
        caixasRealizadas,
        diferenca,
        coberturaPercent,
        status,
        horasGastas,
        horasFormatadas: formatDecimalHours(horasGastas),
        vphReal,
        minutosPorCaixa,
        artigosDemandados,
        apontamentosRealizados
      });
    });

    // Ordenar: primeiro ruas com pendências e maior volume de saída
    calculatedRows.sort((a, b) => {
      if (a.caixasPlanilha !== b.caixasPlanilha) return b.caixasPlanilha - a.caixasPlanilha;
      return a.rua.localeCompare(b.rua);
    });

    // Totais Consolidados do Dia
    let sumPlanilha = 0;
    let sumRealizadas = 0;
    let sumHoras = 0;
    let sumApontamentos = 0;

    calculatedRows.forEach(r => {
      sumPlanilha += r.caixasPlanilha;
      sumRealizadas += r.caixasRealizadas;
      sumHoras += r.horasGastas;
      sumApontamentos += r.apontamentosRealizados;
    });

    const vphTotal = sumHoras > 0 ? Number((sumRealizadas / sumHoras).toFixed(1)) : 0;
    const minPorCaixaTotal = sumRealizadas > 0 && sumHoras > 0
      ? Number(((sumHoras * 60) / sumRealizadas).toFixed(1))
      : 0;

    const cobGeral = sumPlanilha > 0
      ? Number(((sumRealizadas / sumPlanilha) * 100).toFixed(1))
      : (sumRealizadas > 0 ? 100 : 0);

    let stGeral: 'FINALIZADO' | 'EM_ANDAMENTO' | 'PENDENTE' = 'PENDENTE';
    if (sumPlanilha > 0 && sumRealizadas >= sumPlanilha) stGeral = 'FINALIZADO';
    else if (sumRealizadas > 0) stGeral = 'EM_ANDAMENTO';

    // ---------------------------------------------------------
    // INTELIGÊNCIA PRÉ-ATIVIDADE: DIMENSIONAMENTO & PRIORIZAÇÃO
    // ---------------------------------------------------------
    // Quantas horas estimadas o reabastecimento necessita antes de começar?
    const targetVphRef = targetVph > 0 ? targetVph : 56;
    const horasNecessarias = sumPlanilha > 0 ? Number((sumPlanilha / targetVphRef).toFixed(2)) : 0;

    // Previsão de tempo restante com base no saldo pendente
    const saldoPendenteTotal = Math.max(0, sumPlanilha - sumRealizadas);
    const velocidadeAtual = vphTotal > 0 ? vphTotal : targetVphRef;
    const minutosRestantes = saldoPendenteTotal > 0 ? Math.round((saldoPendenteTotal / velocidadeAtual) * 60) : 0;

    // Top Artigos que saíram na planilha antes da atividade (Curva ABC de Saída)
    const articleTotalsMap = new Map<string, { artigo: string; caixas: number; ruas: Set<string>; enderecos: Set<string> }>();
    plannedRecordsToday.forEach(r => {
      const art = (r.artigo || 'SEM_CODIGO').toUpperCase();
      if (!articleTotalsMap.has(art)) {
        articleTotalsMap.set(art, { artigo: art, caixas: 0, ruas: new Set(), enderecos: new Set() });
      }
      const item = articleTotalsMap.get(art)!;
      item.caixas += Number(r.ctn) || 0;
      if (r.rua) item.ruas.add(r.rua.toUpperCase());
      if (r.endereco) item.enderecos.add(r.endereco.toUpperCase());
    });

    const topArtigos = Array.from(articleTotalsMap.values())
      .map(i => ({
        artigo: i.artigo,
        caixas: i.caixas,
        ruas: Array.from(i.ruas),
        totalRuas: i.ruas.size,
        enderecos: Array.from(i.enderecos)
      }))
      .sort((a, b) => b.caixas - a.caixas)
      .slice(0, 8);

    // Ruas Críticas / Gargalos (maior volume pendente antes de começar)
    const ruasCriticas = calculatedRows
      .filter(r => r.caixasPlanilha > 0 && r.coberturaPercent < 100)
      .sort((a, b) => (b.caixasPlanilha - b.caixasRealizadas) - (a.caixasPlanilha - a.caixasRealizadas))
      .slice(0, 5);

    return {
      rows: calculatedRows,
      totalCaixasPlanilha: sumPlanilha,
      totalCaixasRealizadas: sumRealizadas,
      totalHorasReapro: sumHoras,
      vphGeralReal: vphTotal,
      minutosPorCaixaGeral: minPorCaixaTotal,
      coberturaGeralPercent: cobGeral,
      statusGeral: stGeral,
      horasNecessariasEstimadas: horasNecessarias,
      previsaoTerminoMinutos: minutosRestantes,
      topArtigosQueSairam: topArtigos,
      ruasCriticasGargalo: ruasCriticas,
      totalApontamentosDia: sumApontamentos,
      primeiroApontamento: earliestTime,
      ultimoApontamento: latestTime
    };
  }, [articleRecords, logs, selectedDate, selectedSector, reproDemands, targetVph]);

  // Filtro de linhas para a tabela
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // Filtro Setor
      if (selectedSector !== 'TODOS' && r.setor !== selectedSector) return false;
      // Filtro Status
      if (filterStatus === 'FINALIZADO' && r.status !== 'FINALIZADO') return false;
      if (filterStatus === 'EM_ANDAMENTO' && r.status !== 'EM_ANDAMENTO') return false;
      if (filterStatus === 'PENDENTE' && r.status !== 'PENDENTE') return false;
      if (filterStatus === 'EXCEDENTE' && r.status !== 'EXCEDENTE') return false;
      // Busca
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesRua = r.rua.toLowerCase().includes(term);
        const matchesArt = r.artigosDemandados.some(a => a.artigo.toLowerCase().includes(term));
        if (!matchesRua && !matchesArt) return false;
      }
      return true;
    });
  }, [rows, selectedSector, filterStatus, searchTerm]);

  // -------------------------------------------------------------
  // 3. PROCESSADOR DE COLAR DA PLANILHA (CTRL+V FLEXÍVEL)
  // -------------------------------------------------------------
  const handleProcessPastedData = async () => {
    if (!pastedText.trim()) {
      if (onNotify) onNotify('Cole os dados da planilha antes de continuar.', 'var(--color-warning)');
      return;
    }

    setIsProcessingPaste(true);
    try {
      const lines = pastedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const newRecords: ArticleAddressRecord[] = [];
      let parsedCount = 0;

      // Pular cabeçalho se houver
      let startIndex = 0;
      const firstLineLower = lines[0].toLowerCase();
      if (
        firstLineLower.includes('rua') ||
        firstLineLower.includes('caixa') ||
        firstLineLower.includes('artigo') ||
        firstLineLower.includes('data') ||
        firstLineLower.includes('ctn') ||
        firstLineLower.includes('qtd')
      ) {
        startIndex = 1;
      }

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        let cols = line.split('\t');
        if (cols.length < 2) cols = line.split(';');
        if (cols.length < 2) cols = line.split(',');
        if (cols.length < 2) cols = line.split(/\s+/); // Fallback espaço simples

        if (cols.length >= 2) {
          const col0 = cols[0]?.trim().toUpperCase() || '';
          const col1 = cols[1]?.trim().toUpperCase() || '';
          const col2 = cols[2]?.trim().toUpperCase() || '';
          const col3 = cols[3]?.trim().toUpperCase() || '';

          let rua = 'OUTROS';
          let artigo = 'ART-GERAL';
          let caixas = 1;
          let endereco = '';

          // Heurística 1: Coluna 0 é RUA (ex: B4VD) e Coluna 1 é Quantidade de Caixas (ex: 45)
          const isCol1Numeric = /^\d+$/.test(col1.replace(/[^0-9]/g, ''));
          const isCol0Numeric = /^\d+$/.test(col0.replace(/[^0-9]/g, ''));

          if (!isCol0Numeric && isCol1Numeric) {
            rua = col0.split('-')[0].trim();
            endereco = col0;
            caixas = parseInt(col1.replace(/[^0-9]/g, ''), 10) || 1;
            if (col2 && !/^\d+$/.test(col2)) artigo = col2;
          } else if (isCol0Numeric && !isCol1Numeric) {
            // Coluna 0 é Caixas, Coluna 1 é Rua/Artigo
            caixas = parseInt(col0.replace(/[^0-9]/g, ''), 10) || 1;
            rua = col1.split('-')[0].trim();
            endereco = col1;
          } else if (cols.length >= 3) {
            // Exemplo: Artigo | Endereço (Rua) | Caixas
            artigo = col0;
            endereco = col1;
            rua = col1.split('-')[0].trim();
            caixas = parseInt(col2.replace(/[^0-9]/g, ''), 10) || 1;
          }

          const { setor } = parseStreetAndSectorFromAddress(rua);

          const rec: ArticleAddressRecord = {
            id: `plan-imp-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
            data: selectedDate,
            artigo: artigo || 'ART-GERAL',
            endereco: endereco || `${rua}-01`,
            ctn: String(caixas),
            rua: rua || 'B4VD',
            setor,
            hora: '08:00',
            colaborador: 'PLANILHA PRÉVIA',
            origem: 'PLANILHA',
            statusAuditoria: 'VALIDADO',
            mensagensAuditoria: ['Registrado da planilha antes da atividade'],
            criadoEm: Date.now() + i
          };

          const audit = auditArticleAddressRecord(rec);
          rec.statusAuditoria = audit.status;
          rec.mensagensAuditoria = audit.mensagens;

          newRecords.push(rec);
          parsedCount++;
        }
      }

      if (newRecords.length > 0) {
        if (onAddRecords) {
          await onAddRecords(newRecords);
        }
        setPastedText('');
        setShowPasteModal(false);
        if (onNotify) {
          onNotify(`✓ Sucesso: ${parsedCount} registros da planilha importados para o validador.`, 'var(--color-success)');
        }
      } else {
        if (onNotify) onNotify('Não foi possível identificar colunas válidas. Verifique o formato.', 'var(--color-danger)');
      }
    } catch (err) {
      console.error('Erro ao processar dados colados:', err);
      if (onNotify) onNotify('Erro ao ler texto colado da planilha.', 'var(--color-danger)');
    } finally {
      setIsProcessingPaste(false);
    }
  };

  // -------------------------------------------------------------
  // 4. ADIÇÃO RÁPIDA MANUAL DE UMA LINHA DE PRÉ-DEMANDA
  // -------------------------------------------------------------
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cx = parseInt(quickCaixas.replace(/[^0-9]/g, ''), 10);
    if (!cx || cx <= 0) {
      if (onNotify) onNotify('Informe uma quantidade válida de caixas.', 'var(--color-warning)');
      return;
    }

    const { setor } = parseStreetAndSectorFromAddress(quickRua);
    const end = quickEndereco.trim().toUpperCase() || `${quickRua.toUpperCase()}-01`;
    const art = quickArtigo.trim().toUpperCase() || 'ART-GERAL';

    const newRec: ArticleAddressRecord = {
      id: `plan-manual-${Date.now()}`,
      data: selectedDate,
      artigo: art,
      endereco: end,
      ctn: String(cx),
      rua: quickRua.toUpperCase(),
      setor,
      hora: '08:00',
      colaborador: 'REGISTRO RÁPIDO',
      origem: 'PLANILHA',
      statusAuditoria: 'VALIDADO',
      mensagensAuditoria: ['Demanda prévia registrada manualmente'],
      criadoEm: Date.now()
    };

    if (onAddRecords) {
      await onAddRecords([newRec]);
    }

    setQuickCaixas('');
    setQuickArtigo('');
    setQuickEndereco('');
    setShowQuickAddModal(false);
    if (onNotify) {
      onNotify(`✓ Demanda de ${cx} caixas cadastrada na rua ${quickRua.toUpperCase()}.`, 'var(--color-success)');
    }
  };

  // -------------------------------------------------------------
  // 5. EXPORTAÇÃO DO RELATÓRIO DE AUDITORIA PLANILHA vs. SISTEMA
  // -------------------------------------------------------------
  const handleExportAuditExcel = () => {
    if (rows.length === 0) {
      if (onNotify) onNotify('Nenhum registro para exportar.', 'var(--color-warning)');
      return;
    }

    const dataRows = rows.map(r => ({
      'Data': selectedDate,
      'Setor': r.setor,
      'Rua': r.rua,
      'Caixas na Planilha (Prévia)': r.caixasPlanilha,
      'Caixas Feitas (Sistema Real)': r.caixasRealizadas,
      'Diferença (Saldo)': r.diferenca,
      '% Cobertura': `${r.coberturaPercent}%`,
      'Status': r.status,
      'Horas Gastas no Reapro': r.horasGastas,
      'Horas (Formatado)': r.horasFormatadas,
      'Produtividade Real (cx/h)': r.vphReal,
      'Ritmo Médio (min/cx)': r.minutosPorCaixa,
      'Artigos da Demanda': r.artigosDemandados.map(a => `${a.artigo} (${a.caixas} cx)`).join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria_Planilha_vs_Real');
    XLSX.writeFile(wb, `Auditoria_REAPRO_${selectedDate}_Planilha_vs_Real.xlsx`);

    if (onNotify) onNotify('✓ Relatório de auditoria exportado com sucesso em Excel.', 'var(--color-success)');
  };

  // -------------------------------------------------------------
  // 6. DOWNLOAD DO MODELO OFICIAL DE PLANILHA COM FÓRMULAS & NOMES
  // -------------------------------------------------------------
  const handleDownloadTemplateExcel = () => {
    const wb = XLSX.utils.book_new();

    // ABA 1: PLANILHA OPERACIONAL DIÁRIA (Entrada + Fórmulas)
    const templateData = [
      {
        'DATA': selectedDate,
        'SETOR': '87',
        'RUA': 'B4VD',
        'COD_ARTIGO': 'ART-1044',
        'ENDERECO_VAO': 'B4VD-01',
        'CAIXAS_PLANILHA': 50,
        'CAIXAS_REALIZADAS': 50,
        'DIFERENCA_SALDO': 0,
        'PERC_COBERTURA': 1,
        'STATUS': 'FINALIZADO',
        'HORAS_LIVRES': 0.85,
        'VPH_PRODUTIVIDADE': 58.8,
        'MIN_POR_CAIXA': 1.02
      },
      {
        'DATA': selectedDate,
        'SETOR': '87',
        'RUA': 'B4VA',
        'COD_ARTIGO': 'ART-2099',
        'ENDERECO_VAO': 'B4VA-04',
        'CAIXAS_PLANILHA': 40,
        'CAIXAS_REALIZADAS': 25,
        'DIFERENCA_SALDO': -15,
        'PERC_COBERTURA': 0.625,
        'STATUS': 'EM_ANDAMENTO',
        'HORAS_LIVRES': 0.50,
        'VPH_PRODUTIVIDADE': 50.0,
        'MIN_POR_CAIXA': 1.20
      },
      {
        'DATA': selectedDate,
        'SETOR': '88',
        'RUA': 'B5VD',
        'COD_ARTIGO': 'ART-3310',
        'ENDERECO_VAO': 'B5VD-02',
        'CAIXAS_PLANILHA': 60,
        'CAIXAS_REALIZADAS': 0,
        'DIFERENCA_SALDO': -60,
        'PERC_COBERTURA': 0.0,
        'STATUS': 'PENDENTE',
        'HORAS_LIVRES': 0.0,
        'VPH_PRODUTIVIDADE': 0.0,
        'MIN_POR_CAIXA': 0.0
      }
    ];

    const ws1 = XLSX.utils.json_to_sheet(templateData);

    // ABA 2: GUIA DE FÓRMULAS & NOMES DAS COLUNAS
    const formulasGuideData = [
      {
        'COLUNA': 'A',
        'NOME_CABECALHO': 'DATA',
        'TIPO_DADO': 'Data (YYYY-MM-DD)',
        'EXEMPLO': selectedDate,
        'DESCRICAO': 'Data do turno operacional a ser auditado'
      },
      {
        'COLUNA': 'B',
        'NOME_CABECALHO': 'SETOR',
        'TIPO_DADO': 'Texto',
        'EXEMPLO': '87',
        'DESCRICAO': 'Código do setor (87, 88, 89 ou 90)'
      },
      {
        'COLUNA': 'C',
        'NOME_CABECALHO': 'RUA',
        'TIPO_DADO': 'Texto',
        'EXEMPLO': 'B4VD',
        'DESCRICAO': 'Nome/código da rua física no armazém'
      },
      {
        'COLUNA': 'D',
        'NOME_CABECALHO': 'COD_ARTIGO',
        'TIPO_DADO': 'Texto/Código',
        'EXEMPLO': 'ART-1044',
        'DESCRICAO': 'Código do produto/SKU da lista prévia'
      },
      {
        'COLUNA': 'E',
        'NOME_CABECALHO': 'ENDERECO_VAO',
        'TIPO_DADO': 'Texto',
        'EXEMPLO': 'B4VD-01',
        'DESCRICAO': 'Endereço específico do picking/pulmão'
      },
      {
        'COLUNA': 'F',
        'NOME_CABECALHO': 'CAIXAS_PLANILHA',
        'TIPO_DADO': 'Número Inteiro',
        'EXEMPLO': '50',
        'DESCRICAO': 'Demanda prevista antes de iniciar o turno'
      },
      {
        'COLUNA': 'G',
        'NOME_CABECALHO': 'CAIXAS_REALIZADAS',
        'TIPO_DADO': 'Número Inteiro',
        'EXEMPLO': '50',
        'DESCRICAO': 'Caixas efetivamente abastecidas e apontadas no sistema'
      },
      {
        'COLUNA': 'H',
        'NOME_CABECALHO': 'DIFERENCA_SALDO',
        'TIPO_DADO': 'Fórmula Excel',
        'EXEMPLO': '=G2-F2',
        'DESCRICAO': 'Saldo restante (= Realizado - Planilha). Se negativo, faltam caixas.'
      },
      {
        'COLUNA': 'I',
        'NOME_CABECALHO': 'PERC_COBERTURA',
        'TIPO_DADO': 'Fórmula Excel (%)',
        'EXEMPLO': '=SE(F2>0; G2/F2; 1)',
        'DESCRICAO': 'Percentual de atendimento da rua'
      },
      {
        'COLUNA': 'J',
        'NOME_CABECALHO': 'STATUS',
        'TIPO_DADO': 'Fórmula Excel',
        'EXEMPLO': '=SE(I2>=1; "FINALIZADO"; SE(G2>0; "EM_ANDAMENTO"; "PENDENTE"))',
        'DESCRICAO': 'Status automático da rua no turno'
      },
      {
        'COLUNA': 'K',
        'NOME_CABECALHO': 'HORAS_LIVRES',
        'TIPO_DADO': 'Número Decimal (h)',
        'EXEMPLO': '0.85',
        'DESCRICAO': 'Horas líquidas de reapro dedicadas à rua'
      },
      {
        'COLUNA': 'L',
        'NOME_CABECALHO': 'VPH_PRODUTIVIDADE',
        'TIPO_DADO': 'Fórmula Excel (cx/h)',
        'EXEMPLO': '=SE(K2>0; G2/K2; 0)',
        'DESCRICAO': 'Velocidade de caixas por hora na rua'
      },
      {
        'COLUNA': 'M',
        'NOME_CABECALHO': 'MIN_POR_CAIXA',
        'TIPO_DADO': 'Fórmula Excel (min/cx)',
        'EXEMPLO': '=SE(G2>0; (K2*60)/G2; 0)',
        'DESCRICAO': 'Tempo médio em minutos por cada caixa'
      }
    ];

    const ws2 = XLSX.utils.json_to_sheet(formulasGuideData);

    XLSX.utils.book_append_sheet(wb, ws1, 'Modelo_Preenchimento');
    XLSX.utils.book_append_sheet(wb, ws2, 'Dicionario_Formulas_Colunas');
    XLSX.writeFile(wb, `Modelo_Planilha_Reapro_Auditoria_V5.xlsx`);

    if (onNotify) onNotify('✓ Modelo oficial (.xlsx) com fórmulas e cabeçalhos baixado com sucesso!', 'var(--color-success)');
  };

  return (
    <div className="space-y-5 animate-fade-in font-sans">
      
      {/* -------------------------------------------------------------
          0. CABEÇALHO TÁTICO COM FILTROS DE DATA, SETOR E AÇÕES RÁPIDAS
          ------------------------------------------------------------- */}
      <div className="bg-slate-950/90 border border-white/15 rounded-2xl p-4 md:p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-black font-black shadow-lg shadow-cyan-500/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white uppercase font-mono tracking-wider">
                  VALIDADOR: PLANILHA vs. SISTEMA REAL
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[0.62rem] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  100% LOCAL & SEGURO
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Auditoria de Cobertura de Caixas, Horas Feitas no Reapro, Produtividade e Horas por Rua
              </p>
            </div>
          </div>

          {/* Botões de Ação de Pré-Demanda */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPasteModal(true)}
              className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Copiar e colar dados de caixas ou artigos do Excel"
            >
              <Upload size={14} />
              <span>COLAR DA PLANILHA</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQuickAddModal(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Registrar quantidade de caixas da rua antes de começar"
            >
              <Plus size={14} />
              <span>+ PRÉ-DEMANDA RÁPIDA</span>
            </button>

            <button
              type="button"
              onClick={handleExportAuditExcel}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Exportar planilha de auditoria completa em Excel"
            >
              <Download size={14} />
              <span>EXPORTAR RESULTADO</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplateExcel}
              className="px-3 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Baixar Modelo de Planilha com Cabeçalhos, Fórmulas e Exemplos Prontos"
            >
              <FileSpreadsheet size={14} className="text-indigo-400" />
              <span>BAIXAR MODELO (.XLSX)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowModelSpecsModal(true)}
              className="px-3 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Visualizar a estrutura completa de colunas, cabeçalhos, nomes e fórmulas da planilha"
            >
              <HelpCircle size={14} className="text-purple-400" />
              <span>ESTRUTURA & FÓRMULAS</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros: Data, Setor e Meta de Produtividade */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 text-xs font-mono">
          <div>
            <label className="text-[0.68rem] text-slate-400 block mb-1 font-bold flex items-center gap-1">
              <Calendar size={12} className="text-cyan-400" /> DATA DA OPERAÇÃO:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs font-mono focus:border-cyan-400 outline-none"
            />
          </div>

          <div>
            <label className="text-[0.68rem] text-slate-400 block mb-1 font-bold flex items-center gap-1">
              <Filter size={12} className="text-cyan-400" /> FILTRAR SETOR:
            </label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs font-mono focus:border-cyan-400 outline-none"
            >
              <option value="TODOS">TODOS OS SETORES</option>
              <option value="87">SETOR 87 (SOLO / B4)</option>
              <option value="88">SETOR 88 (B5)</option>
              <option value="89">SETOR 89 (B6)</option>
              <option value="90">SETOR 90 (B7)</option>
            </select>
          </div>

          <div>
            <label className="text-[0.68rem] text-slate-400 block mb-1 font-bold flex items-center gap-1">
              <Target size={12} className="text-emerald-400" /> META DE PRODUTIVIDADE (CX/H):
            </label>
            <input
              type="number"
              min="20"
              max="120"
              value={targetVph}
              onChange={(e) => setTargetVph(Number(e.target.value) || 56)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-emerald-400 font-black text-xs font-mono focus:border-emerald-400 outline-none"
              title="Meta de caixas por hora para cálculo de horas necessárias"
            />
          </div>

          <div>
            <label className="text-[0.68rem] text-slate-400 block mb-1 font-bold flex items-center gap-1">
              <Search size={12} className="text-cyan-400" /> BUSCAR RUA OU ARTIGO:
            </label>
            <input
              type="text"
              placeholder="Ex: B4VD, ART-3091..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs font-mono focus:border-cyan-400 outline-none"
            />
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------
          1. SCORECARD DE RESULTADOS OPERACIONAIS DO DIA
          ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono">
        
        {/* Card 1: Caixas na Planilha (Prévia) */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-3.5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider">PLANILHA (PRÉVIA)</span>
            <FileSpreadsheet size={15} className="text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-300">
            {totalCaixasPlanilha} <span className="text-xs text-slate-400 font-normal">cx</span>
          </div>
          <p className="text-[0.62rem] text-slate-400 mt-1">
            Demanda registrada antes de começar
          </p>
        </div>

        {/* Card 2: Caixas Feitas no Real (Sistema) */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-3.5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider">SISTEMA (REALIZADO)</span>
            <Boxes size={15} className="text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">
            {totalCaixasRealizadas} <span className="text-xs text-slate-400 font-normal">cx</span>
          </div>
          <p className="text-[0.62rem] text-slate-400 mt-1">
            Apontamentos reais ({totalApontamentosDia} registros)
          </p>
        </div>

        {/* Card 3: % Cobertura Realizada & Status */}
        <div className={`border rounded-2xl p-3.5 shadow-lg relative overflow-hidden ${
          coberturaGeralPercent >= 100 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
            : coberturaGeralPercent >= 60 
            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
            : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider">COBERTURA DO DIA</span>
            {coberturaGeralPercent >= 100 ? <CheckCircle2 size={15} /> : <Clock size={15} />}
          </div>
          <div className="text-xl sm:text-2xl font-black">
            {coberturaGeralPercent}%
          </div>
          <div className="mt-1 flex items-center justify-between text-[0.62rem]">
            <span>{totalCaixasPlanilha > totalCaixasRealizadas ? `Faltam ${totalCaixasPlanilha - totalCaixasRealizadas} cx` : 'Cobertura 100%'}</span>
            <span className="font-black uppercase">
              {coberturaGeralPercent >= 100 ? 'CONCLUÍDO' : 'EM ANDAMENTO'}
            </span>
          </div>
        </div>

        {/* Card 4: Quantas Horas Feitas no Reapro (Líquido) */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-3.5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider">HORAS NO REAPRO</span>
            <Clock size={15} className="text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300">
            {formatDecimalHours(totalHorasReapro)}
          </div>
          <p className="text-[0.62rem] text-slate-400 mt-1 truncate">
            {primeiroApontamento && ultimoApontamento ? `Turno: ${primeiroApontamento} às ${ultimoApontamento}` : `${totalHorasReapro.toFixed(2)}h apontadas`}
          </p>
        </div>

        {/* Card 5: Produtividade Real (VPH) */}
        <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-3.5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider">PRODUTIVIDADE VPH</span>
            <TrendingUp size={15} className="text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white flex items-baseline gap-1.5">
            <span>{vphGeralReal}</span>
            <span className="text-xs text-slate-400 font-normal">cx/h</span>
          </div>
          <div className="text-[0.62rem] text-slate-400 mt-1 flex justify-between">
            <span>Ritmo: {minutosPorCaixaGeral} m/cx</span>
            <span className={vphGeralReal >= targetVph ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
              Meta: {targetVph}
            </span>
          </div>
        </div>

      </div>

      {/* -------------------------------------------------------------
          2. SEÇÃO DE INTELIGÊNCIA PRÉ-ATIVIDADE:
             "O QUE PODEMOS USAR A NOSSO FAVOR ANTES DE COMEÇAR?"
          ------------------------------------------------------------- */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center font-bold">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase font-mono tracking-wider flex items-center gap-2">
                INTELIGÊNCIA PRÉ-ATIVIDADE & ESTRATÉGIA LOGÍSTICA
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] bg-indigo-500/20 text-indigo-300 font-bold">
                  ANÁLISE ANTECIPADA
                </span>
              </h2>
              <p className="text-[0.68rem] text-slate-400">
                Informações extraídas da planilha antes do início da operação para otimizar tempo, rota e esforço
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400 text-[0.65rem] font-bold">SIMULAR EQUIPE:</span>
            {[1, 2, 3, 4].map(op => (
              <button
                key={op}
                type="button"
                onClick={() => setSimulatedOperators(op)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  simulatedOperators === op
                    ? 'bg-indigo-500 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {op} {op === 1 ? 'Op' : 'Ops'}
              </button>
            ))}
          </div>
        </div>

        {/* 3 Blocos Táticos Inteligentes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          
          {/* Bloco A: Dimensionamento de Horas & Tempo de Conclusão */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <Clock size={15} />
              <span className="uppercase text-[0.7rem]">1. Dimensionamento de Horas</span>
            </div>
            <p className="text-[0.68rem] text-slate-300 leading-relaxed">
              Com as <strong className="text-white">{totalCaixasPlanilha} caixas</strong> da planilha na meta de <strong>{targetVph} cx/h</strong>:
            </p>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-white/5 space-y-1 text-[0.7rem]">
              <div className="flex justify-between">
                <span className="text-slate-400">Horas-Homem Necessárias:</span>
                <span className="text-cyan-300 font-bold">{horasNecessariasEstimadas}h ({formatDecimalHours(horasNecessariasEstimadas)})</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1">
                <span className="text-slate-400">Previsão com {simulatedOperators} {simulatedOperators === 1 ? 'operador' : 'operadores'}:</span>
                <span className="text-emerald-400 font-black">
                  ~{formatDecimalHours(horasNecessariasEstimadas / simulatedOperators)}
                </span>
              </div>
              {previsaoTerminoMinutos > 0 && (
                <div className="flex justify-between text-amber-400 pt-1 border-t border-white/10">
                  <span>Saldo Restante a Abastecer:</span>
                  <span className="font-bold">~{previsaoTerminoMinutos} min</span>
                </div>
              )}
            </div>
          </div>

          {/* Bloco B: Caminho Crítico (Gargalo das Ruas) */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <Compass size={15} />
              <span className="uppercase text-[0.7rem]">2. Roteiro Crítico de Ataque</span>
            </div>
            <p className="text-[0.68rem] text-slate-300">
              Ruas com maior volume de saída prévia (iniciar primeiro para evitar ruptura):
            </p>
            <div className="space-y-1.5">
              {ruasCriticasGargalo.length > 0 ? (
                ruasCriticasGargalo.map((rc, idx) => (
                  <div 
                    key={rc.rua}
                    onClick={() => onNavigateToStreet && onNavigateToStreet(rc.rua)}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/90 border border-white/5 hover:border-amber-400/40 transition-all cursor-pointer text-[0.68rem]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-300 text-[0.55rem] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <strong className="text-white">{rc.rua}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-300 font-bold">{rc.caixasPlanilha - rc.caixasRealizadas} cx pend.</span>
                      <span className="text-[0.6rem] text-slate-500">({rc.coberturaPercent}%)</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-[0.68rem] py-2 text-center">
                  Todas as ruas da planilha já atingiram 100% de cobertura.
                </div>
              )}
            </div>
          </div>

          {/* Bloco C: Curva ABC de Artigos que Saíram */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-bold">
              <Boxes size={15} />
              <span className="uppercase text-[0.7rem]">3. Artigos de Alto Volume (Top Saídas)</span>
            </div>
            <p className="text-[0.68rem] text-slate-300">
              Artigos prioritários para dimensionamento de paleteiras e caixas:
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
              {topArtigosQueSairam.length > 0 ? (
                topArtigosQueSairam.map((art) => (
                  <div 
                    key={art.artigo}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/90 border border-white/5 text-[0.68rem]"
                  >
                    <div>
                      <strong className="text-indigo-300">{art.artigo}</strong>
                      <div className="text-[0.58rem] text-slate-400">
                        {art.totalRuas} {art.totalRuas === 1 ? 'rua' : 'ruas'} ({art.ruas.join(', ')})
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-bold">{art.caixas} cx</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-[0.68rem] py-2 text-center">
                  Nenhum código de artigo detalhado na planilha do dia.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* -------------------------------------------------------------
          3. TABELA DE AUDITORIA E VALIDAÇÃO LINHA A LINHA POR RUA
          ------------------------------------------------------------- */}
      <div className="bg-slate-950/90 border border-white/15 rounded-2xl p-4 md:p-5 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-cyan-400" />
            <h2 className="text-sm font-black text-white uppercase font-mono tracking-wider">
              VALIDADOR DETALHADO POR RUA: PLANEJADO vs. REALIZADO
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              ({filteredRows.length} ruas listadas)
            </span>
          </div>

          {/* Filtros de Status */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setFilterStatus('TODOS')}
              className={`px-2.5 py-1 rounded-lg text-[0.65rem] font-bold cursor-pointer transition-all ${
                filterStatus === 'TODOS'
                  ? 'bg-cyan-500 text-black font-black'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              TODOS
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('FINALIZADO')}
              className={`px-2.5 py-1 rounded-lg text-[0.65rem] font-bold cursor-pointer transition-all ${
                filterStatus === 'FINALIZADO'
                  ? 'bg-emerald-500 text-black font-black'
                  : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
              }`}
            >
              FINALIZADOS
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('EM_ANDAMENTO')}
              className={`px-2.5 py-1 rounded-lg text-[0.65rem] font-bold cursor-pointer transition-all ${
                filterStatus === 'EM_ANDAMENTO'
                  ? 'bg-amber-500 text-black font-black'
                  : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
              }`}
            >
              EM ANDAMENTO
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('PENDENTE')}
              className={`px-2.5 py-1 rounded-lg text-[0.65rem] font-bold cursor-pointer transition-all ${
                filterStatus === 'PENDENTE'
                  ? 'bg-rose-500 text-white font-black'
                  : 'bg-slate-800 text-rose-400 hover:bg-slate-700'
              }`}
            >
              PENDENTES
            </button>
          </div>
        </div>

        {/* Tabela Responsiva */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[0.65rem] text-slate-400 uppercase tracking-wider bg-slate-900/60">
                <th className="p-2.5">RUA</th>
                <th className="p-2.5">SETOR</th>
                <th className="p-2.5 text-right">PLANILHA (PRÉ)</th>
                <th className="p-2.5 text-right">REALIZADO (SISTEMA)</th>
                <th className="p-2.5 text-right">DIFERENÇA</th>
                <th className="p-2.5 text-center">COBERTURA</th>
                <th className="p-2.5 text-center">STATUS</th>
                <th className="p-2.5 text-right">HORAS NA RUA</th>
                <th className="p-2.5 text-right">PROD. (CX/H)</th>
                <th className="p-2.5 text-right">RITMO</th>
                <th className="p-2.5">ARTIGOS DEMANDADOS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => {
                  const isFinalizado = row.status === 'FINALIZADO';
                  const isExcedente = row.status === 'EXCEDENTE';
                  const isEmAndamento = row.status === 'EM_ANDAMENTO';
                  const isPendente = row.status === 'PENDENTE';

                  return (
                    <tr 
                      key={row.rua}
                      className="hover:bg-white/5 transition-colors group"
                    >
                      {/* RUA */}
                      <td className="p-2.5 font-bold text-white flex items-center gap-1.5">
                        <span className="text-cyan-400 group-hover:underline cursor-pointer"
                              onClick={() => onNavigateToStreet && onNavigateToStreet(row.rua)}>
                          {row.rua}
                        </span>
                      </td>

                      {/* SETOR */}
                      <td className="p-2.5 text-slate-400">
                        {row.setor}
                      </td>

                      {/* CAIXAS PLANILHA */}
                      <td className="p-2.5 text-right text-cyan-300 font-bold">
                        {row.caixasPlanilha} <span className="text-[0.6rem] text-slate-500">cx</span>
                      </td>

                      {/* CAIXAS REALIZADAS */}
                      <td className="p-2.5 text-right text-emerald-400 font-bold">
                        {row.caixasRealizadas} <span className="text-[0.6rem] text-slate-500">cx</span>
                      </td>

                      {/* DIFERENÇA (SALDO) */}
                      <td className="p-2.5 text-right font-bold">
                        {row.diferenca < 0 ? (
                          <span className="text-amber-400">
                            {row.diferenca} cx
                          </span>
                        ) : row.diferenca > 0 ? (
                          <span className="text-purple-400">
                            +{row.diferenca} cx
                          </span>
                        ) : (
                          <span className="text-emerald-400">0</span>
                        )}
                      </td>

                      {/* COBERTURA VISUAL */}
                      <td className="p-2.5 text-center min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                row.coberturaPercent >= 100 
                                  ? 'bg-emerald-400' 
                                  : row.coberturaPercent >= 50 
                                  ? 'bg-cyan-400' 
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: `${Math.min(row.coberturaPercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-[0.65rem] font-bold text-slate-300 w-10 text-right">
                            {row.coberturaPercent}%
                          </span>
                        </div>
                      </td>

                      {/* STATUS BADGE */}
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-black uppercase tracking-wider inline-block ${
                          isFinalizado 
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                            : isExcedente
                            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            : isEmAndamento
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}>
                          {row.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* QUANTAS HORAS NA RUA */}
                      <td className="p-2.5 text-right font-bold text-amber-300">
                        {row.horasFormatadas}
                      </td>

                      {/* PRODUTIVIDADE REAL (CX/H) */}
                      <td className="p-2.5 text-right">
                        {row.vphReal > 0 ? (
                          <span className={`font-bold ${row.vphReal >= targetVph ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {row.vphReal}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* RITMO (MIN/CX) */}
                      <td className="p-2.5 text-right text-slate-300">
                        {row.minutosPorCaixa > 0 ? `${row.minutosPorCaixa} m` : '-'}
                      </td>

                      {/* ARTIGOS DEMANDADOS */}
                      <td className="p-2.5 max-w-xs">
                        {row.artigosDemandados.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {row.artigosDemandados.slice(0, 3).map(art => (
                              <span
                                key={art.artigo}
                                className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[0.6rem] text-cyan-300"
                                title={`${art.artigo}: ${art.caixas} caixas`}
                              >
                                {art.artigo} <strong className="text-white">({art.caixas})</strong>
                              </span>
                            ))}
                            {row.artigosDemandados.length > 3 && (
                              <span className="text-[0.6rem] text-slate-500 font-bold self-center">
                                +{row.artigosDemandados.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[0.62rem] text-slate-500 italic">Demanda sem código</span>
                        )}
                      </td>

                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400 font-mono text-xs">
                    Nenhum registro encontrado para a data {selectedDate} e filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------------------
          MODAL 1: COLAR DIRETO DA PLANILHA (CTRL+V)
          ------------------------------------------------------------- */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-white/20 rounded-2xl w-full max-w-2xl p-5 shadow-2xl space-y-4 font-mono animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-cyan-400">
                <FileSpreadsheet size={20} />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  COLAR DADOS DA PLANILHA (CTRL + V)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-1.5">
              <p>
                Copie as colunas do seu <strong>Excel</strong> ou <strong>Google Sheets</strong> e cole na caixa abaixo.
              </p>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-[0.68rem] text-slate-400 space-y-1">
                <p className="font-bold text-cyan-300">Formatos reconhecidos automaticamente:</p>
                <p>• <code>Rua [TAB] Caixas</code> (Ex: B4VD 45)</p>
                <p>• <code>Rua [TAB] Caixas [TAB] Artigo</code> (Ex: B4VD 45 ART-3091)</p>
                <p>• <code>Artigo [TAB] Endereço [TAB] Caixas</code> (Ex: ART-3091 B4VD-02 12)</p>
              </div>
            </div>

            <textarea
              rows={8}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Cole aqui os dados da sua planilha (ex: B4VD	50&#10;B4VA	32&#10;B4VB	48)..."
              className="w-full bg-slate-900 border border-white/15 rounded-xl p-3 text-white font-mono text-xs focus:border-cyan-400 outline-none resize-none"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-[0.65rem] text-slate-500">
                Data de atribuição: <strong className="text-white">{selectedDate}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleProcessPastedData}
                  disabled={isProcessingPaste || !pastedText.trim()}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isProcessingPaste ? 'Processando...' : '✓ Validar e Salvar Pré-Demanda'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL 2: ADIÇÃO RÁPIDA DE PRÉ-DEMANDA POR RUA
          ------------------------------------------------------------- */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={handleQuickAdd}
            className="bg-slate-950 border border-white/20 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 font-mono animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Plus size={20} />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  PRÉ-DEMANDA RÁPIDA DE RUA
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-bold">RUA DE DESTINO:</label>
                <select
                  value={quickRua}
                  onChange={(e) => setQuickRua(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-emerald-400 outline-none"
                >
                  {ALL_CONFIGURED_STREETS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-bold">QUANTIDADE DE CAIXAS:</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="5000"
                  placeholder="Ex: 60"
                  value={quickCaixas}
                  onChange={(e) => setQuickCaixas(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 font-black text-sm font-mono focus:border-emerald-400 outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-bold">CÓDIGO DO ARTIGO (OPCIONAL):</label>
                <input
                  type="text"
                  placeholder="Ex: ART-3091 (ou deixe em branco)"
                  value={quickArtigo}
                  onChange={(e) => setQuickArtigo(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-emerald-400 outline-none uppercase"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-bold">ENDEREÇO / VÃO (OPCIONAL):</label>
                <input
                  type="text"
                  placeholder="Ex: B4VD-01"
                  value={quickEndereco}
                  onChange={(e) => setQuickEndereco(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-emerald-400 outline-none uppercase"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-all cursor-pointer"
              >
                Salvar Demanda
              </button>
            </div>
          </form>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODAL 3: GUIA VISUAL DE ESTRUTURA, NOMES, COLUNAS E FÓRMULAS
          ------------------------------------------------------------- */}
      {showModelSpecsModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-950 border border-white/20 rounded-2xl w-full max-w-4xl p-5 sm:p-6 shadow-2xl space-y-5 font-mono animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">
                    MODELO DA PLANILHA DE REABASTECIMENTO & AUDITORIA
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cabeçalhos, Linhas, Colunas, Fórmulas Nativas do Excel e Nomenclaturas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModelSpecsModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 hover:border-white/20 cursor-pointer"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Ações de Download Direto dentro do Guia */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-purple-950/40 to-slate-900 border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-xs text-purple-200 font-bold">
                  Deseja o arquivo oficial pronto com abas, validações e fórmulas pré-configuradas?
                </p>
                <p className="text-[0.68rem] text-slate-400">
                  Baixe o arquivo <code>.xlsx</code> para abrir diretamente no Microsoft Excel ou importar no Google Planilhas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplateExcel}
                className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-black font-black text-xs transition-all flex items-center gap-2 cursor-pointer shadow-lg whitespace-nowrap"
              >
                <Download size={14} />
                <span>BAIXAR MODELO .XLSX</span>
              </button>
            </div>

            {/* Tabela Estruturada de Colunas, Cabeçalhos e Fórmulas */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-cyan-300 uppercase flex items-center gap-1.5">
                <span>1. ESTRUTURA DE COLUNAS & NOMES DOS CABEÇALHOS (Linha 1)</span>
              </h4>
              
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left border-collapse text-[0.72rem]">
                  <thead>
                    <tr className="bg-slate-900 text-slate-300 border-b border-white/15">
                      <th className="p-2.5 font-bold text-center w-12">Col</th>
                      <th className="p-2.5 font-bold text-cyan-300">Cabeçalho (Linha 1)</th>
                      <th className="p-2.5 font-bold text-slate-300">Tipo de Dado</th>
                      <th className="p-2.5 font-bold text-emerald-400">Fórmula Excel / Entrada</th>
                      <th className="p-2.5 font-bold text-slate-300">Exemplo (Linha 2)</th>
                      <th className="p-2.5 font-bold text-slate-400">Função / Utilidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 bg-slate-950/60">
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-slate-400">A</td>
                      <td className="p-2.5 font-bold text-white">DATA</td>
                      <td className="p-2.5 text-slate-300">Data (YYYY-MM-DD)</td>
                      <td className="p-2.5 text-slate-400 italic">Entrada manual</td>
                      <td className="p-2.5 text-amber-300 font-mono">{selectedDate}</td>
                      <td className="p-2.5 text-slate-300">Dia de trabalho do turno a ser auditado</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-slate-400">B</td>
                      <td className="p-2.5 font-bold text-white">SETOR</td>
                      <td className="p-2.5 text-slate-300">Texto</td>
                      <td className="p-2.5 text-slate-400 italic">Entrada manual</td>
                      <td className="p-2.5 text-amber-300 font-mono">87</td>
                      <td className="p-2.5 text-slate-300">Setor logístico do armazém (87, 88, 89, 90)</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-slate-400">C</td>
                      <td className="p-2.5 font-bold text-cyan-300">RUA</td>
                      <td className="p-2.5 text-slate-300">Texto</td>
                      <td className="p-2.5 text-slate-400 italic">Entrada manual</td>
                      <td className="p-2.5 text-amber-300 font-mono">B4VD</td>
                      <td className="p-2.5 text-slate-300">Código físico da rua de abastecimento</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-slate-400">D</td>
                      <td className="p-2.5 font-bold text-white">COD_ARTIGO</td>
                      <td className="p-2.5 text-slate-300">Texto</td>
                      <td className="p-2.5 text-slate-400 italic">Entrada manual</td>
                      <td className="p-2.5 text-amber-300 font-mono">ART-1044</td>
                      <td className="p-2.5 text-slate-300">Código ou SKU do produto que saiu</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-slate-400">E</td>
                      <td className="p-2.5 font-bold text-white">ENDERECO_VAO</td>
                      <td className="p-2.5 text-slate-300">Texto</td>
                      <td className="p-2.5 text-slate-400 italic">Entrada manual</td>
                      <td className="p-2.5 text-amber-300 font-mono">B4VD-01</td>
                      <td className="p-2.5 text-slate-300">Posição específica no picking ou pulmão</td>
                    </tr>
                    <tr className="hover:bg-white/5 bg-cyan-950/20">
                      <td className="p-2.5 font-bold text-center text-cyan-400">F</td>
                      <td className="p-2.5 font-bold text-cyan-300">CAIXAS_PLANILHA</td>
                      <td className="p-2.5 text-slate-300">Número</td>
                      <td className="p-2.5 text-slate-400 italic">Demanda prevista</td>
                      <td className="p-2.5 text-amber-300 font-mono">50</td>
                      <td className="p-2.5 text-slate-300">Quantidade de caixas que saíram antes do turno</td>
                    </tr>
                    <tr className="hover:bg-white/5 bg-emerald-950/20">
                      <td className="p-2.5 font-bold text-center text-emerald-400">G</td>
                      <td className="p-2.5 font-bold text-emerald-300">CAIXAS_REALIZADAS</td>
                      <td className="p-2.5 text-slate-300">Número</td>
                      <td className="p-2.5 text-slate-400 italic">Apontado no sistema</td>
                      <td className="p-2.5 text-amber-300 font-mono">50</td>
                      <td className="p-2.5 text-slate-300">Caixas que o operador realmente abasteceu</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-purple-400">H</td>
                      <td className="p-2.5 font-bold text-purple-300">DIFERENCA_SALDO</td>
                      <td className="p-2.5 text-purple-200">Fórmula</td>
                      <td className="p-2.5 text-emerald-300 font-mono font-bold">=G2-F2</td>
                      <td className="p-2.5 text-amber-300 font-mono">0</td>
                      <td className="p-2.5 text-slate-300">Saldo restante. Se negativo, faltam caixas.</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-purple-400">I</td>
                      <td className="p-2.5 font-bold text-purple-300">PERC_COBERTURA</td>
                      <td className="p-2.5 text-purple-200">Fórmula (%)</td>
                      <td className="p-2.5 text-emerald-300 font-mono font-bold">=SE(F2&gt;0; G2/F2; 1)</td>
                      <td className="p-2.5 text-amber-300 font-mono">100%</td>
                      <td className="p-2.5 text-slate-300">Grau de conclusão da rua no dia</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-purple-400">J</td>
                      <td className="p-2.5 font-bold text-purple-300">STATUS</td>
                      <td className="p-2.5 text-purple-200">Fórmula</td>
                      <td className="p-2.5 text-emerald-300 font-mono font-bold text-[0.65rem]">=SE(I2&gt;=1;"FINALIZADO";SE(G2&gt;0;"EM_ANDAMENTO";"PENDENTE"))</td>
                      <td className="p-2.5 text-emerald-400 font-mono font-bold">FINALIZADO</td>
                      <td className="p-2.5 text-slate-300">Classificação operacional automática</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-slate-400">K</td>
                      <td className="p-2.5 font-bold text-white">HORAS_LIVRES</td>
                      <td className="p-2.5 text-slate-300">Número Decimal</td>
                      <td className="p-2.5 text-slate-400 italic">Tempo gasto (horas)</td>
                      <td className="p-2.5 text-amber-300 font-mono">0.85</td>
                      <td className="p-2.5 text-slate-300">Horas operacionais registradas na rua</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-purple-400">L</td>
                      <td className="p-2.5 font-bold text-purple-300">VPH_PRODUTIVIDADE</td>
                      <td className="p-2.5 text-purple-200">Fórmula (cx/h)</td>
                      <td className="p-2.5 text-emerald-300 font-mono font-bold">=SE(K2&gt;0; G2/K2; 0)</td>
                      <td className="p-2.5 text-amber-300 font-mono">58.8</td>
                      <td className="p-2.5 text-slate-300">Velocidade de reabastecimento na rua</td>
                    </tr>
                    <tr className="hover:bg-white/5">
                      <td className="p-2.5 font-bold text-center text-purple-400">M</td>
                      <td className="p-2.5 font-bold text-purple-300">MIN_POR_CAIXA</td>
                      <td className="p-2.5 text-purple-200">Fórmula (min/cx)</td>
                      <td className="p-2.5 text-emerald-300 font-mono font-bold">=SE(G2&gt;0; (K2*60)/G2; 0)</td>
                      <td className="p-2.5 text-amber-300 font-mono">1.02</td>
                      <td className="p-2.5 text-slate-300">Ritmo médio de abastecimento por caixa</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fórmulas de Totais e Resumo Gerencial (Rodapé da Planilha) */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <h4 className="text-xs font-bold text-amber-300 uppercase flex items-center gap-1.5">
                <span>2. FÓRMULAS DE TOTAIS GERAIS (Linha de Totais da Planilha)</span>
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-white/10 space-y-1">
                  <p className="font-bold text-white">Total Caixas Previstas na Planilha:</p>
                  <code className="text-emerald-400 font-mono text-xs block bg-black/40 p-1.5 rounded">
                    =SOMA(F2:F100)
                  </code>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-white/10 space-y-1">
                  <p className="font-bold text-white">Total Caixas Realizadas no Sistema:</p>
                  <code className="text-emerald-400 font-mono text-xs block bg-black/40 p-1.5 rounded">
                    =SOMA(G2:G100)
                  </code>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-white/10 space-y-1">
                  <p className="font-bold text-white">Total de Horas Feitas no Reapro:</p>
                  <code className="text-emerald-400 font-mono text-xs block bg-black/40 p-1.5 rounded">
                    =SOMA(K2:K100)
                  </code>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-white/10 space-y-1">
                  <p className="font-bold text-white">Produtividade Real Geral (VPH da Operação):</p>
                  <code className="text-emerald-400 font-mono text-xs block bg-black/40 p-1.5 rounded">
                    =SE(SOMA(K2:K100)&gt;0; SOMA(G2:G100)/SOMA(K2:K100); 0)
                  </code>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-white/10 space-y-1 md:col-span-2">
                  <p className="font-bold text-white">Horas Necessárias Previstas (Dimensionamento antes de começar):</p>
                  <code className="text-emerald-400 font-mono text-xs block bg-black/40 p-1.5 rounded">
                    =SOMA(F2:F100) / 56   [Onde 56 é a meta de caixas por hora do REPRO]
                  </code>
                </div>
              </div>
            </div>

            {/* Dicas de Nomenclaturas e Boas Práticas */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs space-y-2">
              <h5 className="font-bold text-cyan-300 uppercase">3. Nomes e Padrões Recomendados:</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[0.7rem] text-slate-300">
                <p>• <strong>Nome da Aba 1:</strong> <code>Auditoria_Diaria</code> ou <code>Reapro_Planilha</code></p>
                <p>• <strong>Nome da Aba 2:</strong> <code>Dicionario_Formulas</code> ou <code>Metricas</code></p>
                <p>• <strong>Nome das Ruas:</strong> Use maiúsculas sem espaços (ex: <code>B4VD</code>, <code>B4VA</code>, <code>B5VD</code>)</p>
                <p>• <strong>Formato das Horas:</strong> Número decimal (ex: 1h30min = <code>1.5</code>; 45min = <code>0.75</code>)</p>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowModelSpecsModal(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer"
              >
                Entendido
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

