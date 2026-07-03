"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@/components/ui";

// Full-screen blocking overlay shown while a schedule is being generated.
//
// It is rendered via a portal to <body> (a sibling of the nav, not nested under
// the page's <main>) with a z-index above the nav, so it reliably covers the
// whole viewport — including the top navigation — and intercepts every click.
// It also installs a beforeunload guard so closing/refreshing is confirmed.
export function GeneratingOverlay({ title = "Generating schedule…", message }: { title?: string; message?: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show their own generic text; returnValue must be set.
      e.returnValue = "Are you sure you want to leave the site?";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-busy="true">
      <div className="mx-4 flex w-full max-w-sm flex-col items-center gap-4 rounded-xl bg-white px-8 py-10 text-center shadow-xl">
        <Spinner className="h-12 w-12 text-brand" />
        <div>
          <p className="text-base font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{message ?? "Please don't navigate away or refresh until it finishes."}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
