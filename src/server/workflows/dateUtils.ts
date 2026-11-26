/**
 * Date Parsing and Validation Utilities for Workflow Ask Node
 */

/**
 * Parses user input string into a valid normalized ISO Date string (YYYY-MM-DD).
 * Returns null if the input is not a valid date.
 */
export function parseAndNormalizeDate(input: string, referenceDate: Date = new Date()): string | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  const pad = (n: number) => String(n).padStart(2, "0");

  // Relative keywords
  if (lower === "today" || lower === "now") {
    return `${referenceDate.getFullYear()}-${pad(referenceDate.getMonth() + 1)}-${pad(referenceDate.getDate())}`;
  }
  if (lower === "tomorrow") {
    const tom = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
    return `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;
  }
  if (lower.startsWith("opt_date_")) {
    const rawIso = lower.replace("opt_date_", "");
    return parseAndNormalizeDate(rawIso, referenceDate);
  }

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  // Pattern 1: ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else {
    // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      const p3 = parseInt(dmyMatch[3], 10);

      // If p1 > 12, it's definitely DD/MM/YYYY
      // If p2 > 12 and p1 <= 12, it's MM/DD/YYYY
      if (p1 > 12 && p2 <= 12) {
        day = p1;
        month = p2;
      } else if (p2 > 12 && p1 <= 12) {
        month = p1;
        day = p2;
      } else {
        // Standard international format default: DD/MM/YYYY
        day = p1;
        month = p2;
      }
      year = p3;
    }
  }

  if (year === null || month === null || day === null) {
    return null;
  }

  // Validate ranges
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Strict check on days per month (including leap years)
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Map of known time slot IDs (from the Ask/time interactive list) → human-readable label.
 */
export const TIME_SLOT_MAP: Record<string, string> = {
  slot_10am: "10:00 AM - 11:00 AM",
  slot_11am: "11:00 AM - 12:00 PM",
  slot_02pm: "02:00 PM - 03:00 PM",
  slot_03pm: "03:00 PM - 04:00 PM",
  slot_05pm: "05:00 PM - 06:00 PM",
  slot_06pm: "06:00 PM - 07:00 PM",
};

/**
 * Returns true if the given replyId is the "custom time" sentinel.
 */
export function isCustomTimeSlot(replyId: string | null | undefined): boolean {
  return replyId === "slot_custom";
}

/**
 * Returns the pre-defined label for a known slot ID, or null if not found.
 */
export function resolveTimeSlotLabel(replyId: string | null | undefined): string | null {
  if (!replyId) return null;
  return TIME_SLOT_MAP[replyId] ?? null;
}

/**
 * Parses and normalizes a free-text time reply.
 * Accepts:
 *   - HH:MM (24h)                 → "14:30"
 *   - H:MM AM/PM (12h)            → "02:30 PM"
 *   - Ranges like "10:00 AM - 11:00 AM" → returned as-is after trimming
 *   - Single digits like "10" treated as hour-only → "10:00 AM" if 1-12 else "10:00"
 * Returns null if the input cannot be interpreted as a time.
 */
export function parseAndNormalizeTime(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Already a range like "10:00 AM - 11:00 AM" (from slot map or user typed it)
  const rangeMatch = trimmed.match(
    /^\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)$/i
  );
  if (rangeMatch) return trimmed;

  // 12-hour: H:MM AM/PM or HH:MM AM/PM
  const twelveHour = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (twelveHour) {
    const h = parseInt(twelveHour[1], 10);
    const m = twelveHour[2] ? parseInt(twelveHour[2], 10) : 0;
    const meridiem = twelveHour[3].toUpperCase();
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${meridiem}`;
  }

  // 24-hour: HH:MM
  const twentyFourHour = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const h = parseInt(twentyFourHour[1], 10);
    const m = parseInt(twentyFourHour[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Hour-only integer (1-23) — treat as "H:00 AM/PM" for 1-12, or "H:00" for 13-23
  const hourOnly = trimmed.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const h = parseInt(hourOnly[1], 10);
    if (h >= 1 && h <= 12) return `${String(h).padStart(2, "0")}:00 AM`;
    if (h >= 13 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  return null;
}
