"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Button, Card, Spinner, Badge, ErrorBanner } from "@/components/ui";
import { GridEditor } from "@/components/GridEditor";
import { TimelineView } from "@/components/TimelineView";
import { PrintableReport } from "@/components/PrintableReport";
import { GapReportView } from "@/components/GapReportView";
import { SliderEditor } from "@/components/SliderEditor";
import { getJSON, sendJSON } from "@/lib/client";
import { dateForDay } from "@/lib/schedule-helpers";
import type { AssignmentRow, ScheduleDetail } from "@/lib/view-types";
import type { EmployeeLite } from "@/lib/validation";

type Tab = "grid" | "timeline" | "report" | "gaps";

const TABS: { id: Tab; label: string }[] = [
  { id: "grid", label: "Grid editor" },
  { id: "timeline", label: "Timeline" },
  { id: "report", label: "Printable report" },
  { id: "gaps", label: "Gap report" },
];

export default function SchedulePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("grid");
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState<{ employee: EmployeeLite; dayOfWeek: number; assignment: AssignmentRow | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getJSON<ScheduleDetail>(`/api/schedules/${params.id}`);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = useCallback(
    (employeeId: string, dayOfWeek: number, assignment: AssignmentRow | null) => {
      const employee = detail?.employees.find((e) => e.id === employeeId);
      if (employee) setEditing({ employee, dayOfWeek, assignment });
    },
    [detail],
  );

  async function saveShift(startMin: number, endMin: number) {
    if (!editing) return;
    await sendJSON(`/api/schedules/${params.id}/assignments`, "PUT", {
      id: editing.assignment?.id,
      employeeId: editing.employee.id,
      dayOfWeek: editing.dayOfWeek,
      startMin,
      endMin,
    });
    setEditing(null);
    await load();
  }

  async function deleteShift() {
    if (!editing?.assignment) return;
    await sendJSON(`/api/schedules/${params.id}/assignments?assignmentId=${editing.assignment.id}`, "DELETE");
    setEditing(null);
    await load();
  }

  async function resolve() {
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

  if (loading)
    return (
      <div className="flex items-center gap-2 py-16 text-slate-500">
        <Spinner /> Loading schedule…
      </div>
    );
  if (error && !detail) return <ErrorBanner message={error} />;
  if (!detail) return null;

  const { schedule } = detail;
  const gapList = schedule.gaps ?? [];
  const blocking = gapList.filter((g) => g.severity === "BLOCKING").length;
  const warning = gapList.filter((g) => g.severity === "WARNING").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="no-print">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              {schedule.name}
              <Badge color={schedule.generatedFrom === "RESOLVE" ? "blue" : "purple"}>{schedule.generatedFrom === "RESOLVE" ? "Re-solved" : "Generated"}</Badge>
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
        {tab === "grid" && <GridEditor detail={detail} onCellClick={openEditor} />}
        {tab === "timeline" && <TimelineView detail={detail} />}
        {tab === "report" && <PrintableReport detail={detail} />}
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
    </div>
  );
}
