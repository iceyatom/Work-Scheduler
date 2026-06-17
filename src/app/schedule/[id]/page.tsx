"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Card, Spinner, Badge, ErrorBanner } from "@/components/ui";
import { GridEditor } from "@/components/GridEditor";
import { TimelineView } from "@/components/TimelineView";
import { PrintableReport } from "@/components/PrintableReport";
import { GapReportView } from "@/components/GapReportView";
import { SliderEditor } from "@/components/SliderEditor";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getJSON, sendJSON } from "@/lib/client";
import { dateForDay } from "@/lib/schedule-helpers";
import { computeGapReport, deriveShift, type EmployeeLite, type ShiftLite } from "@/lib/validation";
import type { AssignmentRow, ScheduleDetail } from "@/lib/view-types";

type Tab = "grid" | "timeline" | "report" | "gaps";

const TABS: { id: Tab; label: string }[] = [
  { id: "grid", label: "Grid editor" },
  { id: "timeline", label: "Timeline" },
  { id: "report", label: "Printable report" },
  { id: "gaps", label: "Gap report" },
];

// Order-independent content signature of the draft used to detect unsaved edits
// (ignores ids so a reverted edit reads as clean and temp rows compare by value).
function signature(rows: AssignmentRow[]): string {
  return rows
    .map((a) => `${a.employeeId}:${a.dayOfWeek}:${a.startMin}:${a.endMin}:${a.locked ? 1 : 0}:${a.source}`)
    .sort()
    .join("|");
}

export default function SchedulePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  // Buffered working copy of the assignments. All grid/timeline/slider edits
  // mutate this locally; nothing is persisted until "Save changes" is hit.
  const [draft, setDraft] = useState<AssignmentRow[]>([]);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("grid");
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState<{ employee: EmployeeLite; dayOfWeek: number; assignment: AssignmentRow | null } | null>(null);
  // Pending action awaiting confirmation in the stylized discard dialog.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getJSON<ScheduleDetail>(`/api/schedules/${params.id}`);
      setDetail(d);
      setDraft(d.assignments);
      setBaseline(signature(d.assignments));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => signature(draft) !== baseline, [draft, baseline]);

  // Gaps are recomputed locally from the draft so the gap report + tab badge
  // stay live with unsaved edits (mirrors solver/engine.py compute_gaps).
  const gapList = useMemo(() => {
    if (!detail) return [];
    const shifts: ShiftLite[] = draft.map((a) => ({
      employeeId: a.employeeId,
      dayOfWeek: a.dayOfWeek,
      startMin: a.startMin,
      endMin: a.endMin,
      breakStarts: a.breakStarts,
      paidMinutes: a.paidMinutes,
    }));
    return computeGapReport(detail.employees, shifts);
  }, [detail, draft]);

  // Warn on browser-level navigation (close tab, refresh, external link) while dirty.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Run an action that would drop unsaved edits, gated by the stylized discard
  // dialog. When nothing is dirty the action runs immediately.
  const guardDiscard = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      setPendingDiscard(() => action);
    },
    [dirty],
  );

  const openEditor = useCallback(
    (employeeId: string, dayOfWeek: number, assignment: AssignmentRow | null) => {
      const employee = detail?.employees.find((e) => e.id === employeeId);
      if (employee) setEditing({ employee, dayOfWeek, assignment });
    },
    [detail],
  );

  // Insert or update a shift in the draft (no network). Edited/new rows become
  // MANUAL; untouched solver/hard-set rows keep their original source.
  const upsertDraft = useCallback(
    (employeeId: string, dayOfWeek: number, assignmentId: string | null, startMin: number, endMin: number) => {
      const { breakStarts, paidMinutes } = deriveShift(startMin, endMin);
      setDraft((prev) => {
        if (assignmentId) {
          return prev.map((a) => (a.id === assignmentId ? { ...a, dayOfWeek, startMin, endMin, breakStarts, paidMinutes, source: "MANUAL" } : a));
        }
        const temp: AssignmentRow = {
          id: `temp-${crypto.randomUUID()}`,
          scheduleId: params.id,
          employeeId,
          dayOfWeek,
          startMin,
          endMin,
          breakStarts,
          paidMinutes,
          locked: false,
          source: "MANUAL",
        };
        return [...prev, temp];
      });
    },
    [params.id],
  );

  async function saveShift(startMin: number, endMin: number) {
    if (!editing) return;
    upsertDraft(editing.employee.id, editing.dayOfWeek, editing.assignment?.id ?? null, startMin, endMin);
    setEditing(null);
  }

  const updateShift = useCallback(
    async (assignment: AssignmentRow, startMin: number, endMin: number) => {
      setError(null);
      upsertDraft(assignment.employeeId, assignment.dayOfWeek, assignment.id, startMin, endMin);
    },
    [upsertDraft],
  );

  async function deleteShift() {
    if (!editing?.assignment) return;
    const id = editing.assignment.id;
    setDraft((prev) => prev.filter((a) => a.id !== id));
    setEditing(null);
  }

  async function saveChanges() {
    setSaving(true);
    setError(null);
    try {
      await sendJSON(`/api/schedules/${params.id}/assignments/bulk`, "PUT", {
        assignments: draft.map((a) => ({
          id: a.id.startsWith("temp-") ? undefined : a.id,
          employeeId: a.employeeId,
          dayOfWeek: a.dayOfWeek,
          startMin: a.startMin,
          endMin: a.endMin,
          locked: a.locked,
          source: a.source,
        })),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    if (!detail || !dirty) return;
    guardDiscard(() => {
      setDraft(detail.assignments);
      setError(null);
    });
  }

  async function doResolve() {
    setResolving(true);
    setError(null);
    try {
      const next = await sendJSON<{ id: string }>(`/api/schedules/${params.id}/resolve`, "POST");
      router.push(`/schedule/${next.id}`);
    } catch (e) {
      setError((e as Error).message);
      setResolving(false);
    }
  }

  function resolve() {
    guardDiscard(() => void doResolve());
  }

  function leave() {
    guardDiscard(() => router.push("/"));
  }

  if (loading)
    return (
      <div className="flex items-center gap-2 py-16 text-slate-500">
        <Spinner /> Loading schedule…
      </div>
    );
  if (error && !detail) return <ErrorBanner message={error} />;
  if (!detail) return null;

  const { schedule } = detail;
  const draftDetail: ScheduleDetail = { ...detail, assignments: draft, schedule: { ...schedule, gaps: gapList } };
  const blocking = gapList.filter((g) => g.severity === "BLOCKING").length;
  const warning = gapList.filter((g) => g.severity === "WARNING").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="no-print">
        <button onClick={leave} className="text-sm text-slate-500 hover:underline">
          ← Dashboard
        </button>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              {schedule.name}
              <Badge color={schedule.generatedFrom === "RESOLVE" ? "blue" : "purple"}>{schedule.generatedFrom === "RESOLVE" ? "Re-solved" : "Generated"}</Badge>
              {dirty && <Badge color="amber">Unsaved changes</Badge>}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Week of {dateForDay(schedule.weekStart, 0)} – {dateForDay(schedule.weekStart, 6)} · solver {schedule.solverStatus ?? "—"} · {schedule.solveMs ?? "—"} ms ·
              objective {schedule.objectiveValue?.toFixed(0) ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.open(`/api/schedules/${params.id}/export`, "_blank")}>
              ⬇ Tracks export
            </Button>
            {tab === "report" && (
              <Button variant="secondary" onClick={() => window.print()}>
                🖨 Print
              </Button>
            )}
            <Button onClick={resolve} disabled={resolving} title="Apply queued personnel changes and re-solve">
              {resolving ? (
                <>
                  <Spinner /> Re-solving…
                </>
              ) : (
                "Apply changes & re-solve"
              )}
            </Button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Unsaved-changes action bar */}
      {dirty && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-800">You have unsaved edits. They won&apos;t be persisted until you save.</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={discardChanges} disabled={saving}>
              Discard
            </Button>
            <Button onClick={saveChanges} disabled={saving}>
              {saving ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="no-print flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              "relative px-4 py-2 text-sm font-medium",
              tab === t.id ? "text-brand" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.id === "gaps" && blocking + warning > 0 && (
              <span className={clsx("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", blocking ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")}>
                {blocking + warning}
              </span>
            )}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />}
          </button>
        ))}
      </div>

      <Card className="p-4">
        {tab === "grid" && <GridEditor detail={draftDetail} onCellClick={openEditor} gaps={gapList} />}
        {tab === "timeline" && <TimelineView detail={draftDetail} onShiftChange={updateShift} />}
        {tab === "report" && <PrintableReport detail={draftDetail} />}
        {tab === "gaps" && <GapReportView gaps={gapList} />}
      </Card>

      {editing && (
        <SliderEditor
          employee={editing.employee}
          dayOfWeek={editing.dayOfWeek}
          assignment={editing.assignment}
          onClose={() => setEditing(null)}
          onSave={saveShift}
          onDelete={editing.assignment ? deleteShift : undefined}
        />
      )}

      {pendingDiscard && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="You have unsaved edits to this schedule. If you continue now, those changes will be lost."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          tone="danger"
          onCancel={() => setPendingDiscard(null)}
          onConfirm={() => {
            const action = pendingDiscard;
            setPendingDiscard(null);
            action();
          }}
        />
      )}
    </div>
  );
}
