"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Spinner, Badge, ErrorBanner } from "@/components/ui";
import { getJSON, sendJSON } from "@/lib/client";
import { mondayOf, isoDate } from "@/lib/time";
import type { ScheduleSummary } from "@/lib/view-types";
import type { GapItem } from "@/lib/types";

function gapCounts(gaps: GapItem[] | null) {
  const blocking = gaps?.filter((g) => g.severity === "BLOCKING").length ?? 0;
  const warning = gaps?.filter((g) => g.severity === "WARNING").length ?? 0;
  return { blocking, warning };
}

export default function DashboardPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [empCount, setEmpCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("Weekly schedule");
  const [weekStart, setWeekStart] = useState(() => isoDate(mondayOf(new Date())));

  async function load() {
    try {
      const [s, emps] = await Promise.all([getJSON<ScheduleSummary[]>("/api/schedules"), getJSON<unknown[]>("/api/employees")]);
      setSchedules(s);
      setEmpCount(emps.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const schedule = await sendJSON<{ id: string }>("/api/schedules/generate", "POST", { name, weekStart });
      router.push(`/schedule/${schedule.id}`);
    } catch (e) {
      setError((e as Error).message);
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this schedule?")) return;
    await sendJSON(`/api/schedules/${id}`, "DELETE");
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Generate and manage weekly store schedules.</p>
        </div>
        <Link href="/employees" className="text-sm font-medium text-brand hover:underline">
          {empCount ?? "…"} employees →
        </Link>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Generate a new schedule</h2>
        <p className="mb-4 text-sm text-slate-500">
          F-1 · builds an optimal weekly schedule from a blank slate using the current roster, availability and preferences.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Name</span>
            <input className="w-56 rounded-md border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-600">Week starting (Mon)</span>
            <input type="date" className="rounded-md border border-slate-300 px-3 py-2" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
          <Button onClick={generate} disabled={generating || (empCount ?? 0) === 0}>
            {generating ? (
              <>
                <Spinner /> Solving…
              </>
            ) : (
              "Generate schedule"
            )}
          </Button>
          {generating && <span className="text-sm text-slate-500">The CP-SAT solver may take a few seconds.</span>}
        </div>
        {(empCount ?? 0) === 0 && !loading && (
          <p className="mt-3 text-sm text-amber-700">No employees yet — add some on the Employees page (or run the seed) before generating.</p>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Schedules</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-slate-500">
            <Spinner /> Loading…
          </div>
        ) : schedules.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No schedules yet. Generate one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {schedules.map((s) => {
              const { blocking, warning } = gapCounts(s.gaps);
              return (
                <li key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <Link href={`/schedule/${s.id}`} className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{s.name}</span>
                      <Badge color={s.generatedFrom === "RESOLVE" ? "blue" : "purple"}>{s.generatedFrom === "RESOLVE" ? "Re-solved" : "Generated"}</Badge>
                      <Badge color="slate">{s.solverStatus ?? "—"}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Week of {s.weekStart.slice(0, 10)} · {s._count?.assignments ?? 0} shifts · solved in {s.solveMs ?? "—"} ms
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {blocking > 0 && <Badge color="red">{blocking} blocking</Badge>}
                    {warning > 0 && <Badge color="amber">{warning} warnings</Badge>}
                    {blocking === 0 && warning === 0 && <Badge color="green">No gaps</Badge>}
                    <Button variant="ghost" onClick={() => remove(s.id)} className="text-red-600 hover:bg-red-50">
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
