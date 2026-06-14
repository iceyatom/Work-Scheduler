// Session-based auth: a random token in an httpOnly cookie maps to a Session row.
// Reading uses next/headers cookies(); setting is done on the NextResponse by the
// route handlers (cookies() is read-only in route handlers).

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Account } from "@prisma/client";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "ws_session";

const DAY = 60 * 60 * 24;
/** Persistent ("stay logged in") cookie + session lifetime. */
export const PERSISTENT_MAX_AGE = 30 * DAY;
/** Non-persistent server-side session lifetime (cookie itself is browser-session). */
export const SESSION_TTL_SECONDS = DAY;

/** Account is locked after this many consecutive failed logins… */
export const LOCKOUT_THRESHOLD = 5;
/** …for this long. */
export const LOCKOUT_MINUTES = 15;

interface NewSession {
  token: string;
  persistent: boolean;
  maxAge: number;
}

export async function createSession(accountId: string, persistent: boolean): Promise<NewSession> {
  const token = randomBytes(32).toString("hex");
  const maxAge = persistent ? PERSISTENT_MAX_AGE : SESSION_TTL_SECONDS;
  await prisma.session.create({ data: { token, accountId, expiresAt: new Date(Date.now() + maxAge * 1000) } });
  return { token, persistent, maxAge };
}

function baseCookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function setSessionCookie(res: NextResponse, session: NewSession) {
  res.cookies.set(SESSION_COOKIE, session.token, {
    ...baseCookieOpts(),
    // Persistent => maxAge (survives browser restart). Otherwise omit maxAge so
    // it's a session cookie cleared when the browser closes.
    ...(session.persistent ? { maxAge: session.maxAge } : {}),
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...baseCookieOpts(), maxAge: 0 });
}

/** Resolve the logged-in account from the session cookie, or null. */
export async function getSessionAccount(): Promise<Account | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { account: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  return session.account;
}

/** Delete the current session row (used by logout). */
export async function destroyCurrentSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
}

export function publicAccount(account: Account) {
  return { id: account.id, username: account.username };
}
