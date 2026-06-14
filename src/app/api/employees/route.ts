import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { employeeInput } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const employees = await prisma.employee.findMany({
      orderBy: [{ isManager: "desc" }, { name: "asc" }],
      include: { availability: true, hardSets: true },
    });
    return ok(employees);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = employeeInput.parse(await req.json());
    const employee = await prisma.employee.create({
      data: {
        name: body.name,
        employmentType: body.employmentType,
        // GM implies manager (the GM box overrides the manager box).
        isManager: body.isManager || body.isGM,
        isGM: body.isGM,
        isMinor: body.isMinor,
        active: body.active,
        performance: body.performance,
        minHoursPerWeek: body.minHoursPerWeek ?? null,
        maxHoursPerWeek: body.maxHoursPerWeek ?? null,
        availability: { create: body.availability },
        hardSets: {
          create: body.hardSets.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startMin: h.startMin,
            endMin: h.endMin,
            weekStart: h.weekStart ? new Date(h.weekStart + "T00:00:00.000Z") : null,
            note: h.note ?? null,
          })),
        },
      },
      include: { availability: true, hardSets: true },
    });
    return ok(employee, { status: 201 });
  });
}
