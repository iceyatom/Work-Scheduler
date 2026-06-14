"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
  { href: "/changes", label: "Change queue" },
];

interface Me {
  id: string;
  username: string;
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
    <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
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

        {ready && (
          <div className="ml-auto flex items-center gap-2 py-1.5">
            {me ? (
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
                <Link href="/" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">
                  Sign in
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </header>
  );
}
