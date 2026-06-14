import { prisma } from "@/lib/prisma";
import { handle, badRequest, ok, notFound, unauthorized } from "@/lib/api";
import { assignmentUpsert } from "@/lib/schemas";
import { deriveShift, recomputeGaps } from "@/lib/scheduling";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownsSchedule(scheduleId: string, accountId: string) {
  return prisma.schedule.findFirst({ where: { id: scheduleId, accountId }, select: { id: true } });
}

// Manual edit from the grid / slider editor (spec §7.1, §7.5). Creates or
// updates a single shift, recomputes the gap report, and returns both.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    if (!(await ownsSchedule(params.id, account.id))) return notFound("Schedule not found");
    const body = assignmentUpsert.parse(await req.json());
    if (body.endMin <= body.startMin) return badRequest("End time must be after start time.");

    const { breakStarts, paidMinutes } = deriveShift(body.startMin, body.endMin);

    if (body.id) {
      await prisma.assignment.update({
        where: { id: body.id },
        data: { dayOfWeek: body.dayOfWeek, startMin: body.startMin, endMin: body.endMin, breakStarts, paidMinutes, source: "MANUAL", locked: body.locked ?? undefined },
      });
    } else {
      await prisma.assignment.create({
        data: {
          scheduleId: params.id,
          employeeId: body.employeeId,
          dayOfWeek: body.dayOfWeek,
          startMin: body.startMin,
          endMin: body.endMin,
          breakStarts,
          paidMinutes,
          source: "MANUAL",
          locked: body.locked ?? false,
        },
      });
    }

    const gaps = await recomputeGaps(params.id);
    return ok({ gaps });
  });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    if (!(await ownsSchedule(params.id, account.id))) return notFound("Schedule not found");
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) return badRequest("assignmentId query parameter is required.");
    // Scope the delete to assignments of this (owned) schedule.
    await prisma.assignment.deleteMany({ where: { id: assignmentId, scheduleId: params.id } });
    const gaps = await recomputeGaps(params.id);
    return ok({ gaps });
  });
}
