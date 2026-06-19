import { handle, ok, unauthorized } from "@/lib/api";
import { generateInput } from "@/lib/schemas";
import { generateSchedule } from "@/lib/scheduling";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A solve can take up to SOLVER_TIME_LIMIT_SECONDS; give the route headroom.
export const maxDuration = 60;

// F-1: generate an optimal schedule from a blank slate (spec §8).
export async function POST(req: Request) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const body = generateInput.parse(await req.json());
    const schedule = await generateSchedule({ name: body.name, weekStartISO: body.weekStart, accountId: account.id, config: body.config });
    return ok(schedule, { status: 201 });
  });
}
