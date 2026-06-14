import { handle, ok } from "@/lib/api";
import { resolveSchedule } from "@/lib/scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// F-2: load this schedule, apply the queued personnel changes, and produce a
// new incrementally re-solved schedule with minimal disruption (spec §6, §8).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const schedule = await resolveSchedule({ scheduleId: params.id });
    return ok(schedule, { status: 201 });
  });
}
