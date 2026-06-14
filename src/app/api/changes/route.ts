import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { changeInput } from "@/lib/schemas";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const changes = await prisma.personnelChange.findMany({
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { id: true, name: true } } },
    });
    return ok(changes);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = changeInput.parse(await req.json());
    const change = await prisma.personnelChange.create({
      data: {
        employeeId: body.employeeId,
        type: body.type,
        dayOfWeek: body.dayOfWeek ?? null,
        startMin: body.startMin ?? null,
        endMin: body.endMin ?? null,
        note: body.note ?? null,
        payload: (body.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      include: { employee: { select: { id: true, name: true } } },
    });
    return ok(change, { status: 201 });
  });
}
