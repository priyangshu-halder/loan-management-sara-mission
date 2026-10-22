/**
 * Date and timezone handling utilities.
 * Ensures strict distinction between:
 * - Business Date (YYYY-MM-DD calendar date in organization timezone)
 * - Posting Date (effective date of accounting ledger entry)
 * - Created/Updated Timestamps (UTC system audit timestamps)
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Validates that a string is a valid ISO calendar date (YYYY-MM-DD).
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateStr;
}

/**
 * Returns today's business date string in YYYY-MM-DD format for a given timezone.
 */
export function getTodayBusinessDate(timezone = DEFAULT_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

/**
 * Formats a Date object or ISO string to display format (e.g. "22 Oct 2026").
 */
export function formatDisplayDate(date: Date | string, timezone = DEFAULT_TIMEZONE): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Parses YYYY-MM-DD into a UTC midnight Date object suitable for database storage.
 */
export function parseBusinessDateToUtcMidnight(dateStr: string): Date {
  if (!isValidCalendarDate(dateStr)) {
    throw new Error(`Invalid business date format: ${dateStr}. Expected YYYY-MM-DD.`);
  }
  return new Date(`${dateStr}T00:00:00.000Z`);
}

