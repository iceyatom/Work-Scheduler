"""CP-SAT scheduling engine (spec build-order stage 3).

Approach: shift-selection. For every (employee, day) we enumerate a set of
candidate shifts that already respect the structural rules (availability, shift
length, GM exception, minor school-night limits). A boolean decision variable
picks at most one candidate per employee per day. Coverage, manager presence,
labour and priority weighting are then expressed over those variables.

Design philosophy (spec §1): soft constraints over hard failures. Only true
upper-bound caps are modelled as hard constraints (daily labour hard cap, weekly
max hours, open/close edge caps) plus the structural rules baked into candidate
generation. Everything else is a weighted penalty so the solver always returns
its best feasible schedule, and unmet items come back as a gap report.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from models import Assignment, Employee, GapItem, SolveRequest, SolveResponse, StoreConfig

# --- Objective weights (heuristic; tune freely) ----------------------------
W_MANAGER = 1000      # per missing manager, per slot (phase 1) — drives an even
                      # spread of managers across all open hours
W_BASE_FLOOR = 250    # per staff below the hard floor (3), per slot
W_BASE_TARGET = 25    # per staff below the baseline target (4), per slot
W_RUSH = 40           # per staff below the rush target (5), per rush slot
W_OPEN_EDGE = 30      # per role below the open/close-hour target, per edge slot
W_LATE_NIGHT = 90     # per staff below the late-night target (2), per late slot
W_LABOR_MIN = 2       # per minute below the daily 70h minimum
W_LABOR_OVER = 3      # per minute over the daily 75h soft cap
W_MINHOURS = 1        # per minute an employee is below their weekly minimum
W_MINHOURS_MGR = 8    # stronger weight so managers get lengthy enough shifts to
                      # meet their weekly minimum (phase 1)
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
    break_starts: list[int]
    paid: int
    slots: list[int]  # active (excludes breaks)
    span: list[int]   # all slots start..end (manager-on-break still on premises)
    is_manager: bool
    coeff: int = 0  # per-candidate objective coefficient (prefs + priority)


@dataclass
class FixedShift:
    emp_id: str
    day: int
    start: int
    end: int
    break_starts: list[int]
    paid: int
    slots: list[int]  # active (excludes breaks)
    span: list[int]   # all slots start..end
    is_manager: bool


def snap(value: int, step: int) -> int:
    return int(round(value / step)) * step


def num_breaks(duration: int, cfg: StoreConfig) -> int:
    """One unpaid 30-min lunch per completed 5h interval (spec §4 + CA meal-break
    rule). <5h: none; 5h–<10h: 1; 10h+: 2. A shift of exactly 5h earns a break."""
    if duration < cfg.lunchBreakThresholdMin:
        return 0
    return duration // cfg.lunchBreakThresholdMin


def derive_breaks(start: int, end: int, cfg: StoreConfig) -> tuple[list[int], int]:
    """Unpaid lunches & paid minutes for a shift; breaks split the shift into
    roughly equal work segments. Returns (break start minutes, paid)."""
    duration = end - start
    n = num_breaks(duration, cfg)
    breaks: list[int] = []
    if n > 0:
        seg = duration // (n + 1)
        for i in range(1, n + 1):
            b = snap(start + i * seg - cfg.lunchBreakMin // 2, cfg.slotMinutes)
            lo = breaks[-1] + cfg.lunchBreakMin + cfg.slotMinutes if breaks else start + cfg.slotMinutes
            hi = end - cfg.slotMinutes - cfg.lunchBreakMin
            b = max(lo, min(b, hi))
            breaks.append(b)
    return breaks, duration - n * cfg.lunchBreakMin


def span_slots(start: int, end: int, cfg: StoreConfig) -> list[int]:
    """All slots within [start, end), ignoring breaks (person on premises)."""
    out: list[int] = []
    for s in range(cfg.slotsPerDay):
        slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
        if start <= slot_min and slot_min + cfg.slotMinutes <= end:
            out.append(s)
    return out


def covered_slots(start: int, end: int, break_starts: list[int], cfg: StoreConfig) -> list[int]:
    """Actively-staffed slots: spanned and not within any unpaid break."""
    out: list[int] = []
    for s in span_slots(start, end, cfg):
        slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
        if any(b <= slot_min < b + cfg.lunchBreakMin for b in break_starts):
            continue
        out.append(s)
    return out


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
                breaks, paid = derive_breaks(start, end, cfg)
                out.append(
                    Candidate(
                        emp_id=emp.id,
                        day=day,
                        start=start,
                        end=end,
                        break_starts=breaks,
                        paid=paid,
                        slots=covered_slots(start, end, breaks, cfg),
                        span=span_slots(start, end, cfg),
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
            breaks, paid = derive_breaks(h.startMin, h.endMin, cfg)
            m.fixed.append(
                FixedShift(
                    emp_id=emp.id,
                    day=h.dayOfWeek,
                    start=h.startMin,
                    end=h.endMin,
                    break_starts=breaks,
                    paid=paid,
                    slots=covered_slots(h.startMin, h.endMin, breaks, cfg),
                    span=span_slots(h.startMin, h.endMin, cfg),
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


def _assignment_to_fixed(a: Assignment, cfg: StoreConfig, is_manager: bool) -> FixedShift:
    """Turn a chosen assignment into a constant shift for a later phase."""
    return FixedShift(
        emp_id=a.employeeId,
        day=a.dayOfWeek,
        start=a.startMin,
        end=a.endMin,
        break_starts=a.breakStarts,
        paid=a.paidMinutes,
        slots=covered_slots(a.startMin, a.endMin, a.breakStarts, cfg),
        span=span_slots(a.startMin, a.endMin, cfg),
        is_manager=is_manager,
    )


def _abs_start(day: int, start: int) -> int:
    return day * 1440 + start


def _abs_end(day: int, end: int) -> int:
    # end may be > 1440 for shifts that close after midnight.
    return day * 1440 + end


def _add_rest_constraints(model, x, candidates: list[Candidate], fixed: list[FixedShift], cfg: StoreConfig) -> None:
    """HARD: no employee can start a shift less than the configured rest period
    after their prior shift ends. Fixed-vs-fixed violations are reported as
    gaps, not made infeasible, because hard-set shifts are constants."""
    cand_by_emp_day: dict[tuple[str, int], list[int]] = {}
    fixed_by_emp_day: dict[tuple[str, int], list[FixedShift]] = {}
    for i, c in enumerate(candidates):
        cand_by_emp_day.setdefault((c.emp_id, c.day), []).append(i)
    for f in fixed:
        fixed_by_emp_day.setdefault((f.emp_id, f.day), []).append(f)

    var_day: dict[tuple[str, int], dict[str, object]] = {}
    for (emp_id, day), idxs in cand_by_emp_day.items():
        worked = model.NewBoolVar(f"worked_{emp_id}_{day}")
        model.Add(worked == sum(x[i] for i in idxs))
        start_expr = sum(candidates[i].start * x[i] for i in idxs)
        end_expr = sum(candidates[i].end * x[i] for i in idxs)
        var_day[(emp_id, day)] = {"worked": worked, "start": start_expr, "end": end_expr}

    emp_ids = {c.emp_id for c in candidates} | {f.emp_id for f in fixed}
    for emp_id in emp_ids:
        # No wrap from Sunday to Monday: the next week's Monday is outside this
        # schedule request and cannot be known here.
        for day in range(cfg.daysPerWeek - 1):
            cur_var = var_day.get((emp_id, day))
            next_var = var_day.get((emp_id, day + 1))
            cur_fixed = fixed_by_emp_day.get((emp_id, day), [])
            next_fixed = fixed_by_emp_day.get((emp_id, day + 1), [])

            if cur_var is not None and next_var is not None:
                model.Add(
                    _abs_start(day + 1, 0) + next_var["start"] - (_abs_end(day, 0) + cur_var["end"])
                    >= cfg.minRestBetweenShiftsMin
                ).OnlyEnforceIf([cur_var["worked"], next_var["worked"]])

            if next_var is not None:
                for prev in cur_fixed:
                    model.Add(
                        _abs_start(day + 1, 0) + next_var["start"] - _abs_end(prev.day, prev.end)
                        >= cfg.minRestBetweenShiftsMin
                    ).OnlyEnforceIf(next_var["worked"])

            if cur_var is not None:
                for nxt in next_fixed:
                    model.Add(
                        _abs_start(nxt.day, nxt.start) - (_abs_end(day, 0) + cur_var["end"])
                        >= cfg.minRestBetweenShiftsMin
                    ).OnlyEnforceIf(cur_var["worked"])


def _solve_phase(
    cfg: StoreConfig,
    decision_employees: list[Employee],
    candidates: list[Candidate],
    fixed: list[FixedShift],
    mode: str,
    existing,
    time_limit: float,
    manager_phase: bool,
) -> tuple[list[Assignment], str, "float | None"]:
    """Build & solve one phase. ``candidates`` are the decision shifts; ``fixed``
    are constant shifts (hard-sets, and in the crew phase the managers already
    placed by phase 1). Returns (chosen assignments, status, objective)."""
    model = cp_model.CpModel()
    x = [model.NewBoolVar(f"x{i}") for i in range(len(candidates))]

    # At most one shift per employee per day.
    groups: dict[tuple[str, int], list[int]] = {}
    for i, c in enumerate(candidates):
        groups.setdefault((c.emp_id, c.day), []).append(i)
    for idxs in groups.values():
        model.Add(sum(x[i] for i in idxs) <= 1)

    _add_rest_constraints(model, x, candidates, fixed, cfg)

    ub = max(1, len({c.emp_id for c in candidates}) + len({f.emp_id for f in fixed}))

    # Pre-index by (day, slot). Active staff uses `slots` (excludes breaks);
    # manager *presence* uses `span` so a manager on their lunch still counts.
    cand_by_slot: dict[tuple[int, int], list[int]] = {}
    mgr_span_by_slot: dict[tuple[int, int], list[int]] = {}
    base_staff: dict[tuple[int, int], int] = {}
    base_crew: dict[tuple[int, int], int] = {}  # non-manager fixed (open/close-edge cap)
    base_mgr_span: dict[tuple[int, int], int] = {}
    for i, c in enumerate(candidates):
        for s in c.slots:
            cand_by_slot.setdefault((c.day, s), []).append(i)
        if c.is_manager:
            for s in c.span:
                mgr_span_by_slot.setdefault((c.day, s), []).append(i)
    for f in fixed:
        for s in f.slots:
            base_staff[(f.day, s)] = base_staff.get((f.day, s), 0) + 1
            if not f.is_manager:
                base_crew[(f.day, s)] = base_crew.get((f.day, s), 0) + 1
        if f.is_manager:
            for s in f.span:
                base_mgr_span[(f.day, s)] = base_mgr_span.get((f.day, s), 0) + 1

    obj: list = []
    for i, c in enumerate(candidates):
        if c.coeff != 0:
            obj.append(c.coeff * x[i])

    def in_rush(slot_min: int) -> bool:
        return any(rw.startMin <= slot_min and slot_min + cfg.slotMinutes <= rw.endMin for rw in cfg.rushWindows)

    def is_late(day: int, slot_min: int) -> bool:
        return slot_min >= cfg.lateNightCutoffMin[day]

    def is_open_edge(slot_min: int) -> bool:
        """First hour the store is open, or the last hour before it closes."""
        return (
            slot_min < cfg.storeOpenMin + cfg.openEdgeWindowMin
            or slot_min >= cfg.storeCloseMin - cfg.openEdgeWindowMin
        )

    for day in range(cfg.daysPerWeek):
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            cand_idxs = cand_by_slot.get((day, s), [])
            bstaff = base_staff.get((day, s), 0)
            staff = model.NewIntVar(0, ub, f"staff_{day}_{s}")
            model.Add(staff == sum(x[i] for i in cand_idxs) + bstaff)

            edge = is_open_edge(slot_min)

            if manager_phase:
                # Manager presence: keep >=1 manager on at all open hours. The
                # even spread comes from having to cover the whole day; managers
                # are free to work full-length, overlapping shifts so they meet
                # their hour requirements. Uses span (a manager on their lunch
                # break still counts as present).
                mgr_idxs = mgr_span_by_slot.get((day, s), [])
                bmgr = base_mgr_span.get((day, s), 0)
                mgr = model.NewIntVar(0, ub, f"mgr_{day}_{s}")
                model.Add(mgr == sum(x[i] for i in mgr_idxs) + bmgr)
                mgr_short = model.NewIntVar(0, cfg.managerMinOnSite, f"mshort_{day}_{s}")
                model.Add(mgr_short >= cfg.managerMinOnSite - mgr)
                obj.append(W_MANAGER * mgr_short)
                # HARD: at most one manager during the first/last open hour, so the
                # store opens & closes lean. Decision-capped against the fixed base
                # (hard-set managers can't make the phase infeasible — reported as a
                # gap instead). Presence (>=1) above drives it to exactly one.
                if edge and cand_idxs:
                    room = max(0, cfg.openEdgeMaxManagers - bstaff)
                    model.Add(sum(x[i] for i in cand_idxs) <= room)
                if edge:
                    edge_mgr_short = model.NewIntVar(0, cfg.openEdgeMaxManagers, f"emshort_{day}_{s}")
                    model.Add(edge_mgr_short >= cfg.openEdgeMaxManagers - staff)
                    obj.append(W_OPEN_EDGE * edge_mgr_short)
                continue

            # Crew phase coverage (managers already fixed).
            if edge:
                # First/last open hour: exactly one crew member (one manager comes
                # from phase 1). Baseline/rush do NOT apply here — the edge hour is
                # intentionally lean. HARD cap on crew (decision-capped) + a soft
                # nudge toward one.
                bcrew = base_crew.get((day, s), 0)
                if cand_idxs:
                    room = max(0, cfg.openEdgeMaxCrew - bcrew)
                    model.Add(sum(x[i] for i in cand_idxs) <= room)
                crew_cnt = model.NewIntVar(0, ub, f"crew_{day}_{s}")
                model.Add(crew_cnt == sum(x[i] for i in cand_idxs) + bcrew)
                edge_short = model.NewIntVar(0, cfg.openEdgeMaxCrew, f"eshort_{day}_{s}")
                model.Add(edge_short >= cfg.openEdgeMaxCrew - crew_cnt)
                obj.append(W_OPEN_EDGE * edge_short)
                continue
            if is_late(day, slot_min):
                late_short = model.NewIntVar(0, cfg.lateNightMinStaff, f"lnshort_{day}_{s}")
                model.Add(late_short >= cfg.lateNightMinStaff - staff)
                obj.append(W_LATE_NIGHT * late_short)
                continue
            if in_rush(slot_min):
                rush_short = model.NewIntVar(0, cfg.rushTargetStaff, f"rshort_{day}_{s}")
                model.Add(rush_short >= cfg.rushTargetStaff - staff)
                obj.append(W_RUSH * rush_short)
            else:
                floor_short = model.NewIntVar(0, cfg.baselineFloorStaff, f"fshort_{day}_{s}")
                model.Add(floor_short >= cfg.baselineFloorStaff - staff)
                obj.append(W_BASE_FLOOR * floor_short)
                tgt_short = model.NewIntVar(0, cfg.baselineTargetStaff, f"tshort_{day}_{s}")
                model.Add(tgt_short >= cfg.baselineTargetStaff - staff)
                obj.append(W_BASE_TARGET * tgt_short)

    big = ub * cfg.gmShiftMaxMin

    # Daily labour only matters once crew are placed (managers alone are light).
    if not manager_phase:
        paid_by_day: dict[int, list] = {d: [] for d in range(cfg.daysPerWeek)}
        paid_by_day_base: dict[int, int] = {d: 0 for d in range(cfg.daysPerWeek)}
        for i, c in enumerate(candidates):
            paid_by_day[c.day].append(c.paid * x[i])
        for f in fixed:
            paid_by_day_base[f.day] += f.paid
        for day in range(cfg.daysPerWeek):
            daypaid = model.NewIntVar(0, big, f"daypaid_{day}")
            model.Add(daypaid == sum(paid_by_day[day]) + paid_by_day_base[day])
            # HARD daily hard cap, applied to the decision portion only: fixed
            # hard-sets that already blow the cap degrade to a gap, not
            # infeasibility.
            if paid_by_day[day]:
                room = max(0, cfg.dailyLaborHardCapMin - paid_by_day_base[day])
                model.Add(sum(paid_by_day[day]) <= room)
            lshort = model.NewIntVar(0, cfg.dailyLaborMinMin, f"lshort_{day}")
            model.Add(lshort >= cfg.dailyLaborMinMin - daypaid)
            obj.append(W_LABOR_MIN * lshort)
            lover = model.NewIntVar(0, big, f"lover_{day}")
            model.Add(lover >= daypaid - cfg.dailyLaborSoftCapMin)
            obj.append(W_LABOR_OVER * lover)

    # Weekly hour bounds for this phase's employees.
    paid_by_emp: dict[str, list] = {}
    paid_by_emp_base: dict[str, int] = {}
    for i, c in enumerate(candidates):
        paid_by_emp.setdefault(c.emp_id, []).append(c.paid * x[i])
    for f in fixed:
        paid_by_emp_base[f.emp_id] = paid_by_emp_base.get(f.emp_id, 0) + f.paid
    for emp in decision_employees:
        terms = paid_by_emp.get(emp.id, [])
        base = paid_by_emp_base.get(emp.id, 0)
        weekpaid = model.NewIntVar(0, big * cfg.daysPerWeek, f"week_{emp.id}")
        model.Add(weekpaid == (sum(terms) if terms else 0) + base)
        if emp.maxHoursPerWeek is not None and terms:
            # HARD weekly max, decision portion only — a hard-set already over an
            # employee's weekly max must not make the phase infeasible (which
            # would drop every other employee too); it's surfaced as a gap.
            room = max(0, emp.maxHoursPerWeek * 60 - base)
            model.Add(sum(terms) <= room)
        if emp.minHoursPerWeek is not None:
            mshort = model.NewIntVar(0, emp.minHoursPerWeek * 60, f"weekshort_{emp.id}")
            model.Add(mshort >= emp.minHoursPerWeek * 60 - weekpaid)
            obj.append((W_MINHOURS_MGR if manager_phase else W_MINHOURS) * mshort)

    # HARD: minimum days off per week (per this phase's employees).
    max_working_days = cfg.daysPerWeek - cfg.minDaysOffPerWeek
    emp_cand_idxs: dict[str, list[int]] = {}
    for i, c in enumerate(candidates):
        emp_cand_idxs.setdefault(c.emp_id, []).append(i)
    emp_fixed_days: dict[str, set[int]] = {}
    for f in fixed:
        emp_fixed_days.setdefault(f.emp_id, set()).add(f.day)
    for emp in decision_employees:
        idxs = emp_cand_idxs.get(emp.id, [])
        fixed_days = len(emp_fixed_days.get(emp.id, set()))
        rhs = max_working_days - fixed_days
        if idxs and rhs >= 0:
            model.Add(sum(x[i] for i in idxs) <= rhs)

    # RESOLVE stability: discourage churn & dropped days (spec §6, F-2).
    if mode == "RESOLVE" and existing:
        existing_days = {(a.employeeId, a.dayOfWeek) for a in existing}
        for (emp_id, day), idxs in groups.items():
            worked = sum(x[i] for i in idxs)
            if (emp_id, day) in existing_days:
                dropped = model.NewBoolVar(f"drop_{emp_id}_{day}")
                model.Add(worked == 0).OnlyEnforceIf(dropped)
                model.Add(worked >= 1).OnlyEnforceIf(dropped.Not())
                obj.append(W_DROP * dropped)
            else:
                obj.append(W_CHURN * worked)

    model.Minimize(sum(obj))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.1, float(time_limit))
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    chosen: list[Assignment] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for i, c in enumerate(candidates):
            if solver.Value(x[i]) == 1:
                chosen.append(
                    Assignment(
                        employeeId=c.emp_id,
                        dayOfWeek=c.day,
                        startMin=c.start,
                        endMin=c.end,
                        breakStarts=c.break_starts,
                        paidMinutes=c.paid,
                        locked=False,
                        source="SOLVER",
                    )
                )
    obj_val = solver.ObjectiveValue() if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None
    return chosen, solver.StatusName(status), obj_val


def solve(req: SolveRequest) -> SolveResponse:
    """Two-phase solve (spec §5.1): place managers / GM first with an even
    spread (no two opening or closing together), then schedule the rest of the
    crew around the now-fixed manager coverage."""
    t0 = time.time()
    cfg = req.config
    m = build_fixed_and_candidates(req)
    apply_objective_coeffs(m, req)

    mgr_ids = {e.id for e in req.employees if e.isManager}
    managers = [e for e in req.employees if e.isManager]
    crew = [e for e in req.employees if not e.isManager]
    mgr_candidates = [c for c in m.candidates if c.emp_id in mgr_ids]
    crew_candidates = [c for c in m.candidates if c.emp_id not in mgr_ids]
    mgr_fixed = [f for f in m.fixed if f.emp_id in mgr_ids]
    crew_fixed = [f for f in m.fixed if f.emp_id not in mgr_ids]

    total_limit = float(req.timeLimitSeconds)
    statuses: list[str] = []
    obj_total = 0.0

    # --- Phase 1: managers / GM first (even spread) -----------------------
    mgr_chosen: list[Assignment] = []
    p1_limit = 0.0
    if mgr_candidates or mgr_fixed:
        p1_limit = min(total_limit * 0.35, 8.0) if crew_candidates else total_limit
        mgr_chosen, st1, ov1 = _solve_phase(
            cfg, managers, mgr_candidates, mgr_fixed, req.mode, req.existingAssignments, p1_limit, manager_phase=True
        )
        statuses.append(st1)
        if ov1 is not None:
            obj_total += ov1

    # Managers (hard-set + phase-1 picks) become fixed coverage for the crew.
    mgr_all_fixed = list(mgr_fixed) + [_assignment_to_fixed(a, cfg, is_manager=True) for a in mgr_chosen]

    # --- Phase 2: crew around the fixed managers --------------------------
    p2_limit = max(1.0, total_limit - p1_limit)
    crew_chosen, st2, ov2 = _solve_phase(
        cfg, crew, crew_candidates, crew_fixed + mgr_all_fixed, req.mode, req.existingAssignments, p2_limit, manager_phase=False
    )
    statuses.append(st2)
    if ov2 is not None:
        obj_total += ov2

    # --- Assemble final schedule ------------------------------------------
    assignments: list[Assignment] = list(mgr_chosen) + list(crew_chosen)
    for f in m.fixed:  # hard-set shifts are always part of the schedule
        assignments.append(
            Assignment(
                employeeId=f.emp_id,
                dayOfWeek=f.day,
                startMin=f.start,
                endMin=f.end,
                breakStarts=f.break_starts,
                paidMinutes=f.paid,
                locked=True,
                source="HARDSET",
            )
        )

    if any(s == "INFEASIBLE" for s in statuses):
        status_name = "INFEASIBLE"
    elif statuses and all(s == "OPTIMAL" for s in statuses):
        status_name = "OPTIMAL"
    else:
        status_name = "FEASIBLE"

    gaps = compute_gaps(req.employees, assignments, cfg)
    return SolveResponse(
        status=status_name,
        objectiveValue=obj_total if statuses else None,
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


def _spans(a: Assignment, slot_min: int, cfg: StoreConfig) -> bool:
    """Shift spans the slot, ignoring breaks (person on premises)."""
    return a.startMin <= slot_min and a.endMin >= slot_min + cfg.slotMinutes


def _covers(a: Assignment, slot_min: int, cfg: StoreConfig) -> bool:
    """Actively staffs the slot — spans it and is not on an unpaid break."""
    if not _spans(a, slot_min, cfg):
        return False
    if any(b <= slot_min < b + cfg.lunchBreakMin for b in a.breakStarts):
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

    def is_open_edge(slot_min: int) -> bool:
        return (
            slot_min < cfg.storeOpenMin + cfg.openEdgeWindowMin
            or slot_min >= cfg.storeCloseMin - cfg.openEdgeWindowMin
        )

    for day in range(cfg.daysPerWeek):
        day_shifts = [a for a in assignments if a.dayOfWeek == day]
        staff = [0] * cfg.slotsPerDay
        mgr = [0] * cfg.slotsPerDay
        mgr_active = [0] * cfg.slotsPerDay  # managers actively staffing (excl. break)
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            for a in day_shifts:
                is_mgr = emp_by_id.get(a.employeeId) and emp_by_id[a.employeeId].isManager
                if _covers(a, slot_min, cfg):
                    staff[s] += 1
                    if is_mgr:
                        mgr_active[s] += 1
                # Manager on a lunch break still counts as present (uses span).
                if is_mgr and _spans(a, slot_min, cfg):
                    mgr[s] += 1
        crew_active = [staff[s] - mgr_active[s] for s in range(cfg.slotsPerDay)]

        mgr_flags = [
            ("BLOCKING", mgr[s], cfg.managerMinOnSite) if (staff[s] > 0 and mgr[s] < cfg.managerMinOnSite) else None
            for s in range(cfg.slotsPerDay)
        ]
        _emit_ranges(day, mgr_flags, "MANAGER_ABSENCE", lambda h, n: f"no manager on site (have {h})", gaps, cfg)

        # Open/close edge hours: exactly one manager + one crew. Over-coverage is
        # blocking; missing either role is a warning. These windows are exempt from the
        # late-night / rush / baseline rules below (the edge rule supersedes them).
        edge_over_flags = []
        edge_under_flags = []
        edge_max = cfg.openEdgeMaxManagers + cfg.openEdgeMaxCrew
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            if is_open_edge(slot_min) and (mgr_active[s] > cfg.openEdgeMaxManagers or crew_active[s] > cfg.openEdgeMaxCrew):
                edge_over_flags.append(("BLOCKING", staff[s], edge_max))
            else:
                edge_over_flags.append(None)
            if is_open_edge(slot_min) and (mgr_active[s] < cfg.openEdgeMaxManagers or crew_active[s] < cfg.openEdgeMaxCrew):
                edge_under_flags.append(("WARNING", staff[s], edge_max))
            else:
                edge_under_flags.append(None)
        _emit_ranges(day, edge_over_flags, "OPEN_EDGE_OVER_CAP", lambda h, n: f"{h} working in the open/close hour (max {n}: one manager + one crew)", gaps, cfg)
        _emit_ranges(day, edge_under_flags, "OPEN_EDGE_UNDERSTAFFED", lambda h, n: f"{h} working in the open/close hour (want {n}: one manager + one crew)", gaps, cfg)

        late_flags = []
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            late = slot_min >= cfg.lateNightCutoffMin[day]
            late_flags.append(("WARNING", staff[s], cfg.lateNightMinStaff) if (late and not is_open_edge(slot_min) and staff[s] < cfg.lateNightMinStaff) else None)
        _emit_ranges(day, late_flags, "LATE_NIGHT_BELOW_TARGET", lambda h, n: f"late-night staffed {h} (target at least {n})", gaps, cfg)

        rush_flags = []
        base_flags = []
        for s in range(cfg.slotsPerDay):
            slot_min = cfg.storeOpenMin + s * cfg.slotMinutes
            late = slot_min >= cfg.lateNightCutoffMin[day]
            if late or is_open_edge(slot_min):
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
                else:
                    base_flags.append(None)
        _emit_ranges(day, rush_flags, "RUSH_BELOW_TARGET", lambda h, n: f"rush staffed {h} (target {n})", gaps, cfg)
        _emit_ranges(
            day,
            base_flags,
            "BASELINE_BELOW_FLOOR",
            lambda h, n: f"below the {n}-staff hard floor (have {h})",
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

    # Minimum rest between adjacent shifts. The solver enforces this for
    # selectable shifts; this catches manual edits and fixed-vs-fixed hard-sets.
    shifts_by_emp: dict[str, list[Assignment]] = {}
    for a in assignments:
        shifts_by_emp.setdefault(a.employeeId, []).append(a)
    for emp_id, shifts in shifts_by_emp.items():
        shifts.sort(key=lambda sh: (_abs_start(sh.dayOfWeek, sh.startMin), _abs_end(sh.dayOfWeek, sh.endMin)))
        for prev, curr in zip(shifts, shifts[1:]):
            rest = _abs_start(curr.dayOfWeek, curr.startMin) - _abs_end(prev.dayOfWeek, prev.endMin)
            if rest >= cfg.minRestBetweenShiftsMin:
                continue
            emp = emp_by_id.get(emp_id)
            name = emp.name if emp else emp_id
            if rest < 0:
                message = (
                    f"{name}: shifts overlap from {DAY_NAMES[prev.dayOfWeek]} {_fmt(prev.startMin)}-{_fmt(prev.endMin)} "
                    f"to {DAY_NAMES[curr.dayOfWeek]} {_fmt(curr.startMin)}-{_fmt(curr.endMin)}; "
                    f"minimum rest is {cfg.minRestBetweenShiftsMin/60:.0f}h."
                )
            else:
                message = (
                    f"{name}: only {rest/60:.1f}h between {DAY_NAMES[prev.dayOfWeek]} shift ending {_fmt(prev.endMin)} "
                    f"and {DAY_NAMES[curr.dayOfWeek]} shift starting {_fmt(curr.startMin)}; "
                    f"minimum is {cfg.minRestBetweenShiftsMin/60:.0f}h."
                )
            gaps.append(
                GapItem(
                    kind="REST_PERIOD",
                    severity="BLOCKING",
                    dayOfWeek=curr.dayOfWeek,
                    startMin=curr.startMin,
                    endMin=curr.endMin,
                    message=message,
                    detail={
                        "employeeId": emp_id,
                        "previousDayOfWeek": prev.dayOfWeek,
                        "previousEndMin": prev.endMin,
                        "restMinutes": rest,
                        "need": cfg.minRestBetweenShiftsMin,
                    },
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
