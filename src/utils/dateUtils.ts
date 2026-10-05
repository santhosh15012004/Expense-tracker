/**
 * Bulletproof date utilities with timezone safety for local dates (e.g. IST).
 * Avoids UTC skew bugs caused by `.toISOString().slice(0, 7)`.
 */

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns YYYY-MM-DD in local time
 */
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

/**
 * Returns YYYY-MM in local time
 */
export function getLocalYearMonth(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  return `${year}-${month}`;
}

/**
 * Today's date YYYY-MM-DD
 */
export function getTodayDateString(): string {
  return getLocalDateString(new Date());
}

/**
 * Yesterday's date YYYY-MM-DD
 */
export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

/**
 * N days ago date YYYY-MM-DD
 */
export function getDaysAgoDateString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateString(d);
}

/**
 * Normalizes any user-entered date string into strict YYYY-MM-DD format.
 * Supports:
 * - YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
 * - DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
 * - DD-MM-YY or DD/MM/YY
 * - DD-MM or DD/MM (current year)
 * - "today", "yesterday", "1 week ago", "7 days ago"
 */
export function normalizeDateString(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const now = new Date();

  if (trimmed === 'today') {
    return getTodayDateString();
  }
  if (trimmed === 'yesterday') {
    return getYesterdayDateString();
  }
  if (trimmed === '1 week ago' || trimmed === '7 days ago' || trimmed === 'week ago') {
    return getDaysAgoDateString(7);
  }
  if (trimmed === '2 days ago') {
    return getDaysAgoDateString(2);
  }

  let y: number;
  let m: number;
  let d: number;

  // Pattern 1: YYYY-MM-DD or YYYY/MM/DD
  let match = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    y = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    d = parseInt(match[3], 10);
  } else if ((match = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    // Pattern 2: DD-MM-YYYY or DD/MM/YYYY (common in India)
    d = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    y = parseInt(match[3], 10);
  } else if ((match = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/))) {
    // Pattern 3: DD-MM-YY or DD/MM/YY
    d = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    y = 2000 + parseInt(match[3], 10);
  } else if ((match = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})$/))) {
    // Pattern 4: DD-MM or DD/MM (current year)
    d = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    y = now.getFullYear();
  } else {
    return null;
  }

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;

  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) return null;

  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Formats a date string for user-friendly display:
 * e.g. "Fri, 2 Oct 2026 (Yesterday)" or "Sat, 3 Oct 2026 (Today)"
 */
export function formatDateDisplay(dateStr?: string | null): string {
  if (!dateStr) return '';
  const norm = normalizeDateString(dateStr);
  if (!norm) return dateStr;

  const parts = norm.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m - 1, d);

  const todayStr = getTodayDateString();
  const yestStr = getYesterdayDateString();

  let relative = '';
  if (norm === todayStr) {
    relative = ' (Today)';
  } else if (norm === yestStr) {
    relative = ' (Yesterday)';
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - target.getTime();
    const diffDays = Math.round(diffMs / (1000 * 3600 * 24));
    if (diffDays > 0) {
      relative = ` (${diffDays} days ago)`;
    } else if (diffDays < 0) {
      relative = ` (in ${Math.abs(diffDays)} days)`;
    }
  }

  const formatted = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${formatted}${relative}`;
}

/**
 * Format month string "YYYY-MM" to "October 2026"
 */
export function formatMonthDisplay(monthStr: string): string {
  if (monthStr === 'all') return 'All Time';
  const parts = monthStr.split('-');
  if (parts.length < 2) return monthStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return monthStr;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * Shift month by offset (e.g. -1 for prev month, +1 for next month)
 * Always safe from UTC offset bugs.
 */
export function getShiftedMonth(monthStr: string, offset: number): string {
  const parts = monthStr.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }
  // m is 1-indexed; JS Date month is 0-indexed
  const newDate = new Date(y, m - 1 + offset, 1);
  return `${newDate.getFullYear()}-${pad2(newDate.getMonth() + 1)}`;
}
