export interface SqlCatalogEntry {
  id: string;
  sql: string;
}

export const SQL_CATALOG: SqlCatalogEntry[] = [
  {
    id: 'AUD001',
    sql: 'SELECT * FROM NEWGES.MRNRREP WHERE SECTEUR = :setor'
  },
  {
    id: 'REPRO_ALL',
    sql: 'SELECT * FROM NEWGES.MRNRREP'
  }
];

export function resolveSqlTemplate(sql: string, params: Record<string, string | number>): string {
  let resolvedSql = sql;
  for (const [key, value] of Object.entries(params)) {
    // Replace all occurrences of :key with the value
    // NOTE: In a real system you should use parameterized queries natively, 
    // but this simulates the requested template resolution safely for the mock.
    resolvedSql = resolvedSql.replace(new RegExp(`:${key}`, 'g'), String(value));
  }
  return resolvedSql;
}
