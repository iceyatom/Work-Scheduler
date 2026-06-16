import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handle, badRequest, ok, notFound, unauthorized } from "@/lib/api";
import { assignmentBulk } from "@/lib/schemas";
import { deriveShift, recomputeGaps } from "@/lib/scheduling";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownsSchedule(scheduleId: string, accountId: string) {
  return prisma.schedule.findFirst({ where: { id: scheduleId, accountId }, select: { id: true } });
}

// Bulk save of buffered grid/timeline edits. The client sends the whole draft
// assignment set; we reconcile it against the persisted rows (create new,
// update changed, delete removed) in a single transaction so nothing is written
// until the user hits "Save changes". Recomputes + persists the gap report.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    if (!(await ownsSchedule(params.id, account.id))) return notFound("Schedule not found");
    const { assignments } = assignmentBulk.parse(await req.json());

    for (const a of assignments) {
      if (a.endMin <= a.startMin) return badRequest("End time must be after start time.");
    }

    const existing = await prisma.assignment.findMany({ where: { scheduleId: params.id }, select: { id: true } });
    const existingIds = new Set(existing.map((e) => e.id));
    // Only ids that still exist in the draft AND in the DB are kept/updated; any
    // client-only temp ids fall through to create.
    const keepIds = new Set(assignments.map((a) => a.id).filter((id): id is string => !!id && existingIds.has(id)));
    const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (toDelete.length) {
      ops.push(prisma.assignment.deleteMany({ where: { id: { in: toDelete }, scheduleId: params.id } }));
    }
    for (const a of assignments) {
      const { breakStarts, paidMinutes } = deriveShift(a.startMin, a.endMin);
      if (a.id && existingIds.has(a.id)) {
        ops.push(
          prisma.assignment.update({
            where: { id: a.id },
            data: { dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin, breakStarts, paidMinutes, source: a.source ?? "MANUAL", locked: a.locked ?? undefined },
          }),
        );
      } else {
        ops.push(
          prisma.assignment.create({
            data: {
              scheduleId: params.id,
              employeeId: a.employeeId,
              dayOfWeek: a.dayOfWeek,
              startMin: a.startMin,
              endMin: a.endMin,
              breakStarts,
              paidMinutes,
              source: a.source ?? "MANUAL",
              locked: a.locked ?? false,
            },
          }),
        );
      }
    }

    await prisma.$transaction(ops);
    const gaps = await recomputeGaps(params.id);
    return ok({ gaps });
  });
}
