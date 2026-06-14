import { handle, ok, unauthorized } from "@/lib/api";
import { getSessionAccount, publicAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const account = await getSessionAccount();
    return account ? ok(publicAccount(account)) : unauthorized();
  });
}
