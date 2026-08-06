/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Returns the ISO 8601 week number for a given Date or date string/timestamp.
 * ISO week 1 is the week with the first Thursday of the year.
 */
export function getWeekNumber(dateInput?: Date | string | number | null): number {
  if (!dateInput) dateInput = new Date();
  const date = parseDateString(dateInput) || new Date();

  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Returns the day of week name in Portuguese for a given Date or date input.
 */
export function getDayOfWeekName(dateInput?: Date | string | number | null): string {
  const d = parseDateString(dateInput) || new Date();
  return DIAS_DA_SEMANA[d.getDay()] || 'Segunda';
}

/**
 * Formats a Date object or string into standard Brazilian format 'DD/MM/YYYY'.
 */
export function formatDateToBR(dateInput?: Date | string | number | null): string {
  const d = parseDateString(dateInput) || new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Robust date parser supporting DD/MM/YYYY, YYYY-MM-DD, JS Date objects, and Excel Date Serials.
 */
export function parseDateString(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // Handle Excel Date Serial number (e.g. 45500)
  if (typeof val === 'number') {
    if (val > 25000 && val < 100000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }

  const str = String(val).trim();
  if (!str) return null;

  // Handle Excel Serial as string
  const num = Number(str);
  if (!isNaN(num) && num > 25000 && num < 100000) {
    const d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d;
  }

  // Handle DD/MM/YYYY or DD/MM/YY
  const slashParts = str.split('/');
  if (slashParts.length === 3) {
    const day = parseInt(slashParts[0], 10);
    const month = parseInt(slashParts[1], 10) - 1;
    let year = parseInt(slashParts[2], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Handle YYYY-MM-DD
  const dashParts = str.split('-');
  if (dashParts.length === 3 && dashParts[0].length === 4) {
    const year = parseInt(dashParts[0], 10);
    const month = parseInt(dashParts[1], 10) - 1;
    const day = parseInt(dashParts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback ISO/JS Date parse
  const isoDate = new Date(str);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}
