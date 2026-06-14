"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/AuthPanel";

const FEATURES = [
  { icon: "🧩", title: "Constraint-based solver", desc: "OR-Tools CP-SAT builds an optimal weekly schedule honoring coverage, labor, and shift rules." },
  { icon: "👔", title: "Managers first", desc: "Managers and the GM are placed first for even, gap-free coverage, then crew fill in around them." },
  { icon: "🛠️", title: "Edit with live validation", desc: "Drag shifts in the grid or slider editor and see rule violations the instant they happen." },
  { icon: "📋", title: "Gap report & Tracks export", desc: "See exactly what's unmet, then export an import-ready file for Taco Bell Tracks." },
];

const STATS = [
  { value: "70–80h", label: "daily labor band" },
  { value: "15-min", label: "scheduling slots" },
  { value: "2", label: "days off / week" },
];

export default function LandingPage() {
  const router = useRouter();

  // Already signed in? Skip straight to the app.
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        if (r.ok) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  return (
    <div className="-mx-4 -my-6">
      {/* Hero */}
      <section className="animated-gradient relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/10 blur-3xl animate-float" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl animate-float" style={{ animationDelay: "2s" }} aria-hidden />

        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-24">
          {/* Copy */}
          <div>
            <span className="animate-fade-up inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-brand-dark ring-1 ring-brand/20" style={{ animationDelay: "0ms" }}>
              For quick-service restaurant managers
            </span>
            <h1 className="animate-fade-up mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl" style={{ animationDelay: "80ms" }}>
              Build a week&apos;s schedule in <span className="text-brand">seconds</span>, not hours.
            </h1>
            <p className="animate-fade-up mt-4 max-w-xl text-lg text-slate-600" style={{ animationDelay: "160ms" }}>
              The Schedule Generator turns your roster, availability, and coverage rules into an optimized, import-ready weekly
              schedule — and shows you exactly what it couldn&apos;t satisfy.
            </p>
            <dl className="animate-fade-up mt-8 flex flex-wrap gap-x-8 gap-y-4" style={{ animationDelay: "240ms" }}>
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="text-2xl font-bold text-slate-900">{s.value}</dt>
                  <dd className="text-sm text-slate-500">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Auth */}
          <div className="animate-fade-up mx-auto w-full max-w-md" style={{ animationDelay: "200ms" }}>
            <AuthPanel />
            <p className="mt-3 text-center text-xs text-slate-500">Your roster and schedules are saved to your account.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold text-slate-900">Everything a store manager needs</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-500">
          Coverage targets, manager presence, minor labor laws, breaks, and days off — all handled, with a manager-friendly editor on top.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="animate-fade-up rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-transform duration-200 hover:-translate-y-1 hover:shadow-md"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-light text-2xl">{f.icon}</div>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-slate-400">
          Work Schedule Generator · constraint-based scheduling for quick-service restaurants
        </div>
      </footer>
    </div>
  );
}
