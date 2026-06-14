// ---------------------------------------------------------------------------
// Cross-field validation for an employee's characteristics. Pure & shared by
// the edit form (live, blocks Save) and the API routes (rejects with 400).
// Times are store-day minutes from midnight (12:30 AM close = 1470).
// ---------------------------------------------------------------------------

import {
  DAY_NAMES,
  FULL_TIME_MIN_WEEKLY_HOURS,
  PART_TIME_MAX_WEEKLY_HOURS,
  STORE_CLOSE_MIN,
  STORE_OPEN_MIN,
} from "./constants";
import { formatMinutesShort } from "./time";

export interface ValidatableWindow {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface ValidatableEmployee {
  name: string;
  employmentType: "FULL_TIME" | "PART_TIME";
  performance: number;
  minHoursPerWeek: number | null;
  maxHoursPerWeek: number | null;
  availability: ValidatableWindow[];
  hardSets: ValidatableWindow[];
}

const HOURS = `${formatMinutesShort(STORE_OPEN_MIN)}–${formatMinutesShort(STORE_CLOSE_MIN)}`;

/** Returns a list of human-readable validation errors (empty = valid). */
export function validateEmployee(e: ValidatableEmployee): string[] {
  const errors: string[] = [];
  const availability = e.availability ?? [];
  const hardSets = e.hardSets ?? [];

  // --- Basics --------------------------------------------------------------
  if (!e.name?.trim()) errors.push("Name is required.");
  if (!Number.isInteger(e.performance) || e.performance < 1 || e.performance > 5) {
    errors.push("Performance must be a whole number between 1 and 5.");
  }

  // --- Weekly hours + employment-type agreement ----------------------------
  const min = e.minHoursPerWeek;
  const max = e.maxHoursPerWeek;
  if (min != null && (min < 0 || min > 60)) errors.push("Minimum hours per week must be between 0 and 60.");
  if (max != null && (max < 0 || max > 60)) errors.push("Maximum hours per week must be between 0 and 60.");
  if (min != null && max != null && min > max) errors.push("Minimum hours per week cannot exceed maximum hours per week.");

  if (e.employmentType === "FULL_TIME") {
    if (max != null && max < FULL_TIME_MIN_WEEKLY_HOURS) {
      errors.push(`Full-time employees must be able to work at least ${FULL_TIME_MIN_WEEKLY_HOURS}h/week — raise the maximum or set them part-time.`);
    }
  } else {
    if (max != null && max > PART_TIME_MAX_WEEKLY_HOURS) {
      errors.push(`Part-time employees can work at most ${PART_TIME_MAX_WEEKLY_HOURS}h/week — lower the maximum or set them full-time.`);
    }
    if (min != null && min > PART_TIME_MAX_WEEKLY_HOURS) {
      errors.push(`Part-time minimum hours can't exceed ${PART_TIME_MAX_WEEKLY_HOURS}h/week.`);
    }
  }

  // --- Availability windows ------------------------------------------------
  for (const w of availability) {
    const day = DAY_NAMES[w.dayOfWeek] ?? `day ${w.dayOfWeek}`;
    const span = `${formatMinutesShort(w.startMin)}–${formatMinutesShort(w.endMin)}`;
    if (w.endMin <= w.startMin) errors.push(`Availability on ${day} (${span}): end time must be after start time.`);
    if (w.startMin < STORE_OPEN_MIN || w.endMin > STORE_CLOSE_MIN) {
      errors.push(`Availability on ${day} (${span}) is outside store hours (${HOURS}).`);
    }
  }
  // No duplicate / overlapping availability windows on the same day.
  for (let day = 0; day < 7; day++) {
    const wins = availability.filter((a) => a.dayOfWeek === day).sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < wins.length; i++) {
      if (wins[i].startMin < wins[i - 1].endMin) {
        errors.push(`Overlapping or duplicate availability windows on ${DAY_NAMES[day]}.`);
        break;
      }
    }
  }

  // --- Hard-set shifts -----------------------------------------------------
  const hardSetsPerDay = new Map<number, number>();
  for (const h of hardSets) {
    const day = DAY_NAMES[h.dayOfWeek] ?? `day ${h.dayOfWeek}`;
    const span = `${formatMinutesShort(h.startMin)}–${formatMinutesShort(h.endMin)}`;
    hardSetsPerDay.set(h.dayOfWeek, (hardSetsPerDay.get(h.dayOfWeek) ?? 0) + 1);

    if (h.endMin <= h.startMin) errors.push(`Hard-set shift on ${day} (${span}): end time must be after start time.`);
    if (h.startMin < STORE_OPEN_MIN || h.endMin > STORE_CLOSE_MIN) {
      errors.push(`Hard-set shift on ${day} (${span}) is outside store hours (${HOURS}).`);
    }
    // Must fall entirely within one of that day's availability windows.
    const wins = availability.filter((a) => a.dayOfWeek === h.dayOfWeek);
    if (wins.length === 0) {
      errors.push(`Hard-set shift on ${day} (${span}) but no availability is set for ${day}.`);
    } else if (!wins.some((w) => h.startMin >= w.startMin && h.endMin <= w.endMin)) {
      errors.push(`Hard-set shift on ${day} (${span}) is outside the employee's availability for ${day}.`);
    }
  }
  // At most one hard-set shift per day (the solver schedules one shift/day).
  for (const [day, count] of hardSetsPerDay) {
    if (count > 1) errors.push(`Only one hard-set shift is allowed per day (${DAY_NAMES[day]} has ${count}).`);
  }

  return errors;
}
