import { prisma } from "@/lib/prisma";
import { handle, ok } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchInput = z.object({ status: z.enum(["QUEUED", "APPLIED", "DISCARDED"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const body = patchInput.parse(await req.json());
    const change = await prisma.personnelChange.update({ where: { id: params.id }, data: { status: body.status } });
    return ok(change);
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await prisma.personnelChange.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  });
}
