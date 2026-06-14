import { prisma } from "@/lib/prisma";
import { handle, notFound, ok } from "@/lib/api";
import { employeeUpdate } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      include: { availability: true, preferences: true, hardSets: true },
    });
    return employee ? ok(employee) : notFound("Employee not found");
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const raw = (await req.json()) as Record<string, unknown>;
    const body = employeeUpdate.parse(raw);
    // Only replace nested collections that were actually present in the request
    // (zod defaults would otherwise turn an omitted array into an empty one).
    const sentAvailability = "availability" in raw;
    const sentPreferences = "preferences" in raw;
    const sentHardSets = "hardSets" in raw;

    // Replace nested collections wholesale when provided (simple & predictable).
    const result = await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: params.id },
        data: {
          name: body.name,
          employmentType: body.employmentType,
          isManager: body.isManager,
          isGM: body.isGM,
          isMinor: body.isMinor,
          active: body.active,
          seniorityMonths: body.seniorityMonths,
          performance: body.performance,
          certifications: body.certifications,
          minHoursPerWeek: body.minHoursPerWeek,
          maxHoursPerWeek: body.maxHoursPerWeek,
        },
      });

      if (sentAvailability && body.availability) {
        await tx.availability.deleteMany({ where: { employeeId: params.id } });
        await tx.availability.createMany({ data: body.availability.map((a) => ({ ...a, employeeId: params.id })) });
      }
      if (sentPreferences && body.preferences) {
        await tx.preference.deleteMany({ where: { employeeId: params.id } });
        await tx.preference.createMany({
          data: body.preferences.map((p) => ({
            employeeId: params.id,
            kind: p.kind,
            dayOfWeek: p.dayOfWeek ?? null,
            startMin: p.startMin ?? null,
            endMin: p.endMin ?? null,
            weight: p.weight ?? 1,
            note: p.note ?? null,
          })),
        });
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

      return tx.employee.findUnique({ where: { id: params.id }, include: { availability: true, preferences: true, hardSets: true } });
    });

    return result ? ok(result) : notFound("Employee not found");
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await prisma.employee.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  });
}
