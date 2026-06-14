// ---------------------------------------------------------------------------
// Store operating parameters & constraint targets (spec §2, §3, §4).
//
// This file is the single source of truth for the scheduling parameters. The
// values are passed to the Python solver in each solve request so the solver
// and the app never disagree. The Python service mirrors these as defaults.
// ---------------------------------------------------------------------------

/** Minutes from midnight the store opens (5:00 AM). */
export const STORE_OPEN_MIN = 5 * 60; // 300
/** Minutes from midnight the store closes (12:30 AM next day = 24:30). */
export const STORE_CLOSE_MIN = 24 * 60 + 30; // 1470
/** Scheduling granularity. */
export const SLOT_MINUTES = 15;
/**
 * Number of 15-minute slots in a store day.
 * (1470 - 300) / 15 = 78. NOTE: the spec text says "82 slots"; that figure does
 * not match the stated 5:00 AM–12:30 AM hours (which yield 78). We derive the
 * count from the hours above so the two never drift; adjust the hours here if
 * the real store window differs. See README "Known spec ambiguities".
 */
export const SLOTS_PER_DAY = (STORE_CLOSE_MIN - STORE_OPEN_MIN) / SLOT_MINUTES; // 78

/** 0 = Monday … 6 = Sunday (so the cutoff array indexes line up). */
export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export const DAYS_PER_WEEK = 7;

// --- Manager presence (spec §2) -------------------------------------------
export const MANAGER_MIN_ON_SITE = 1;

// --- Late-night reduced coverage, HARD CAP (spec §3.3) --------------------
// Max staff scheduled AFTER each day's cutoff (minutes from midnight).
export const LATE_NIGHT_CUTOFF_MIN: number[] = [
  22 * 60, // Monday    10:00 PM
  23 * 60, // Tuesday   11:00 PM
  22 * 60 + 30, // Wednesday 10:30 PM
  23 * 60, // Thursday  11:00 PM
  23 * 60 + 30, // Friday    11:30 PM
  23 * 60 + 30, // Saturday  11:30 PM
  23 * 60 + 30, // Sunday    11:30 PM
];
export const LATE_NIGHT_MAX_STAFF = 2;

// --- Rush coverage, SOFT (spec §3.1) --------------------------------------
export const RUSH_TARGET_STAFF = 5;
export const RUSH_WINDOWS: { label: string; startMin: number; endMin: number }[] = [
  { label: "Lunch rush", startMin: 11 * 60, endMin: 13 * 60 }, // 11:00 AM–1:00 PM
  { label: "Dinner rush", startMin: 18 * 60, endMin: 20 * 60 }, // 6:00 PM–8:00 PM
];

// --- Baseline coverage, SOFT target / HARD floor (spec §3.2) --------------
export const BASELINE_FLOOR_STAFF = 3; // hard floor (reported as blocking)
export const BASELINE_TARGET_STAFF = 4; // preferred

// --- Daily labour target (spec §2) ----------------------------------------
export const DAILY_LABOR_MIN_MIN = 70 * 60; // 4200  (minimum)
export const DAILY_LABOR_SOFT_CAP_MIN = 75 * 60; // 4500  (soft cap)
export const DAILY_LABOR_HARD_CAP_MIN = 80 * 60; // 4800  (hard cap)

// --- Shift rules (spec §4) -------------------------------------------------
export const REGULAR_SHIFT_MIN_MIN = 4 * 60; // 240
export const REGULAR_SHIFT_MAX_MIN = 8 * 60 + 30; // 510 (8.5h)
export const GM_SHIFT_MAX_MIN = 10 * 60 + 30; // 630 (10.5h)
export const LUNCH_BREAK_THRESHOLD_MIN = 5 * 60; // shifts OVER 5h get a break
export const LUNCH_BREAK_MIN = 30; // 30-min unpaid break

// --- Minor school-night limits (spec §4) ----------------------------------
export const MINOR_MAX_SHIFT_MIN = 4 * 60; // 240 (<= 4h)
export const MINOR_LATEST_END_MIN = 22 * 60; // 1320 (not past 10:00 PM)
/**
 * School nights = the night before a school day. With 0=Monday this is
 * Sun, Mon, Tue, Wed, Thu. Fri & Sat are treated as non-school nights.
 * (Simplifying assumption — see README.)
 */
export const SCHOOL_NIGHTS: number[] = [6, 0, 1, 2, 3];

// --- Weekly days off -------------------------------------------------------
/** Every employee must get at least this many days off per week (i.e. work at
 *  most daysPerWeek - this many days). */
export const MIN_DAYS_OFF_PER_WEEK = 2;

// --- Employment-type hour thresholds (used for input validation) -----------
/** A full-time employee's weekly hour cap must be at least this. */
export const FULL_TIME_MIN_WEEKLY_HOURS = 30;
/** A part-time employee's weekly hours must not exceed this. */
export const PART_TIME_MAX_WEEKLY_HOURS = 35;

// --- Solver tuning ---------------------------------------------------------
/** Start-time grid for candidate shift generation (minutes). */
export const CANDIDATE_START_STEP_MIN = 30;
/** Duration grid for candidate shift generation (minutes). */
export const CANDIDATE_DURATION_STEP_MIN = 30;

/** Bundle of every parameter sent to the solver, so it stays in lock-step. */
export function storeConfig() {
  return {
    storeOpenMin: STORE_OPEN_MIN,
    storeCloseMin: STORE_CLOSE_MIN,
    slotMinutes: SLOT_MINUTES,
    slotsPerDay: SLOTS_PER_DAY,
    daysPerWeek: DAYS_PER_WEEK,
    managerMinOnSite: MANAGER_MIN_ON_SITE,
    lateNightCutoffMin: LATE_NIGHT_CUTOFF_MIN,
    lateNightMaxStaff: LATE_NIGHT_MAX_STAFF,
    rushTargetStaff: RUSH_TARGET_STAFF,
    rushWindows: RUSH_WINDOWS,
    baselineFloorStaff: BASELINE_FLOOR_STAFF,
    baselineTargetStaff: BASELINE_TARGET_STAFF,
    dailyLaborMinMin: DAILY_LABOR_MIN_MIN,
    dailyLaborSoftCapMin: DAILY_LABOR_SOFT_CAP_MIN,
    dailyLaborHardCapMin: DAILY_LABOR_HARD_CAP_MIN,
    regularShiftMinMin: REGULAR_SHIFT_MIN_MIN,
    regularShiftMaxMin: REGULAR_SHIFT_MAX_MIN,
    gmShiftMaxMin: GM_SHIFT_MAX_MIN,
    lunchBreakThresholdMin: LUNCH_BREAK_THRESHOLD_MIN,
    lunchBreakMin: LUNCH_BREAK_MIN,
    minorMaxShiftMin: MINOR_MAX_SHIFT_MIN,
    minorLatestEndMin: MINOR_LATEST_END_MIN,
    schoolNights: SCHOOL_NIGHTS,
    minDaysOffPerWeek: MIN_DAYS_OFF_PER_WEEK,
    candidateStartStepMin: CANDIDATE_START_STEP_MIN,
    candidateDurationStepMin: CANDIDATE_DURATION_STEP_MIN,
  };
}

export type StoreConfig = ReturnType<typeof storeConfig>;
