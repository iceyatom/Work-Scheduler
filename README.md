# Work Schedule Generator

Constraint-based automated weekly scheduling for a quick-service-restaurant store
(Taco Bell). The tool generates an optimized weekly staff schedule from each
employee's availability, lets a manager edit it with live validation, surfaces
unmet targets as a **gap report**, and exports an import-ready file for Taco Bell
Tracks (the downstream labor system).

This repository is a **functional local prototype** of the system described in
`Schedule_Generator_Requirements.pdf` (v0.2). It implements every core function
(F-1 generate, F-2 incremental re-solve) and all six output/editing surfaces.

---

## Architecture

```
┌────────────────────────┐      HTTP/JSON       ┌──────────────────────────┐
│  Next.js app (host)    │  POST /solve         │  Solver service (Docker) │
│  npm run dev :3000     │ ───────────────────► │  FastAPI + OR-Tools      │
│  • UI (grid/timeline/  │ ◄─────────────────── │  CP-SAT  :8000           │
│    report/slider/gaps) │   assignments+gaps   └──────────────────────────┘
│  • API routes          │
│  • Prisma ORM          │      SQL              ┌──────────────────────────┐
└────────────────────────┘ ───────────────────► │  PostgreSQL 16 (Docker)  │
                                                 │  :5432                   │
                                                 └──────────────────────────┘
```

- **Frontend / API / ORM** — Next.js 14 (App Router, TypeScript), Prisma. Runs on
  the **host** via `npm run dev`.
- **Solver** — Python + OR-Tools CP-SAT behind FastAPI. Runs in **Docker**.
- **Database** — PostgreSQL 16. Runs in **Docker**.

The solver is **stateless**: the Next.js app sends it the full problem (employees,
availability, store config) as JSON and gets back assignments + a gap
report. Prisma owns all persistence. See *Prototype deviations from the spec* below
for how this maps to the target AWS architecture.

---

## Prerequisites

- **Docker Desktop** (running)
- **Node.js 18.17+** (tested on Node 22) and npm

No local Python is needed — the solver runs entirely inside Docker.

---

## Quick start

From the project root (`C:\Users\Jonathan\Documents\Random Code\Work Scheduler`):

```bash
# 1. Start Postgres + the OR-Tools solver in Docker
#    (first run builds the solver image — installs OR-Tools, ~2-4 min)
docker compose up -d --build

# 2. Install Node dependencies
npm install

# 3. Create the database schema + seed an example store crew
#    (runs: prisma generate && prisma db push && seed)
npm run setup

# 4. Start the web app
npm run dev
```

Then open **http://localhost:3000**.

`.env` is already present with local defaults. Click **Generate schedule** on the
dashboard to run the solver against the seeded crew.

> First solve takes a few seconds (the CP-SAT time limit defaults to 15s). The
> seeded roster is intentionally a little tight on managers/late-night coverage so
> the **Gap report** has something to show.

### Typical day-to-day

```bash
docker compose up -d        # bring the stack up (db + solver)
npm run dev                 # start the app
# ...work...
docker compose down         # stop the stack (data persists in a volume)
```

---

## What you can do in the app

| View | Where | Spec |
|------|-------|------|
| **Generate** an optimal schedule from blank | Dashboard → *Generate schedule* | F-1 |
| **Grid editor** (employee × day matrix, click a cell to edit) | Schedule → Grid | §7.1 |
| **Timeline / Gantt** (daily coverage density, rush + late-night bands) | Schedule → Timeline | §7.2 |
| **Printable report** ("Weekly Labor Schedule With Daily Total") | Schedule → Printable report → *Print* | §7.3 |
| **Slider editor** with live validation | Click any grid cell | §7.5 |
| **Gap report** (blocking vs. warning) | Schedule → Gap report | §7.6 |
| **Tracks export** (CSV) | Schedule → *Tracks export* | §7.4 |
| **Manage employees** (availability, hard-sets) | Employees | §5 |
| **Queue personnel changes** + **incremental re-solve** | Change queue → then *Apply changes & re-solve* | §6, F-2 |

---

## How the solver works

A **shift-selection** CP-SAT model (`solver/engine.py`):

1. For every `(employee, day)` it enumerates **candidate shifts** that already
   respect the structural rules — availability windows, 4–8.5h length (10.5h GM,
   ≤4h minors on school nights), and the minor not-past-10pm rule.
2. A boolean variable selects **at most one** candidate per employee per day.
3. **Hard constraints** (cannot be violated): per-day late-night cap (≤2 after
   cutoff), 80h/day labor hard cap, weekly max-hours, **≥2 days off per week**
   (≤5 working days per employee), and the structural rules baked into candidate
   generation. Hard-set shifts (e.g. the GM) are fixed constants.
4. **Soft constraints** (weighted penalties, always feasible): manager presence,
   baseline floor (3) / target (4), rush target (5), 70h/day minimum, 75h/day soft
   cap, weekly minimums, and priority weighting (FT over PT, and performance). In
   **RESOLVE** mode an extra stability term keeps existing shifts unchanged.
5. The result is mapped back to assignments, and a **gap report** is computed and
   returned.

Per the spec's *"soft constraints over hard failures"* philosophy, coverage and
manager rules are modelled as penalties so the solver **always returns its best
feasible schedule** and reports what it couldn't satisfy, rather than failing.

Weights live at the top of `solver/engine.py`; the CP-SAT time limit is
`SOLVER_TIME_LIMIT_SECONDS` (`.env`).

### Gap report

The same `GapItem` shape is produced two ways:
- by the **solver** at solve time (`solver/engine.py: compute_gaps`), and
- by the **TypeScript validation engine** (`src/lib/validation.ts`) after a manual
  grid/slider edit, so the report stays live without a solver round-trip.

Keep the two in sync if you change constraint logic.

---

## Constraint reference (from the spec)

All parameters live in **`src/lib/constants.ts`** (the single source of truth, sent
to the solver on every request). Mirrored as defaults in `solver/models.py`.

| Parameter | Value |
|-----------|-------|
| Store hours | 5:00 AM – 12:30 AM (78 × 15-min slots) |
| Manager presence | ≥1 manager whenever open (soft, reported) |
| Rush target | 5 staff, 11:00–13:00 & 18:00–20:00 (soft) |
| Baseline | floor 3 (blocking) / target 4 (soft) |
| Late-night cap | ≤2 after per-day cutoff (hard): Mon 22:00, Tue 23:00, Wed 22:30, Thu 23:00, Fri–Sun 23:30 |
| Daily labor | 70h min / 75h soft cap / 80h hard cap |
| Shift length | 4–8.5h regular, ≤10.5h GM, ≤4h minor (school night) |
| Unpaid lunch | 30 min auto-inserted for shifts > 5h |
| Minor school nights | ≤4h and not past 10:00 PM (Sun–Thu nights) |
| Days off | ≥2 per employee per week, i.e. ≤5 working days (hard) |

---

## Common commands

| Command | Description |
|---------|-------------|
| `docker compose up -d --build` | Start db + solver (build solver image) |
| `docker compose logs -f solver` | Tail solver logs |
| `docker compose down` | Stop stack (DB volume persists) |
| `docker compose down -v` | Stop **and wipe** the database |
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build / full typecheck |
| `npm run setup` | `prisma generate` + `db push` + seed |
| `npm run db:seed` | Re-seed the example crew (wipes & re-creates) |
| `npm run db:studio` | Open Prisma Studio (browse/edit the DB) |
| `npm run db:reset` | Drop, re-create, migrate & seed |

### Working on the solver

```bash
# rebuild just the solver after editing solver/*.py
docker compose up -d --build solver
docker compose logs -f solver

# or run it locally with hot-reload (needs local python + pip install -r)
cd solver && uvicorn app:app --reload --port 8000
```

---

## Project structure

```
.
├── docker-compose.yml         # db + solver services
├── prisma/
│   ├── schema.prisma          # data model (single source of truth)
│   └── seed.ts                # example store crew
├── solver/                    # Python CP-SAT service (Dockerized)
│   ├── app.py                 # FastAPI (/health, /solve)
│   ├── engine.py              # CP-SAT model + gap report
│   ├── models.py              # Pydantic request/response (mirror of src/lib/types.ts)
│   └── Dockerfile
└── src/
    ├── app/
    │   ├── page.tsx           # dashboard (generate + list)
    │   ├── employees/         # roster management
    │   ├── changes/           # personnel change queue (F-2 inputs)
    │   ├── schedule/[id]/     # grid / timeline / report / gaps + slider
    │   └── api/               # REST API routes (Prisma + solver client)
    ├── components/            # GridEditor, TimelineView, PrintableReport, …
    └── lib/
        ├── constants.ts       # store parameters & constraint targets
        ├── validation.ts      # TS validation + gap engine
        ├── scheduling.ts      # orchestration (F-1, F-2, gap recompute)
        ├── types.ts           # solver protocol types
        └── time.ts            # minute/slot/time helpers
```

---

## API reference (local)

| Method | Route | Purpose |
|--------|-------|---------|
| `GET/POST` | `/api/employees` | List / create employees |
| `GET/PATCH/DELETE` | `/api/employees/:id` | Read / update / delete |
| `GET` | `/api/schedules` | List schedules |
| `POST` | `/api/schedules/generate` | **F-1** generate from blank |
| `GET/DELETE` | `/api/schedules/:id` | Detail (schedule + assignments + employees) / delete |
| `PUT/DELETE` | `/api/schedules/:id/assignments` | Manual shift edit; recomputes gaps |
| `POST` | `/api/schedules/:id/resolve` | **F-2** apply queued changes & re-solve |
| `GET` | `/api/schedules/:id/export` | Tracks CSV export |
| `GET/POST` | `/api/changes` | List / queue personnel changes |
| `PATCH/DELETE` | `/api/changes/:id` | Update status / delete |

---

## Environment variables (`.env`)

| Var | Default | Used by |
|-----|---------|---------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/scheduler` | Prisma |
| `SOLVER_URL` | `http://localhost:8000` | API → solver |
| `SOLVER_TIME_LIMIT_SECONDS` | `15` | solver search budget |
| `POSTGRES_USER/PASSWORD/DB` | `postgres/postgres/scheduler` | docker `db` |

---

## Known spec ambiguities / prototype deviations

These are pragmatic choices made for a runnable local prototype; each is a known
follow-up before production.

1. **Slot count.** The spec says "82 slots/day", but the stated hours (5:00 AM–12:30
   AM) are 19.5h = **78** 15-min slots. The code derives the count from the hours
   (`src/lib/constants.ts`); adjust the hours there if the real store window differs.
2. **Tracks export format is a placeholder.** §7.4 requires an exact, import-ready
   Tracks schema "to be reverse-engineered from a real Tracks export." The current
   CSV (`/api/schedules/:id/export`) is a reasonable stand-in so the end-to-end flow
   works today — **not** yet a verified Tracks import file.
3. **Stateless solver instead of SQLAlchemy DB reads.** The spec lists SQLAlchemy for
   the solver. Here the solver is stateless (problem in → solution out) and Prisma
   owns all I/O, which avoids dual-schema drift. The DB-reading solver is a future
   step.
4. **Synchronous solve instead of SQS.** Locally the API calls the solver directly
   and records a `Job` row (mirroring the async flow). SQS/Lambda wiring is deferred.
5. **School nights** are assumed to be Sun–Thu (the nights before a school day);
   configurable in `constants.ts` (`SCHOOL_NIGHTS`).
6. **Manager presence & baseline floor are modelled as (heavily-weighted) soft
   constraints**, not hard failures — matching the spec's "best feasible schedule +
   gap report" philosophy. They appear as **blocking** items in the gap report when
   violated.

---

## Roadmap to production (later)

The local stack maps cleanly onto the target architecture (spec §10):

| Local (now) | Production (later) |
|-------------|--------------------|
| `npm run dev` | Next.js on **Vercel** |
| Docker `solver` | Dockerized solver on **AWS Lambda / Fargate** |
| Direct HTTP + `Job` row | **AWS SQS** async job queue |
| Docker Postgres | **AWS RDS PostgreSQL** + RDS Proxy |
| `prisma db push` | `prisma migrate` migrations |

---

## Troubleshooting

- **"Could not reach the solver service…"** — the `solver` container isn't up. Run
  `docker compose up -d` and check `docker compose logs solver`.
- **Prisma can't connect / `db push` fails** — Postgres isn't ready yet. Wait for
  `docker compose ps` to show `db` healthy, then retry. Confirm `DATABASE_URL` host
  is `localhost:5432`.
- **Solver image build is slow the first time** — OR-Tools is a large wheel; it's
  cached after the first build.
- **Generate returns lots of gaps** — expected with the tight seeded roster; add
  employees/availability on the Employees page, or edit shifts in the grid.
- **Port already in use (3000/5432/8000)** — stop the conflicting process or change
  the published port in `docker-compose.yml` / `next dev -p`.
