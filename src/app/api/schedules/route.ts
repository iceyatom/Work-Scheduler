import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const schedules = await prisma.schedule.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { assignments: true } } },
    });
    return ok(schedules);
  });
}
