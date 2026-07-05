"use client";

import clsx from "clsx";
import { ExportIcon, LockIcon, PrinterIcon } from "@/components/icons";

/* Simulated (static, data-free) versions of the real app screens, used by the
   /tutorial walkthrough. Elements a tutorial step can spotlight carry a
   data-tut="key" attribute; keys are referenced from the step definitions in
   src/app/tutorial/page.tsx. Keep the look close to the real pages so the
   walkthrough transfers, but no interactivity is needed. */

export type MockScreenId = "dashboard" | "employees" | "employee-form" | "schedule-grid" | "schedule-gaps" | "schedule-report";

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>{children}</span>;
}

function MockButton({ variant = "primary", tut, children }: { variant?: "primary" | "secondary"; tut?: string; children: React.ReactNode }) {
  return (
    <span
      data-tut={tut}
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
        variant === "primary" ? "bg-brand text-white" : "border border-slate-300 bg-surface text-slate-700",
      )}
    >
      {children}
    </span>
  );
}

function MockDashboard() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <div className="text-lg font-bold text-slate-900">Dashboard</div>
        <div className="text-xs text-slate-500">Generate and manage weekly store schedules.</div>
      </div>

      <div data-tut="generate-card" className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Generate a new schedule</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span data-tut="week-label" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600">
            Label: <span className="font-semibold text-slate-900">Week of Jul 6</span>
          </span>
          <MockButton tut="generate-btn">Generate schedule</MockButton>
          <MockButton tut="constraints-btn" variant="secondary">
            ⚙ Customize constraints
          </MockButton>
        </div>
      </div>

      <div data-tut="schedule-list" className="overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900">Your schedules</div>
        <div data-tut="open-schedule" className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="font-medium text-slate-900">Week of Jun 29</span>
            <Chip className="bg-brand-light text-brand-dark">Generated</Chip>
            <Chip className="bg-amber-100 text-amber-800">2 warnings</Chip>
          </div>
          <span className="text-xs font-medium text-brand">Open →</span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span className="font-medium text-slate-900">Week of Jun 22</span>
            <Chip className="bg-blue-100 text-blue-700">Re-solved</Chip>
            <Chip className="bg-green-100 text-green-700">No gaps</Chip>
          </div>
          <span className="text-xs font-medium text-brand">Open →</span>
        </div>
      </div>
    </div>
  );
}

const MOCK_EMPLOYEES = [
  { name: "Nicole W", chips: ["GM", "Manager", "Full-time"], avail: "Mon–Sun · all day", hardSets: 0 },
  { name: "Dianna R", chips: ["Manager", "Full-time"], avail: "Mon–Fri · 5:00–15:00", hardSets: 1 },
  { name: "Jaden P", chips: ["Minor", "Part-time"], avail: "School nights until 22:00", hardSets: 0 },
];

function MockEmployees() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold text-slate-900">Employees</div>
          <div className="text-xs text-slate-500">Your roster, availability, and roles.</div>
        </div>
        <MockButton tut="add-employee">+ Add employee</MockButton>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
        {MOCK_EMPLOYEES.map((e, i) => (
          <div key={e.name} data-tut={i === 0 ? "employee-row" : undefined} className={clsx("px-4 py-2.5", i > 0 && "border-t border-slate-100")}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-900">{e.name}</span>
              {e.chips.map((c) => (
                <Chip
                  key={c}
                  className={
                    c === "GM" || c === "Manager"
                      ? "bg-brand-light text-brand-dark"
                      : c === "Minor"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                  }
                >
                  {c}
                </Chip>
              ))}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {e.avail}
              {e.hardSets > 0 && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-brand-dark">
                  <LockIcon className="h-3 w-3" /> {e.hardSets} hard-set shift
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormRow({ label, tut, children }: { label: string; tut?: string; children: React.ReactNode }) {
  return (
    <div data-tut={tut} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-700">{children}</div>
    </div>
  );
}

function MockEmployeeForm() {
  return (
    <div className="p-4">
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-surface p-4 shadow-md">
        <div className="text-sm font-semibold text-slate-900">Edit employee — Jaden P</div>
        <div className="mt-3 space-y-2">
          <FormRow label="Roles" tut="role-flags">
            {["Manager", "GM", "Minor ✓"].map((r) => (
              <Chip key={r} className={r.includes("✓") ? "bg-brand-light text-brand-dark" : "bg-slate-100 text-slate-500"}>
                {r}
              </Chip>
            ))}
            <Chip className="bg-slate-100 text-slate-500">Part-time ✓</Chip>
          </FormRow>
          <FormRow label="Weekly hours" tut="hours">
            <span>
              min <span className="font-semibold text-slate-900">12h</span> · max <span className="font-semibold text-slate-900">24h</span>
            </span>
          </FormRow>
          <FormRow label="Availability windows" tut="availability">
            <Chip className="bg-emerald-100 text-emerald-800">Mon 15:00–22:00</Chip>
            <Chip className="bg-emerald-100 text-emerald-800">Wed 15:00–22:00</Chip>
            <Chip className="bg-emerald-100 text-emerald-800">Sat 8:00–12:30 AM</Chip>
          </FormRow>
          <FormRow label="Hard-set shifts" tut="hard-sets">
            <Chip className="gap-1 bg-brand-light text-brand-dark">
              <LockIcon className="h-2.5 w-2.5" /> Fri 16:00–20:00
            </Chip>
            <span className="text-slate-400">always scheduled exactly as entered</span>
          </FormRow>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <MockButton variant="secondary">Cancel</MockButton>
          <MockButton tut="save-employee">Save employee</MockButton>
        </div>
      </div>
    </div>
  );
}

const TABS = ["Grid editor", "Timeline", "Printable report", "Gap report"] as const;

function MockScheduleShell({ activeTab, children }: { activeTab: (typeof TABS)[number]; children: React.ReactNode }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-slate-900">Week of Jul 6</span>
          <Chip className="bg-brand-light text-brand-dark">Generated</Chip>
        </div>
        <div className="flex items-center gap-1.5">
          <MockButton tut="print" variant="secondary">
            <PrinterIcon /> Print
          </MockButton>
          <MockButton tut="queue-changes" variant="secondary">
            Queue changes
          </MockButton>
          <MockButton tut="resolve">Re-solve</MockButton>
        </div>
      </div>

      <div data-tut="tabs" className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <span
            key={t}
            className={clsx(
              "relative px-2.5 py-1.5 text-xs font-medium",
              t === activeTab ? "text-brand" : "text-slate-500",
            )}
          >
            {t}
            {t === activeTab && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />}
          </span>
        ))}
      </div>

      {children}
    </div>
  );
}

type GridCell = { time: string; locked?: boolean } | null;

const GRID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const GRID_ROWS: { name: string; mgr?: boolean; cells: GridCell[] }[] = [
  { name: "Nicole W", mgr: true, cells: [{ time: "5:00–15:30" }, null, { time: "5:00–15:30" }, { time: "11:00–21:30" }, null] },
  { name: "Dianna R", mgr: true, cells: [null, { time: "14:30–12:30" }, { time: "15:00–1:00" }, null, { time: "5:00–13:30" }] },
  { name: "Marcus T", cells: [{ time: "7:00–15:00" }, { time: "11:00–19:30" }, null, { time: "16:00–12:30" }, { time: "11:00–19:30" }] },
  { name: "Jaden P", cells: [null, { time: "15:00–19:00" }, null, { time: "16:00–20:00", locked: true }, null] },
];

function MockGrid() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-surface text-[10px]">
      <div className="grid grid-cols-[80px_repeat(5,1fr)] border-b border-slate-200 bg-slate-50 font-semibold text-slate-500">
        <div className="px-2 py-1.5">Employee</div>
        {GRID_DAYS.map((d) => (
          <div key={d} className="px-1 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      {GRID_ROWS.map((r, ri) => (
        <div key={r.name} className={clsx("grid grid-cols-[80px_repeat(5,1fr)] items-center", ri > 0 && "border-t border-slate-100")}>
          <div className={clsx("truncate px-2 py-1.5 font-medium", r.mgr ? "text-brand-dark" : "text-slate-700")}>{r.name}</div>
          {r.cells.map((c, ci) => (
            <div key={ci} className="p-1" data-tut={ri === 2 && ci === 1 ? "grid-cell" : undefined}>
              {c ? (
                <span
                  className={clsx(
                    "flex items-center justify-center gap-0.5 truncate rounded px-1 py-1 text-center font-medium",
                    c.locked
                      ? "bg-brand-light text-brand-dark"
                      : r.mgr
                        ? "bg-brand/90 text-white"
                        : "bg-emerald-100 text-emerald-800",
                  )}
                >
                  {c.locked && <LockIcon className="h-2.5 w-2.5 shrink-0" />}
                  {c.time}
                </span>
              ) : (
                <span className="block rounded border border-dashed border-slate-200 py-1 text-center text-slate-300">—</span>
              )}
            </div>
          ))}
        </div>
      ))}
      <div data-tut="totals" className="grid grid-cols-[80px_repeat(5,1fr)] border-t border-slate-200 bg-slate-50 font-semibold">
        <div className="px-2 py-1.5 text-slate-500">Daily total</div>
        {["74.5h", "76h", "71h ⚠", "78.5h", "75h"].map((t, i) => (
          <div key={i} className={clsx("py-1.5 text-center", t.includes("⚠") ? "text-amber-700" : "text-emerald-700")}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockGaps() {
  return (
    <div className="space-y-2">
      <div data-tut="gap-summary" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs">
        <Chip className="bg-red-100 text-red-700">1 blocking</Chip>
        <Chip className="bg-amber-100 text-amber-800">2 warnings</Chip>
        <span className="text-slate-500">The schedule is still usable — gaps are ranked by severity.</span>
      </div>
      <div data-tut="gap-item" className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2">
        <div className="text-xs text-red-700">
          <span className="font-semibold">Wed 20:00–21:00</span> — no manager on site
        </div>
        <span data-tut="gap-jump" className="text-[10px] font-medium text-brand underline underline-offset-2">
          Jump to day →
        </span>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="text-xs text-amber-800">
          <span className="font-semibold">Mon 11:00 rush</span> — 1 below target staffing
        </div>
        <span className="text-[10px] font-medium text-brand underline underline-offset-2">Jump to day →</span>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <div className="text-xs text-amber-800">
          <span className="font-semibold">Fri late-night</span> — only 1 crew after cutoff
        </div>
        <span className="text-[10px] font-medium text-brand underline underline-offset-2">Jump to day →</span>
      </div>
    </div>
  );
}

function MockReport() {
  return (
    <div className="space-y-2">
      <div data-tut="report-sheet" className="rounded-lg border border-slate-200 bg-surface p-3">
        <div className="text-center text-xs font-bold text-slate-900">Store #031115 — Weekly Schedule</div>
        <div className="mt-2 space-y-1">
          {["Nicole W", "Dianna R", "Marcus T", "Jaden P"].map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span className="w-16 truncate text-[10px] font-medium text-slate-700">{n}</span>
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-slate-300" style={{ width: `${55 + ((n.length * 7) % 30)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-center text-[10px] text-slate-400">Optimized for the printed Tracks sheet — start day Wednesday</div>
      </div>
      <div data-tut="export-csv" className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-light px-3 py-2 text-xs font-semibold text-brand-dark">
        <ExportIcon /> Download Tracks import file (CSV)
      </div>
    </div>
  );
}

export function MockScreen({ screen }: { screen: MockScreenId }) {
  switch (screen) {
    case "dashboard":
      return <MockDashboard />;
    case "employees":
      return <MockEmployees />;
    case "employee-form":
      return <MockEmployeeForm />;
    case "schedule-grid":
      return (
        <MockScheduleShell activeTab="Grid editor">
          <MockGrid />
        </MockScheduleShell>
      );
    case "schedule-gaps":
      return (
        <MockScheduleShell activeTab="Gap report">
          <MockGaps />
        </MockScheduleShell>
      );
    case "schedule-report":
      return (
        <MockScheduleShell activeTab="Printable report">
          <MockReport />
        </MockScheduleShell>
      );
  }
}
