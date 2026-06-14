import { prisma } from "@/lib/prisma";
import { handle, ok, unauthorized } from "@/lib/api";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const schedules = await prisma.schedule.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { assignments: true } } },
    });
    return ok(schedules);
  });
}
