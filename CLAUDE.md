# CLAUDE.md

Working notes for the **Work Schedule Generator** — a constraint-based weekly
staff scheduler for a Taco Bell quick-service restaurant (store #031115, Folsom CA).
Read this first; it captures architecture, conventions, and gotchas that aren't
obvious from a quick scan. Keep it updated as the project evolves.

See `README.md` for the user-facing setup/commands and the full constraint spec.

## ⚠️ Critical: never wipe the user's data

The user actively edits employees **in the running app** (e.g. they made Nicole W
the GM with all-day availability and turned off Dianna's GM flag). The live
Postgres DB therefore **diverges from `prisma/seed.ts`** — apparent "drift" (a
flag/availability not matching the seed) is usually their edits, not a bug.

- **Do NOT run `npm run db:seed` / `db:reset` to "get a clean state"** mid-session.
  It wipes all employees/schedules/changes.
- `prisma db push` for a schema change is fine — it only alters the changed
  table/column and preserves employee rows. Use `--accept-data-loss` when it asks
  (the only losses so far have been *derived* columns like break data).
- To verify end-to-end: generate a schedule, inspect it, then **delete just that
  test schedule** (`DELETE /api/schedules/:id`), leaving employees untouched.
- Only re-seed when the user explicitly asks.

## Architecture

Three pieces; the frontend runs on the host, the other two in Docker:

```
Next.js app (host, npm run dev :3000)  ──HTTP/JSON──>  Solver (Docker :8000)
  • UI + API routes + Prisma                            FastAPI + OR-Tools CP-SAT
        │ SQL
        ▼
  PostgreSQL 16 (Docker :5432)
```

- **Solver is stateless**: the app sends the whole problem (employees,
  availability, store config) as JSON to `POST /solve` and gets back assignments +
  a gap report. Prisma owns all persistence. (The spec's SQLAlchemy/DB-reading
  solver is a deferred future step.)
- **Async is faked**: the API calls the solver synchronously and records a `Job`
  row, mirroring the eventual SQS flow. No real queue yet.
- **Tracks export is a placeholder CSV** (`/api/schedules/:id/export`) — the real
  Taco Bell Tracks import schema must be reverse-engineered before it's final.

## Auth & multi-tenancy

- Each company = an **`Account`**; `Employee`/`Schedule`/`PersonnelChange`/`Job`
  carry a (nullable, but always-set) `accountId`. **Invariant: every API query
  must filter/assign by the signed-in `account.id`** — use `getSessionAccount()`
  (`src/lib/auth.ts`); 401 via `unauthorized()` if null. For `[id]` routes, scope
  with `findFirst({ where:{ id, accountId } })` / `deleteMany`/`updateMany` so you
  can't touch another account's rows. `scheduling.ts` fns take `accountId`.
- **Sessions**: random token in an httpOnly cookie (`ws_session`) → `Session`
  row. `createSession(accountId, persistent)`; set/clear on `NextResponse`.
  Persistent = 30-day cookie; else browser-session cookie.
- **Passwords**: scrypt salt:hash in `src/lib/password.ts` (pure, no Next/DB — safe
  for scripts). Policy + username rules there too. Lockout (5 fails / 15 min) lives
  in the login route + `LOCKOUT_*` consts in `auth.ts`.
- **Edge middleware** (`src/middleware.ts`) only checks cookie *presence* to
  redirect `/dashboard|/employees|/changes|/schedule/*` → `/`. It must NOT import
  `auth.ts`/Prisma (edge runtime). Real authz is the per-route DB check. The
  client fetch helper redirects to `/` on any 401.
- **Default account** `folsom` / `Taco1234!` (env `DEFAULT_ACCOUNT_*`). Created by
  the seed and the backfill so existing/seeded data has an owner you can log in as.

## Layout

```
prisma/schema.prisma     # data model = single source of truth (+ Account/Session)
prisma/seed.ts           # real Folsom roster (19 employees) under default account; WIPES employees (not accounts)
prisma/backfill-accounts.ts  # attach pre-auth rows to default account (non-destructive)
solver/engine.py         # CP-SAT model + gap report (the brain)
solver/models.py         # Pydantic request/response — MIRRORS src/lib/types.ts
solver/app.py            # FastAPI: GET /health, POST /solve
src/middleware.ts        # edge cookie-presence guard for app routes
src/lib/auth.ts          # sessions, cookies, getSessionAccount (server-only)
src/lib/password.ts      # scrypt hash + password/username policy (pure)
src/lib/constants.ts     # store params & targets — SINGLE SOURCE, sent to solver
src/lib/validation.ts    # TS validation + gap engine (mirrors parts of engine.py)
src/lib/employee-validation.ts  # cross-field employee form validation (shared client+API)
src/lib/scheduling.ts    # orchestration: F-1 generate, F-2 resolve, gap recompute (account-scoped)
src/lib/types.ts         # solver protocol types — MIRRORS solver/models.py
src/lib/time.ts          # minute<->clock helpers, incl. parseStoreTime
src/app/api/auth/...     # register / login / logout / me
src/app/api/...          # REST routes (employees, schedules, changes, export) — all account-scoped
src/app/page.tsx         # PUBLIC landing page (hero + AuthPanel + features)
src/app/dashboard/page.tsx   # the app dashboard (was /), auth-required
src/app/{employees,changes,schedule/[id]}/page.tsx   # auth-required client pages
src/components/          # GridEditor, TimelineView, PrintableReport, SliderEditor, EmployeeForm, GapReportView, AuthPanel, Nav, ui
```

## Conventions & invariants

- **Time = integer "minutes from midnight."** Store day is 5:00 AM (300) →
  12:30 AM next day (**1470**, i.e. 24:30). Times after midnight are >1440.
- **`<input type=time>` only emits 00:00–23:59**, so 12:30 AM parses as 30, not
  1470. Always convert time-input values with `parseStoreTime()` (wraps anything
  before store open to the next day). Display with `toHHMM`. The slider editor
  uses absolute-minute ranges, so it's exempt.
- **Day of week: 0 = Monday … 6 = Sunday** (so the late-night cutoff array indexes
  line up). The printed Tracks sheet starts Wednesday — that's cosmetic only.
- **Two mirrored pairs must stay in sync** when you touch shared shapes/logic:
  - `src/lib/types.ts` ↔ `solver/models.py` (the JSON protocol).
  - `src/lib/validation.ts` ↔ `solver/engine.py compute_gaps` (the gap report;
    one runs after manual edits, the other at solve time — same `GapItem` shape).
- **`src/lib/constants.ts` is the single source of truth** for store parameters;
  `storeConfig()` ships them to the solver each request. `solver/models.py`
  mirrors them as the `StoreConfig` shape. Add new params in both.

## Solver behavior (solver/engine.py)

- **Shift-selection model**: per `(employee, day)` it enumerates candidate shifts
  that already respect structural rules (availability, length 4–8.5h / GM 10.5h /
  minor ≤4h on school nights, not-past-10pm for minors). A bool var picks ≤1/day.
- **Two-phase solve**:
  1. **Managers/GM first** — only managers, keep ≥1 present at all open hours.
     Even spread comes from having to cover the whole day; they're free to work
     full-length overlapping shifts. `W_MINHOURS_MGR` (stronger) makes them meet
     weekly minimums. *There is intentionally NO overlap-minimization penalty* —
     it was removed because it shortened manager shifts below their min hours. If
     two-managers-opening/closing-together reappears and matters, re-add only a
     *gentle* tiebreaker that can't cost hours.
  2. **Crew** around the now-fixed managers, for baseline/rush/labor.
  The CP-SAT time budget is split (~35% phase 1, rest phase 2).
- **Soft-over-hard philosophy**: coverage/manager/labor-min are weighted penalties
  so the solver always returns its best feasible schedule + a gap report. True
  hard constraints: 80h/day hard cap, weekly max-hours, ≥2 days off/week (≤5
  working days), structural rules, hard-sets, and open/close-edge caps.
  The late-night period is now a soft target: 2+ active staff after each day's
  cutoff, except the final close hour.
  *All HARD caps that include the fixed base (daily-hard-cap, weekly-max,
  open/close-edge) are **decision-capped** — they bound only the selectable shifts
  against the room left by hard-sets, so an over-the-cap hard-set degrades to a
  reported gap instead of making the whole phase INFEASIBLE and dropping every crew.*
- **Open/close edge hours** (`OPEN_EDGE_*` in `constants.ts`): the first hour the
  store is open and the last hour before close are kept lean — **exactly one manager
  + one crew**. Caps are HARD (≤1 each, decision-capped); "one each" is a soft target
  (`W_OPEN_EDGE`). These windows are exempt from baseline/rush/late-night. Gaps:
  `OPEN_EDGE_OVER_CAP` (blocking), `OPEN_EDGE_UNDERSTAFFED` (warning).
- **Breaks**: one unpaid 30-min lunch **per completed 5-hour interval** — `<5h`: 0,
  `5h–<10h`: 1, `10h+`: 2 (a 10.5h GM shift → 2). Stored as `Assignment.breakStarts:
  Int[]`. `paidMinutes = duration − 30·count`.
- **Manager on break still counts as present.** Two coverage notions exist:
  *active staff* = `slots` (excludes break) for baseline/rush/late-night; *manager
  present* = `span` (includes break) for the manager-presence rule. A manager on
  their lunch must NOT trigger a "no manager on site" gap.
- **Priority weighting** = FT-over-PT + performance only (seniority, certifications,
  and preferences were removed by request).
- **GM implies manager**: `isGM` forces `isManager` (UI, API create/update, seed,
  solver mapping all enforce it).
- **Grid card duration** shows *time at the store* (`endMin − startMin`, incl.
  unpaid break), while Daily/Weekly totals show *paid* labor (`paidMinutes`).

## Common commands

```bash
docker compose up -d --build      # start db + solver (rebuild solver after engine.py edits)
docker compose up -d --build solver   # rebuild just the solver
npm run dev                       # frontend on :3000
npm run build                     # full TS typecheck (do this after TS changes)
npx prisma db push --accept-data-loss # apply schema change (preserves employees)
docker compose logs -f solver     # tail solver logs
```

## Verification workflow (what I do after changes)

1. TS changes → `npm run build` (typechecks everything).
2. Python changes → `python -m py_compile solver/*.py`, then rebuild the solver
   image, then `curl http://localhost:8000/health`.
3. End-to-end: start dev server, `POST /api/schedules/generate`, fetch
   `/api/schedules/:id`, assert with a throwaway Python/`tsx` script, then delete
   the test schedule. Pure logic (breaks, validation) is fastest to check with a
   small `tsx` script importing from `src/lib/*`.

### Gotchas
- **Stale dev servers**: `npm run dev` often finds :3000 "in use" and silently
  binds :3001, causing 404s on new routes. Kill listeners on 3000 **and** 3001
  before starting one clean instance (PowerShell `Get-NetTCPConnection -LocalPort
  3000,3001 ... | Stop-Process`).
- Host Python is 3.13 and has **no OR-Tools**; the solver only runs in Docker
  (image pins Python 3.12). `py_compile` checks syntax without importing ortools.
- After editing `engine.py`/`models.py` you **must rebuild the solver image** for
  changes to take effect (it's baked in, not hot-reloaded).

## Known deviations / open items
- Tracks export schema is a placeholder (reverse-engineer from a real export).
- Solver is stateless + synchronous (no SQLAlchemy, no SQS yet).
- Deployment to Vercel + AWS RDS is a deliberately deferred phase.
- "82 slots/day" in the spec is wrong for 5:00 AM–12:30 AM; code derives **78**
  from the hours and treats that as authoritative.
