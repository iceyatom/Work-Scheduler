"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui";
import { MockScreen, MockScreenId } from "@/components/TutorialMocks";
import { FlagIcon, ManagersIcon, RefreshIcon, ExportIcon, RouteIcon, ValidationIcon, ZapIcon } from "@/components/icons";

/* Guided, simulated walkthroughs. Each step points the spotlight at a
   data-tut target inside a MockScreen (see TutorialMocks.tsx) and explains it
   in a callout bubble. No login or real data involved. */

interface Step {
  screen: MockScreenId;
  target: string; // data-tut key on the mock screen
  title: string;
  body: string;
}

interface Tutorial {
  id: string;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  steps: Step[];
}

const TUTORIALS: Tutorial[] = [
  {
    id: "workflow",
    icon: <RouteIcon />,
    title: "The full workflow",
    blurb: "Roster → generate → review → fix gaps → export. The whole loop, end to end.",
    steps: [
      {
        screen: "employees",
        target: "add-employee",
        title: "1 · Build your roster",
        body: "Everything starts on the Employees page. Add each person once — the solver reuses the roster every week.",
      },
      {
        screen: "employees",
        target: "employee-row",
        title: "Roles drive the rules",
        body: "Flags like GM, Manager, and Minor aren't labels — they activate constraints: manager coverage, GM shift lengths, school-night limits for minors.",
      },
      {
        screen: "employee-form",
        target: "availability",
        title: "Availability windows",
        body: "Per-day windows tell the solver when someone can work. Shifts are only ever placed inside these windows.",
      },
      {
        screen: "employee-form",
        target: "hard-sets",
        title: "Hard-set shifts are promises",
        body: "A hard-set shift is scheduled exactly as entered, no matter what. Use it for fixed commitments; the solver plans everyone else around it.",
      },
      {
        screen: "dashboard",
        target: "generate-card",
        title: "2 · Generate",
        body: "From the Dashboard, give the week a label and generate. Your roster, availability, and store rules are sent to the solver in one click.",
      },
      {
        screen: "dashboard",
        target: "generate-btn",
        title: "The solver does the heavy lifting",
        body: "A constraint solver (CP-SAT) places managers first for gap-free coverage, then fills crew around them — usually in a few seconds.",
      },
      {
        screen: "schedule-grid",
        target: "tabs",
        title: "3 · Review in four views",
        body: "Every schedule opens with a Grid editor, a Timeline, a Printable report, and a Gap report. Same data, different lenses.",
      },
      {
        screen: "schedule-grid",
        target: "grid-cell",
        title: "Edit anything",
        body: "Click any cell to add, move, or resize a shift. Validation runs instantly, so you see rule violations the moment they happen.",
      },
      {
        screen: "schedule-gaps",
        target: "gap-item",
        title: "4 · Fix what the solver couldn't",
        body: "Anything the solver couldn't satisfy shows up here, ranked by severity — you always get the best feasible schedule plus an honest gap list.",
      },
      {
        screen: "schedule-report",
        target: "export-csv",
        title: "5 · Print or export",
        body: "When you're happy, print the weekly sheet or download the Tracks import file. That's the whole loop — see the focused tutorials for deeper dives.",
      },
    ],
  },
  {
    id: "employees",
    icon: <ManagersIcon />,
    title: "Employees & availability",
    blurb: "Roles, weekly hour ranges, availability windows, and hard-set shifts.",
    steps: [
      {
        screen: "employees",
        target: "add-employee",
        title: "Add an employee",
        body: "Open the form with “+ Add employee”. You'll set their roles, hours, and availability in one place.",
      },
      {
        screen: "employee-form",
        target: "role-flags",
        title: "Role flags",
        body: "Manager and GM unlock manager-coverage duties (GM implies Manager). The Minor flag enforces school-night and 10 PM limits automatically.",
      },
      {
        screen: "employee-form",
        target: "hours",
        title: "Weekly hour range",
        body: "Min/max weekly hours steer the solver: it works to meet minimums (especially for full-timers) and never exceeds the max.",
      },
      {
        screen: "employee-form",
        target: "availability",
        title: "Availability windows",
        body: "Add one window per day the person can work. Times past midnight (like 12:30 AM) belong to the previous store day.",
      },
      {
        screen: "employee-form",
        target: "hard-sets",
        title: "Hard-set shifts",
        body: "Hard sets are scheduled verbatim, every week. If one breaks a rule, the schedule still generates — the conflict is reported as a gap instead.",
      },
    ],
  },
  {
    id: "generate",
    icon: <ZapIcon />,
    title: "Generate a schedule",
    blurb: "Label the week, tweak constraints if needed, and let the solver run.",
    steps: [
      {
        screen: "dashboard",
        target: "week-label",
        title: "Label the week",
        body: "Give the schedule a name you'll recognize in the list later — the week's start date works well.",
      },
      {
        screen: "dashboard",
        target: "constraints-btn",
        title: "Customize constraints (optional)",
        body: "Tweak rush windows, labor targets, and coverage rules for this run. Defaults match your store's standing configuration.",
      },
      {
        screen: "dashboard",
        target: "generate-btn",
        title: "Generate",
        body: "One click sends everything to the solver. Managers are placed first, then crew — you'll land on the finished schedule when it's done.",
      },
      {
        screen: "dashboard",
        target: "schedule-list",
        title: "Your schedules",
        body: "Every generated week is saved here with its status and gap count. Open one anytime to review or edit.",
      },
    ],
  },
  {
    id: "edit",
    icon: <ValidationIcon />,
    title: "Edit shifts in the grid",
    blurb: "Adjust the generated schedule by hand with instant validation.",
    steps: [
      {
        screen: "schedule-grid",
        target: "tabs",
        title: "Pick your view",
        body: "The Grid editor is the fastest place to make changes; the Timeline shows coverage over the day at a glance.",
      },
      {
        screen: "schedule-grid",
        target: "grid-cell",
        title: "Click a cell to edit",
        body: "Clicking a cell opens the slider editor for that shift. Purple chips with a lock icon are hard-set shifts — locked to what you promised.",
      },
      {
        screen: "schedule-grid",
        target: "totals",
        title: "Watch the daily totals",
        body: "Totals recompute as you edit and flag days outside the labor band. Card durations show time at the store; totals show paid hours.",
      },
      {
        screen: "schedule-gaps",
        target: "gap-summary",
        title: "Validation follows you",
        body: "Every manual edit re-runs the same rule engine the solver uses, so the gap report always reflects your latest changes.",
      },
    ],
  },
  {
    id: "gaps",
    icon: <FlagIcon />,
    title: "Read the gap report",
    blurb: "What the solver couldn't satisfy, ranked and explained.",
    steps: [
      {
        screen: "schedule-gaps",
        target: "gap-summary",
        title: "Soft rules, honest reporting",
        body: "Coverage targets are soft constraints: instead of failing, the solver returns its best schedule plus a list of what fell short.",
      },
      {
        screen: "schedule-gaps",
        target: "gap-item",
        title: "Blocking vs. warning",
        body: "Red items (like a missing manager) need attention before the week runs. Amber items are below-target staffing you may accept.",
      },
      {
        screen: "schedule-gaps",
        target: "gap-jump",
        title: "Jump straight to the problem",
        body: "Each gap links to its day so you can fix it in the editor — add a shift, extend one, or accept the gap knowingly.",
      },
    ],
  },
  {
    id: "changes",
    icon: <RefreshIcon />,
    title: "Personnel changes & re-solve",
    blurb: "Someone quit or changed availability? Queue it and re-solve.",
    steps: [
      {
        screen: "schedule-grid",
        target: "queue-changes",
        title: "Queue the change",
        body: "Record departures, new hires, or availability changes in the queue — they don't touch the schedule yet.",
      },
      {
        screen: "schedule-grid",
        target: "resolve",
        title: "Re-solve",
        body: "Re-solve applies the queued changes and generates a fresh schedule that respects them, keeping everything else as stable as it can.",
      },
      {
        screen: "dashboard",
        target: "schedule-list",
        title: "Both versions are kept",
        body: "The re-solved week appears alongside the original (marked “Re-solved”), so you can compare before committing to the new plan.",
      },
    ],
  },
  {
    id: "export",
    icon: <ExportIcon />,
    title: "Print & export",
    blurb: "The printable weekly sheet and the Tracks import file.",
    steps: [
      {
        screen: "schedule-report",
        target: "tabs",
        title: "The printable report",
        body: "The Printable report tab formats the week like the paper sheet your crew already reads (it starts on Wednesday, like Tracks).",
      },
      {
        screen: "schedule-report",
        target: "print",
        title: "Print it",
        body: "Print gives you a clean, ink-friendly sheet — everything else on the page is hidden automatically.",
      },
      {
        screen: "schedule-report",
        target: "export-csv",
        title: "Export to Tracks",
        body: "Download the CSV to import the week into Taco Bell Tracks instead of re-typing it.",
      },
    ],
  },
];

interface SpotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function TutorialRunner({ tutorial, onExit }: { tutorial: Tutorial; onExit: () => void }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<SpotRect | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const step = tutorial.steps[idx];
  const last = idx === tutorial.steps.length - 1;

  const measure = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const el = stage.querySelector<HTMLElement>(`[data-tut="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pad = 6;
    setRect({ left: r.left - s.left - pad, top: r.top - s.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }, [step.target]);

  useLayoutEffect(measure, [measure, step.screen]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const next = useCallback(() => (last ? onExit() : setIdx((i) => i + 1)), [last, onExit]);
  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, onExit]);

  // Callout below the target when there's room, otherwise above.
  const stageH = stageRef.current?.clientHeight ?? 0;
  const stageW = stageRef.current?.clientWidth ?? 0;
  const below = rect ? rect.top + rect.height + 190 < stageH || rect.top < 170 : true;
  const bubbleW = 300;
  const bubbleLeft = rect ? Math.max(8, Math.min(rect.left + rect.width / 2 - bubbleW / 2, stageW - bubbleW - 8)) : 8;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-brand-dark [&_svg]:h-5 [&_svg]:w-5">{tutorial.icon}</span>
          <span className="font-semibold text-slate-900">{tutorial.title}</span>
          <span className="text-sm text-slate-500">
            · Step {idx + 1} of {tutorial.steps.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {tutorial.steps.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setIdx(i)}
              className={clsx("h-2 rounded-full transition-all", i === idx ? "w-6 bg-brand" : "w-2 bg-slate-300 hover:bg-slate-400")}
            />
          ))}
        </div>
      </div>

      <div className="relative">
        {/* Simulated screen (clips the spotlight's dim layer). */}
        <div ref={stageRef} className="relative min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <MockScreen screen={step.screen} />
          {rect && (
            <>
              <div
                className="tut-dim pointer-events-none absolute rounded-lg transition-all duration-300"
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
              />
              <div
                className="tut-ring pointer-events-none absolute rounded-lg transition-all duration-300"
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
              />
            </>
          )}
        </div>

        {/* Callout bubble (outside the stage so it never gets clipped). */}
        {rect && (
          <div
            className="absolute z-10 transition-all duration-300"
            style={{
              left: bubbleLeft,
              width: bubbleW,
              ...(below ? { top: rect.top + rect.height + 14 } : { top: rect.top - 14, transform: "translateY(-100%)" }),
            }}
          >
            <div
              className={clsx(
                "absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-brand/40 bg-surface",
                below ? "-top-1.5 border-l border-t" : "-bottom-1.5 border-b border-r",
              )}
              style={{ left: Math.max(20, Math.min(rect.left + rect.width / 2 - bubbleLeft, bubbleW - 20)) }}
            />
            <div className="rounded-xl border border-brand/40 bg-surface p-4 shadow-xl">
              <div className="font-semibold text-slate-900">{step.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
              <div className="mt-3 flex items-center justify-between">
                <button onClick={onExit} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  Exit tour
                </button>
                <div className="flex gap-2">
                  <Button variant="secondary" className="!px-2.5 !py-1.5 text-xs" onClick={back} disabled={idx === 0}>
                    ← Back
                  </Button>
                  <Button className="!px-2.5 !py-1.5 text-xs" onClick={next}>
                    {last ? "Finish ✓" : "Next →"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Simulated screens — nothing here touches your real roster. Use ← → keys to navigate, Esc to exit.
      </p>
    </div>
  );
}

export default function TutorialPage() {
  const [active, setActive] = useState<Tutorial | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      {active ? (
        <TutorialRunner key={active.id} tutorial={active} onExit={() => setActive(null)} />
      ) : (
        <>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">Learn the Schedule Generator</h1>
            <p className="mx-auto mt-2 max-w-2xl text-slate-500">
              Guided walkthroughs on simulated screens — no account or data needed. Start with the full workflow, or jump into a
              specific feature.
            </p>
          </div>

          {/* Featured: the full workflow */}
          <button
            onClick={() => setActive(TUTORIALS[0])}
            className="mt-8 block w-full rounded-2xl border border-brand/30 bg-gradient-to-r from-brand-light to-surface p-6 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface text-brand-dark shadow-sm [&_svg]:h-6 [&_svg]:w-6">
                  {TUTORIALS[0].icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-900">{TUTORIALS[0].title}</span>
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">START HERE</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{TUTORIALS[0].blurb}</p>
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-brand">
                {TUTORIALS[0].steps.length} steps →
              </span>
            </div>
          </button>

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-400">Feature tutorials</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TUTORIALS.slice(1).map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t)}
                className="rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-light text-brand-dark [&_svg]:h-6 [&_svg]:w-6">{t.icon}</div>
                <div className="mt-3 font-semibold text-slate-900">{t.title}</div>
                <p className="mt-1 text-sm text-slate-500">{t.blurb}</p>
                <div className="mt-3 text-xs font-medium text-brand">{t.steps.length} steps →</div>
              </button>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-slate-500">
            Ready to do it for real?{" "}
            <Link href="/" className="font-semibold text-brand underline-offset-2 hover:underline">
              Sign in and build your week →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
