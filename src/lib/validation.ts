// ---------------------------------------------------------------------------
// Validation engine (spec build-order stage 2).
//
// Pure, dependency-free functions that:
//   * derive the unpaid-lunch break & paid minutes for a shift (spec §4),
//   * validate a single shift against the structural rules (slider live
//     validation, spec §7.5), and
//   * compute the full gap report for a set of assignments (spec §7.6).
//
// The same GapItem shape is produced by the Python solver, so the UI can
// recompute gaps locally after a manual edit without a solver round-trip.
// ---------------------------------------------------------------------------

import {
  DAY_NAMES,
  DAYS_PER_WEEK,
  DEFAULT_CONSTRAINTS,
  LUNCH_BREAK_MIN,
  LUNCH_BREAK_THRESHOLD_MIN,
  SLOTS_PER_DAY,
  SLOT_MINUTES,
  STORE_CLOSE_MIN,
  STORE_OPEN_MIN,
  type ConstraintConfig,
} from "./constants";
import { formatMinutesShort, snapToSlot } from "./time";
import type { GapItem, GapSeverity } from "./types";

export interface EmployeeLite {
  id: string;
  name: string;
  isManager: boolean;
  isGM: boolean;
  isMinor: boolean;
  availability: { dayOfWeek: number; startMin: number; endMin: number }[];
}

export interface ShiftLite {
  employeeId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  breakStarts: number[];
  paidMinutes: number;
}

// --- Shift derivation ------------------------------------------------------

/** Number of unpaid 30-min lunches: one per completed 5h interval (spec §4 + CA
 *  meal-break rule). <5h: none; 5h–<10h: 1; 10h+: 2. A shift of exactly 5h
 *  completes one interval and so earns a break. */
export function numBreaks(durationMin: number): number {
  if (durationMin < LUNCH_BREAK_THRESHOLD_MIN) return 0;
  return Math.floor(durationMin / LUNCH_BREAK_THRESHOLD_MIN);
}

/** Derive the unpaid-lunch breaks & paid minutes for a shift (spec §4).
 *  Breaks split the shift into roughly equal work segments. */
export function deriveShift(startMin: number, endMin: number): {
  breakStarts: number[];
  paidMinutes: number;
} {
  const duration = endMin - startMin;
  const n = numBreaks(duration);
  const breakStarts: number[] = [];
  if (n > 0) {
    const seg = Math.floor(duration / (n + 1));
    for (let i = 1; i <= n; i++) {
      let b = snapToSlot(startMin + i * seg - LUNCH_BREAK_MIN / 2);
      const lo = breakStarts.length ? breakStarts[breakStarts.length - 1] + LUNCH_BREAK_MIN + SLOT_MINUTES : startMin + SLOT_MINUTES;
      const hi = endMin - SLOT_MINUTES - LUNCH_BREAK_MIN;
      b = Math.max(lo, Math.min(b, hi));
      breakStarts.push(b);
    }
  }
  return { breakStarts, paidMinutes: duration - n * LUNCH_BREAK_MIN };
}

// General per-shift max. The minor 4h cap is a *school-night* rule, enforced
// separately in validateShift; on other nights minors follow the regular max.
export function maxShiftMinFor(emp: { isGM: boolean }, cfg: ConstraintConfig = DEFAULT_CONSTRAINTS): number {
  if (emp.isGM) return cfg.gmShiftMaxMin;
  return cfg.regularShiftMaxMin;
}

// --- Single-shift validation (slider live validation) ----------------------

export interface ShiftViolation {
  severity: GapSeverity;
  message: string;
}

/** Validate one proposed shift against the structural rules. Returns an empty
 *  array when the shift is legal. Used by the slider editor for live feedback. */
export function validateShift(emp: EmployeeLite, dayOfWeek: number, startMin: number, endMin: number, cfg: ConstraintConfig = DEFAULT_CONSTRAINTS): ShiftViolation[] {
  const out: ShiftViolation[] = [];
  const duration = endMin - startMin;

  if (endMin <= startMin) {
    out.push({ severity: "BLOCKING", message: "End time must be after start time." });
    return out;
  }
  if (startMin < STORE_OPEN_MIN || endMin > STORE_CLOSE_MIN) {
    out.push({
      severity: "BLOCKING",
      message: `Shift is outside store hours (${formatMinutesShort(STORE_OPEN_MIN)}–${formatMinutesShort(STORE_CLOSE_MIN)}).`,
    });
  }

  const maxShift = maxShiftMinFor(emp, cfg);
  if (duration < cfg.regularShiftMinMin) {
    out.push({
      severity: "BLOCKING",
      message: `Shift is shorter than the ${cfg.regularShiftMinMin / 60}h minimum.`,
    });
  }
  if (duration > maxShift) {
    // Shift-length maxes are soft guidelines for MANUAL edits: a manager may
    // deliberately schedule a crew member past the 8.5h max (or the GM past
    // 10.5h), so surface it as a warning rather than blocking the save. The
    // solver still enforces these as HARD caps when auto-generating
    // (solver/engine.py) — this only relaxes the manual-edit validation.
    out.push({
      severity: "WARNING",
      message: emp.isGM
        ? `Shift exceeds the ${(maxShift / 60).toFixed(1)}h GM guideline.`
        : `Shift exceeds the ${(maxShift / 60).toFixed(1)}h maximum (allowed for manual edits).`,
    });
  }

  // Minor school-night limits (spec §4).
  if (emp.isMinor && cfg.schoolNights.includes(dayOfWeek)) {
    if (endMin > cfg.minorLatestEndMin) {
      out.push({
        severity: "BLOCKING",
        message: `Minor cannot work past ${formatMinutesShort(cfg.minorLatestEndMin)} on a school night.`,
      });
    }
    if (duration > cfg.minorMaxShiftMin) {
      out.push({
        severity: "BLOCKING",
        message: `Minor cannot work more than ${cfg.minorMaxShiftMin / 60}h on a school night.`,
      });
    }
  }

  // Availability (spec §5): shift must fall inside one availability window.
  const windows = emp.availability.filter((a) => a.dayOfWeek === dayOfWeek);
  if (windows.length > 0) {
    const covered = windows.some((w) => startMin >= w.startMin && endMin <= w.endMin);
    if (!covered) {
      out.push({ severity: "BLOCKING", message: `${emp.name} is not available for this time on ${DAY_NAMES[dayOfWeek]}.` });
    }
  } else {
    out.push({ severity: "WARNING", message: `${emp.name} has no availability recorded for ${DAY_NAMES[dayOfWeek]}.` });
  }

  return out;
}

// --- Coverage --------------------------------------------------------------

/** Shift spans the slot, ignoring breaks (i.e. the person is on premises). */
function shiftSpansSlot(shift: ShiftLite, slotStartMin: number): boolean {
  return shift.startMin <= slotStartMin && shift.endMin >= slotStartMin + SLOT_MINUTES;
}

/** Shift actively staffs the slot — spans it AND is not on an unpaid break. */
function shiftCoversSlot(shift: ShiftLite, slotStartMin: number): boolean {
  if (!shiftSpansSlot(shift, slotStartMin)) return false;
  for (const b of shift.breakStarts) {
    if (slotStartMin >= b && slotStartMin < b + LUNCH_BREAK_MIN) return false; // on break
  }
  return true;
}

export interface DayCoverage {
  staff: number[]; // active staff (excludes anyone on break), length SLOTS_PER_DAY
  /** Managers present on premises, counting those on their lunch break — a
   *  manager on a 30-min break still satisfies the manager-presence rule. */
  managerPresent: number[];
  /** Managers actively staffing (excludes anyone on break) — used for the
   *  open/close-edge composition (one manager + one crew). */
  managerActive: number[];
}

export function coverageForDay(shifts: ShiftLite[], empById: Map<string, EmployeeLite>, dayOfWeek: number): DayCoverage {
  const staff = new Array(SLOTS_PER_DAY).fill(0);
  const managerPresent = new Array(SLOTS_PER_DAY).fill(0);
  const managerActive = new Array(SLOTS_PER_DAY).fill(0);
  const dayShifts = shifts.filter((s) => s.dayOfWeek === dayOfWeek);
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const slotStart = STORE_OPEN_MIN + i * SLOT_MINUTES;
    for (const sh of dayShifts) {
      const isMgr = empById.get(sh.employeeId)?.isManager;
      if (shiftCoversSlot(sh, slotStart)) {
        staff[i]++;
        if (isMgr) managerActive[i]++;
      }
      if (isMgr && shiftSpansSlot(sh, slotStart)) managerPresent[i]++;
    }
  }
  return { staff, managerPresent, managerActive };
}

function inRush(slotStartMin: number, cfg: ConstraintConfig): boolean {
  const slotEnd = slotStartMin + SLOT_MINUTES;
  return cfg.rushWindows.some((w) => slotStartMin >= w.startMin && slotEnd <= w.endMin);
}

function isLateNight(dayOfWeek: number, slotStartMin: number, cfg: ConstraintConfig): boolean {
  return slotStartMin >= cfg.lateNightCutoffMin[dayOfWeek];
}

/** First hour the store is open, or the last hour before it closes. */
function isOpenEdge(slotStartMin: number, cfg: ConstraintConfig): boolean {
  return slotStartMin < STORE_OPEN_MIN + cfg.openEdgeWindowMin || slotStartMin >= STORE_CLOSE_MIN - cfg.openEdgeWindowMin;
}

function absoluteStart(dayOfWeek: number, startMin: number): number {
  return dayOfWeek * 1440 + startMin;
}

function absoluteEnd(dayOfWeek: number, endMin: number): number {
  return dayOfWeek * 1440 + endMin;
}

// Merge consecutive slots that share a gap into a single ranged GapItem.
function emitRanges(
  dayOfWeek: number,
  flags: (null | { severity: GapSeverity; have: number; need: number })[],
  kind: GapItem["kind"],
  label: (have: number, need: number) => string,
  out: GapItem[],
) {
  let i = 0;
  while (i < flags.length) {
    const f = flags[i];
    if (!f) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < flags.length && flags[j + 1] && flags[j + 1]!.severity === f.severity && flags[j + 1]!.have === f.have && flags[j + 1]!.need === f.need) {
      j++;
    }
    const startMin = STORE_OPEN_MIN + i * SLOT_MINUTES;
    const endMin = STORE_OPEN_MIN + (j + 1) * SLOT_MINUTES;
    out.push({
      kind,
      severity: f.severity,
      dayOfWeek,
      startMin,
      endMin,
      message: `${DAY_NAMES[dayOfWeek]} ${formatMinutesShort(startMin)}–${formatMinutesShort(endMin)}: ${label(f.have, f.need)}`,
      detail: { have: f.have, need: f.need },
    });
    i = j + 1;
  }
}

/** Compute the full gap report for a week of assignments (spec §7.6). */
export function computeGapReport(employees: EmployeeLite[], shifts: ShiftLite[], cfg: ConstraintConfig = DEFAULT_CONSTRAINTS): GapItem[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const gaps: GapItem[] = [];
  const hrs = (min: number) => (min / 60).toFixed(0);

  for (let day = 0; day < 7; day++) {
    const { staff, managerPresent, managerActive } = coverageForDay(shifts, empById, day);
    const crewActive = staff.map((c, i) => c - managerActive[i]);

    // Manager presence (spec §2) – blocking whenever the store is "open" and
    // staffed but no manager is present. A manager on their lunch break still
    // counts as present (managerPresent includes break slots).
    const mgrFlags: (null | { severity: GapSeverity; have: number; need: number })[] = managerPresent.map((m, i) => {
      const anyOpenCoverage = staff[i] > 0;
      return m < cfg.managerMinOnSite && anyOpenCoverage
        ? ({ severity: "BLOCKING" as const, have: m, need: cfg.managerMinOnSite })
        : null;
    });
    emitRanges(day, mgrFlags, "MANAGER_ABSENCE", (h) => `no manager on site (have ${h})`, gaps);

    // Open/close edge hours – exactly one manager + one crew. Over-coverage is
    // blocking; missing crew is a warning. These windows supersede the
    // late-night / rush / baseline rules below.
    const edgeMax = cfg.openEdgeMaxManagers + cfg.openEdgeMaxCrew;
    const edgeOverFlags = staff.map((c, i) => {
      const slotStart = STORE_OPEN_MIN + i * SLOT_MINUTES;
      return isOpenEdge(slotStart, cfg) && (managerActive[i] > cfg.openEdgeMaxManagers || crewActive[i] > cfg.openEdgeMaxCrew)
        ? ({ severity: "BLOCKING" as const, have: c, need: edgeMax })
        : null;
    });
    emitRanges(day, edgeOverFlags, "OPEN_EDGE_OVER_CAP", (h, n) => `${h} working in the open/close hour (max ${n}: one manager + one crew)`, gaps);
    const edgeUnderFlags = staff.map((c, i) => {
      const slotStart = STORE_OPEN_MIN + i * SLOT_MINUTES;
      return isOpenEdge(slotStart, cfg) && (managerActive[i] < cfg.openEdgeMaxManagers || crewActive[i] < cfg.openEdgeMaxCrew)
        ? ({ severity: "WARNING" as const, have: c, need: edgeMax })
        : null;
    });
    emitRanges(day, edgeUnderFlags, "OPEN_EDGE_UNDERSTAFFED", (h, n) => `${h} working in the open/close hour (want ${n}: one manager + one crew)`, gaps);

    // Late-night minimum target. The final close hour is handled by the
    // open/close-edge rule above.
    const lateFlags = staff.map((c, i) => {
      const slotStart = STORE_OPEN_MIN + i * SLOT_MINUTES;
      return isLateNight(day, slotStart, cfg) && !isOpenEdge(slotStart, cfg) && c < cfg.lateNightMinStaff
        ? ({ severity: "WARNING" as const, have: c, need: cfg.lateNightMinStaff })
        : null;
    });
    emitRanges(day, lateFlags, "LATE_NIGHT_BELOW_TARGET", (h, n) => `late-night staffed ${h} (target at least ${n})`, gaps);

    // Rush coverage (spec §3.1).
    const rushFlags = staff.map((c, i) => {
      const slotStart = STORE_OPEN_MIN + i * SLOT_MINUTES;
      return inRush(slotStart, cfg) && !isLateNight(day, slotStart, cfg) && !isOpenEdge(slotStart, cfg) && c < cfg.rushTargetStaff
        ? ({ severity: "WARNING" as const, have: c, need: cfg.rushTargetStaff })
        : null;
    });
    emitRanges(day, rushFlags, "RUSH_BELOW_TARGET", (h, n) => `rush staffed ${h} (target ${n})`, gaps);

    // Baseline coverage (spec §3.2): report only the floor. The 4-staff target
    // remains a solver preference, but lunch breaks commonly dip to 3 and should
    // not create warning noise.
    const baseFlags = staff.map((c, i) => {
      const slotStart = STORE_OPEN_MIN + i * SLOT_MINUTES;
      if (inRush(slotStart, cfg) || isLateNight(day, slotStart, cfg) || isOpenEdge(slotStart, cfg)) return null;
      if (c < cfg.baselineFloorStaff) return { severity: "BLOCKING" as const, have: c, need: cfg.baselineFloorStaff };
      return null;
    });
    emitRanges(
      day,
      baseFlags,
      "BASELINE_BELOW_FLOOR",
      (h, n) => `below the ${n}-staff hard floor (have ${h})`,
      gaps,
    );

    // Daily labour (spec §2).
    const dayPaid = shifts.filter((s) => s.dayOfWeek === day).reduce((a, s) => a + s.paidMinutes, 0);
    if (dayPaid > 0 && dayPaid < cfg.dailyLaborMinMin) {
      gaps.push(dayLaborGap(day, "LABOR_BELOW_MIN", "WARNING", dayPaid, cfg.dailyLaborMinMin, `below the ${hrs(cfg.dailyLaborMinMin)}h daily minimum`));
    } else if (dayPaid > cfg.dailyLaborHardCapMin) {
      gaps.push(dayLaborGap(day, "LABOR_OVER_HARD_CAP", "BLOCKING", dayPaid, cfg.dailyLaborHardCapMin, `over the ${hrs(cfg.dailyLaborHardCapMin)}h daily hard cap`));
    } else if (dayPaid > cfg.dailyLaborSoftCapMin) {
      gaps.push(dayLaborGap(day, "LABOR_OVER_SOFT_CAP", "WARNING", dayPaid, cfg.dailyLaborSoftCapMin, `over the ${hrs(cfg.dailyLaborSoftCapMin)}h daily soft cap`));
    }
  }

  // Per-shift structural checks (minor rules, shift length, availability).
  for (const sh of shifts) {
    const emp = empById.get(sh.employeeId);
    if (!emp) continue;
    for (const v of validateShift(emp, sh.dayOfWeek, sh.startMin, sh.endMin, cfg)) {
      gaps.push({
        kind: v.message.toLowerCase().includes("minor") ? "MINOR_RULE" : v.message.toLowerCase().includes("avail") ? "AVAILABILITY" : "SHIFT_RULE",
        severity: v.severity,
        dayOfWeek: sh.dayOfWeek,
        startMin: sh.startMin,
        endMin: sh.endMin,
        message: `${emp.name}: ${v.message}`,
        detail: { employeeId: emp.id },
      });
    }
  }

  // Minimum days off per week: each employee must work <= maxWorkingDays.
  const maxWorkingDays = DAYS_PER_WEEK - cfg.minDaysOffPerWeek;
  const daysWorked = new Map<string, Set<number>>();
  for (const sh of shifts) {
    if (!daysWorked.has(sh.employeeId)) daysWorked.set(sh.employeeId, new Set());
    daysWorked.get(sh.employeeId)!.add(sh.dayOfWeek);
  }
  for (const [employeeId, days] of daysWorked) {
    if (days.size > maxWorkingDays) {
      const emp = empById.get(employeeId);
      gaps.push({
        kind: "DAYS_OFF",
        severity: "BLOCKING",
        dayOfWeek: null,
        startMin: null,
        endMin: null,
        message: `${emp?.name ?? employeeId}: scheduled ${days.size} days — needs at least ${cfg.minDaysOffPerWeek} days off (max ${maxWorkingDays} working days).`,
        detail: { employeeId, daysWorked: days.size, max: maxWorkingDays },
      });
    }
  }

  // Minimum rest between adjacent shifts. The solver enforces this for
  // selectable shifts; this catches manual edits and fixed-vs-fixed hard-sets.
  const shiftsByEmp = new Map<string, ShiftLite[]>();
  for (const sh of shifts) {
    if (!shiftsByEmp.has(sh.employeeId)) shiftsByEmp.set(sh.employeeId, []);
    shiftsByEmp.get(sh.employeeId)!.push(sh);
  }
  for (const [employeeId, empShifts] of shiftsByEmp) {
    const emp = empById.get(employeeId);
    empShifts.sort((a, b) => {
      const byStart = absoluteStart(a.dayOfWeek, a.startMin) - absoluteStart(b.dayOfWeek, b.startMin);
      return byStart || absoluteEnd(a.dayOfWeek, a.endMin) - absoluteEnd(b.dayOfWeek, b.endMin);
    });
    for (let i = 1; i < empShifts.length; i++) {
      const prev = empShifts[i - 1];
      const curr = empShifts[i];
      const rest = absoluteStart(curr.dayOfWeek, curr.startMin) - absoluteEnd(prev.dayOfWeek, prev.endMin);
      if (rest >= cfg.minRestBetweenShiftsMin) continue;
      const message =
        rest < 0
          ? `${emp?.name ?? employeeId}: shifts overlap from ${DAY_NAMES[prev.dayOfWeek]} ${formatMinutesShort(prev.startMin)}-${formatMinutesShort(prev.endMin)} to ${DAY_NAMES[curr.dayOfWeek]} ${formatMinutesShort(curr.startMin)}-${formatMinutesShort(curr.endMin)}; minimum rest is ${cfg.minRestBetweenShiftsMin / 60}h.`
          : `${emp?.name ?? employeeId}: only ${(rest / 60).toFixed(1)}h between ${DAY_NAMES[prev.dayOfWeek]} shift ending ${formatMinutesShort(prev.endMin)} and ${DAY_NAMES[curr.dayOfWeek]} shift starting ${formatMinutesShort(curr.startMin)}; minimum is ${cfg.minRestBetweenShiftsMin / 60}h.`;
      gaps.push({
        kind: "REST_PERIOD",
        severity: "BLOCKING",
        dayOfWeek: curr.dayOfWeek,
        startMin: curr.startMin,
        endMin: curr.endMin,
        message,
        detail: {
          employeeId,
          previousDayOfWeek: prev.dayOfWeek,
          previousEndMin: prev.endMin,
          restMinutes: rest,
          need: cfg.minRestBetweenShiftsMin,
        },
      });
    }
  }

  return gaps;
}

function dayLaborGap(day: number, kind: GapItem["kind"], severity: GapSeverity, have: number, need: number, label: string): GapItem {
  return {
    kind,
    severity,
    dayOfWeek: day,
    startMin: null,
    endMin: null,
    message: `${DAY_NAMES[day]}: ${(have / 60).toFixed(1)}h scheduled — ${label}.`,
    detail: { have, need },
  };
}
