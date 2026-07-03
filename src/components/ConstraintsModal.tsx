"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { DAY_NAMES, DEFAULT_CONSTRAINTS, type ConstraintConfig } from "@/lib/constants";
import { toHHMM, parseStoreTime } from "@/lib/time";

// Editor for the solver constraints used when generating a schedule. Holds a
// local working copy; "Apply" hands the edited config back to the dashboard.
export function ConstraintsModal({
  value,
  onApply,
  onClose,
}: {
  value: ConstraintConfig;
  onApply: (cfg: ConstraintConfig) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<ConstraintConfig>(() => structuredClone(value));
  const set = <K extends keyof ConstraintConfig>(key: K, v: ConstraintConfig[K]) => setCfg((c) => ({ ...c, [key]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Customize constraints</h3>
            <p className="text-xs text-slate-500">Tune the targets the solver optimizes against for the next generated schedule.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto scroll-thin p-5">
          {/* Coverage targets */}
          <Section title="Coverage targets" hint="Active staff the solver aims for in each window.">
            <Num label="Baseline floor (hard)" value={cfg.baselineFloorStaff} onChange={(v) => set("baselineFloorStaff", v)} />
            <Num label="Baseline target" value={cfg.baselineTargetStaff} onChange={(v) => set("baselineTargetStaff", v)} />
            <Num label="Rush target" value={cfg.rushTargetStaff} onChange={(v) => set("rushTargetStaff", v)} />
            <Num label="Late-night min" value={cfg.lateNightMinStaff} onChange={(v) => set("lateNightMinStaff", v)} />
            <Num label="Managers on site (min)" value={cfg.managerMinOnSite} onChange={(v) => set("managerMinOnSite", v)} />
          </Section>

          {/* Rush windows */}
          <Section title="Rush windows" hint="High-traffic periods that use the rush target above.">
            <div className="col-span-full space-y-2">
              {cfg.rushWindows.length === 0 && <p className="text-xs text-slate-400">No rush windows — add one below.</p>}
              {cfg.rushWindows.map((w, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    className="w-40 rounded border border-slate-300 px-2 py-1.5 text-sm"
                    value={w.label}
                    placeholder="Label"
                    onChange={(e) => set("rushWindows", cfg.rushWindows.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <input
                    type="time"
                    step={900}
                    value={toHHMM(w.startMin)}
                    onChange={(e) => set("rushWindows", cfg.rushWindows.map((x, idx) => (idx === i ? { ...x, startMin: parseStoreTime(e.target.value) } : x)))}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="time"
                    step={900}
                    value={toHHMM(w.endMin)}
                    onChange={(e) => set("rushWindows", cfg.rushWindows.map((x, idx) => (idx === i ? { ...x, endMin: parseStoreTime(e.target.value) } : x)))}
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button onClick={() => set("rushWindows", cfg.rushWindows.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600" aria-label="Remove rush window">
                    ✕
                  </button>
                </div>
              ))}
              <Button variant="ghost" className="text-brand" onClick={() => set("rushWindows", [...cfg.rushWindows, { label: "Rush", startMin: 11 * 60, endMin: 13 * 60 }])}>
                + Add rush window
              </Button>
            </div>
          </Section>

          {/* Late-night cutoff per day */}
          <Section title="Late-night start (per day)" hint="After this time each day, the late-night minimum applies.">
            {DAY_NAMES.map((d, i) => (
              <Time
                key={d}
                label={d.slice(0, 3)}
                value={cfg.lateNightCutoffMin[i]}
                onChange={(v) => set("lateNightCutoffMin", cfg.lateNightCutoffMin.map((x, idx) => (idx === i ? v : x)))}
              />
            ))}
          </Section>

          {/* Open/close edge */}
          <Section title="Open / close edge" hint="The lean first & last hour of the day.">
            <Hours label="Edge window (hrs)" value={cfg.openEdgeWindowMin} onChange={(v) => set("openEdgeWindowMin", v)} step={0.5} />
            <Num label="Max managers" value={cfg.openEdgeMaxManagers} onChange={(v) => set("openEdgeMaxManagers", v)} />
            <Num label="Max crew" value={cfg.openEdgeMaxCrew} onChange={(v) => set("openEdgeMaxCrew", v)} />
          </Section>

          {/* Daily labor */}
          <Section title="Daily labor targets (hours)" hint="Total paid labor per day.">
            <Hours label="Minimum" value={cfg.dailyLaborMinMin} onChange={(v) => set("dailyLaborMinMin", v)} />
            <Hours label="Soft cap" value={cfg.dailyLaborSoftCapMin} onChange={(v) => set("dailyLaborSoftCapMin", v)} />
            <Hours label="Hard cap" value={cfg.dailyLaborHardCapMin} onChange={(v) => set("dailyLaborHardCapMin", v)} />
          </Section>

          {/* Shift rules */}
          <Section title="Shift rules" hint="Lengths in hours; rest is between adjacent shifts.">
            <Hours label="Min shift" value={cfg.regularShiftMinMin} onChange={(v) => set("regularShiftMinMin", v)} step={0.25} />
            <Hours label="Max shift" value={cfg.regularShiftMaxMin} onChange={(v) => set("regularShiftMaxMin", v)} step={0.25} />
            <Hours label="GM max shift" value={cfg.gmShiftMaxMin} onChange={(v) => set("gmShiftMaxMin", v)} step={0.25} />
            <Hours label="Rest between shifts" value={cfg.minRestBetweenShiftsMin} onChange={(v) => set("minRestBetweenShiftsMin", v)} step={0.5} />
            <Num label="Min days off / week" value={cfg.minDaysOffPerWeek} onChange={(v) => set("minDaysOffPerWeek", v)} max={7} />
          </Section>

          {/* Minor rules */}
          <Section title="Minor rules (school nights)" hint="Limits for minors on school nights.">
            <Hours label="Max shift" value={cfg.minorMaxShiftMin} onChange={(v) => set("minorMaxShiftMin", v)} step={0.25} />
            <Time label="Latest end" value={cfg.minorLatestEndMin} onChange={(v) => set("minorLatestEndMin", v)} />
            <div className="col-span-full">
              <span className="mb-1 block text-xs font-medium text-slate-600">School nights</span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_NAMES.map((d, i) => {
                  const on = cfg.schoolNights.includes(i);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set("schoolNights", on ? cfg.schoolNights.filter((x) => x !== i) : [...cfg.schoolNights, i].sort((a, b) => a - b))}
                      className={
                        "rounded-md px-2.5 py-1 text-xs font-medium " + (on ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100")
                      }
                    >
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <Button variant="ghost" onClick={() => setCfg(structuredClone(DEFAULT_CONSTRAINTS))}>
            Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onApply(cfg)}>Apply constraints</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      {hint && <p className="mb-2 text-xs text-slate-400">{hint}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{children}</div>
    </div>
  );
}

function Num({ label, value, onChange, min = 0, max = 50 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))}
        className="w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums"
      />
    </label>
  );
}

// Minutes stored, shown/edited in hours.
function Hours({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (min: number) => void; step?: number }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={+(value / 60).toFixed(2)}
        onChange={(e) => onChange(Math.max(0, Math.round((Number(e.target.value) || 0) * 60)))}
        className="w-full rounded border border-slate-300 px-2 py-1.5 tabular-nums"
      />
    </label>
  );
}

// Minutes-from-midnight stored, edited as a clock time.
function Time({ label, value, onChange }: { label: string; value: number; onChange: (min: number) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input type="time" step={900} value={toHHMM(value)} onChange={(e) => onChange(parseStoreTime(e.target.value))} className="w-full rounded border border-slate-300 px-2 py-1.5" />
    </label>
  );
}
