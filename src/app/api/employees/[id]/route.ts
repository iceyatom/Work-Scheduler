import { prisma } from "@/lib/prisma";
import { handle, notFound, ok, badRequest, unauthorized } from "@/lib/api";
import { employeeUpdate } from "@/lib/schemas";
import { validateEmployee } from "@/lib/employee-validation";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, accountId: account.id },
      include: { availability: true, hardSets: true },
    });
    return employee ? ok(employee) : notFound("Employee not found");
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const owned = await prisma.employee.findFirst({ where: { id: params.id, accountId: account.id }, select: { id: true } });
    if (!owned) return notFound("Employee not found");
    const raw = (await req.json()) as Record<string, unknown>;
    const body = employeeUpdate.parse(raw);
    // Only replace nested collections that were actually present in the request
    // (zod defaults would otherwise turn an omitted array into an empty one).
    const sentAvailability = "availability" in raw;
    const sentHardSets = "hardSets" in raw;

    // Validate the full employee when the edit form sends the complete payload.
    if (sentAvailability && sentHardSets && body.employmentType) {
      const errors = validateEmployee({
        name: body.name ?? "",
        employmentType: body.employmentType,
        performance: body.performance ?? 3,
        minHoursPerWeek: body.minHoursPerWeek ?? null,
        maxHoursPerWeek: body.maxHoursPerWeek ?? null,
        availability: body.availability ?? [],
        hardSets: body.hardSets ?? [],
      });
      if (errors.length) return badRequest("Employee validation failed", errors);
    }

    // Replace nested collections wholesale when provided (simple & predictable).
    const result = await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: params.id },
        data: {
          name: body.name,
          employmentType: body.employmentType,
          // GM implies manager (the GM box overrides the manager box).
          isManager: body.isGM === true ? true : body.isManager,
          isGM: body.isGM,
          isMinor: body.isMinor,
          active: body.active,
          performance: body.performance,
          minHoursPerWeek: body.minHoursPerWeek,
          maxHoursPerWeek: body.maxHoursPerWeek,
        },
      });

      if (sentAvailability && body.availability) {
        await tx.availability.deleteMany({ where: { employeeId: params.id } });
        await tx.availability.createMany({ data: body.availability.map((a) => ({ ...a, employeeId: params.id })) });
      }
      if (sentHardSets && body.hardSets) {
        await tx.hardSetAssignment.deleteMany({ where: { employeeId: params.id } });
        await tx.hardSetAssignment.createMany({
          data: body.hardSets.map((h) => ({
            employeeId: params.id,
            dayOfWeek: h.dayOfWeek,
            startMin: h.startMin,
            endMin: h.endMin,
            weekStart: h.weekStart ? new Date(h.weekStart + "T00:00:00.000Z") : null,
            note: h.note ?? null,
          })),
        });
      }

      return tx.employee.findUnique({ where: { id: params.id }, include: { availability: true, hardSets: true } });
    });

    return result ? ok(result) : notFound("Employee not found");
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const result = await prisma.employee.deleteMany({ where: { id: params.id, accountId: account.id } });
    return result.count ? ok({ deleted: true }) : notFound("Employee not found");
  });
}
