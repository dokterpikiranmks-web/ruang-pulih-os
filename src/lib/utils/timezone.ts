/**
 * Ruang Pulih OS — WITA (Asia/Makassar, UTC+8) Timezone Utilities
 * Standard operating timezone: Asia/Makassar (WITA, UTC+8)
 * Operational hours: 09:00 - 20:00 WITA, Monday - Saturday
 */

export const TIMEZONE_WITA = 'Asia/Makassar';
export const WITA_OFFSET_HOURS = 8;
export const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface WITAParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
}

export interface AppointmentSlot {
  slot_start: string; // ISO 8601 string with +08:00 offset
  slot_end: string;   // ISO 8601 string with +08:00 offset
  time_label: string; // e.g. "09:00 - 10:00 WITA"
}

export interface WATriggerSchedule {
  hMinus1: string;     // H-1 at 19:00 WITA
  hMinus2h: string;    // Exactly 2 hours before slot_start
  hPlus3Days: string;  // Exactly 3 days after slot_start (or 10:00 WITA 3 days later)
}

/**
 * Deconstruct any Date or timestamp into its WITA year, month, day, hour, minute, second.
 */
export function getWITAParts(dateInput: Date | string | number = new Date()): WITAParts {
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  
  // Format into Makassar timezone parts using Intl
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE_WITA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(d);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let weekdayStr = '';

  for (const p of parts) {
    if (p.type === 'year') year = parseInt(p.value, 10);
    else if (p.type === 'month') month = parseInt(p.value, 10);
    else if (p.type === 'day') day = parseInt(p.value, 10);
    else if (p.type === 'hour') hour = parseInt(p.value, 10);
    else if (p.type === 'minute') minute = parseInt(p.value, 10);
    else if (p.type === 'second') second = parseInt(p.value, 10);
    else if (p.type === 'weekday') weekdayStr = p.value;
  }

  const daysMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = daysMap[weekdayStr] ?? 0;

  return { year, month, day, hour, minute, second, dayOfWeek };
}

/**
 * Create an ISO 8601 string explicitly representing Asia/Makassar (+08:00).
 */
export function createWITAISOString(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number = 0
): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+08:00`;
}

/**
 * Format a date in Indonesian locale for WITA display.
 */
export function formatWITADate(dateInput: Date | string | number): string {
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE_WITA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Format time in WITA (e.g. "09:00 WITA")
 */
export function formatWITATime(dateInput: Date | string | number): string {
  const parts = getWITAParts(dateInput);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(parts.hour)}:${pad(parts.minute)} WITA`;
}

/**
 * Full date and time in WITA
 */
export function formatWITADateTime(dateInput: Date | string | number): string {
  return `${formatWITADate(dateInput)} pukul ${formatWITATime(dateInput)}`;
}

/**
 * Standard appointment slot definitions for Ruang Pulih Makassar:
 * Operating hours: 09:00 - 20:00 WITA (Mon-Sat)
 * 60 minutes therapy + 30 minutes therapist rest break = 90 min interval.
 * Slots: 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00, 19:30
 */
export const DAILY_SLOT_STARTS = [
  { hour: 9, minute: 0 },
  { hour: 10, minute: 30 },
  { hour: 12, minute: 0 },
  { hour: 13, minute: 30 },
  { hour: 15, minute: 0 },
  { hour: 16, minute: 30 },
  { hour: 18, minute: 0 },
  { hour: 19, minute: 30 },
] as const;

/**
 * Generate all 8 standard therapy slots for a given WITA date (format 'YYYY-MM-DD').
 */
export function calculateDaySlots(dateStr: string): AppointmentSlot[] {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  if (!y || !m || !d) {
    throw new Error(`Invalid date string: ${dateStr}. Expected YYYY-MM-DD.`);
  }

  const durationMinutes = 60; // 60 min session

  return DAILY_SLOT_STARTS.map((slot) => {
    const slotStartIso = createWITAISOString(y, m, d, slot.hour, slot.minute, 0);

    // Calculate slot end (+60 minutes)
    const startDate = new Date(slotStartIso);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
    const endParts = getWITAParts(endDate);
    const slotEndIso = createWITAISOString(
      endParts.year,
      endParts.month,
      endParts.day,
      endParts.hour,
      endParts.minute,
      0
    );

    const pad = (n: number) => n.toString().padStart(2, '0');
    const startStr = `${pad(slot.hour)}:${pad(slot.minute)}`;
    const endStr = `${pad(endParts.hour)}:${pad(endParts.minute)}`;

    return {
      slot_start: slotStartIso,
      slot_end: slotEndIso,
      time_label: `${startStr} - ${endStr} WITA`,
    };
  });
}

/**
 * Calculate the 3 standard WA reminder/lifecycle triggers for an appointment:
 * 1. H_MINUS_1: 1 day before the appointment date, scheduled at 19:00 WITA (+08:00)
 * 2. H_MINUS_2H: Exactly 2 hours (120 minutes) before slot_start
 * 3. H_PLUS_3: 3 days after appointment (72 hours after slot_start, or 10:00 WITA 3 days later)
 */
export function calculateWAFollowUpTriggers(slotStartInput: string | Date): WATriggerSchedule {
  const startDate = typeof slotStartInput === 'string' ? new Date(slotStartInput) : slotStartInput;
  const startParts = getWITAParts(startDate);

  // 1. H-1 at 19:00 WITA
  // Subtract 1 day from the appointment date
  const dayBefore = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day - 1));
  const hMinus1Iso = createWITAISOString(
    dayBefore.getUTCFullYear(),
    dayBefore.getUTCMonth() + 1,
    dayBefore.getUTCDate(),
    19,
    0,
    0
  );

  // 2. H-2h: Exactly 2 hours before slot_start
  const hMinus2hDate = new Date(startDate.getTime() - 2 * 60 * 60 * 1000);
  const hMinus2hParts = getWITAParts(hMinus2hDate);
  const hMinus2hIso = createWITAISOString(
    hMinus2hParts.year,
    hMinus2hParts.month,
    hMinus2hParts.day,
    hMinus2hParts.hour,
    hMinus2hParts.minute,
    0
  );

  // 3. H+3: Exactly 3 days (72 hours) after slot_start
  const hPlus3Date = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  const hPlus3Parts = getWITAParts(hPlus3Date);
  const hPlus3DaysIso = createWITAISOString(
    hPlus3Parts.year,
    hPlus3Parts.month,
    hPlus3Parts.day,
    10, // Default 10:00 WITA morning follow-up 3 days later
    0,
    0
  );

  return {
    hMinus1: hMinus1Iso,
    hMinus2h: hMinus2hIso,
    hPlus3Days: hPlus3DaysIso,
  };
}
