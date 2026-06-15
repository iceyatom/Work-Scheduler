"use client";

import { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { DAY_NAMES } from "@/lib/constants";
import { toHHMM, parseStoreTime, hoursFromMin } from "@/lib/time";
import { deriveShift } from "@/lib/validation";
import { validateEmployee } from "@/lib/employee-validation";
import { sendJSON } from "@/lib/client";

type Window = { dayOfWeek: number; startMin: number; endMin: number };
type HardSet = { dayOfWeek: number; startMin: number; endMin: number; note?: string | null };

export interface EmployeeDraft {
  id?: string;
  name: string;
  employmentType: "FULL_TIME" | "PART_TIME";
  isManager: boolean;
  isGM: boolean;
  isMinor: boolean;
  active: boolean;
  performance: number;
  minHoursPerWeek: number | null;
  maxHoursPerWeek: number | null;
  availability: Window[];
  hardSets: HardSet[];
}

export function emptyDraft(): EmployeeDraft {
  return {
    name: "",
    employmentType: "PART_TIME",
    isManager: false,
    isGM: false,
    isMinor: false,
    active: true,
    performance: 3,
    minHoursPerWeek: null,
    maxHoursPerWeek: null,
    availability: [],
    hardSets: [],
  };
}

function TimeField({ value, onChange }: { value: number; onChange: (min: number) => void }) {
  return <input type="time" step={900} value={toHHMM(value)} onChange={(e) => onChange(parseStoreTime(e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-sm" />;
}

export function EmployeeForm({ initial, onClose, onSaved }: { initial: EmployeeDraft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<EmployeeDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<EmployeeDraft>) => setD((cur) => ({ ...cur, ...patch }));

  const errors = validateEmployee(d);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (d.id) await sendJSON(`/api/employees/${d.id}`, "PATCH", d);
      else await sendJSON("/api/employees", "POST", d);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{d.id ? "Edit employee" : "Add employee"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="space-y-5">
          {/* Basics */}
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">Name</span>
              <input className="w-full rounded border border-slate-300 px-2 py-1.5" value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-600">Employment type</span>
              <select className="w-full rounded border border-slate-300 px-2 py-1.5" value={d.employmentType} onChange={(e) => set({ employmentType: e.target.value as EmployeeDraft["employmentType"] })}>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            {/* GM overrides Manager: checking GM forces (and locks) Manager on. */}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={d.isManager || d.isGM} disabled={d.isGM} onChange={(e) => set({ isManager: e.target.checked })} />
              Manager
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={d.isGM}
                onChange={(e) => set(e.target.checked ? { isGM: true, isManager: true } : { isGM: false })}
              />
              GM (10.5h shifts)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={d.isMinor} onChange={(e) => set({ isMinor: e.target.checked })} />
              Minor
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} />
              Active
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="mb-1 block font-medium text-slate-600">Performance 1–5</span>
              <input type="number" min={1} max={5} className="w-full rounded border border-slate-300 px-2 py-1.5" value={d.performance} onChange={(e) => set({ performance: Number(e.target.value) })} />
            </label>
            <label>
              <span className="mb-1 block font-medium text-slate-600">Min/Max h/wk</span>
              <div className="flex gap-1">
                <input type="number" placeholder="min" className="w-full rounded border border-slate-300 px-1 py-1.5" value={d.minHoursPerWeek ?? ""} onChange={(e) => set({ minHoursPerWeek: e.target.value === "" ? null : Number(e.target.value) })} />
                <input type="number" placeholder="max" className="w-full rounded border border-slate-300 px-1 py-1.5" value={d.maxHoursPerWeek ?? ""} onChange={(e) => set({ maxHoursPerWeek: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
            </label>
          </div>

          {/* Availability */}
          <ListEditor
            title="Availability windows"
            items={d.availability}
            onAdd={() => set({ availability: [...d.availability, { dayOfWeek: 0, startMin: 9 * 60, endMin: 17 * 60 }] })}
            onRemove={(i) => set({ availability: d.availability.filter((_, idx) => idx !== i) })}
            onDuplicate={(i) => set({ availability: insertCopy(d.availability, i) })}
            render={(w, i) => (
              <>
                <DaySelect value={w.dayOfWeek} onChange={(v) => updateAt(d.availability, i, { dayOfWeek: v }, (next) => set({ availability: next }))} />
                <TimeField value={w.startMin} onChange={(v) => updateAt(d.availability, i, { startMin: v }, (next) => set({ availability: next }))} />
                <span className="text-slate-400">to</span>
                <TimeField value={w.endMin} onChange={(v) => updateAt(d.availability, i, { endMin: v }, (next) => set({ availability: next }))} />
                <ShiftTotals startMin={w.startMin} endMin={w.endMin} />
              </>
            )}
          />

          {/* Hard-set shifts */}
          <ListEditor
            title="Hard-set shifts (recurring lock, e.g. GM)"
            items={d.hardSets}
            onAdd={() => set({ hardSets: [...d.hardSets, { dayOfWeek: 0, startMin: 6 * 60, endMin: 16 * 60 + 30 }] })}
            onRemove={(i) => set({ hardSets: d.hardSets.filter((_, idx) => idx !== i) })}
            onDuplicate={(i) => set({ hardSets: insertCopy(d.hardSets, i) })}
            render={(h, i) => (
              <>
                <DaySelect value={h.dayOfWeek} onChange={(v) => updateAt(d.hardSets, i, { dayOfWeek: v }, (next) => set({ hardSets: next }))} />
                <TimeField value={h.startMin} onChange={(v) => updateAt(d.hardSets, i, { startMin: v }, (next) => set({ hardSets: next }))} />
                <span className="text-slate-400">to</span>
                <TimeField value={h.endMin} onChange={(v) => updateAt(d.hardSets, i, { endMin: v }, (next) => set({ hardSets: next }))} />
                <ShiftTotals startMin={h.startMin} endMin={h.endMin} />
              </>
            )}
          />
        </div>

        {errors.length > 0 && (
          <ul className="mt-5 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errors.map((msg, i) => (
              <li key={i}>⚠️ {msg}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          {errors.length > 0 && <span className="mr-auto text-xs text-slate-500">Resolve {errors.length} issue{errors.length > 1 ? "s" : ""} to save.</span>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || errors.length > 0}>
            {saving ? <Spinner /> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Per-line totals: time at the store (length, incl. unpaid breaks) and paid
// time (length minus the derived unpaid 30-min lunches). Mirrors the grid's
// "duration vs paid" distinction (see deriveShift / breaks rules).
function ShiftTotals({ startMin, endMin }: { startMin: number; endMin: number }) {
  if (endMin <= startMin) {
    return <span className="ml-auto whitespace-nowrap text-xs text-red-500">invalid range</span>;
  }
  const length = endMin - startMin;
  const { paidMinutes } = deriveShift(startMin, endMin);
  return (
    <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-slate-500">
      <span title="Total time at the store (incl. unpaid breaks)">{hoursFromMin(length)}h total</span>
      <span className="mx-1 text-slate-300">·</span>
      <span title="Paid time (length minus unpaid 30-min breaks)">{hoursFromMin(paidMinutes)}h paid</span>
    </span>
  );
}

function updateAt<T>(arr: T[], i: number, patch: Partial<T>, commit: (next: T[]) => void) {
  commit(arr.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
}

// Duplicate the entry at index i, inserting the copy directly after it so the
// new (identical) row sits adjacent and ready to re-day.
function insertCopy<T>(arr: T[], i: number): T[] {
  return [...arr.slice(0, i + 1), { ...arr[i] }, ...arr.slice(i + 1)];
}

function DaySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="rounded border border-slate-300 px-1 py-1 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {DAY_NAMES.map((d, i) => (
        <option key={d} value={i}>
          {d.slice(0, 3)}
        </option>
      ))}
    </select>
  );
}

function ListEditor<T>({
  title,
  items,
  onAdd,
  onRemove,
  onDuplicate,
  render,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onDuplicate: (i: number) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{title}</span>
        <Button variant="ghost" onClick={onAdd} className="text-brand">
          + Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">None</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
              {render(item, i)}
              <button onClick={() => onDuplicate(i)} className="text-slate-400 hover:text-brand" title="Duplicate (copy then change the day)">
                ⧉
              </button>
              <button onClick={() => onRemove(i)} className="text-slate-400 hover:text-red-600" title="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
