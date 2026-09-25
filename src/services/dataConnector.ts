import { SHEET_ID } from '../config/sheetConfig';

export async function fetchSheetData(): Promise<any[]> {
  const token = await getAuthToken();
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/A:Z`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch data from Google Sheets');
  }

  const data = await response.json();
  const values = data.values || [];
  if (values.length <= 1) return [];

  const headers = values[0].map((h: string) => h.trim().toLowerCase());
  
  // Dynamic index mapping
  const addressIdx = headers.indexOf('adresse');
  const qteIdx = headers.indexOf('qte');

  return values.slice(1).map((row: any[]) => {
    return {
      address: addressIdx !== -1 ? row[addressIdx] : '',
      qte: parseInt(qteIdx !== -1 ? row[qteIdx] : '0', 10) || 0
    };
  });
}

async function getAuthToken(): Promise<string> {
  // Placeholder - integration with Google Auth context required
  return '';
}
