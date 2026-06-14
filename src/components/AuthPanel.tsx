"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Button, Spinner } from "@/components/ui";

const PASSWORD_RULES = [
  "At least 8 characters",
  "Uppercase & lowercase letters",
  "A number",
  "A special character",
];

type Mode = "login" | "register";

export function AuthPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, stayLoggedIn }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors(Array.isArray(data.details) && data.details.length ? data.details : [data.error ?? "Something went wrong."]);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setErrors(["Network error — please try again."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["login", "register"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErrors([]);
            }}
            className={clsx("rounded-md py-2 transition-colors", mode === m ? "bg-white text-brand-dark shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            {m === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Username</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-600">Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>

        {mode === "register" && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
            {PASSWORD_RULES.map((r) => (
              <li key={r} className="flex items-center gap-1">
                <span className="text-brand">•</span> {r}
              </li>
            ))}
          </ul>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={stayLoggedIn} onChange={(e) => setStayLoggedIn(e.target.checked)} />
          Stay logged in on this browser
        </label>

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner /> : mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
