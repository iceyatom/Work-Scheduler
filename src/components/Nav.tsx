"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { THEME_MODES, ThemeMode, getThemeMode, setThemeMode, watchSystemTheme } from "@/lib/theme";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
];

interface Me {
  id: string;
  username: string;
}

const MODE_ICONS: Record<ThemeMode, React.ReactNode> = {
  light: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  ),
  system: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  ),
};

/** Hamburger menu: appearance (light/dark/system) + future actions. */
function MainMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");
  const modeRef = useRef(mode);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getThemeMode();
    setMode(stored);
    modeRef.current = stored;
    return watchSystemTheme(() => modeRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: ThemeMode) {
    setMode(next);
    modeRef.current = next;
    setThemeMode(next);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className={clsx(
          "grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100",
          open && "bg-slate-100",
        )}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-slate-200 bg-surface p-3 shadow-lg">
          <div className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Appearance</div>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {THEME_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => pick(m.value)}
                className={clsx(
                  "flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  mode === m.value ? "bg-surface text-brand-dark shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {MODE_ICONS[m.value]}
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-slate-200 pt-2">
            <Link
              href="/tutorial"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Tutorials &amp; guides
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setMe(d))
      .catch(() => active && setMe(null))
      .finally(() => active && setReady(true));
    // Re-check whenever the route changes (e.g. after login/logout navigation).
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4">
        <Link href={me ? "/dashboard" : "/"} className="flex items-center gap-2 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">WS</span>
          <span className="font-semibold text-slate-900">Schedule Generator</span>
        </Link>

        {me && (
          <nav className="flex items-center gap-1">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={clsx(
                    "rounded-md px-2.5 py-2 text-sm font-medium transition-colors sm:px-3",
                    active ? "bg-brand-light text-brand-dark" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2 py-1.5">
          {ready &&
            (me ? (
              <>
                <span className="hidden text-sm text-slate-500 sm:inline">
                  Signed in as <span className="font-medium text-slate-700">{me.username}</span>
                </span>
                <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                  Log out
                </button>
              </>
            ) : (
              pathname !== "/" && (
                <Link href="/" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark dark:hover:bg-violet-600">
                  Sign in
                </Link>
              )
            ))}
          <MainMenu />
        </div>
      </div>
    </header>
  );
}
