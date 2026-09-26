/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SERVIÇO DE TELEMETRIA & TRANSMISSÃO EM TEMPO REAL (TORRE 5.0)
 * Conecta Coletor (Zebra/PDT) ➔ Servidor Express ➔ Modo TV / Telas Externas
 * Suporte a IP Interno (Wi-Fi/LAN) e IP Externo (Nuvem / WAN)
 */

export interface TelemetryHistoryItem {
  rua: string;
  setor: string;
  volumes: number;
  enderecos?: number;
  tempoSegundos?: number;
  tempoMinutos?: number;
  horario: string;
  vph?: string;
  eph?: string;
}

export interface TelemetryPayload {
  deviceId?: string;
  clientIp?: string;
  isInternalIp?: boolean;
  operador: string;
  setor: string;
  rua: string;
  status: 'EM_ANDAMENTO' | 'PAUSADO' | 'CONCLUIDO' | 'OCIOSO';
  volumes: number;
  enderecos: number;
  demanda: number;
  unidade: string;
  tempoSegundos: number;
  vph: string;
  eph: string;
  ultimaAcao?: string;
  ultimoBipeTs?: number;
  tempoTotalGeralSegundos?: number;
  enderecosTotalGeral?: number;
  volumesTotalGeral?: number;
  historicoHoje?: TelemetryHistoryItem[];
}

export interface NetworkInfo {
  clientIp: string;
  isClientInternal: boolean;
  internalAddresses: { address: string; name: string; url: string; isLan: boolean }[];
  externalUrl: string;
  tvUrlInternal: string;
  tvUrlExternal: string;
  port: number;
  serverTimestamp: string;
}

export interface LiveTelemetrySnapshot {
  status: 'ONLINE' | 'OFFLINE' | 'STANDBY';
  activeReapro: TelemetryPayload | null;
  devices: (TelemetryPayload & {
    deviceId: string;
    clientIp: string;
    isInternalIp: boolean;
    lastHeartbeat: number;
    isStale: boolean;
  })[];
  serverNetwork: NetworkInfo;
  timestamp: number;
}

// Identificador único persistente para este dispositivo coletor
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_node';
  let devId = localStorage.getItem('repro_device_id');
  if (!devId) {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    devId = `ZEBRA-${rand}`;
    localStorage.setItem('repro_device_id', devId);
  }
  return devId;
}

/**
 * Envia batimento cardíaco com os dados operacionais ao vivo para o servidor
 */
export async function sendTelemetryHeartbeat(data: Partial<TelemetryPayload>): Promise<boolean> {
  try {
    const devId = getOrCreateDeviceId();
    const payload: TelemetryPayload = {
      deviceId: devId,
      operador: data.operador || localStorage.getItem('repro_colaborador_padrao') || 'OPERADOR',
      setor: data.setor || '87',
      rua: data.rua || 'B4VD',
      status: data.status || 'EM_ANDAMENTO',
      volumes: Number(data.volumes) || 0,
      enderecos: Number(data.enderecos) || 0,
      demanda: Number(data.demanda) || 0,
      unidade: data.unidade || 'CAIXAS',
      tempoSegundos: Number(data.tempoSegundos) || 0,
      vph: data.vph || '0.0',
      eph: data.eph || '0.0',
      ultimaAcao: data.ultimaAcao || 'Operação ativa no coletor',
      ultimoBipeTs: data.ultimoBipeTs || Date.now(),
      tempoTotalGeralSegundos: data.tempoTotalGeralSegundos,
      enderecosTotalGeral: data.enderecosTotalGeral,
      volumesTotalGeral: data.volumesTotalGeral,
      historicoHoje: data.historicoHoje || []
    };

    const res = await fetch('/api/telemetry/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return res.ok;
  } catch (err) {
    // Falhas de rede em coletores móveis não devem interromper o operador
    return false;
  }
}

/**
 * Consulta instantânea dos dados ao vivo (para polling e inicialização)
 */
export async function fetchLiveTelemetry(): Promise<LiveTelemetrySnapshot | null> {
  try {
    const res = await fetch('/api/telemetry/live', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Consulta dados de rede (IP Interno e IP Externo)
 */
export async function fetchNetworkInfo(): Promise<NetworkInfo | null> {
  try {
    const res = await fetch('/api/telemetry/network-info', { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Simula um reapro em campo para teste e calibração de telas de TV
 */
export async function triggerTelemetrySimulation(): Promise<boolean> {
  try {
    const res = await fetch('/api/telemetry/simulate-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TelemetrySubscriptionOptions {
  pollingIntervalMs?: number;
  preferPolling?: boolean;
  onModeChange?: (mode: 'SSE' | 'POLLING' | 'CONNECTING') => void;
  onPulse?: (source: 'SSE' | 'POLL', timestamp: number) => void;
}

/**
 * Assina o fluxo de telemetria em tempo real via Server-Sent Events (SSE)
 * ou Polling Contínuo de Alta Frequência (com fallback e reconexão automática).
 * Garante atualização 100% em tempo real sem recarregar a página!
 */
export function subscribeToTelemetry(
  onData: (snapshot: LiveTelemetrySnapshot) => void,
  onErrorOrOptions?: ((err: any) => void) | TelemetrySubscriptionOptions,
  maybeOptions?: TelemetrySubscriptionOptions
): { unsubscribe: () => void; forcePoll: () => Promise<void>; setPollingRate: (ms: number) => void } {
  const options: TelemetrySubscriptionOptions = 
    typeof onErrorOrOptions === 'object' && onErrorOrOptions !== null
      ? onErrorOrOptions
      : maybeOptions || {};

  const onError = typeof onErrorOrOptions === 'function' ? onErrorOrOptions : undefined;

  let isCleanedUp = false;
  let eventSource: EventSource | null = null;
  let pollingTimer: any = null;
  let currentPollingMs = options.pollingIntervalMs || 2000;
  let lastDataTs = 0;

  const notifyMode = (mode: 'SSE' | 'POLLING' | 'CONNECTING') => {
    if (options.onModeChange && !isCleanedUp) {
      options.onModeChange(mode);
    }
  };

  const handleIncomingData = (data: LiveTelemetrySnapshot, source: 'SSE' | 'POLL') => {
    if (isCleanedUp) return;
    lastDataTs = Date.now();
    if (options.onPulse) {
      options.onPulse(source, lastDataTs);
    }
    onData(data);
  };

  const executePoll = async () => {
    if (isCleanedUp) return;
    try {
      const data = await fetchLiveTelemetry();
      if (data && !isCleanedUp) {
        handleIncomingData(data, 'POLL');
      }
    } catch (err) {
      if (onError && !isCleanedUp) onError(err);
    }
  };

  const startPollingLoop = (intervalMs: number) => {
    if (pollingTimer) clearInterval(pollingTimer);
    if (isCleanedUp) return;
    currentPollingMs = intervalMs;
    notifyMode('POLLING');
    pollingTimer = setInterval(executePoll, currentPollingMs);
  };

  // 1. Leitura imediata ao iniciar
  notifyMode('CONNECTING');
  executePoll();

  // 2. Se o usuário preferir polling contínuo direto ou se SSE não for suportado
  if (options.preferPolling || typeof window === 'undefined' || !('EventSource' in window)) {
    startPollingLoop(currentPollingMs);
  } else {
    // Modo Híbrido: Conecta SSE + monitor de saúde por polling
    try {
      eventSource = new EventSource('/api/telemetry/stream');
      notifyMode('SSE');

      eventSource.onmessage = (event) => {
        if (isCleanedUp) return;
        try {
          const parsed = JSON.parse(event.data);
          handleIncomingData(parsed, 'SSE');
        } catch (e) {
          console.warn('Erro ao decodificar telemetria SSE:', e);
        }
      };

      eventSource.onerror = (err) => {
        if (isCleanedUp) return;
        console.warn('Conexão SSE suspensa ou oscilando. Ativando Polling contínuo imediato:', err);
        if (onError) onError(err);
        startPollingLoop(currentPollingMs);
      };

      // Watchdog de segurança: Se passar mais de 4.5s sem receber nenhum pacote SSE,
      // faz um poll de garantia para nunca deixar a tela congelada
      pollingTimer = setInterval(() => {
        if (isCleanedUp) return;
        if (Date.now() - lastDataTs > 4000) {
          executePoll();
        }
      }, 2500);

    } catch (err) {
      startPollingLoop(currentPollingMs);
    }
  }

  return {
    unsubscribe: () => {
      isCleanedUp = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    },
    forcePoll: async () => {
      await executePoll();
    },
    setPollingRate: (newMs: number) => {
      currentPollingMs = newMs;
      startPollingLoop(newMs);
    }
  };
}
