"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
  { href: "/changes", label: "Change queue" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-bold text-white">WS</span>
          <span className="font-semibold text-slate-900">Schedule Generator</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-brand-light text-brand-dark" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
