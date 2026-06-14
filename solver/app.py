"""FastAPI wrapper around the CP-SAT engine (spec §10).

Endpoints:
  GET  /health  -> liveness probe (used by docker-compose healthcheck)
  POST /solve   -> run a GENERATE or RESOLVE solve, returns assignments + gaps
"""

from __future__ import annotations

import logging

from fastapi import FastAPI

from engine import solve
from models import SolveRequest, SolveResponse

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("solver")

app = FastAPI(title="Work Schedule Solver", version="0.2.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve", response_model=SolveResponse)
def solve_endpoint(req: SolveRequest) -> SolveResponse:
    log.info(
        "solve mode=%s employees=%d existing=%d limit=%ss",
        req.mode,
        len(req.employees),
        len(req.existingAssignments or []),
        req.timeLimitSeconds,
    )
    resp = solve(req)
    log.info("solve done status=%s assignments=%d gaps=%d in %dms", resp.status, len(resp.assignments), len(resp.gaps), resp.solveMs)
    return resp
