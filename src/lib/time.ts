import { SLOT_MINUTES, STORE_OPEN_MIN } from "./constants";

/** Format "minutes from midnight" as a 12-hour clock string, e.g. 1290 -> "9:30 PM".
 *  Values past 1440 (after midnight) wrap and are suffixed to flag the next day. */
export function formatMinutes(min: number): string {
  const wrapped = min % 1440;
  const nextDay = min >= 1440;
  let h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h < 12 || h === 24 ? "AM" : "PM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  const mm = m.toString().padStart(2, "0");
  return `${h12}:${mm} ${period}${nextDay ? " (+1)" : ""}`;
}

/** Compact form without minutes when on the hour, e.g. "9 PM", "9:30 PM". */
export function formatMinutesShort(min: number): string {
  const wrapped = min % 1440;
  let h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h < 12 || h === 24 ? "AM" : "PM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Parse "HH:MM" (24h) into minutes from midnight. */
export function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}

/** "minutes from midnight" -> "HH:MM" 24-hour string for <input type=time>. */
export function toHHMM(min: number): string {
  const wrapped = min % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Snap a minute value to the scheduling slot grid. */
export function snapToSlot(min: number): number {
  return Math.round(min / SLOT_MINUTES) * SLOT_MINUTES;
}

/** Slot index (0-based, from store open) for a given absolute minute. */
export function minuteToSlot(min: number): number {
  return Math.floor((min - STORE_OPEN_MIN) / SLOT_MINUTES);
}

/** Absolute minute at the start of a slot index. */
export function slotToMinute(slot: number): number {
  return STORE_OPEN_MIN + slot * SLOT_MINUTES;
}

export function hoursFromMin(min: number): number {
  return Math.round((min / 60) * 100) / 100;
}

/** ISO date (yyyy-mm-dd) of the Monday on/before the given date (UTC). */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** yyyy-mm-dd for a Date (UTC). */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
