
/**
 * Serviço de Integração com Google Sheets (Backend Serverless)
 */

const SPREADSHEET_URL = process.env.GOOGLE_SHEETS_API_URL;

export async function fetchGoogleSheetData(): Promise<any[]> {
  if (!SPREADSHEET_URL) return [];
  try {
    const response = await fetch(SPREADSHEET_URL);
    return await response.json();
  } catch (err) {
    console.error('Erro ao buscar dados do Google Sheets:', err);
    return [];
  }
}

export async function saveToGoogleSheet(data: any): Promise<boolean> {
  if (!SPREADSHEET_URL) return false;
  try {
    const response = await fetch(SPREADSHEET_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const result = await response.json();
    return result.status === 'success';
  } catch (err) {
    console.error('Erro ao salvar no Google Sheets:', err);
    return false;
  }
}
