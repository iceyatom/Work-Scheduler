"use client";

import { useMemo, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { validateShift, deriveShift, type EmployeeLite } from "@/lib/validation";
import { DAY_NAMES, SLOT_MINUTES, STORE_CLOSE_MIN, STORE_OPEN_MIN } from "@/lib/constants";
import { formatMinutes, hoursFromMin } from "@/lib/time";
import type { AssignmentRow } from "@/lib/view-types";

// Manual shift editor with live validation (spec §7.5). Dragging either slider
// re-validates the shift against availability, shift-length and minor rules and
// surfaces violations immediately.
export function SliderEditor({
  employee,
  dayOfWeek,
  assignment,
  onClose,
  onSave,
  onDelete,
}: {
  employee: EmployeeLite;
  dayOfWeek: number;
  assignment?: AssignmentRow | null;
  onClose: () => void;
  onSave: (startMin: number, endMin: number) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [start, setStart] = useState(assignment?.startMin ?? 9 * 60);
  const [end, setEnd] = useState(assignment?.endMin ?? 13 * 60);
  const [saving, setSaving] = useState(false);

  const violations = useMemo(() => validateShift(employee, dayOfWeek, start, end), [employee, dayOfWeek, start, end]);
  const blocking = violations.filter((v) => v.severity === "BLOCKING");
  const derived = end > start ? deriveShift(start, end) : { breakStarts: [] as number[], paidMinutes: 0 };

  function clampStart(v: number) {
    setStart(Math.min(v, end - SLOT_MINUTES));
  }
  function clampEnd(v: number) {
    setEnd(Math.max(v, start + SLOT_MINUTES));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(start, end);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {employee.name} · {DAY_NAMES[dayOfWeek]}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {assignment ? "Adjust this shift" : "Add a shift"} — drag the sliders to set start and end times.
        </p>

        <div className="space-y-5">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-600">Start</span>
              <span className="tabular-nums text-slate-900">{formatMinutes(start)}</span>
            </div>
            <input
              type="range"
              min={STORE_OPEN_MIN}
              max={STORE_CLOSE_MIN}
              step={SLOT_MINUTES}
              value={start}
              onChange={(e) => clampStart(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-slate-600">End</span>
              <span className="tabular-nums text-slate-900">{formatMinutes(end)}</span>
            </div>
            <input
              type="range"
              min={STORE_OPEN_MIN}
              max={STORE_CLOSE_MIN}
              step={SLOT_MINUTES}
              value={end}
              onChange={(e) => clampEnd(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-4 rounded-md bg-slate-50 px-4 py-2 text-sm text-slate-600">
          <span>
            Length <strong className="text-slate-900">{hoursFromMin(end - start)}h</strong>
          </span>
          <span>
            Paid <strong className="text-slate-900">{hoursFromMin(derived.paidMinutes)}h</strong>
          </span>
          <span>
            {derived.breakStarts.length === 0
              ? "Breaks none"
              : `Break${derived.breakStarts.length > 1 ? "s" : ""} ${derived.breakStarts.map((b) => formatMinutes(b)).join(", ")} (30m each)`}
          </span>
        </div>

        {violations.length > 0 && (
          <ul className="mt-4 space-y-1">
            {violations.map((v, i) => (
              <li key={i} className={v.severity === "BLOCKING" ? "text-sm text-red-600" : "text-sm text-amber-700"}>
                {v.severity === "BLOCKING" ? "⛔" : "⚠️"} {v.message}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div>
            {assignment && onDelete && (
              <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onDelete}>
                Delete shift
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || blocking.length > 0}>
              {saving ? <Spinner /> : "Save shift"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
