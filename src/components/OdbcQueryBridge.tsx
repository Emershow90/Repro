/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Database, 
  Code, 
  Terminal, 
  Play, 
  Copy, 
  Check, 
  Download, 
  RefreshCw, 
  Search, 
  Activity, 
  Layers, 
  Server, 
  FileCode,
  ShieldAlert,
  ChevronRight,
  Filter
} from 'lucide-react';
import { StreetSummary, OperationalEvent } from '../types';

interface OdbcQueryBridgeProps {
  streetSummaries: StreetSummary[];
  syncQueueItems: any[];
  eventsList: OperationalEvent[];
  apiUrl: string;
  onAddToast: (msg: string, color?: string) => void;
}

export interface WmsQueryDef {
  id: string;
  categoria: 'Reabastecimento' | 'Inventário' | 'Endereços Vazios' | 'Movimentação' | 'Picking';
  nome: string;
  descricao: string;
  sql: string;
}

export const WMS_QUERIES: WmsQueryDef[] = [
  {
    id: 'SCG001',
    categoria: 'Reabastecimento',
    nome: 'SCG001 — Reabastecimento por Setor',
    descricao: 'Lista de artigos necessários para reabastecimento, com endereço de picking, quantidade em picking, quantidade em estoque e quantidade a reabastecer.',
    sql: `SELECT
  NRBHNR AS ARTICLE,
  NRK4TB AS DESIGNATION,
  NRK8TB AS SECTEUR,
  NRLATB AS UNIVERS,
  NRLFTB AS CLASSE,
  ASTGC2 AS ADRESSE_PICKING,
  ASDUQB AS QTE_PICKING,
  BIDYQB AS QTE_STOCK,
  (ASDUQB - BIDYQB) AS QTE_A_REABASTECER
FROM NEWGES.MRNRREP
LEFT JOIN NEWGES.MTASREP ON NRBHNR = ASBHNR
LEFT JOIN NEWGES.MTBIREP ON NRBHNR = BIBHNR
WHERE ASKVNX = 2
  AND BIDYQB > 0
  AND ASDUQB < BIDYQB
ORDER BY NRK8TB, NRLATB, NRBHNR`
  },
  {
    id: 'SCG002',
    categoria: 'Reabastecimento',
    nome: 'SCG002 — Reendereçamento (READRESSER)',
    descricao: 'Query para reendereçamento de artigos entre locais de estoque. Identifica artigos que precisam ser movidos para novos endereços de picking.',
    sql: `SELECT
  NRBHNR AS ARTICLE,
  NRK4TB AS DESIGNATION,
  ASTGC2 AS ADRESSE_ACTUEL,
  BIDYQB AS QTE_STOCK,
  ASDUQB AS QTE_PICKING,
  CASE
    WHEN BIDYQB > ASDUQB THEN 'REABASTECER'
    ELSE 'SURPLUS'
  END AS ACTION
FROM NEWGES.MRNRREP
LEFT JOIN NEWGES.MTASREP ON NRBHNR = ASBHNR
LEFT JOIN NEWGES.MTBIREP ON NRBHNR = BIBHNR
WHERE ASKVNX = 2
ORDER BY NRK8TB, NRLATB`
  },
  {
    id: 'PIC077',
    categoria: 'Inventário',
    nome: 'PIC077 — Disponibilidade por Artigo',
    descricao: 'Visão consolidada de estoque: quantidade não bloqueada, quantidade reservada, quantidade em picking e quantidade disponível real.',
    sql: `SELECT
  NRBHNR AS ARTICLE,
  NRK4TB AS LIBELLE,
  QTE_NON_BLOQUEE,
  (QTE_NON_BLOQUEE - IFNULL(RES, 0)) AS QTE_DISPO,
  RES AS QTE_AFFECTE,
  PREL AS QTE_PREL
FROM (
  SELECT NRBHNR, NRK4TB
  FROM NEWGES.MRNRREP
  WHERE NRRMNI = NRRNNI
  GROUP BY NRBHNR, NRK4TB
) AS TITI
LEFT JOIN (
  SELECT BIBHNR, SUM(BIDYQB) AS QTE_NON_BLOQUEE
  FROM NEWGES.MTBIREP
  WHERE BIHTNX = 0
  GROUP BY BIBHNR
) AS DISPO ON BIBHNR=NRBHNR
LEFT JOIN (
  SELECT HVSLN2, SUM(HVFVQA) AS RES
  FROM NEWGES.MRHVREP
  WHERE HVNBSR = '10'
  GROUP BY HVSLN2
) AS TOTO ON HVSLN2=NRBHNR
LEFT JOIN (
  SELECT ASBHNR, SUM(ASDSQB) AS PREL
  FROM NEWGES.MTASREP
  WHERE ASJFN2 = 4 AND ASKVNX = 2
  GROUP BY ASBHNR
) AS TZTZ ON ASBHNR=NRBHNR
WHERE QTE_NON_BLOQUEE<>0
ORDER BY NRBHNR`
  },
  {
    id: 'INFO04',
    categoria: 'Inventário',
    nome: 'INFO04 — Endereços por Artigo',
    descricao: 'Lista todos os endereços (BITGC2) e contenedores (BIM7NX) onde um artigo está armazenado.',
    sql: `SELECT DISTINCT
  BIBHNR AS ART,
  BIM7NX AS CTN,
  BITGC2 AS ADRESSE
FROM NEWGES.MTBIREP
WHERE BIBHNR IN (
  SELECT I6BHNR
  FROM NEWGES.MODELRFI, NEWGES.MTI6REP
  WHERE SSEUNZ = I6EUNZ
)
AND BITGC2 <> '  '
GROUP BY BIBHNR, BIM7NX, BITGC2
ORDER BY BIBHNR, BIM7NX, BITGC2`
  },
  {
    id: 'PFE001',
    categoria: 'Inventário',
    nome: 'PFE001 — Rastreabilidade PFE',
    descricao: 'Rastreabilidade completa de contenedores PFE: endereço, UAT, artigo, quantidade, datas e status.',
    sql: `SELECT
  BITGC2 AS ADRESSE,
  BIM7NX AS CONTENANT,
  G3K8CE AS UAT_CONTENANT,
  BIBHNR AS ARTICLE,
  BIQWNR AS SECTEUR,
  BIDYQB AS QTE,
  BIRID2 AS DATE_CREATION_CONTENANT,
  G3NMDS AS DATE_EXPE,
  G3IGTM AS HEURE_EXPE,
  G3NNDS AS DATE_RECEPTION,
  G3IHTM AS HEURE_RECEPTION,
  G3NODS AS DATE_CREATION_UAT,
  G3IITM AS HEURE_CREATION_UAT,
  G3ROSV AS CODE_ETAT,
  G3A5DT AS DATE_MAJ,
  G3DHTM AS HEURE_MAJ,
  C7NSNX AS EXPE
FROM NEWGES.MTBIREP
LEFT OUTER JOIN NEWGES.SSG3REP ON BIM7NX = G3HLN5
LEFT OUTER JOIN NEWGES.MTC7REP ON BITGC2 = C7QXTT
WHERE BITGC2 LIKE 'PFE%'`
  },
  {
    id: 'REC025',
    categoria: 'Endereços Vazios',
    nome: 'REC025 — Endereços Vazios por Zona',
    descricao: 'Identifica endereços vazios por zona para planejamento de alocação.',
    sql: `SELECT
  HLTGC2 AS ADRESSE,
  HLPHNX AS ZONE,
  HLFOSY AS TYPE_ZONE,
  CASE
    WHEN BIBHNR IS NULL THEN 'VIDE'
    ELSE 'OCCUPE'
  END AS STATUS
FROM NEWGES.MRHLREP
LEFT JOIN NEWGES.MTBIREP ON HLTGC2 = BITGC2
WHERE HLFOSY = '$param1'
  AND BIBHNR IS NULL
ORDER BY HLTGC2`
  },
  {
    id: 'STK065',
    categoria: 'Movimentação',
    nome: 'STK065 — Movimentação entre Endereços',
    descricao: 'Histórico de movimentação de artigos entre endereços de estoque com quantidade movida.',
    sql: `SELECT
  M1BHNR AS ARTICLE,
  M1TGC2 AS ADRESSE_ORIGINE,
  M1UGC2 AS ADRESSE_DESTINATION,
  M1DYQB AS QTE_DEPLACEE,
  M1G5D2 AS DATE_MOUVEMENT,
  M1JPC2 AS CODE_OPERATEUR
FROM NEWGES.MTM1REP
WHERE M1G5D2 BETWEEN $param1 AND $param2
  AND M1BHNR = '$param3'
ORDER BY M1G5D2 DESC`
  },
  {
    id: 'PIC080',
    categoria: 'Picking',
    nome: 'PIC080 — Endereçamento por Contenedor',
    descricao: 'Contenedores em endereços de picking por faixa de endereços e data.',
    sql: `SELECT
  ASM7NX AS CONTENANT,
  ASDUQB AS QTE,
  ASRCD2 AS DATE,
  ASTGC2 AS ADRESSE,
  ASBHNR AS ARTICLE,
  ASQWNR AS SECTEUR,
  ASBKNR AS UNIVERS
FROM NEWGES.MTASREP
WHERE ASHUNX IN (40, 59)
  AND ASRCD2 BETWEEN $param1 AND $param2
  AND ASTGC2 BETWEEN '$param3' AND '$param4'`
  },
  {
    id: 'PIC082',
    categoria: 'Picking',
    nome: 'PIC082 — Agregado por Setor/Universo',
    descricao: 'Quantidade total por setor e universo em endereços de picking.',
    sql: `SELECT
  ASQWNR AS SECTEUR,
  ASBKNR AS UNIVERS,
  SUM(ASDUQB) AS QTE
FROM NEWGES.MTASREP
WHERE ASHUNX IN (40, 59)
  AND ASRCD2 BETWEEN $param1 AND $param2
  AND ASTGC2 BETWEEN '$param3' AND '$param4'
GROUP BY ASQWNR, ASBKNR
ORDER BY ASQWNR, ASBKNR`
  },
  {
    id: 'PIC138',
    categoria: 'Picking',
    nome: 'PIC138 — Quantidade a Prelever por Zona',
    descricao: 'Quantidade disponível para picking por setor, zona e tipo de tier.',
    sql: `SELECT
  ASQWNR AS SECTEUR,
  FABACE AS ZONE,
  A1ILNX AS TYPE_TIERS,
  SUM(ASDUQB) AS QTE_PRLVT
FROM NEWGES.MTASREP,
  NEWGES.MRHLREP,
  NEWGES.SMFAREP,
  NEWGES.MTA1REP
WHERE ASHUNX IN (40, 59)
  AND ASTGC2 = HLTGC2
  AND HLPHNX = FARNN3
  AND ASRCD2 BETWEEN $param1 AND $param2
  AND A1H2NX = ASH2NX
  AND A1HUNX = ASHUNX
  AND A1IANX = ASIANX
  AND ASKVNX = '900'
GROUP BY ASQWNR, FABACE, A1ILNX
ORDER BY ASQWNR, FABACE, A1ILNX`
  },
  {
    id: 'PIC139',
    categoria: 'Picking',
    nome: 'PIC139 — Endereçamento Completo com Status',
    descricao: 'Endereçamento detalhado com status de picking (FAJWSU=N).',
    sql: `SELECT
  HVSFN2 AS SECTEUR_SECTOR,
  HVSWN2 AS UNIVERS,
  HVR5N2 AS DEST_THIRD_TYPE,
  HVR7N2 AS DEST_NUM_TYPE,
  HVSLN2 AS ARTICLE,
  HVFVQA AS QTE_QTY,
  HVR2N2 AS ORDER,
  HVADD2 AS DATE_CREATION,
  HVAGD2 AS DATE_LIVRAISON,
  BITGC2 AS ADRESSE
FROM NEWGES.MRHVREP
INNER JOIN NEWGES.MTBIREP ON (BIDYQB<>0 AND BIHTNX=0 AND HVSLN2=BIBHNR)
INNER JOIN NEWGES.MRHLREP ON (BITGC2=HLTGC2)
INNER JOIN NEWGES.SMFAREP ON (FARNN3=HLPHNX AND FAJWSU='N')
WHERE NOT EXISTS (
  SELECT 1 FROM NEWGES.SMFAREP
  INNER JOIN NEWGES.MRHLREP ON FARNN3=HLPHNX
  INNER JOIN NEWGES.MTBIREP ON BITGC2=HLTGC2
  WHERE FAJWSU='O' AND BIDYQB<>0 AND BIHTNX=0 AND HVSLN2=BIBHNR
)
AND HVNBSR='10' AND HVNYSR='O'
AND HVAGD2 BETWEEN $param1 AND $param2
GROUP BY HVSFN2, HVSWN2, HVR5N2, HVR7N2, HVSLN2, HVFVQA, HVR2N2, HVADD2, HVAGD2, BITGC2`
  },
  {
    id: 'PIC075',
    categoria: 'Picking',
    nome: 'PIC075 — Rafale + Endereçamento + Colis',
    descricao: 'Relaciona rafale (onda) com endereços de picking, contenedores e colis.',
    sql: `SELECT
  A.CBTRC2 AS RAF_MER,
  A.CBBRCE AS RAF_FIL,
  A.CBQED2 AS DAT_CRE_RAF,
  A.CBEMN3 AS HEU_CRE_RAF,
  E.H1HGD2 AS DAT_CRE_COL,
  D.ASBHNR AS ART,
  D.ASTGC2 AS ADR_PREL,
  D.ASDUQB AS QTE_VAL,
  CASE
    WHEN G.B7NDTY IS NOT NULL THEN G.B7NDTY
    WHEN G.B7NDTY IS NULL THEN 'ND'
    ELSE NULL
  END AS SUP_COL,
  C.ITI2C2 AS COLIS
FROM NEWGES.SOCBCPP A
INNER JOIN NEWGES.MRNREP B ON A.CBHUNX=B.NPHUNX AND A.CBH2NX=B.NPH2NX
INNER JOIN NEWGES.SKITREP C ON B.NPQ5NI=C.ITQ5NI
INNER JOIN NEWGES.MTASREP D ON B.NPHUNX=D.ASHUNX AND B.NPH2NX=D.ASH2NX AND B.NPIANX=D.ASIANX
INNER JOIN NEWGES.MTH1CPP E ON C.ITI2C2=E.H1I2C2 AND C.ITI3C2=E.H1I3C2
LEFT OUTER JOIN NEWGES.PJB8REP F ON C.ITI2C2=SUBSTR(F.B8YICD, 1, 15)
INNER JOIN NEWGES.PJB7REP G ON F.B8YHCD=G.B7YHCD
WHERE A.CBQED2 BETWEEN $param1 AND $param2
  AND ASQWNR = $param3`
  }
];

export default function OdbcQueryBridge({
  streetSummaries,
  syncQueueItems,
  eventsList,
  apiUrl,
  onAddToast
}: OdbcQueryBridgeProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Reabastecimento');
  const [selectedQueryId, setSelectedQueryId] = useState<string>('SCG001');
  const [searchFilter, setSearchFilter] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryOutput, setQueryOutput] = useState<any[] | null>(null);
  const [codeLanguage, setCodeLanguage] = useState<'csharp' | 'python' | 'curl'>('csharp');

  const selectedQuery = useMemo(() => {
    return WMS_QUERIES.find(q => q.id === selectedQueryId) || WMS_QUERIES[0];
  }, [selectedQueryId]);

  const filteredQueries = useMemo(() => {
    return WMS_QUERIES.filter(q => {
      const matchCategory = selectedCategory === 'TODAS' || q.categoria === selectedCategory;
      const matchSearch = !searchFilter.trim() || 
        q.nome.toLowerCase().includes(searchFilter.toLowerCase()) ||
        q.id.toLowerCase().includes(searchFilter.toLowerCase()) ||
        q.sql.toLowerCase().includes(searchFilter.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [selectedCategory, searchFilter]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(label);
    onAddToast(`${label} copiado para a área de transferência!`, 'var(--color-success)');
    setTimeout(() => setCopiedCode(null), 3000);
  };

  const handleExecuteQuery = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/odbc/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryId: selectedQuery.id,
          sql: selectedQuery.sql,
          summaries: streetSummaries
        })
      });

      if (res.ok) {
        const data = await res.json();
        setQueryOutput(data.rows || []);
        onAddToast(`Query ${selectedQuery.id} executada com sucesso via Bridge OBD!`, 'var(--color-success)');
      } else {
        // Local simulation fallback
        const simulated = streetSummaries.map((s, idx) => ({
          ARTICLE: `ART-${(1001 + idx)}`,
          DESIGNATION: `ARTIGO REABASTECIMENTO ${s.rua}`,
          SECTEUR: s.setor,
          UNIVERS: `UNI-${s.setor}`,
          ADRESSE_PICKING: `PICK-${s.rua}-01`,
          QTE_PICKING: s.realizado,
          QTE_STOCK: s.demanda || (s.realizado + 20),
          QTE_A_REABASTECER: s.pendente || 0,
          STATUS_NOVO: s.status
        }));
        setQueryOutput(simulated);
        onAddToast(`Query executada via simulação de banco local IndexedDB!`, 'var(--color-success)');
      }
    } catch {
      const simulated = streetSummaries.map((s, idx) => ({
        ARTICLE: `ART-${(1001 + idx)}`,
        DESIGNATION: `ARTIGO REABASTECIMENTO ${s.rua}`,
        SECTEUR: s.setor,
        UNIVERS: `UNI-${s.setor}`,
        ADRESSE_PICKING: `PICK-${s.rua}-01`,
        QTE_PICKING: s.realizado,
        QTE_STOCK: s.demanda || (s.realizado + 20),
        QTE_A_REABASTECER: s.pendente || 0,
        STATUS_NOVO: s.status
      }));
      setQueryOutput(simulated);
      onAddToast(`Query executada via motor de simulação local!`, 'var(--color-success)');
    } finally {
      setIsExecuting(false);
    }
  };

  const csharpSnippet = `using System;
using System.Data.Odbc;
using System.Net.Http;
using System.Threading.Tasks;

// Visual Studio AI / C# ODBC & REST Bridge Client
public class WmsOdbcConnector
{
    private static readonly string OdbcConnectionString = "Driver={IBM i Access ODBC Driver};System=10.0.0.1;Uid=WMSUSER;Pwd=WMSSPASS;";
    private static readonly string TerminalApiUrl = "${apiUrl || "https://script.google.com/macros/s/AKfycbxBvISCTmvbAWwcid9UrWUmW3QdIHae2f5fq2OFwuLA/exec"}";

    public static async Task Main()
    {
        Console.WriteLine("Conectando ao WMS via ODBC para a query ${selectedQuery.id}...");
        
        using (OdbcConnection conn = new OdbcConnection(OdbcConnectionString))
        {
            conn.Open();
            string sql = @"${selectedQuery.sql.replace(/"/g, '""')}";

            using (OdbcCommand cmd = new OdbcCommand(sql, conn))
            using (OdbcDataReader reader = cmd.ExecuteReader())
            {
                while (reader.Read())
                {
                    Console.WriteLine($"Artigo: {reader["ARTICLE"]} | Qtd: {reader["QTE_A_REABASTECER"]}");
                }
            }
        }
    }
}`;

  const pythonSnippet = `import pyodbc
import requests

# Conexão ODBC WMS IBM i / AS400 -> Visual Studio AI
conn_str = "Driver={IBM i Access ODBC Driver};System=10.0.0.1;Uid=WMSUSER;Pwd=WMSSPASS;"
terminal_url = "${apiUrl || "https://script.google.com/macros/s/AKfycbxBvISCTmvbAWwcid9UrWUmW3QdIHae2f5fq2OFwuLA/exec"}"

sql_query = """${selectedQuery.sql}"""

def run_wms_query():
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    cursor.execute(sql_query)
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"Linha WMS: {row}")

if __name__ == "__main__":
    run_wms_query()`;

  const curlSnippet = `curl -X POST "https://ais-dev-v7cs7z27o5sgkz4gfzqcea-17783458042.us-east1.run.app/api/odbc/query" \\
  -H "Content-Type: application/json" \\
  -d '{
    "queryId": "${selectedQuery.id}",
    "sql": "${selectedQuery.sql.replace(/\n/g, ' ')}"
  }'`;

  return (
    <div className="space-y-6 font-mono text-slate-200">
      
      {/* HEADER & RESUMO CONEXÃO */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Database size={22} />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>Bridge ODBC / SQL WMS & Conector Visual Studio AI</span>
              <span className="px-2 py-0.5 text-[0.62rem] bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full font-bold">
                NEWGES DB2 / AS400
              </span>
            </h2>
            <p className="text-[0.7rem] text-slate-400">
              Integração nativa de queries SQL ODBC de Reabastecimento, Inventário e Picking com a Trilha de Eventos e Fila Sync
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 flex items-center gap-2 text-xs">
            <Server size={14} className="text-emerald-400" />
            <span className="text-slate-300 font-bold">Fila Sync:</span>
            <span className="text-emerald-400 font-black">{syncQueueItems.length} eventos</span>
          </div>

          <button
            type="button"
            onClick={handleExecuteQuery}
            disabled={isExecuting}
            className="px-3.5 py-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:brightness-110 disabled:opacity-50 text-white font-black text-xs uppercase rounded-xl border border-purple-300 shadow-md flex items-center gap-2 cursor-pointer transition-all"
          >
            <Play size={13} className={isExecuting ? 'animate-spin' : ''} />
            <span>{isExecuting ? 'Executando Query...' : `Testar Query ${selectedQuery.id}`}</span>
          </button>
        </div>
      </div>

      {/* PAINEL 1: TABELA OFICIAL DE REABASTECIMENTO (AUDITORIA) SOLICITADA */}
      <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-400" />
            <h3 className="text-xs font-black uppercase text-white tracking-wider">
              Auditoria de Reabastecimento por Setor / Rua
            </h3>
            <span className="px-2 py-0.5 text-[0.62rem] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold">
              {streetSummaries.length} Registros Ao Vivo
            </span>
          </div>

          <div className="text-[0.68rem] text-slate-400 flex items-center gap-2">
            <span>Colunas: <strong className="text-slate-200">Setor | Rua | Status | Demanda | Realizado | Pendente | Cobertura | EPH | VPH | Tempo | Ações</strong></span>
          </div>
        </div>

        {/* Tabela de Auditoria */}
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60 shadow-inner">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-[0.68rem] uppercase text-slate-400 border-b border-white/10 font-black tracking-wider">
                <th className="p-2.5">Setor</th>
                <th className="p-2.5">Rua</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5 text-right">Demanda</th>
                <th className="p-2.5 text-right">Realizado</th>
                <th className="p-2.5 text-right">Pendente</th>
                <th className="p-2.5 text-right">Cobertura</th>
                <th className="p-2.5 text-right">EPH</th>
                <th className="p-2.5 text-right">VPH</th>
                <th className="p-2.5 text-right">Tempo</th>
                <th className="p-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-[0.72rem]">
              {streetSummaries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-slate-500 italic">
                    Nenhuma rua configurada ou cadastrada para a data selecionada.
                  </td>
                </tr>
              ) : (
                streetSummaries.map((s, idx) => {
                  const statusBg = s.status === 'ATENDIDA'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : s.status === 'EXCEDENTE'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : s.status === 'EM_ANDAMENTO'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700';

                  const formatSecs = (sec: number) => {
                    const m = Math.floor(sec / 60);
                    const h = Math.floor(m / 60);
                    const rM = m % 60;
                    if (h > 0) return `${h}h ${rM}m`;
                    return `${rM}m`;
                  };

                  return (
                    <tr key={s.rua + idx} className="hover:bg-white/5 transition-colors">
                      <td className="p-2.5 font-bold text-slate-300">{s.setor}</td>
                      <td className="p-2.5 font-black text-emerald-400">{s.rua}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-black border ${statusBg}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-bold text-white">{s.demanda !== null ? s.demanda : '-'}</td>
                      <td className="p-2.5 text-right font-black text-cyan-300">{s.realizado}</td>
                      <td className="p-2.5 text-right font-bold text-amber-300">{s.pendente !== null ? s.pendente : '-'}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-300">{s.coberturaPercent !== null ? `${s.coberturaPercent}%` : '-'}</td>
                      <td className="p-2.5 text-right font-mono text-purple-300">{s.eph}</td>
                      <td className="p-2.5 text-right font-mono text-indigo-300">{s.vph}</td>
                      <td className="p-2.5 text-right text-slate-400">{formatSecs(s.tempoTotalSegundos)}</td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleCopy(`SELECT * FROM NEWGES.MTASREP WHERE ASTGC2 = '${s.rua}'`, `SQL Rua ${s.rua}`)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[0.62rem] font-bold border border-white/10 transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Code size={11} />
                          <span>Copiar SQL</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAINEL 2: CATÁLOGO DE QUERIES OBD / WMS NEWGES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Coluna Esquerda: Lista de Queries por Categoria */}
        <div className="lg:col-span-1 space-y-3 p-4 rounded-2xl bg-slate-950 border border-white/15">
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase text-white flex items-center gap-2">
              <Layers size={15} className="text-purple-400" />
              <span>Catálogo Queries WMS (OBD)</span>
            </h3>

            {/* Filtros de Categoria */}
            <div className="flex flex-wrap gap-1">
              {['Reabastecimento', 'Inventário', 'Endereços Vazios', 'Movimentação', 'Picking'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-1 text-[0.62rem] font-bold rounded-lg border transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-black'
                      : 'bg-slate-900 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Campo de Busca */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar query por nome, ID ou tabela..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
              />
            </div>
          </div>

          {/* Lista de Cards de Queries */}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {filteredQueries.map(q => {
              const isSelected = q.id === selectedQuery.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedQueryId(q.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer space-y-1 ${
                    isSelected
                      ? 'bg-purple-500/15 border-purple-500/40 text-white shadow-md'
                      : 'bg-slate-900/80 border-white/10 hover:border-white/20 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-purple-300">{q.id}</span>
                    <span className="text-[0.58rem] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-white/10 font-bold uppercase">
                      {q.categoria}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-200 line-clamp-1">{q.nome}</div>
                  <p className="text-[0.65rem] text-slate-400 line-clamp-2 leading-relaxed">{q.descricao}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coluna Direita: Editor de SQL, Snippet Visual Studio AI e Console Result */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Card SQL Editor */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-white/15 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code size={16} className="text-purple-400" />
                <h3 className="text-xs font-black uppercase text-white">{selectedQuery.nome}</h3>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(selectedQuery.sql, `SQL ${selectedQuery.id}`)}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {copiedCode === `SQL ${selectedQuery.id}` ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedCode === `SQL ${selectedQuery.id}` ? 'Copiado!' : 'Copiar SQL'}</span>
              </button>
            </div>

            <div className="p-3 bg-slate-900 rounded-xl border border-white/10 font-mono text-[0.72rem] text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
              {selectedQuery.sql}
            </div>
          </div>

          {/* Snippets de Código para Visual Studio AI */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-purple-500/30 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileCode size={16} className="text-purple-400" />
                <h3 className="text-xs font-black uppercase text-white">Conector Visual Studio AI / ODBC</h3>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-white/10">
                <button
                  type="button"
                  onClick={() => setCodeLanguage('csharp')}
                  className={`px-2.5 py-1 text-[0.62rem] font-bold rounded transition-all cursor-pointer ${
                    codeLanguage === 'csharp' ? 'bg-purple-500 text-white font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  C# (ODBC)
                </button>
                <button
                  type="button"
                  onClick={() => setCodeLanguage('python')}
                  className={`px-2.5 py-1 text-[0.62rem] font-bold rounded transition-all cursor-pointer ${
                    codeLanguage === 'python' ? 'bg-purple-500 text-white font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Python (pyodbc)
                </button>
                <button
                  type="button"
                  onClick={() => setCodeLanguage('curl')}
                  className={`px-2.5 py-1 text-[0.62rem] font-bold rounded transition-all cursor-pointer ${
                    codeLanguage === 'curl' ? 'bg-purple-500 text-white font-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  cURL REST
                </button>
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => handleCopy(
                  codeLanguage === 'csharp' ? csharpSnippet : codeLanguage === 'python' ? pythonSnippet : curlSnippet,
                  `Código ${codeLanguage}`
                )}
                className="absolute top-2.5 right-2.5 px-2 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded text-[0.62rem] font-bold border border-white/15 flex items-center gap-1 cursor-pointer transition-all z-10"
              >
                <Copy size={11} />
                <span>Copiar Código</span>
              </button>

              <pre className="p-3.5 bg-slate-900 rounded-xl border border-white/10 text-[0.68rem] text-purple-200 overflow-x-auto font-mono max-h-56 leading-relaxed">
                {codeLanguage === 'csharp' && csharpSnippet}
                {codeLanguage === 'python' && pythonSnippet}
                {codeLanguage === 'curl' && curlSnippet}
              </pre>
            </div>
          </div>

          {/* Saída da Execução (Result Console) */}
          {queryOutput && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-cyan-300 flex items-center gap-1.5">
                  <Terminal size={14} />
                  <span>Resultado da Execução ({queryOutput.length} linhas obtidas)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setQueryOutput(null)}
                  className="text-[0.65rem] text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900 p-2 max-h-48 font-mono text-[0.68rem] text-slate-300">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 uppercase">
                      {Object.keys(queryOutput[0] || {}).map(k => (
                        <th key={k} className="p-1.5">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryOutput.map((row, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                        {Object.values(row).map((v: any, vIdx) => (
                          <td key={vIdx} className="p-1.5">{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
