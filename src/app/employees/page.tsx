"use client";

import { useEffect, useState } from "react";
import { Button, Card, Spinner, Badge, ErrorBanner } from "@/components/ui";
import { EmployeeForm, emptyDraft, type EmployeeDraft } from "@/components/EmployeeForm";
import { getJSON, sendJSON } from "@/lib/client";
import { DAY_NAMES } from "@/lib/constants";
import { formatMinutesShort, hoursFromMin } from "@/lib/time";

interface ApiEmployee extends EmployeeDraft {
  id: string;
  availability: { dayOfWeek: number; startMin: number; endMin: number }[];
}

function toDraft(e: ApiEmployee): EmployeeDraft {
  return {
    id: e.id,
    name: e.name,
    employmentType: e.employmentType,
    isManager: e.isManager,
    isGM: e.isGM,
    isMinor: e.isMinor,
    active: e.active,
    performance: e.performance,
    minHoursPerWeek: e.minHoursPerWeek,
    maxHoursPerWeek: e.maxHoursPerWeek,
    availability: e.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
    hardSets: (e.hardSets ?? []).map((h) => ({ dayOfWeek: h.dayOfWeek, startMin: h.startMin, endMin: h.endMin, note: h.note })),
  };
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmployeeDraft | null>(null);

  async function load() {
    try {
      setEmployees(await getJSON<ApiEmployee[]>("/api/employees"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string, name: string) {
    if (!confirm(`Delete ${name}? This also removes them from any schedules.`)) return;
    await sendJSON(`/api/employees/${id}`, "DELETE");
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-sm text-slate-500">Roster, availability and hard-set shifts.</p>
        </div>
        <Button onClick={() => setEditing(emptyDraft())}>+ Add employee</Button>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-slate-500">
          <Spinner /> Loading…
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {employees.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{e.name}</span>
                    {e.isManager && <Badge color="purple">{e.isGM ? "GM" : "Mgr"}</Badge>}
                    {e.isMinor && <Badge color="amber">Minor</Badge>}
                    {!e.active && <Badge color="red">Inactive</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {e.employmentType === "FULL_TIME" ? "Full-time" : "Part-time"} · perf {e.performance}
                    {e.maxHoursPerWeek ? ` · ≤${e.maxHoursPerWeek}h/wk` : ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(toDraft(e))}>
                    Edit
                  </Button>
                  <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(e.id, e.name)}>
                    Delete
                  </Button>
                </div>
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                {e.availability.length === 0 ? (
                  <span className="text-amber-600">No availability set</span>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {DAY_NAMES.map((d, day) => {
                      const wins = e.availability.filter((a) => a.dayOfWeek === day);
                      if (wins.length === 0) return null;
                      return (
                        <span key={d}>
                          <span className="font-medium text-slate-600">{d.slice(0, 3)}</span>{" "}
                          {wins.map((w) => `${formatMinutesShort(w.startMin)}–${formatMinutesShort(w.endMin)}`).join(", ")}
                        </span>
                      );
                    })}
                  </div>
                )}
                {e.hardSets && e.hardSets.length > 0 && (
                  <div className="mt-1 text-brand-dark">🔒 {e.hardSets.length} hard-set shift{e.hardSets.length > 1 ? "s" : ""}</div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <EmployeeForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
