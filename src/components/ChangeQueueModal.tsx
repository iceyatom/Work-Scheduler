"use client";

import { useEffect, useState } from "react";
import { Button, Spinner, Badge } from "@/components/ui";
import { getJSON, sendJSON } from "@/lib/client";
import { DAY_NAMES } from "@/lib/constants";
import { formatMinutesShort, toHHMM, parseStoreTime } from "@/lib/time";

interface ChangeRow {
  id: string;
  employeeId: string;
  type: "DAY_OFF" | "TERMINATION" | "SUSPENSION" | "LEAVE_OF_ABSENCE" | "AVAILABILITY_CHANGE";
  status: "QUEUED" | "APPLIED" | "DISCARDED";
  dayOfWeek: number | null;
  startMin: number | null;
  endMin: number | null;
  note: string | null;
  payload: { windows?: { dayOfWeek: number; startMin: number; endMin: number }[] } | null;
  createdAt: string;
  employee: { id: string; name: string };
}
interface EmployeeOpt {
  id: string;
  name: string;
}

const TYPE_LABEL: Record<ChangeRow["type"], string> = {
  DAY_OFF: "Day off",
  TERMINATION: "Termination",
  SUSPENSION: "Suspension",
  LEAVE_OF_ABSENCE: "Leave of absence",
  AVAILABILITY_CHANGE: "Availability change",
};

// Personnel change queue, surfaced as a modal from the schedule editor. Queued
// changes are applied by "Apply changes & re-solve". onQueueChanged reports the
// current pending count back to the editor so it can enable/disable re-solve.
export function ChangeQueueModal({ onClose, onQueueChanged }: { onClose: () => void; onQueueChanged: (queuedCount: number) => void }) {
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<ChangeRow["type"]>("DAY_OFF");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [partial, setPartial] = useState(false);
  const [startMin, setStartMin] = useState(11 * 60);
  const [endMin, setEndMin] = useState(15 * 60);
  const [note, setNote] = useState("");
  const [availWindows, setAvailWindows] = useState<{ dayOfWeek: number; startMin: number; endMin: number }[]>([]);

  async function load() {
    try {
      const [c, e] = await Promise.all([getJSON<ChangeRow[]>("/api/changes"), getJSON<EmployeeOpt[]>("/api/employees")]);
      setChanges(c);
      setEmployees(e);
      onQueueChanged(c.filter((x) => x.status === "QUEUED").length);
      if (e.length && !employeeId) setEmployeeId(e[0].id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addChange() {
    setError(null);
    try {
      const body: Record<string, unknown> = { employeeId, type, note: note || null };
      if (type === "DAY_OFF") {
        body.dayOfWeek = dayOfWeek;
        if (partial) {
          body.startMin = startMin;
          body.endMin = endMin;
        }
      } else if (type === "AVAILABILITY_CHANGE") {
        body.payload = { windows: availWindows };
      }
      await sendJSON("/api/changes", "POST", body);
      setNote("");
      setAvailWindows([]);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    await sendJSON(`/api/changes/${id}`, "DELETE");
    load();
  }

  const queued = changes.filter((c) => c.status === "QUEUED");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Personnel change queue</h3>
            <p className="text-xs text-slate-500">Queue changes, then use “Apply changes &amp; re-solve” to apply them to this schedule.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close change queue">
            ✕
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto scroll-thin p-5">
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          {/* Queue form */}
          <div className="rounded-lg border border-slate-200 p-4">
            <h4 className="mb-3 text-sm font-semibold text-slate-900">Queue a change</h4>
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label>
                <span className="mb-1 block font-medium text-slate-600">Employee</span>
                <select className="rounded border border-slate-300 px-2 py-1.5" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1 block font-medium text-slate-600">Type</span>
                <select className="rounded border border-slate-300 px-2 py-1.5" value={type} onChange={(e) => setType(e.target.value as ChangeRow["type"])}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              {type === "DAY_OFF" && (
                <>
                  <label>
                    <span className="mb-1 block font-medium text-slate-600">Day</span>
                    <select className="rounded border border-slate-300 px-2 py-1.5" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                      {DAY_NAMES.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 pb-2">
                    <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> Partial day
                  </label>
                  {partial && (
                    <div className="flex items-center gap-1 pb-1">
                      <input type="time" step={900} value={toHHMM(startMin)} onChange={(e) => setStartMin(parseStoreTime(e.target.value))} className="rounded border border-slate-300 px-2 py-1.5" />
                      <span className="text-slate-400">to</span>
                      <input type="time" step={900} value={toHHMM(endMin)} onChange={(e) => setEndMin(parseStoreTime(e.target.value))} className="rounded border border-slate-300 px-2 py-1.5" />
                    </div>
                  )}
                </>
              )}

              <label className="flex-1">
                <span className="mb-1 block font-medium text-slate-600">Note</span>
                <input className="w-full rounded border border-slate-300 px-2 py-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
              </label>
              <Button onClick={addChange} disabled={!employeeId}>
                Queue change
              </Button>
            </div>

            {type === "AVAILABILITY_CHANGE" && (
              <div className="mt-3 rounded-md bg-slate-50 p-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">New availability windows (replaces existing)</span>
                  <Button variant="ghost" className="text-brand" onClick={() => setAvailWindows([...availWindows, { dayOfWeek: 0, startMin: 9 * 60, endMin: 17 * 60 }])}>
                    + Add window
                  </Button>
                </div>
                {availWindows.length === 0 ? (
                  <p className="text-xs text-slate-400">Add at least one window.</p>
                ) : (
                  availWindows.map((w, i) => (
                    <div key={i} className="mb-1 flex items-center gap-2">
                      <select
                        className="rounded border border-slate-300 px-1 py-1 text-sm"
                        value={w.dayOfWeek}
                        onChange={(e) => setAvailWindows(availWindows.map((x, idx) => (idx === i ? { ...x, dayOfWeek: Number(e.target.value) } : x)))}
                      >
                        {DAY_NAMES.map((d, idx) => (
                          <option key={d} value={idx}>
                            {d.slice(0, 3)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(w.startMin)}
                        onChange={(e) => setAvailWindows(availWindows.map((x, idx) => (idx === i ? { ...x, startMin: parseStoreTime(e.target.value) } : x)))}
                        className="rounded border border-slate-300 px-1 py-1 text-sm"
                      />
                      <input
                        type="time"
                        step={900}
                        value={toHHMM(w.endMin)}
                        onChange={(e) => setAvailWindows(availWindows.map((x, idx) => (idx === i ? { ...x, endMin: parseStoreTime(e.target.value) } : x)))}
                        className="rounded border border-slate-300 px-1 py-1 text-sm"
                      />
                      <button onClick={() => setAvailWindows(availWindows.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600">
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Queued list */}
          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <h4 className="text-sm font-semibold text-slate-900">Queue ({queued.length} pending)</h4>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                <Spinner /> Loading…
              </div>
            ) : changes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No changes queued.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto scroll-thin">
                {changes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{c.employee?.name}</span>
                        <Badge color="blue">{TYPE_LABEL[c.type]}</Badge>
                        <Badge color={c.status === "QUEUED" ? "amber" : c.status === "APPLIED" ? "green" : "slate"}>{c.status}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {c.type === "DAY_OFF" && c.dayOfWeek != null && (
                          <>
                            {DAY_NAMES[c.dayOfWeek]}
                            {c.startMin != null && c.endMin != null ? ` ${formatMinutesShort(c.startMin)}–${formatMinutesShort(c.endMin)}` : " (whole day)"}
                          </>
                        )}
                        {c.type === "AVAILABILITY_CHANGE" && c.payload?.windows && <>{c.payload.windows.length} new window(s)</>}
                        {c.note ? ` · ${c.note}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(c.id)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
