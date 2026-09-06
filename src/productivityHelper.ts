import { OperationalEvent } from './types';

export interface VphMetric {
  operador: string;
  horasTrabalhadasLiquidas: number;
  horasPausa: number;
  totalVolumes: number;
  totalEnderecos: number;
  vphNet: number;
  colisoesEvitadas: number;
  colisoesAssumidas: number;
}

export function calculateProductivityMetrics(events: OperationalEvent[], selectedDate: string): VphMetric[] {
  const metricsMap = new Map<string, VphMetric>();
  
  const dailyEvents = events.filter(e => {
    const dateStr = new Date(e.timestamp).toISOString().split('T')[0];
    return dateStr === selectedDate;
  });

  for (const evt of dailyEvents) {
    const opName = (evt as any).colaborador || (evt as any).operador || evt.sessionId || 'OPERADOR_UNK';

    if (!metricsMap.has(opName)) {
      metricsMap.set(opName, {
        operador: opName,
        horasTrabalhadasLiquidas: 0,
        horasPausa: 0,
        totalVolumes: 0,
        totalEnderecos: 0,
        vphNet: 0,
        colisoesEvitadas: 0,
        colisoesAssumidas: 0
      });
    }

    const m = metricsMap.get(opName)!;

    if (evt.tipo === 'ENDERECO_CONCLUIDO') {
      m.totalEnderecos += (evt.enderecosDelta || 0);
      m.totalVolumes += (evt.volumesDelta || 0);
      if (evt.lapDurationSeconds) {
        m.horasTrabalhadasLiquidas += (evt.lapDurationSeconds / 3600);
      }
    } else if (evt.tipo === 'PAUSA') {
      if (evt.lapDurationSeconds) {
        m.horasPausa += (evt.lapDurationSeconds / 3600);
      }
    } else if (evt.tipo === 'AJUSTE_VOLUME' || evt.tipo === 'REDUCAO_VOLUME') {
      m.totalVolumes += (evt.volumesDelta || 0);
    }

    if (evt.justification?.includes('Assumiu Risco') || evt.justification?.includes('colisao_assumida')) {
      m.colisoesAssumidas += 1;
    }
    if (evt.justification?.includes('Colisão Evitada') || evt.justification?.includes('colisao_evitada')) {
      m.colisoesEvitadas += 1;
    }
  }

  return Array.from(metricsMap.values()).map(m => {
    m.vphNet = m.horasTrabalhadasLiquidas > 0 
      ? Math.round(m.totalVolumes / m.horasTrabalhadasLiquidas) 
      : m.totalVolumes;
    return m;
  });
}
