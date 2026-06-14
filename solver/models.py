"""Pydantic request/response models. Field names are camelCase to match the
JSON sent by the Next.js app (see src/lib/types.ts). Keep the two in sync."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel


class RushWindow(BaseModel):
    label: str
    startMin: int
    endMin: int


class StoreConfig(BaseModel):
    storeOpenMin: int
    storeCloseMin: int
    slotMinutes: int
    slotsPerDay: int
    daysPerWeek: int
    managerMinOnSite: int
    lateNightCutoffMin: list[int]
    lateNightMaxStaff: int
    rushTargetStaff: int
    rushWindows: list[RushWindow]
    baselineFloorStaff: int
    baselineTargetStaff: int
    dailyLaborMinMin: int
    dailyLaborSoftCapMin: int
    dailyLaborHardCapMin: int
    regularShiftMinMin: int
    regularShiftMaxMin: int
    gmShiftMaxMin: int
    lunchBreakThresholdMin: int
    lunchBreakMin: int
    minorMaxShiftMin: int
    minorLatestEndMin: int
    schoolNights: list[int]
    minDaysOffPerWeek: int
    candidateStartStepMin: int
    candidateDurationStepMin: int


class Availability(BaseModel):
    dayOfWeek: int
    startMin: int
    endMin: int


class HardSet(BaseModel):
    dayOfWeek: int
    startMin: int
    endMin: int


class Employee(BaseModel):
    id: str
    name: str
    employmentType: Literal["FULL_TIME", "PART_TIME"]
    isManager: bool
    isGM: bool
    isMinor: bool
    performance: int
    minHoursPerWeek: Optional[int] = None
    maxHoursPerWeek: Optional[int] = None
    availability: list[Availability] = []
    hardSets: list[HardSet] = []


class Assignment(BaseModel):
    employeeId: str
    dayOfWeek: int
    startMin: int
    endMin: int
    breakStarts: list[int] = []
    paidMinutes: int
    locked: bool = False
    source: Literal["SOLVER", "MANUAL", "HARDSET"] = "SOLVER"


class SolveRequest(BaseModel):
    mode: Literal["GENERATE", "RESOLVE"]
    config: StoreConfig
    timeLimitSeconds: float = 15.0
    employees: list[Employee]
    existingAssignments: Optional[list[Assignment]] = None


class GapItem(BaseModel):
    kind: str
    severity: Literal["BLOCKING", "WARNING"]
    dayOfWeek: Optional[int] = None
    startMin: Optional[int] = None
    endMin: Optional[int] = None
    message: str
    detail: Optional[dict[str, Any]] = None


class SolveResponse(BaseModel):
    status: str
    objectiveValue: Optional[float] = None
    solveMs: int
    assignments: list[Assignment]
    gaps: list[GapItem]
