import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, ok, notFound, unauthorized } from "@/lib/api";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ key: z.string().min(1), dismissed: z.boolean() });

// Toggle a single gap's dismissed state. Dismissals are UI metadata kept on the
// schedule (separate from assignment edits) so they persist across reloads and
// can be reviewed/restored from the gap report.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const schedule = await prisma.schedule.findFirst({
      where: { id: params.id, accountId: account.id },
      select: { dismissedGaps: true },
    });
    if (!schedule) return notFound("Schedule not found");

    const { key, dismissed } = body.parse(await req.json());
    const set = new Set(schedule.dismissedGaps);
    if (dismissed) set.add(key);
    else set.delete(key);

    const dismissedGaps = [...set];
    await prisma.schedule.update({ where: { id: params.id }, data: { dismissedGaps } });
    return ok({ dismissedGaps });
  });
}
