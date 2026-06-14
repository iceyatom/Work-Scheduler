import { prisma } from "@/lib/prisma";
import { handle, ok, notFound, unauthorized } from "@/lib/api";
import { getSessionAccount } from "@/lib/auth";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchInput = z.object({ status: z.enum(["QUEUED", "APPLIED", "DISCARDED"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const body = patchInput.parse(await req.json());
    const result = await prisma.personnelChange.updateMany({ where: { id: params.id, accountId: account.id }, data: { status: body.status } });
    return result.count ? ok({ updated: true }) : notFound("Change not found");
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const result = await prisma.personnelChange.deleteMany({ where: { id: params.id, accountId: account.id } });
    return result.count ? ok({ deleted: true }) : notFound("Change not found");
  });
}
