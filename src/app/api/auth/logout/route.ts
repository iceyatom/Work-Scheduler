import { handle, ok } from "@/lib/api";
import { destroyCurrentSession, clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await destroyCurrentSession();
    const res = ok({ ok: true });
    clearSessionCookie(res);
    return res;
  });
}
