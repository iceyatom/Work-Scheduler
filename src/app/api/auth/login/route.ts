import { prisma } from "@/lib/prisma";
import { handle, ok, unauthorized, locked } from "@/lib/api";
import { normalizeUsername, verifyPassword } from "@/lib/password";
import { createSession, setSessionCookie, publicAccount, LOCKOUT_THRESHOLD, LOCKOUT_MINUTES } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { username?: string; password?: string; stayLoggedIn?: boolean };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";

    const account = await prisma.account.findUnique({ where: { usernameLower: normalizeUsername(username) } });
    // Generic message so we don't reveal whether the username exists.
    if (!account) return unauthorized("Invalid username or password.");

    // Still within an active lockout window?
    if (account.lockedUntil && account.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((account.lockedUntil.getTime() - Date.now()) / 60000);
      return locked(`Account locked due to too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
    }

    if (!verifyPassword(password, account.passwordHash)) {
      const attempts = account.failedAttempts + 1;
      if (attempts >= LOCKOUT_THRESHOLD) {
        await prisma.account.update({
          where: { id: account.id },
          data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) },
        });
        return locked(`Too many failed attempts — account locked for ${LOCKOUT_MINUTES} minutes.`);
      }
      await prisma.account.update({ where: { id: account.id }, data: { failedAttempts: attempts } });
      const remaining = LOCKOUT_THRESHOLD - attempts;
      return unauthorized(`Invalid username or password. ${remaining} attempt${remaining === 1 ? "" : "s"} left before lockout.`);
    }

    // Success — clear failed attempts and any expired lock, start a session.
    await prisma.account.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null } });
    const session = await createSession(account.id, !!body.stayLoggedIn);
    const res = ok(publicAccount(account));
    setSessionCookie(res, session);
    return res;
  });
}
