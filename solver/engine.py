"""CP-SAT scheduling engine (spec build-order stage 3).

Approach: shift-selection. For every (employee, day) we enumerate a set of
candidate shifts that already respect the structural rules (availability, shift
length, GM exception, minor school-night limits). A boolean decision variable
picks at most one candidate per employee per day. Coverage, manager presence,
labour and priority weighting are then expressed over those variables.

Design philosophy (spec §1): soft constraints over hard failures. Only true
upper-bound caps are modelled as hard constraints (late-night max, daily labour
hard cap, weekly max hours) plus the structural rules baked into candidate
generation. Everything else is a weighted penalty so the solver always returns
its best feasible schedule, and unmet items come back as a gap report.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from models import Assignment, Employee, GapItem, SolveRequest, SolveResponse, StoreConfig

# --- Objective weights (heuristic; tune freely) ----------------------------
W_MANAGER = 1000      # per missing manager, per slot
W_BASE_FLOOR = 250    # per staff below the hard floor (3), per slot
W_BASE_TARGET = 25    # per staff below the baseline target (4), per slot
W_RUSH = 40           # per staff below the rush target (5), per rush slot
W_LABOR_MIN = 2       # per minute below the daily 70h minimum
W_LABOR_OVER = 3      # per minute over the daily 75h soft cap
W_MINHOURS = 1        # per minute an employee is below their weekly minimum
W_PRIORITY = 1        # reward per priority-point * hour assigned
# RESOLVE-mode stability weights
W_STABILITY = 2000    # reward for keeping an identical existing shift
W_CHURN = 40          # penalty for adding a shift on a previously-empty day
W_DROP = 300          # penalty for dropping a day that previously had a shift


@dataclass
class Candidate:
    emp_id: str
    day: int
    start: int
    end: int
    break_start: int | None
    paid: int
    slots: list[int]
    is_manager: bool
    coeff: int = 0  # per-candidate objective coefficient (prefs + priority)


@dataclass
class FixedShift:
    emp_id: str
    day: int
    start: int
    end: int
    break_start: int | None
    paid: int
    slots: list[int]
    is_manager: bool


def snap(value: int, step: int) -> int:
    return int(round(value / step)) * step


def derive_break(start: int, end: int, cfg: StoreConfig) -> tuple[int | None, int]:
    """Unpaid 30-min lunch for shifts over 5h, centred & slot-aligned (spec §4)."""
    duration = end - start
    if duration > cfg.lunchBreakThresholdMin:
        b = snap(start + duration // 2 - cfg.lunchBreakMin // 2, cfg.slotMinutes)
        b = max(start + cfg.slotMinutes, min(b, end - cfg.slotMinutes - cfg.lunchBreakMin))
        return b, duration - cfg.lunchBreakMin
    return None, duration


def covered_slots(start: int, end: int, break_start: int | None, cfg: StoreConfig) -> list[int]:
    slots: list[int] = []
    n = cfg.slotsPerDay
    for s in range(n):
        slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
        if slot_min < start or slot_min + cfg.slotMinutes > end:
            continue
        if break_start is not None and break_start <= slot_min < break_start + cfg.lunchBreakMin:
            continue
        slots.append(s)
    return slots


def priority_score(emp: Employee) -> int:
    """Higher = hours should flow here first (spec §5.1). Weighted by employment
    type (FT over PT) and performance."""
    score = 3 if emp.employmentType == "FULL_TIME" else 1
    score += emp.performance
    return score


def duration_set(emp: Employee, school_night: bool, cfg: StoreConfig) -> list[int]:
    cap = cfg.regularShiftMaxMin
    if emp.isGM:
        cap = cfg.gmShiftMaxMin
    if emp.isMinor and school_night:
        cap = min(cap, cfg.minorMaxShiftMin)
    base = [240, 300, 360, 420, 480, 510, 570, 630]
    durs = sorted({d for d in base if cfg.regularShiftMinMin <= d <= cap} | {cap})
    return [d for d in durs if d >= cfg.regularShiftMinMin]


def generate_candidates(emp: Employee, day: int, cfg: StoreConfig) -> list[Candidate]:
    windows = [a for a in emp.availability if a.dayOfWeek == day]
    if not windows:
        return []
    school_night = emp.isMinor and day in cfg.schoolNights
    latest_end = cfg.minorLatestEndMin if school_night else cfg.storeCloseMin
    durs = duration_set(emp, school_night, cfg)
    out: list[Candidate] = []
    seen: set[tuple[int, int]] = set()
    for w in windows:
        win_start = max(w.startMin, cfg.storeOpenMin)
        win_end = min(w.endMin, cfg.storeCloseMin, latest_end)
        # Align first start up to the candidate start grid.
        start = win_start
        if start % cfg.candidateStartStepMin != 0:
            start += cfg.candidateStartStepMin - (start % cfg.candidateStartStepMin)
        while start + cfg.regularShiftMinMin <= win_end:
            for dur in durs:
                end = start + dur
                if end > win_end:
                    continue
                key = (start, end)
                if key in seen:
                    continue
                seen.add(key)
                bstart, paid = derive_break(start, end, cfg)
                out.append(
                    Candidate(
                        emp_id=emp.id,
                        day=day,
                        start=start,
                        end=end,
                        break_start=bstart,
                        paid=paid,
                        slots=covered_slots(start, end, bstart, cfg),
                        is_manager=emp.isManager,
                    )
                )
            start += cfg.candidateStartStepMin
    return out


@dataclass
class Model:
    employees: dict[str, Employee]
    cfg: StoreConfig
    candidates: list[Candidate] = field(default_factory=list)
    fixed: list[FixedShift] = field(default_factory=list)


def build_fixed_and_candidates(req: SolveRequest) -> Model:
    cfg = req.config
    employees = {e.id: e for e in req.employees}
    m = Model(employees=employees, cfg=cfg)
    for emp in req.employees:
        hardset_days = {h.dayOfWeek for h in emp.hardSets}
        # Hard-set shifts are fixed constants (spec §5).
        for h in emp.hardSets:
            bstart, paid = derive_break(h.startMin, h.endMin, cfg)
            m.fixed.append(
                FixedShift(
                    emp_id=emp.id,
                    day=h.dayOfWeek,
                    start=h.startMin,
                    end=h.endMin,
                    break_start=bstart,
                    paid=paid,
                    slots=covered_slots(h.startMin, h.endMin, bstart, cfg),
                    is_manager=emp.isManager,
                )
            )
        for day in range(cfg.daysPerWeek):
            if day in hardset_days:
                continue  # day already fixed
            m.candidates.extend(generate_candidates(emp, day, cfg))
    return m


def apply_objective_coeffs(m: Model, req: SolveRequest) -> None:
    # Priority coefficient folded into each candidate.
    existing = {(a.employeeId, a.dayOfWeek): a for a in (req.existingAssignments or [])} if req.mode == "RESOLVE" else {}
    for c in m.candidates:
        emp = m.employees[c.emp_id]
        # Priority reward (negative = good): score * hours.
        c.coeff -= W_PRIORITY * priority_score(emp) * (c.paid // 60)
        # RESOLVE stability: reward keeping an identical shift.
        ex = existing.get((c.emp_id, c.day))
        if ex is not None and ex.startMin == c.start and ex.endMin == c.end:
            c.coeff -= W_STABILITY


def solve(req: SolveRequest) -> SolveResponse:
    t0 = time.time()
    cfg = req.config
    m = build_fixed_and_candidates(req)
    model = cp_model.CpModel()
    apply_objective_coeffs(m, req)

    num_emp = max(1, len(req.employees))
    x: list[cp_model.IntVar] = [model.NewBoolVar(f"x{i}") for i in range(len(m.candidates))]

    # At most one shift per employee per day.
    groups: dict[tuple[str, int], list[int]] = {}
    for i, c in enumerate(m.candidates):
        groups.setdefault((c.emp_id, c.day), []).append(i)
    for idxs in groups.values():
        model.Add(sum(x[i] for i in idxs) <= 1)

    # Pre-index candidates & fixed shifts by (day, slot).
    cand_by_slot: dict[tuple[int, int], list[int]] = {}
    mgr_cand_by_slot: dict[tuple[int, int], list[int]] = {}
    base_staff: dict[tuple[int, int], int] = {}
    base_mgr: dict[tuple[int, int], int] = {}
    for i, c in enumerate(m.candidates):
        for s in c.slots:
            cand_by_slot.setdefault((c.day, s), []).append(i)
            if c.is_manager:
                mgr_cand_by_slot.setdefault((c.day, s), []).append(i)
    for f in m.fixed:
        for s in f.slots:
            base_staff[(f.day, s)] = base_staff.get((f.day, s), 0) + 1
            if f.is_manager:
                base_mgr[(f.day, s)] = base_mgr.get((f.day, s), 0) + 1

    obj: list = []  # list of cp_model linear terms

    # Per-candidate coefficients (priority, stability).
    for i, c in enumerate(m.candidates):
        if c.coeff != 0:
            obj.append(c.coeff * x[i])

    def in_rush(slot_min: int) -> bool:
        return any(rw.startMin <= slot_min and slot_min + cfg.slotMinutes <= rw.endMin for rw in cfg.rushWindows)

    def is_late(day: int, slot_min: int) -> bool:
        return slot_min >= cfg.lateNightCutoffMin[day]

    # Coverage-driven constraints & penalties per (day, slot).
    for day in range(cfg.daysPerWeek):
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            cand_idxs = cand_by_slot.get((day, s), [])
            mgr_idxs = mgr_cand_by_slot.get((day, s), [])
            bstaff = base_staff.get((day, s), 0)
            bmgr = base_mgr.get((day, s), 0)

            staff = model.NewIntVar(0, num_emp, f"staff_{day}_{s}")
            model.Add(staff == sum(x[i] for i in cand_idxs) + bstaff)
            mgr = model.NewIntVar(0, num_emp, f"mgr_{day}_{s}")
            model.Add(mgr == sum(x[i] for i in mgr_idxs) + bmgr)

            # HARD: late-night cap (spec §3.3).
            if is_late(day, slot_min):
                model.Add(staff <= cfg.lateNightMaxStaff)

            # SOFT: manager presence (spec §2) — every open slot wants >=1 manager.
            mgr_short = model.NewIntVar(0, cfg.managerMinOnSite, f"mshort_{day}_{s}")
            model.Add(mgr_short >= cfg.managerMinOnSite - mgr)
            obj.append(W_MANAGER * mgr_short)

            if is_late(day, slot_min):
                continue  # late-night: only the cap applies (closing crew)

            if in_rush(slot_min):
                rush_short = model.NewIntVar(0, cfg.rushTargetStaff, f"rshort_{day}_{s}")
                model.Add(rush_short >= cfg.rushTargetStaff - staff)
                obj.append(W_RUSH * rush_short)
            else:
                # Baseline: hard floor (3) + preferred target (4).
                floor_short = model.NewIntVar(0, cfg.baselineFloorStaff, f"fshort_{day}_{s}")
                model.Add(floor_short >= cfg.baselineFloorStaff - staff)
                obj.append(W_BASE_FLOOR * floor_short)
                tgt_short = model.NewIntVar(0, cfg.baselineTargetStaff, f"tshort_{day}_{s}")
                model.Add(tgt_short >= cfg.baselineTargetStaff - staff)
                obj.append(W_BASE_TARGET * tgt_short)

    # Daily labour (spec §2) + weekly hour bounds (spec §5).
    paid_by_day: dict[int, list] = {d: [] for d in range(cfg.daysPerWeek)}
    paid_by_day_base: dict[int, int] = {d: 0 for d in range(cfg.daysPerWeek)}
    paid_by_emp: dict[str, list] = {}
    paid_by_emp_base: dict[str, int] = {}
    for i, c in enumerate(m.candidates):
        paid_by_day[c.day].append(c.paid * x[i])
        paid_by_emp.setdefault(c.emp_id, []).append(c.paid * x[i])
    for f in m.fixed:
        paid_by_day_base[f.day] += f.paid
        paid_by_emp_base[f.emp_id] = paid_by_emp_base.get(f.emp_id, 0) + f.paid

    big = num_emp * cfg.gmShiftMaxMin
    for day in range(cfg.daysPerWeek):
        daypaid = model.NewIntVar(0, big, f"daypaid_{day}")
        model.Add(daypaid == sum(paid_by_day[day]) + paid_by_day_base[day])
        # HARD: daily labour hard cap (spec §2).
        model.Add(daypaid <= cfg.dailyLaborHardCapMin)
        # SOFT: below daily minimum / over soft cap.
        lshort = model.NewIntVar(0, cfg.dailyLaborMinMin, f"lshort_{day}")
        model.Add(lshort >= cfg.dailyLaborMinMin - daypaid)
        obj.append(W_LABOR_MIN * lshort)
        lover = model.NewIntVar(0, big, f"lover_{day}")
        model.Add(lover >= daypaid - cfg.dailyLaborSoftCapMin)
        obj.append(W_LABOR_OVER * lover)

    for emp in req.employees:
        terms = paid_by_emp.get(emp.id, [])
        base = paid_by_emp_base.get(emp.id, 0)
        weekpaid = model.NewIntVar(0, big * cfg.daysPerWeek, f"week_{emp.id}")
        model.Add(weekpaid == (sum(terms) if terms else 0) + base)
        if emp.maxHoursPerWeek is not None:
            model.Add(weekpaid <= emp.maxHoursPerWeek * 60)  # HARD upper bound
        if emp.minHoursPerWeek is not None:
            mshort = model.NewIntVar(0, emp.minHoursPerWeek * 60, f"weekshort_{emp.id}")
            model.Add(mshort >= emp.minHoursPerWeek * 60 - weekpaid)
            obj.append(W_MINHOURS * mshort)

    # HARD: minimum days off per week. Every employee works at most
    # (daysPerWeek - minDaysOffPerWeek) days, e.g. <= 5 working days => 2 off.
    # Each (emp, day) group already sums to <= 1, so the sum of an employee's
    # candidate vars counts their chosen working days; hard-set days are added.
    max_working_days = cfg.daysPerWeek - cfg.minDaysOffPerWeek
    emp_cand_idxs: dict[str, list[int]] = {}
    for i, c in enumerate(m.candidates):
        emp_cand_idxs.setdefault(c.emp_id, []).append(i)
    emp_fixed_days: dict[str, set[int]] = {}
    for f in m.fixed:
        emp_fixed_days.setdefault(f.emp_id, set()).add(f.day)
    for emp in req.employees:
        idxs = emp_cand_idxs.get(emp.id, [])
        fixed_days = len(emp_fixed_days.get(emp.id, set()))
        rhs = max_working_days - fixed_days
        if idxs and rhs >= 0:
            model.Add(sum(x[i] for i in idxs) <= rhs)
        # If rhs < 0 the hard-set shifts alone already exceed the cap; those are
        # locked, so nothing to constrain here (surfaced in the gap report).

    # RESOLVE stability: discourage churn & dropped days (spec §6, F-2).
    if req.mode == "RESOLVE" and req.existingAssignments:
        existing_days = {(a.employeeId, a.dayOfWeek) for a in req.existingAssignments}
        for (emp_id, day), idxs in groups.items():
            had = (emp_id, day) in existing_days
            worked = sum(x[i] for i in idxs)
            if had:
                # Penalty when a previously-worked day is dropped.
                dropped = model.NewBoolVar(f"drop_{emp_id}_{day}")
                model.Add(worked == 0).OnlyEnforceIf(dropped)
                model.Add(worked >= 1).OnlyEnforceIf(dropped.Not())
                obj.append(W_DROP * dropped)
            else:
                obj.append(W_CHURN * worked)  # adding a new working day costs a little

    model.Minimize(sum(obj))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(req.timeLimitSeconds)
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    assignments: list[Assignment] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i, c in enumerate(m.candidates):
            if solver.Value(x[i]) == 1:
                assignments.append(
                    Assignment(
                        employeeId=c.emp_id,
                        dayOfWeek=c.day,
                        startMin=c.start,
                        endMin=c.end,
                        breakStartMin=c.break_start,
                        paidMinutes=c.paid,
                        locked=False,
                        source="SOLVER",
                    )
                )
    # Fixed (hard-set) shifts are always part of the schedule.
    for f in m.fixed:
        assignments.append(
            Assignment(
                employeeId=f.emp_id,
                dayOfWeek=f.day,
                startMin=f.start,
                endMin=f.end,
                breakStartMin=f.break_start,
                paidMinutes=f.paid,
                locked=True,
                source="HARDSET",
            )
        )

    gaps = compute_gaps(req.employees, assignments, cfg)
    obj_val = solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None
    return SolveResponse(
        status=status_name,
        objectiveValue=obj_val,
        solveMs=int((time.time() - t0) * 1000),
        assignments=assignments,
        gaps=gaps,
    )


# --- Gap report (mirrors src/lib/validation.ts) ----------------------------

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _fmt(minute: int) -> str:
    wrapped = minute % 1440
    h = wrapped // 60
    mm = wrapped % 60
    period = "AM" if (h < 12 or h == 24) else "PM"
    h12 = h % 12 or 12
    return f"{h12} {period}" if mm == 0 else f"{h12}:{mm:02d} {period}"


def _covers(a: Assignment, slot_min: int, cfg: StoreConfig) -> bool:
    if a.startMin > slot_min or a.endMin < slot_min + cfg.slotMinutes:
        return False
    if a.breakStartMin is not None and a.breakStartMin <= slot_min < a.breakStartMin + cfg.lunchBreakMin:
        return False
    return True


def _emit_ranges(day, flags, kind, label, out: list[GapItem], cfg: StoreConfig):
    i = 0
    n = len(flags)
    while i < n:
        f = flags[i]
        if f is None:
            i += 1
            continue
        j = i
        while j + 1 < n and flags[j + 1] is not None and flags[j + 1] == f:
            j += 1
        start_min = cfg.storeOpenMin + i * cfg.slotMinutes
        end_min = cfg.storeOpenMin + (j + 1) * cfg.slotMinutes
        sev, have, need = f
        out.append(
            GapItem(
                kind=kind,
                severity=sev,
                dayOfWeek=day,
                startMin=start_min,
                endMin=end_min,
                message=f"{DAY_NAMES[day]} {_fmt(start_min)}–{_fmt(end_min)}: {label(have, need)}",
                detail={"have": have, "need": need},
            )
        )
        i = j + 1


def compute_gaps(employees: list[Employee], assignments: list[Assignment], cfg: StoreConfig) -> list[GapItem]:
    emp_by_id = {e.id: e for e in employees}
    gaps: list[GapItem] = []

    def in_rush(slot_min: int) -> bool:
        return any(rw.startMin <= slot_min and slot_min + cfg.slotMinutes <= rw.endMin for rw in cfg.rushWindows)

    for day in range(cfg.daysPerWeek):
        day_shifts = [a for a in assignments if a.dayOfWeek == day]
        staff = [0] * cfg.slotsPerDay
        mgr = [0] * cfg.slotsPerDay
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            for a in day_shifts:
                if _covers(a, slot_min, cfg):
                    staff[s] += 1
                    if emp_by_id.get(a.employeeId) and emp_by_id[a.employeeId].isManager:
                        mgr[s] += 1

        mgr_flags = [
            ("BLOCKING", mgr[s], cfg.managerMinOnSite) if (staff[s] > 0 and mgr[s] < cfg.managerMinOnSite) else None
            for s in range(cfg.slotsPerDay)
        ]
        _emit_ranges(day, mgr_flags, "MANAGER_ABSENCE", lambda h, n: f"no manager on site (have {h})", gaps, cfg)

        late_flags = []
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            late = slot_min >= cfg.lateNightCutoffMin[day]
            late_flags.append(("BLOCKING", staff[s], cfg.lateNightMaxStaff) if (late and staff[s] > cfg.lateNightMaxStaff) else None)
        _emit_ranges(day, late_flags, "LATE_NIGHT_OVER_CAP", lambda h, n: f"{h} staff after cutoff (max {n})", gaps, cfg)

        rush_flags = []
        base_flags = []
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            late = slot_min >= cfg.lateNightCutoffMin[day]
            if late:
                rush_flags.append(None)
                base_flags.append(None)
                continue
            if in_rush(slot_min):
                rush_flags.append(("WARNING", staff[s], cfg.rushTargetStaff) if staff[s] < cfg.rushTargetStaff else None)
                base_flags.append(None)
            else:
                rush_flags.append(None)
                if staff[s] < cfg.baselineFloorStaff:
                    base_flags.append(("BLOCKING", staff[s], cfg.baselineFloorStaff))
                elif staff[s] < cfg.baselineTargetStaff:
                    base_flags.append(("WARNING", staff[s], cfg.baselineTargetStaff))
                else:
                    base_flags.append(None)
        _emit_ranges(day, rush_flags, "RUSH_BELOW_TARGET", lambda h, n: f"rush staffed {h} (target {n})", gaps, cfg)
        _emit_ranges(
            day,
            base_flags,
            "BASELINE_BELOW_TARGET",
            lambda h, n: (f"below the {n}-staff hard floor (have {h})" if n == cfg.baselineFloorStaff else f"below the {n}-staff baseline (have {h})"),
            gaps,
            cfg,
        )

        day_paid = sum(a.paidMinutes for a in day_shifts)
        if 0 < day_paid < cfg.dailyLaborMinMin:
            gaps.append(_labor_gap(day, "LABOR_BELOW_MIN", "WARNING", day_paid, cfg.dailyLaborMinMin, "below the 70h daily minimum"))
        elif day_paid > cfg.dailyLaborHardCapMin:
            gaps.append(_labor_gap(day, "LABOR_OVER_HARD_CAP", "BLOCKING", day_paid, cfg.dailyLaborHardCapMin, "over the 80h daily hard cap"))
        elif day_paid > cfg.dailyLaborSoftCapMin:
            gaps.append(_labor_gap(day, "LABOR_OVER_SOFT_CAP", "WARNING", day_paid, cfg.dailyLaborSoftCapMin, "over the 75h daily soft cap"))

    # Per-shift structural checks.
    for a in assignments:
        emp = emp_by_id.get(a.employeeId)
        if emp is None:
            continue
        for kind, sev, msg in _shift_violations(emp, a, cfg):
            gaps.append(
                GapItem(kind=kind, severity=sev, dayOfWeek=a.dayOfWeek, startMin=a.startMin, endMin=a.endMin, message=f"{emp.name}: {msg}", detail={"employeeId": emp.id})
            )

    # Minimum days off per week: each employee works at most maxWorkingDays.
    max_working_days = cfg.daysPerWeek - cfg.minDaysOffPerWeek
    days_worked: dict[str, set[int]] = {}
    for a in assignments:
        days_worked.setdefault(a.employeeId, set()).add(a.dayOfWeek)
    for emp_id, days in days_worked.items():
        if len(days) > max_working_days:
            emp = emp_by_id.get(emp_id)
            name = emp.name if emp else emp_id
            gaps.append(
                GapItem(
                    kind="DAYS_OFF",
                    severity="BLOCKING",
                    dayOfWeek=None,
                    startMin=None,
                    endMin=None,
                    message=f"{name}: scheduled {len(days)} days — needs at least {cfg.minDaysOffPerWeek} days off (max {max_working_days} working days).",
                    detail={"employeeId": emp_id, "daysWorked": len(days), "max": max_working_days},
                )
            )
    return gaps


def _labor_gap(day, kind, sev, have, need, label) -> GapItem:
    return GapItem(kind=kind, severity=sev, dayOfWeek=day, startMin=None, endMin=None, message=f"{DAY_NAMES[day]}: {have/60:.1f}h scheduled — {label}.", detail={"have": have, "need": need})


def _shift_violations(emp: Employee, a: Assignment, cfg: StoreConfig):
    out = []
    duration = a.endMin - a.startMin
    # The minor 4h cap is a *school-night* rule (checked separately below); on
    # other nights minors follow the regular max.
    max_shift = cfg.gmShiftMaxMin if emp.isGM else cfg.regularShiftMaxMin
    if duration < cfg.regularShiftMinMin and not a.locked:
        out.append(("SHIFT_RULE", "BLOCKING", f"shift shorter than the {cfg.regularShiftMinMin/60:.0f}h minimum"))
    if duration > max_shift and not a.locked:
        out.append(("SHIFT_RULE", "BLOCKING", f"shift exceeds the {max_shift/60:.1f}h maximum"))
    if emp.isMinor and a.dayOfWeek in cfg.schoolNights:
        if a.endMin > cfg.minorLatestEndMin:
            out.append(("MINOR_RULE", "BLOCKING", f"minor working past {_fmt(cfg.minorLatestEndMin)} on a school night"))
        if duration > cfg.minorMaxShiftMin:
            out.append(("MINOR_RULE", "BLOCKING", f"minor working more than {cfg.minorMaxShiftMin/60:.0f}h on a school night"))
    windows = [av for av in emp.availability if av.dayOfWeek == a.dayOfWeek]
    if windows and not a.locked:
        if not any(a.startMin >= w.startMin and a.endMin <= w.endMin for w in windows):
            out.append(("AVAILABILITY", "BLOCKING", f"scheduled outside availability on {DAY_NAMES[a.dayOfWeek]}"))
    return out
