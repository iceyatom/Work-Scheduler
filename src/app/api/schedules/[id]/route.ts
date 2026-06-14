import { prisma } from "@/lib/prisma";
import { handle, notFound, ok, unauthorized } from "@/lib/api";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the schedule, its assignments, and a lightweight employee directory
// (names + flags + availability) so the client can render every view and
// recompute the gap report locally after manual edits.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const schedule = await prisma.schedule.findFirst({
      where: { id: params.id, accountId: account.id },
      include: { assignments: { orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }] } },
    });
    if (!schedule) return notFound("Schedule not found");

    const employees = await prisma.employee.findMany({
      where: { accountId: account.id },
      include: { availability: true },
      orderBy: [{ isManager: "desc" }, { name: "asc" }],
    });
    const employeesLite = employees.map((e) => ({
      id: e.id,
      name: e.name,
      employmentType: e.employmentType,
      isManager: e.isManager,
      isGM: e.isGM,
      isMinor: e.isMinor,
      active: e.active,
      availability: e.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startMin: a.startMin, endMin: a.endMin })),
    }));

    return ok({ schedule, assignments: schedule.assignments, employees: employeesLite });
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const result = await prisma.schedule.deleteMany({ where: { id: params.id, accountId: account.id } });
    return result.count ? ok({ deleted: true }) : notFound("Schedule not found");
  });
}
