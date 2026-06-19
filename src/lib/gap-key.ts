import type { GapItem } from "./types";

// Stable identity for a gap so a dismissal survives gap recomputation. We key on
// the issue's kind, location (day + time range) and employee — deliberately NOT
// the message/have-count, so a dismissed issue stays dismissed as staffing
// numbers fluctuate, and only resurfaces if the issue itself moves or resolves.
export function gapKey(g: GapItem): string {
  const emp = g.detail && typeof g.detail.employeeId === "string" ? g.detail.employeeId : "";
  return [g.kind, g.dayOfWeek ?? "-", g.startMin ?? "-", g.endMin ?? "-", emp].join("|");
}
