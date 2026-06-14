import { prisma } from "@/lib/prisma";
import { handle, badRequest, ok } from "@/lib/api";
import { assignmentUpsert } from "@/lib/schemas";
import { deriveShift, recomputeGaps } from "@/lib/scheduling";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual edit from the grid / slider editor (spec §7.1, §7.5). Creates or
// updates a single shift, recomputes the gap report, and returns both.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const body = assignmentUpsert.parse(await req.json());
    if (body.endMin <= body.startMin) return badRequest("End time must be after start time.");

    const { breakStartMin, paidMinutes } = deriveShift(body.startMin, body.endMin);

    if (body.id) {
      await prisma.assignment.update({
        where: { id: body.id },
        data: { dayOfWeek: body.dayOfWeek, startMin: body.startMin, endMin: body.endMin, breakStartMin, paidMinutes, source: "MANUAL", locked: body.locked ?? undefined },
      });
    } else {
      await prisma.assignment.create({
        data: {
          scheduleId: params.id,
          employeeId: body.employeeId,
          dayOfWeek: body.dayOfWeek,
          startMin: body.startMin,
          endMin: body.endMin,
          breakStartMin,
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
    const url = new URL(req.url);
    const assignmentId = url.searchParams.get("assignmentId");
    if (!assignmentId) return badRequest("assignmentId query parameter is required.");
    await prisma.assignment.delete({ where: { id: assignmentId } });
    const gaps = await recomputeGaps(params.id);
    return ok({ gaps });
  });
}
