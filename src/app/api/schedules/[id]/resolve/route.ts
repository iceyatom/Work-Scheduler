import { handle, ok, unauthorized } from "@/lib/api";
import { resolveSchedule } from "@/lib/scheduling";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// F-2: load this schedule, apply the queued personnel changes, and produce a
// new incrementally re-solved schedule with minimal disruption (spec §6, §8).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const schedule = await resolveSchedule({ scheduleId: params.id, accountId: account.id });
    return ok(schedule, { status: 201 });
  });
}
