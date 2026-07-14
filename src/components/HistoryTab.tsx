/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent } from 'react';
import { Log } from '../types';
import { 
  FileSpreadsheet, 
  FileDown, 
  FileText, 
  Calendar, 
  User, 
  Briefcase, 
  Search, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  Download, 
  Upload, 
  Check, 
  Printer,
  ChevronDown,
  Clock,
  ChevronUp,
  TrendingUp,
  Layers,
  HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { saveLog, deleteLog } from '../dbLocal';
import { auth } from '../lib/firebase';
import { EventBus } from '../eventBus';

// Constants
const diasDaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Helper to calculate week of the year
function obterSemanaDoAno(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Convert DD/MM/YYYY, Date object, or Excel Date Serial number to Date object
function parseDateString(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  
  // If it's already a native Date object
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
  // If it's a number (Excel date serial)
  if (typeof val === 'number') {
    if (val > 25000 && val < 100000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d;
    }
  }

  const str = String(val).trim();
  if (!str) return null;

  // Try parsing string representing an Excel date serial
  const num = Number(str);
  if (!isNaN(num) && num > 25000 && num < 100000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d;
  }

  // Handle DD/MM/YYYY formats
  const parts = str.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Handle ISO/standard JS date string formats
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;
  
  return null;
}

interface HistoryTabProps {
  logs: Log[];
  onRefresh: () => void;
  onAddToast: (msg: string, color?: string) => void;
}

interface ParsedImportRow {
  raw: any;
  log: Log | null;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

export default function HistoryTab({ logs, onRefresh, onAddToast }: HistoryTabProps) {
  // Advanced filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActivity, setSelectedActivity] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Sorting
  const [sortField, setSortField] = useState<'timestamp' | 'volumes' | 'horas' | 'vph'>('timestamp');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Import states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parsedImportRows, setParsedImportRows] = useState<ParsedImportRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRange, setExportRange] = useState<'all' | 'week' | 'month' | 'custom'>('all');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv' | 'pdf'>('xlsx');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Dropdown options lists derived dynamically
  const uniqueActivities = Array.from(new Set(logs.map(l => l.atividade))).sort();
  const uniqueWeeks = Array.from(new Set(logs.map(l => l.semana))).sort((a, b) => b - a);

  // --- FILTERS LOGIC ---
  const filteredLogs = logs.filter(log => {
    // 1. Colaborador Search
    if (searchTerm && !log.colaborador.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    // 2. Atividade Filter
    if (selectedActivity && log.atividade !== selectedActivity) {
      return false;
    }
    // 3. Semana Filter
    if (selectedWeek && log.semana.toString() !== selectedWeek) {
      return false;
    }
    // 4. Date range filter
    if (startDate || endDate) {
      const logDate = parseDateString(log.data);
      if (logDate) {
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0,0,0,0);
          if (logDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23,59,59,999);
          if (logDate > end) return false;
        }
      } else {
        return false; // Skip if date is unparseable
      }
    }
    return true;
  });

  // Sorting
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'timestamp') {
      comparison = b.timestamp - a.timestamp;
    } else if (sortField === 'volumes') {
      comparison = b.volumes - a.volumes;
    } else if (sortField === 'horas') {
      comparison = b.horas - a.horas;
    } else if (sortField === 'vph') {
      comparison = parseFloat(b.vph) - parseFloat(a.vph);
    }
    return sortAsc ? -comparison : comparison;
  });

  // Pagination sliced list
  const totalPages = Math.ceil(sortedLogs.length / itemsPerPage) || 1;
  const paginatedLogs = sortedLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handle Sort Toggle
  const triggerSort = (field: 'timestamp' | 'volumes' | 'horas' | 'vph') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setCurrentPage(1);
  };

  // --- METRICS FOR FILTERED DATA ---
  const horasDiretas = filteredLogs
    .filter(l => l.tipo !== 'indireta')
    .reduce((acc, l) => acc + l.horas, 0);

  const horasIndiretas = filteredLogs
    .filter(l => l.tipo === 'indireta')
    .reduce((acc, l) => acc + l.horas, 0);

  const totalVolumes = filteredLogs.reduce((acc, l) => acc + l.volumes, 0);
  const totalHoras = horasDiretas + horasIndiretas;

  const vphDiretoNet = horasDiretas > 0 ? (totalVolumes / horasDiretas).toFixed(2) : "0.00";
  const vphGeralBruto = totalHoras > 0 ? (totalVolumes / totalHoras).toFixed(2) : "0.00";
  const totalRecords = filteredLogs.length;

  // --- IMPORT SPREADSHEET (XLSX / CSV) ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processImportFile(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImportFile(files[0]);
    }
  };

  // Robust Sheet Parser
  const processImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (jsonRows.length === 0) {
          onAddToast("Ficheiro vazio ou sem linhas de dados reconhecidas.", 'var(--color-danger)');
          return;
        }

        const parsedRows: ParsedImportRow[] = [];

        for (const row of jsonRows) {
          // Identify columns dynamically mapping standard Portuguese headers
          const rawData = row['Data'] || row['DATA'] || row['Date'] || row['date'] || '';
          const rawSetor = row['Setor'] || row['SETOR'] || row['setor'] || '';
          const rawColaborador = row['Colaborador'] || row['COLABORADOR'] || row['Nome'] || row['nome'] || row['Name'] || '';
          const rawAtividade = row['Atividade'] || row['ATIVIDADE'] || row['Operação'] || row['O que foi feito no Repro'] || row['Atividade no Repro'] || '';
          const rawVolumes = row['Quantidade de Endereços'] || row['Quantidade de Enderecos'] || row['Endereços'] || row['Enderecos'] || row['Volumes'] || row['VOLUMES'] || row['Qtd'] || row['QTD'] || row['Volume'] || 0;
          const rawHoras = row['Horas Utilizadas'] || row['Horas'] || row['HORAS'] || row['Tempo'] || row['Horas Gastas'] || 0;
          const rawVph = row['Produtividade'] || row['VPH'] || row['vph'] || '';

          // Validate fields
          const colaborador = String(rawColaborador).toUpperCase().trim();
          const atividade = String(rawAtividade).trim();
          const volumes = parseInt(String(rawVolumes), 10);
          const horas = parseFloat(String(rawHoras));
          const setorStr = String(rawSetor).trim();

          let parsedDateObj = parseDateString(rawData);
          
          if (!rawData || !parsedDateObj) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: `Data inválida ou em falta: "${rawData}". Formato esperado: DD/MM/YYYY.`
            });
            continue;
          }

          const validSectors = ['87', '88', '89', '90'];
          if (!setorStr) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: 'Setor obrigatório em falta.'
            });
            continue;
          }
          if (!validSectors.includes(setorStr)) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: `Setor inválido: "${setorStr}". Valores permitidos: 87, 88, 89, 90.`
            });
            continue;
          }

          if (!colaborador) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: 'Nome do colaborador em falta.'
            });
            continue;
          }

          if (!atividade) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: 'Atividade em falta.'
            });
            continue;
          }

          if (isNaN(horas) || horas <= 0) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: `Horas devem ser numéricas e maiores que zero. Recebido: "${rawHoras}"`
            });
            continue;
          }

          if (isNaN(volumes) || volumes <= 0) {
            parsedRows.push({
              raw: row,
              log: null,
              status: 'invalid',
              reason: `Quantidade de Endereços deve ser numérica e maior que zero. Recebido: "${rawVolumes}"`
            });
            continue;
          }

          // Calculate dia da semana and semana do ano
          const diaSemana = diasDaSemana[parsedDateObj.getDay()];
          const semanaAno = obterSemanaDoAno(parsedDateObj);
          
          // Determine tipo
          const ehIndireta = atividade.toUpperCase().startsWith("IND:") || atividade.toLowerCase().includes("indireta");
          const tipo = ehIndireta ? 'indireta' : 'direta';

          // Calculate VPH
          const finalVolumes = ehIndireta ? 0 : volumes;
          const computedVph = finalVolumes > 0 ? (finalVolumes / horas).toFixed(2) : '0.00';

          // Check if it's already in our IndexedDB logs list (duplicate validation)
          const formattedDateStr = parsedDateObj.toLocaleDateString('pt-PT');
          const isDuplicate = logs.some(l => 
            l.data === formattedDateStr && 
            l.colaborador === colaborador && 
            l.atividade === atividade && 
            l.volumes === finalVolumes && 
            Math.abs(l.horas - horas) < 0.001
          );

          const newLog: Log = {
            id: Date.now() + Math.floor(Math.random() * 10000000), // safe random
            data: formattedDateStr,
            dia: diaSemana,
            semana: semanaAno,
            atividade: atividade,
            colaborador: colaborador,
            setor: setorStr,
            volumes: finalVolumes,
            horas: horas,
            vph: rawVph ? parseFloat(String(rawVph)).toFixed(2) : computedVph,
            timestamp: parsedDateObj.getTime(),
            synced: false,
            tipo: tipo
          };

          parsedRows.push({
            raw: row,
            log: newLog,
            status: isDuplicate ? 'duplicate' : 'valid'
          });
        }

        setParsedImportRows(parsedRows);
      } catch (err) {
        console.error(err);
        onAddToast("Erro ao processar ficheiro de importação.", 'var(--color-danger)');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCommitImport = async () => {
    const validRowsToImport = parsedImportRows.filter(r => r.status === 'valid' && r.log !== null);
    if (validRowsToImport.length === 0) {
      onAddToast("Nenhum registo válido para importar.", 'var(--color-warning)');
      return;
    }

    try {
      const currentUser = auth.currentUser;
      const isOnline = navigator.onLine;
      let syncSuccess = false;
      let logsToSave = validRowsToImport.map(r => r.log!);

      if (currentUser && isOnline) {
        try {
          const token = await currentUser.getIdToken();
          const response = await fetch('/api/records/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ logs: logsToSave })
          });
          if (response.ok) {
            logsToSave = logsToSave.map(l => ({ ...l, synced: true }));
            syncSuccess = true;
          }
        } catch (syncErr) {
          console.error("Erro ao sincronizar importação na nuvem:", syncErr);
        }
      }

      for (const log of logsToSave) {
        await saveLog(log);
        EventBus.emit('ATIVIDADE_FINALIZADA', log);
      }

      if (syncSuccess) {
        onAddToast(`${validRowsToImport.length} registos importados e sincronizados na nuvem PostgreSQL!`, 'var(--color-success)');
      } else {
        onAddToast(`${validRowsToImport.length} registos importados localmente no IndexedDB.`, 'var(--color-success)');
      }
      
      onRefresh();
      setIsImportModalOpen(false);
      setParsedImportRows([]);
    } catch (err) {
      console.error(err);
      onAddToast("Erro ao guardar dados importados.", 'var(--color-danger)');
    }
  };

  // --- EXPORT SPREADSHEET (XLSX / CSV) ---
  const handleExecuteExport = () => {
    let logsToExport = [...logs];

    // Filter by Range
    if (exportRange === 'week') {
      const today = new Date();
      const currentWeekNum = obterSemanaDoAno(today);
      logsToExport = logsToExport.filter(l => l.semana === currentWeekNum);
    } else if (exportRange === 'month') {
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11
      const currentYear = today.getFullYear();
      logsToExport = logsToExport.filter(l => {
        const d = parseDateString(l.data);
        return d ? d.getMonth() === currentMonth && d.getFullYear() === currentYear : false;
      });
    } else if (exportRange === 'custom') {
      if (!customStart && !customEnd) {
        onAddToast("Indique pelo menos uma data para o intervalo personalizado.", 'var(--color-danger)');
        return;
      }
      logsToExport = logsToExport.filter(l => {
        const d = parseDateString(l.data);
        if (!d) return false;
        if (customStart) {
          const start = new Date(customStart);
          start.setHours(0,0,0,0);
          if (d < start) return false;
        }
        if (customEnd) {
          const end = new Date(customEnd);
          end.setHours(23,59,59,999);
          if (d > end) return false;
        }
        return true;
      });
    }

    if (logsToExport.length === 0) {
      onAddToast("Nenhum dado encontrado para o filtro selecionado.", 'var(--color-warning)');
      return;
    }

    // Sort descending by date
    logsToExport.sort((a, b) => b.timestamp - a.timestamp);

    const filename = `REPRO_Export_${exportRange}_${Date.now()}`;

    // PDF Format
    if (exportFormat === 'pdf') {
      generatePdfList(logsToExport, `Exportação: Período ${exportRange.toUpperCase()}`);
      return;
    }

    // CSV or XLSX Format
    // Format JSON keys for human consumption
    const cleanData = logsToExport.map(l => ({
      'Data': l.data,
      'Dia da Semana': l.dia,
      'Semana do Ano': l.semana,
      'Atividade': l.atividade,
      'Colaborador': l.colaborador,
      'Quantidade de Endereços': l.volumes,
      'Horas Utilizadas': parseFloat(l.horas.toFixed(2)),
      'Produtividade (VPH)': parseFloat(l.vph)
    }));

    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Registos REPRO");

    if (exportFormat === 'xlsx') {
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      onAddToast("Ficheiro Excel (.xlsx) exportado com sucesso!", 'var(--color-success)');
    } else {
      const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onAddToast("Ficheiro CSV (.csv) exportado com sucesso!", 'var(--color-success)');
    }

    setIsExportModalOpen(false);
  };

  // --- PDF GENERATION: GENERAL LIST ---
  const generatePdfList = (logsList: Log[], titleText: string) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Style constants
      const primaryColor = [14, 165, 233]; // cyan sky
      const darkBg = [21, 23, 26];

      // Clean Page border & Background
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Title header block
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 40, 'F');

      // Draw vector accent stripe
      doc.setFillColor(16, 185, 129); // emerald
      doc.rect(0, 38, pageWidth, 2, 'F');

      // System header info
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(16);
      doc.text("TERMINAL REPRO // RELATÓRIO OPERACIONAL", 15, 18);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text(`Sistema de Gestão de Produtividade Logística // Torre de Comando v5.0`, 15, 24);
      doc.text(`${titleText}`, 15, 30);

      // Metricas Globais da exportacao
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(12, 48, pageWidth - 24, 24, 1, 1, 'FD');

      const expHorasDiretas = logsList.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
      const expHorasIndiretas = logsList.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
      const expTotalVolumes = logsList.reduce((acc, l) => acc + l.volumes, 0);
      const expTotalHoras = expHorasDiretas + expHorasIndiretas;
      const expVphNet = expHorasDiretas > 0 ? (expTotalVolumes / expHorasDiretas).toFixed(2) : "0.00";

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("TOTAL ENDEREÇOS (VOL)", 18, 55);
      doc.text("TOTAL HORAS", 65, 55);
      doc.text("HORAS INDIRETAS", 110, 55);
      doc.text("PRODUTIVIDADE VPH", 155, 55);

      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(expTotalVolumes.toLocaleString('pt-PT'), 18, 63);
      doc.text(`${expTotalHoras.toFixed(2)}h`, 65, 63);
      doc.text(`${expHorasIndiretas.toFixed(2)}h`, 110, 63);
      doc.setTextColor(16, 185, 129); // emerald green
      doc.text(`${expVphNet} VPH`, 155, 63);

      // Table Header
      let y = 82;
      doc.setFillColor(226, 232, 240);
      doc.rect(12, y, pageWidth - 24, 7, 'F');
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Data", 15, y + 5);
      doc.text("Colaborador", 38, y + 5);
      doc.text("Atividade", 85, y + 5);
      doc.text("Endereços", 135, y + 5);
      doc.text("Horas", 160, y + 5);
      doc.text("VPH", 182, y + 5);

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      y += 7;

      // Table Rows
      let pageNum = 1;
      for (const log of logsList) {
        if (y > pageHeight - 20) {
          // footer
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text(`Emissão: ${new Date().toLocaleString('pt-PT')} // Terminal REPRO`, 15, pageHeight - 10);
          doc.text(`Página ${pageNum}`, pageWidth - 25, pageHeight - 10);

          doc.addPage();
          pageNum++;
          
          // clean page background
          doc.setFillColor(248, 250, 252);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');

          // simple header
          doc.setFillColor(30, 41, 59);
          doc.rect(0, 0, pageWidth, 15, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(9);
          doc.setFont('Helvetica', 'bold');
          doc.text(`REPRO // ANEXO EXPORTAÇÃO (CONT.) - PÁGINA ${pageNum}`, 15, 9);
          
          y = 25;
          // repeat header row
          doc.setFillColor(226, 232, 240);
          doc.rect(12, y, pageWidth - 24, 7, 'F');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text("Data", 15, y + 5);
          doc.text("Colaborador", 38, y + 5);
          doc.text("Atividade", 85, y + 5);
          doc.text("Endereços", 135, y + 5);
          doc.text("Horas", 160, y + 5);
          doc.text("VPH", 182, y + 5);
          doc.setFont('Helvetica', 'normal');
          doc.setTextColor(15, 23, 42);
          y += 7;
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(12, y, pageWidth - 12, y);

        doc.setFontSize(8);
        doc.text(log.data, 15, y + 5);
        
        // Colaborador truncated if too long
        let colabStr = log.colaborador.toUpperCase();
        if (colabStr.length > 20) colabStr = colabStr.substring(0, 18) + '..';
        doc.text(colabStr, 38, y + 5);

        // Atividade
        let actStr = log.atividade;
        if (actStr.length > 25) actStr = actStr.substring(0, 23) + '..';
        doc.text(actStr, 85, y + 5);

        doc.text(log.volumes.toString(), 135, y + 5);
        doc.text(`${log.horas.toFixed(2)}h`, 160, y + 5);
        
        doc.setFont('Helvetica', 'bold');
        if (log.tipo === 'indireta') {
          doc.setTextColor(148, 163, 184);
          doc.text("IND", 182, y + 5);
        } else {
          doc.setTextColor(16, 185, 129);
          doc.text(log.vph, 182, y + 5);
        }
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(15, 23, 42);

        y += 7.5;
      }

      // Final page footer
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Emissão: ${new Date().toLocaleString('pt-PT')} // Terminal REPRO`, 15, pageHeight - 10);
      doc.text(`Página ${pageNum}`, pageWidth - 25, pageHeight - 10);

      doc.save(`${titleText.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
      onAddToast("Ficheiro PDF descarregado com sucesso!", 'var(--color-success)');
    } catch (err) {
      console.error(err);
      onAddToast("Erro ao gerar relatório PDF.", 'var(--color-danger)');
    }
  };

  // --- PDF GENERATION: DETAILED DAILY REPORT ---
  const handleGenerateDailyPdf = (targetDateStr: string) => {
    try {
      const dailyLogs = logs.filter(l => l.data === targetDateStr);
      if (dailyLogs.length === 0) {
        onAddToast(`Nenhum registo encontrado para a data: ${targetDateStr}`, 'var(--color-warning)');
        return;
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Clean background color
      doc.setFillColor(248, 250, 252);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // 1. CABEÇALHO A4
      // Main dark banner
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 42, 'F');
      
      // Emerald aesthetic highlight line
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 40, pageWidth, 2, 'F');

      // Header text - Logo & System name
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(15);
      doc.text("TERMINAL REPRO // TORRE DE COMANDO", 15, 18);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("SISTEMA DE ANÁLISE OPERACIONAL E PRODUTIVIDADE LOGÍSTICA V5.0", 15, 23);

      // Date information box on the right
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(pageWidth - 75, 12, 60, 20, 1, 1, 'F');
      
      doc.setTextColor(16, 185, 129);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.text("RELATÓRIO DIÁRIO", pageWidth - 70, 18);
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      const parsedD = parseDateString(targetDateStr);
      const dayName = parsedD ? diasDaSemana[parsedD.getDay()] : '--';
      const weekNum = parsedD ? obterSemanaDoAno(parsedD) : '--';
      doc.text(`Data: ${targetDateStr} (${dayName})`, pageWidth - 70, 23);
      doc.text(`Semana do Ano: ${weekNum}`, pageWidth - 70, 28);

      // 2. CORPO - PRINCIPAIS INDICADORES DO DIA
      let y = 52;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("RESUMO DE DESEMPENHO DIÁRIO", 15, y);
      
      y += 5;
      // White container for metrics
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(12, y, pageWidth - 24, 25, 1, 1, 'FD');

      // Compute day totals
      const dHorasDiretas = dailyLogs.filter(l => l.tipo !== 'indireta').reduce((acc, l) => acc + l.horas, 0);
      const dHorasIndiretas = dailyLogs.filter(l => l.tipo === 'indireta').reduce((acc, l) => acc + l.horas, 0);
      const dTotalVolumes = dailyLogs.reduce((acc, l) => acc + l.volumes, 0);
      const dTotalHoras = dHorasDiretas + dHorasIndiretas;
      const dVphNet = dHorasDiretas > 0 ? (dTotalVolumes / dHorasDiretas).toFixed(2) : "0.00";
      const dVphBruto = dTotalHoras > 0 ? (dTotalVolumes / dTotalHoras).toFixed(2) : "0.00";

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text("TOTAL DE REGISTOS", 18, y + 7);
      doc.text("TOTAL ENDEREÇOS (VOL)", 55, y + 7);
      doc.text("HORAS OPERACIONAIS", 100, y + 7);
      doc.text("HORAS INDIRETAS", 140, y + 7);
      doc.text("PRODUTIVIDADE VPH", 175, y + 7);

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(dailyLogs.length.toString(), 18, y + 16);
      doc.text(dTotalVolumes.toLocaleString('pt-PT'), 55, y + 16);
      doc.text(`${dHorasDiretas.toFixed(2)}h`, 100, y + 16);
      doc.text(`${dHorasIndiretas.toFixed(2)}h`, 140, y + 16);
      doc.setTextColor(16, 185, 129); // emerald green
      doc.text(dVphNet, 175, y + 16);

      y += 33;
      // 3. TABELA DE REGISTOS DO DIA
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("DETALHE DOS LANÇAMENTOS", 15, y);

      y += 4;
      doc.setFillColor(226, 232, 240);
      doc.rect(12, y, pageWidth - 24, 7, 'F');
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Colaborador", 15, y + 5);
      doc.text("Atividade Executada no Repro", 60, y + 5);
      doc.text("Qtd Endereços", 125, y + 5);
      doc.text("Horas Utilizadas", 155, y + 5);
      doc.text("Produtividade", 182, y + 5);

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      y += 7;

      for (const log of dailyLogs) {
        if (y > pageHeight - 40) {
          // If too long, page break (highly unlikely for a single day, but safe fallback)
          doc.addPage();
          doc.setFillColor(248, 250, 252);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          y = 20;
          
          doc.setFillColor(226, 232, 240);
          doc.rect(12, y, pageWidth - 24, 7, 'F');
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text("Colaborador", 15, y + 5);
          doc.text("Atividade Executada no Repro", 60, y + 5);
          doc.text("Qtd Endereços", 125, y + 5);
          doc.text("Horas Utilizadas", 155, y + 5);
          doc.text("Produtividade", 182, y + 5);
          doc.setFont('Helvetica', 'normal');
          doc.setTextColor(15, 23, 42);
          y += 7;
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(12, y, pageWidth - 12, y);

        doc.setFontSize(8);
        doc.text(log.colaborador.toUpperCase(), 15, y + 5);
        doc.text(log.atividade, 60, y + 5);
        doc.text(log.volumes.toString(), 125, y + 5);
        doc.text(`${log.horas.toFixed(2)}h`, 155, y + 5);
        
        doc.setFont('Helvetica', 'bold');
        if (log.tipo === 'indireta') {
          doc.setTextColor(148, 163, 184);
          doc.text("IND", 182, y + 5);
        } else {
          doc.setTextColor(16, 185, 129);
          doc.text(`${log.vph} VPH`, 182, y + 5);
        }
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(15, 23, 42);

        y += 8;
      }

      y += 10;
      // 4. ANÁLISE DE COLABORADORES E ATIVIDADES DO DIA
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("CONSOLIDAÇÃO E OBSERVAÇÕES", 15, y);

      y += 4;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(12, y, pageWidth - 24, 30, 1, 1, 'FD');

      const colabsInvolved = Array.from(new Set(dailyLogs.map(l => l.colaborador))).join(', ');
      const activitiesDone = Array.from(new Set(dailyLogs.map(l => l.atividade))).join(', ');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Colaboradores Ativos:", 15, y + 6);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      let truncatedColabs = colabsInvolved;
      if (truncatedColabs.length > 90) truncatedColabs = truncatedColabs.substring(0, 87) + '...';
      doc.text(truncatedColabs, 48, y + 6);

      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text("Atividades Realizadas:", 15, y + 14);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      let truncatedActs = activitiesDone;
      if (truncatedActs.length > 90) truncatedActs = truncatedActs.substring(0, 87) + '...';
      doc.text(truncatedActs, 48, y + 14);

      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text("Observações do Dia:", 15, y + 22);
      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text("Atividades registadas via cronómetro terminal e sincronizadas com a base local IndexedDB.", 48, y + 22);

      // 5. RODAPÉ DE VALIDAÇÃO
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Relatório emitido em: ${new Date().toLocaleString('pt-PT')} // Terminal REPRO v5.0`, 15, pageHeight - 12);
      doc.text(`Utilizador responsável: COORDENAÇÃO DE OPERAÇÕES`, 15, pageHeight - 8);
      
      doc.text(`Página 1 de 1`, pageWidth - 30, pageHeight - 12);
      doc.setDrawColor(226, 232, 240);
      doc.line(15, pageHeight - 16, pageWidth - 15, pageHeight - 16);

      doc.save(`Relatorio_Diario_${targetDateStr.replace(/\//g, '-')}.pdf`);
      onAddToast(`Relatório PDF do dia ${targetDateStr} descarregado com sucesso!`, 'var(--color-success)');
    } catch (err) {
      console.error(err);
      onAddToast("Erro ao gerar relatório diário PDF.", 'var(--color-danger)');
    }
  };

  const handleTriggerDailyPdfFromMain = () => {
    if (logs.length === 0) {
      onAddToast("Não existem registos guardados para gerar relatório.", 'var(--color-danger)');
      return;
    }
    // Default to the most recent log's date
    const mostRecentDate = logs[0].data;
    handleGenerateDailyPdf(mostRecentDate);
  };

  const deleteRowFromHistory = async (id: number) => {
    if (confirm("Confirmar a eliminação definitiva deste registo da base local IndexedDB?")) {
      await deleteLog(id);
      onAddToast("Registo removido com sucesso.", 'var(--color-warning)');
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. SEÇÃO DE FILTROS E IMPORTAÇÃO/EXPORTAÇÃO */}
      <div className="flex flex-col lg:flex-row gap-6 justify-espaçado items-start lg:items-center bg-terminal-panel/20 p-5 rounded-sm border border-terminal-border/30">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-white tracking-widest uppercase">
            HISTÓRICO OPERACIONAL E LOGS DE PRODUTIVIDADE
          </h2>
          <p className="text-[0.6rem] text-terminal-text opacity-50 tracking-wide">
            Gestão avançada, consolidação de indicadores, exportação estruturada e relatórios corporativos.
          </p>
        </div>

        {/* TOP BUTTONS CONTAINER */}
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-[0.6rem] font-bold uppercase tracking-widest bg-info/10 text-info border border-info/30 hover:bg-info/20 hover:border-info rounded-sm cursor-pointer transition-all"
          >
            <Upload size={12} />
            <span>Importar Planilha</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-[0.6rem] font-bold uppercase tracking-widest bg-success/10 text-success border border-success/30 hover:bg-success/20 hover:border-success rounded-sm cursor-pointer transition-all"
          >
            <Download size={12} />
            <span>Exportar Dados</span>
          </button>

          <button
            onClick={handleTriggerDailyPdfFromMain}
            className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-[0.6rem] font-bold uppercase tracking-widest bg-terminal-accent/10 text-terminal-accent border border-terminal-accent/30 hover:bg-terminal-accent/20 hover:border-terminal-accent rounded-sm cursor-pointer transition-all"
            title="Gera PDF do dia mais recente registado"
          >
            <Printer size={12} />
            <span>Gerar Relatório PDF</span>
          </button>
        </div>
      </div>

      {/* 2. DYNAMIC METRICS BOARD (RESPONDS TO FILTERS) */}
      <section className="bg-terminal-panel/10 border border-terminal-border/30 p-5 rounded-sm">
        <div className="flex items-center justify-between mb-4 border-b border-terminal-border/20 pb-2">
          <h3 className="text-[0.65rem] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp size={12} className="text-terminal-accent" />
            <span>Métricas do Histórico (Filtro Ativo)</span>
          </h3>
          <span className="text-[0.55rem] font-mono bg-terminal-bg px-2 py-0.5 border border-terminal-border/30 text-terminal-text/60">
            {totalRecords} registos encontrados
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
          <div className="bg-terminal-bg/40 p-4 border border-terminal-border/30 rounded-sm">
            <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Total de Endereços</p>
            <p className="text-xl font-bold text-white tracking-wider">{totalVolumes.toLocaleString('pt-PT')}</p>
          </div>
          <div className="bg-terminal-bg/40 p-4 border border-terminal-border/30 rounded-sm">
            <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Total de Horas</p>
            <p className="text-xl font-bold text-white tracking-wider">{totalHoras.toFixed(2)}h</p>
            <div className="text-[0.5rem] text-terminal-text/50 mt-1">
              Diretas: {horasDiretas.toFixed(1)}h | Indiretas: {horasIndiretas.toFixed(1)}h
            </div>
          </div>
          <div className="bg-terminal-bg/40 p-4 border border-terminal-border/30 rounded-sm">
            <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Média Produtividade (Net)</p>
            <p className="text-xl font-bold text-terminal-accent tracking-wider">{vphDiretoNet}</p>
            <span className="text-[0.5rem] text-terminal-text/40 block mt-0.5">Volumes / Horas Diretas</span>
          </div>
          <div className="bg-terminal-bg/40 p-4 border border-terminal-border/30 rounded-sm">
            <p className="text-[0.55rem] uppercase text-terminal-text opacity-40 mb-1">Média Produtividade (Bruto)</p>
            <p className="text-xl font-bold text-terminal-text/80 tracking-wider">{vphGeralBruto}</p>
            <span className="text-[0.5rem] text-terminal-text/40 block mt-0.5">Volumes / Horas Totais</span>
          </div>
        </div>
      </section>

      {/* 3. FILTROS AVANÇADOS INTERATIVOS */}
      <section className="bg-terminal-panel/5 border border-terminal-border/20 p-4 rounded-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Colaborador */}
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold tracking-wider flex items-center gap-1">
              <User size={10} />
              <span>Colaborador</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Pesquisar..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full bg-terminal-bg border border-terminal-border/60 text-white text-xs px-2.5 py-1.5 pl-7 focus:outline-none focus:border-terminal-accent rounded-sm font-mono uppercase"
              />
              <Search size={11} className="absolute left-2.5 top-2.5 text-terminal-text opacity-40" />
            </div>
          </div>

          {/* Atividade */}
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold tracking-wider flex items-center gap-1">
              <Briefcase size={10} />
              <span>Atividade</span>
            </label>
            <select
              value={selectedActivity}
              onChange={e => { setSelectedActivity(e.target.value); setCurrentPage(1); }}
              className="w-full bg-terminal-bg border border-terminal-border/60 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-terminal-accent rounded-sm font-mono h-[30px]"
            >
              <option value="">TODAS</option>
              {uniqueActivities.map(act => (
                <option key={act} value={act}>{act.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Semana do Ano */}
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold tracking-wider flex items-center gap-1">
              <Layers size={10} />
              <span>Semana do Ano</span>
            </label>
            <select
              value={selectedWeek}
              onChange={e => { setSelectedWeek(e.target.value); setCurrentPage(1); }}
              className="w-full bg-terminal-bg border border-terminal-border/60 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-terminal-accent rounded-sm font-mono h-[30px]"
            >
              <option value="">TODAS</option>
              {uniqueWeeks.map(wk => (
                <option key={wk} value={wk.toString()}>SEMANA {wk}</option>
              ))}
            </select>
          </div>

          {/* Data De */}
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold tracking-wider flex items-center gap-1">
              <Calendar size={10} />
              <span>Data Início</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="w-full bg-terminal-bg border border-terminal-border/60 text-white text-xs px-2 py-1 focus:outline-none focus:border-terminal-accent rounded-sm font-mono"
            />
          </div>

          {/* Data Até */}
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold tracking-wider flex items-center gap-1">
              <Calendar size={10} />
              <span>Data Fim</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="w-full bg-terminal-bg border border-terminal-border/60 text-white text-xs px-2 py-1 focus:outline-none focus:border-terminal-accent rounded-sm font-mono"
            />
          </div>
        </div>

        {/* Clear filters shortcut */}
        {(searchTerm || selectedActivity || selectedWeek || startDate || endDate) && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedActivity('');
                setSelectedWeek('');
                setStartDate('');
                setEndDate('');
                setCurrentPage(1);
              }}
              className="text-[0.55rem] font-bold uppercase tracking-wider text-danger hover:underline cursor-pointer"
            >
              [ Limpar Todos os Filtros ]
            </button>
          </div>
        )}
      </section>

      {/* 4. TABELA DE LOGS PADRONIZADA */}
      <div className="border border-terminal-border/30 rounded-sm overflow-hidden bg-terminal-panel/5">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="text-[0.55rem] uppercase tracking-widest text-terminal-text opacity-50 border-b border-terminal-border bg-terminal-panel/30">
                <th 
                  className="p-3 font-semibold cursor-pointer hover:bg-terminal-panel/50 text-center"
                  onClick={() => triggerSort('timestamp')}
                >
                  Data {sortField === 'timestamp' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="p-3 font-semibold">Dia da Semana</th>
                <th className="p-3 font-semibold text-center">Semana</th>
                <th className="p-3 font-semibold">O que foi feito no Repro</th>
                <th className="p-3 font-semibold text-terminal-accent">Colaborador</th>
                <th 
                  className="p-3 font-semibold text-right cursor-pointer hover:bg-terminal-panel/50"
                  onClick={() => triggerSort('volumes')}
                >
                  Quantidade de Endereços {sortField === 'volumes' && (sortAsc ? '▲' : '▼')}
                </th>
                <th 
                  className="p-3 font-semibold text-right cursor-pointer hover:bg-terminal-panel/50"
                  onClick={() => triggerSort('horas')}
                >
                  Horas Utilizadas {sortField === 'horas' && (sortAsc ? '▲' : '▼')}
                </th>
                <th 
                  className="p-3 font-semibold text-right text-terminal-accent cursor-pointer hover:bg-terminal-panel/50"
                  onClick={() => triggerSort('vph')}
                >
                  Produtividade {sortField === 'vph' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="p-3 font-semibold text-center">Relatório</th>
                <th className="p-3 font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/30 text-[0.7rem] font-medium text-terminal-text/90">
              {paginatedLogs.map((log) => {
                const isIndireta = log.tipo === 'indireta';
                return (
                  <tr key={log.id} className="hover:bg-terminal-panel/10 border-b border-terminal-border/20 transition-colors">
                    <td className="p-3 font-mono text-center">{log.data}</td>
                    <td className="p-3 opacity-60 font-mono text-center">{log.dia}</td>
                    <td className="p-3 opacity-60 font-mono text-center">Semana {log.semana}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-sm text-[0.6rem] font-bold uppercase border ${
                        isIndireta ? 'border-warning/20 text-warning bg-warning/5' : 'border-terminal-accent/20 text-terminal-accent bg-terminal-accent/5'
                      }`}>
                        {log.atividade}
                      </span>
                    </td>
                    <td className="p-3 font-bold uppercase text-white">{log.colaborador}</td>
                    <td className="p-3 text-right font-mono text-white">
                      {isIndireta ? '-' : log.volumes.toLocaleString('pt-PT')}
                    </td>
                    <td className="p-3 text-right font-mono text-warning font-bold">
                      {log.horas.toFixed(2)}h
                    </td>
                    <td className="p-3 text-right font-mono text-terminal-accent font-bold">
                      {isIndireta ? (
                        <span className="text-terminal-text opacity-30 text-[0.6rem]">INDIRETA</span>
                      ) : (
                        `${log.vph} VPH`
                      )}
                    </td>
                    {/* Quick Daily PDF Action */}
                    <td className="p-2 text-center">
                      <button
                        onClick={() => handleGenerateDailyPdf(log.data)}
                        className="text-terminal-accent hover:text-white transition-colors cursor-pointer inline-flex items-center justify-center p-1 border border-terminal-border hover:border-terminal-accent rounded-sm"
                        title={`Gerar Relatório Diário PDF para ${log.data}`}
                      >
                        <Printer size={12} />
                      </button>
                    </td>
                    {/* Delete Action */}
                    <td className="p-2 text-center">
                      <button
                        onClick={() => deleteRowFromHistory(log.id)}
                        className="text-danger hover:bg-danger/10 hover:border-danger transition-all cursor-pointer inline-flex items-center justify-center p-1 border border-terminal-border/50 rounded-sm"
                        title="Eliminar este registo"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sortedLogs.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center p-12 text-terminal-text opacity-40 uppercase tracking-widest text-[0.65rem] font-mono">
                    Nenhum registo de atividades localizado com os filtros indicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION PANEL */}
        {sortedLogs.length > 0 && (
          <div className="bg-terminal-panel/20 p-4 border-t border-terminal-border/30 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
            <div className="text-terminal-text opacity-50 font-mono text-[0.6rem]">
              A mostrar registos {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, sortedLogs.length)} de um total de {sortedLogs.length}
            </div>
            
            <div className="flex gap-2 font-mono">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-terminal-bg border border-terminal-border/60 hover:border-terminal-accent hover:text-white rounded disabled:opacity-35 disabled:hover:border-terminal-border cursor-pointer transition-colors"
              >
                &lt; ANTERIOR
              </button>
              
              <span className="px-3 py-1 flex items-center text-white font-bold bg-terminal-accent/10 border border-terminal-accent/30 rounded">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 bg-terminal-bg border border-terminal-border/60 hover:border-terminal-accent hover:text-white rounded disabled:opacity-35 disabled:hover:border-terminal-border cursor-pointer transition-colors"
              >
                SEGUINTE &gt;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL 1: IMPORTAR PLANILHA --- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-terminal-panel border-2 border-info w-full max-w-4xl max-h-[90vh] flex flex-col rounded-sm shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-terminal-border bg-terminal-bg flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <FileSpreadsheet className="text-info animate-pulse" size={16} />
                  <span>Importação Assistida de Planilhas REPRO</span>
                </h3>
                <p className="text-[0.55rem] tracking-widest text-terminal-text opacity-50 mt-1">
                  Reconhecimento inteligente de colunas e validação instantânea de consistência
                </p>
              </div>
              <button
                onClick={() => { setIsImportModalOpen(false); setParsedImportRows([]); }}
                className="text-terminal-text hover:text-white border border-terminal-border hover:border-white px-2 py-0.5 text-xs font-mono uppercase cursor-pointer"
              >
                [ FECHAR ]
              </button>
            </div>

            {/* Content body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {parsedImportRows.length === 0 ? (
                /* Drag and drop input state */
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-4 ${
                    dragOver ? 'border-info bg-info/5 scale-[0.99]' : 'border-terminal-border/60 hover:border-info/40'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                  />
                  <Upload size={36} className="text-info opacity-75" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white uppercase tracking-wider">
                      Arraste e solte o seu arquivo aqui
                    </p>
                    <p className="text-[0.6rem] text-terminal-text opacity-40 font-mono">
                      Formatos aceites: .XLSX / .XLS / .CSV
                    </p>
                  </div>
                  <button className="text-[0.6rem] text-info border border-info/50 px-4 py-2 font-bold uppercase rounded-sm hover:bg-info/10 tracking-widest">
                    Procurar no Computador
                  </button>
                  <p className="text-[0.5rem] max-w-md text-terminal-text opacity-30 leading-normal">
                    O cabeçalho do arquivo deve conter os nomes das colunas: <span className="font-mono text-white">Data</span>, <span className="font-mono text-white">Colaborador</span>, <span className="font-mono text-white">Atividade</span>, <span className="font-mono text-white">Endereços</span> e <span className="font-mono text-white">Horas</span>.
                  </p>
                </div>
              ) : (
                /* Validation Preview State */
                <div className="space-y-6">
                  {/* Cards with summaries */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-success/5 border border-success/30 p-3 rounded-sm">
                      <p className="text-[0.55rem] text-success font-bold uppercase tracking-wider">Registos Válidos</p>
                      <p className="text-xl font-bold text-white mt-1">
                        {parsedImportRows.filter(r => r.status === 'valid').length}
                      </p>
                    </div>
                    <div className="bg-warning/5 border border-warning/30 p-3 rounded-sm">
                      <p className="text-[0.55rem] text-warning font-bold uppercase tracking-wider">Duplicados Detetados</p>
                      <p className="text-xl font-bold text-white mt-1">
                        {parsedImportRows.filter(r => r.status === 'duplicate').length}
                      </p>
                      <span className="text-[0.45rem] text-terminal-text opacity-40 block">Serão ignorados</span>
                    </div>
                    <div className="bg-danger/5 border border-danger/30 p-3 rounded-sm">
                      <p className="text-[0.55rem] text-danger font-bold uppercase tracking-wider">Inconsistentes</p>
                      <p className="text-xl font-bold text-white mt-1">
                        {parsedImportRows.filter(r => r.status === 'invalid').length}
                      </p>
                      <span className="text-[0.45rem] text-terminal-text opacity-40 block">Dados incorretos</span>
                    </div>
                  </div>

                  {/* Table with validation details */}
                  <div className="space-y-2">
                    <h4 className="text-[0.65rem] font-bold text-white uppercase tracking-widest">
                      Visualização dos Dados de Importação
                    </h4>
                    
                    <div className="border border-terminal-border/30 rounded-sm max-h-[40vh] overflow-y-auto scrollbar-thin text-xs">
                      <table className="w-full text-left font-mono">
                        <thead className="bg-terminal-bg text-[0.55rem] text-terminal-text opacity-50 sticky top-0 uppercase tracking-wider">
                          <tr>
                            <th className="p-2">Status</th>
                            <th className="p-2">Data</th>
                            <th className="p-2">Setor</th>
                            <th className="p-2">Colaborador</th>
                            <th className="p-2">Atividade</th>
                            <th className="p-2 text-right">Vol</th>
                            <th className="p-2 text-right">Horas</th>
                            <th className="p-2">Detalhes / Erro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-terminal-border/20 text-[0.65rem]">
                          {parsedImportRows.map((pRow, index) => {
                            let statusBadge = (
                              <span className="text-success font-bold flex items-center gap-1">
                                <CheckCircle size={10} /> VAL
                              </span>
                            );
                            let rowClass = "hover:bg-terminal-bg/40";
                            
                            if (pRow.status === 'duplicate') {
                              statusBadge = (
                                <span className="text-warning font-bold flex items-center gap-1">
                                  <AlertCircle size={10} /> DUP
                                </span>
                              );
                              rowClass = "bg-warning/5 opacity-60";
                            } else if (pRow.status === 'invalid') {
                              statusBadge = (
                                <span className="text-danger font-bold flex items-center gap-1">
                                  <XCircle size={10} /> INV
                                </span>
                              );
                              rowClass = "bg-danger/5";
                            }

                            return (
                              <tr key={index} className={rowClass}>
                                <td className="p-2 font-bold">{statusBadge}</td>
                                <td className="p-2">
                                  {pRow.log ? (
                                    <div className="flex flex-col">
                                      <span className="font-bold text-white">{pRow.log.data}</span>
                                      {(pRow.raw['Data'] || pRow.raw['DATA'] || pRow.raw['Date'] || pRow.raw['date']) && 
                                       String(pRow.raw['Data'] || pRow.raw['DATA'] || pRow.raw['Date'] || pRow.raw['date']) !== pRow.log.data && (
                                        <span className="text-[0.55rem] text-terminal-text opacity-40">Original: {String(pRow.raw['Data'] || pRow.raw['DATA'] || pRow.raw['Date'] || pRow.raw['date'])}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-danger font-semibold">{String(pRow.raw['Data'] || pRow.raw['DATA'] || pRow.raw['Date'] || pRow.raw['date'] || '--')}</span>
                                  )}
                                </td>
                                <td className="p-2 font-bold text-terminal-accent">
                                  {pRow.log?.setor || pRow.raw['Setor'] || pRow.raw['SETOR'] || pRow.raw['setor'] || '--'}
                                </td>
                                <td className="p-2 font-bold uppercase">{pRow.log?.colaborador || pRow.raw['Colaborador'] || pRow.raw['COLABORADOR'] || '--'}</td>
                                <td className="p-2 opacity-80">{pRow.log?.atividade || pRow.raw['Atividade'] || pRow.raw['ATIVIDADE'] || '--'}</td>
                                <td className="p-2 text-right font-bold text-white">{pRow.log ? pRow.log.volumes : (pRow.raw['Endereços'] || 0)}</td>
                                <td className="p-2 text-right text-warning">{pRow.log ? pRow.log.horas.toFixed(2) : (pRow.raw['Horas'] || 0)}h</td>
                                <td className="p-2 text-terminal-text opacity-70">
                                  {pRow.status === 'duplicate' && 'Registo idêntico já existe na base IndexedDB.'}
                                  {pRow.status === 'invalid' && pRow.reason}
                                  {pRow.status === 'valid' && 'Pronto para importar.'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-terminal-border bg-terminal-bg flex justify-between">
              <button
                onClick={() => { setParsedImportRows([]); }}
                disabled={parsedImportRows.length === 0}
                className="btn-term text-xs px-4 py-2 uppercase border-terminal-border text-terminal-text/70 hover:border-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                Limpar Arquivo
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => { setIsImportModalOpen(false); setParsedImportRows([]); }}
                  className="btn-term text-xs px-4 py-2 uppercase border-terminal-border text-terminal-text/70 hover:border-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCommitImport}
                  disabled={parsedImportRows.filter(r => r.status === 'valid').length === 0}
                  className="px-5 py-2 text-xs font-bold uppercase tracking-widest bg-success text-black hover:bg-success/90 rounded-sm cursor-pointer transition-all disabled:opacity-35 disabled:pointer-events-none"
                >
                  Executar Importação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: EXPORTAR DADOS --- */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-terminal-panel border-2 border-success w-full max-w-md rounded-sm shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-terminal-border bg-terminal-bg flex justify-between items-center">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <FileDown className="text-success" size={14} />
                  <span>Configuração de Exportação</span>
                </h3>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-terminal-text hover:text-white border border-terminal-border px-2 py-0.5 text-[0.6rem] font-mono cursor-pointer"
              >
                FECHAR
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs font-mono">
              {/* Range Selector */}
              <div className="space-y-1.5">
                <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold">Período de Exportação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportRange('all')}
                    className={`p-2.5 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer ${
                      exportRange === 'all' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    TODOS OS REGISTOS
                  </button>
                  <button
                    onClick={() => setExportRange('week')}
                    className={`p-2.5 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer ${
                      exportRange === 'week' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    SEMANA ATUAL
                  </button>
                  <button
                    onClick={() => setExportRange('month')}
                    className={`p-2.5 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer ${
                      exportRange === 'month' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    MÊS ATUAL
                  </button>
                  <button
                    onClick={() => setExportRange('custom')}
                    className={`p-2.5 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer ${
                      exportRange === 'custom' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    PERSONALIZADO
                  </button>
                </div>
              </div>

              {/* Custom Range Inputs */}
              {exportRange === 'custom' && (
                <div className="grid grid-cols-2 gap-2 bg-terminal-bg/40 p-3 border border-terminal-border rounded-sm">
                  <div className="space-y-1">
                    <span className="text-[0.5rem] uppercase text-terminal-text opacity-40">De:</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="w-full bg-terminal-bg border border-terminal-border text-white text-[0.65rem] p-1 font-mono focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.5rem] uppercase text-terminal-text opacity-40">Até:</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="w-full bg-terminal-bg border border-terminal-border text-white text-[0.65rem] p-1 font-mono focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Format Selector */}
              <div className="space-y-1.5 pt-2">
                <label className="text-[0.55rem] uppercase text-terminal-text opacity-50 font-bold">Formato do Ficheiro</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setExportFormat('xlsx')}
                    className={`p-2 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer flex flex-col items-center gap-1 ${
                      exportFormat === 'xlsx' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    <FileSpreadsheet size={14} />
                    <span>EXCEL (XLSX)</span>
                  </button>
                  <button
                    onClick={() => setExportFormat('csv')}
                    className={`p-2 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer flex flex-col items-center gap-1 ${
                      exportFormat === 'csv' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    <FileText size={14} />
                    <span>TEXTO (CSV)</span>
                  </button>
                  <button
                    onClick={() => setExportFormat('pdf')}
                    className={`p-2 text-[0.6rem] font-bold border rounded-sm text-center cursor-pointer flex flex-col items-center gap-1 ${
                      exportFormat === 'pdf' ? 'border-success text-success bg-success/5' : 'border-terminal-border hover:border-success/40'
                    }`}
                  >
                    <FileText size={14} className="text-danger" />
                    <span>PORTABLE (PDF)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-terminal-border bg-terminal-bg flex justify-end gap-2">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="btn-term text-[0.6rem] font-bold px-3 py-1.5 uppercase border-terminal-border cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteExport}
                className="px-4 py-1.5 text-[0.6rem] font-bold uppercase bg-success text-black hover:bg-success/90 rounded-sm cursor-pointer tracking-wider"
              >
                Descarregar Exportação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
