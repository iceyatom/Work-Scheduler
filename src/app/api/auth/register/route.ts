import { prisma } from "@/lib/prisma";
import { handle, ok, badRequest, conflict } from "@/lib/api";
import { hashPassword, normalizeUsername, validatePassword, validateUsername } from "@/lib/password";
import { createSession, setSessionCookie, publicAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { username?: string; password?: string; stayLoggedIn?: boolean };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";

    const errors = [...validateUsername(username), ...validatePassword(password)];
    if (errors.length) return badRequest("Please fix the highlighted fields.", errors);

    const usernameLower = normalizeUsername(username);
    const existing = await prisma.account.findUnique({ where: { usernameLower } });
    if (existing) return conflict("That username is already taken.");

    const account = await prisma.account.create({
      data: { username, usernameLower, passwordHash: hashPassword(password) },
    });

    const session = await createSession(account.id, !!body.stayLoggedIn);
    const res = ok(publicAccount(account), { status: 201 });
    setSessionCookie(res, session);
    return res;
  });
}
