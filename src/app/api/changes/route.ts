import { prisma } from "@/lib/prisma";
import { handle, ok, badRequest, unauthorized } from "@/lib/api";
import { changeInput } from "@/lib/schemas";
import { getSessionAccount } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const changes = await prisma.personnelChange.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { id: true, name: true } } },
    });
    return ok(changes);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const body = changeInput.parse(await req.json());
    // The change's employee must belong to this account.
    const emp = await prisma.employee.findFirst({ where: { id: body.employeeId, accountId: account.id }, select: { id: true } });
    if (!emp) return badRequest("Unknown employee.");
    const change = await prisma.personnelChange.create({
      data: {
        accountId: account.id,
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
