export interface QueryExecuteOptions {
  queryId: string;
  params?: Record<string, string | number>;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 Minutos de vida útil

export async function executeCatalogQuery(options: QueryExecuteOptions) {
  const startTime = Date.now();
  const { queryId, params = {} } = options;

  if (navigator.onLine) {
    try {
      const response = await fetch('/api/odbc/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId, params }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.rows && result.rows.length > 0) {
          localStorage.setItem(`REPRO_QUERY_CACHE_${queryId}`, JSON.stringify({
            timestamp: Date.now(),
            rows: result.rows,
          }));
        }
        return { ...result, executionTimeMs: Date.now() - startTime };
      }
    } catch (netErr) {
      console.warn('Backend inalcançável. Validando cache offline local.');
    }
  }

  const cached = localStorage.getItem(`REPRO_QUERY_CACHE_${queryId}`);
  if (cached) {
    const parsed = JSON.parse(cached);
    const cacheAge = Date.now() - parsed.timestamp;

    if (cacheAge < CACHE_TTL_MS) {
      return {
        status: 'OK',
        source: 'OFFLINE_CACHE',
        queryId,
        rows: parsed.rows,
        rowCount: parsed.rows.length,
        executionTimeMs: Date.now() - startTime,
        warning: `Operando offline com dados gerados há ${Math.round(cacheAge / 60000)} minutos.`,
      };
    } else {
      localStorage.removeItem(`REPRO_QUERY_CACHE_${queryId}`);
      throw new Error(`Segurança Operacional: O cache local expirou (mais de 60 min). Conecte-se à rede para atualizar.`);
    }
  }

  throw new Error("Sistema offline e sem cache validado para esta consulta.");
}
