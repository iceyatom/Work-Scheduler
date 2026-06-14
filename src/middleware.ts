import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep in sync with SESSION_COOKIE in src/lib/auth.ts. Inlined (not imported) so
// this edge middleware doesn't pull Prisma/Node-only code into the edge bundle.
const SESSION_COOKIE = "ws_session";

// Redirect unauthenticated visitors away from the app pages to the landing page.
// This is a fast cookie-presence check only; real authorization is enforced in
// the API routes (which validate the session against the DB and 401 otherwise).
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/employees/:path*", "/changes/:path*", "/schedule/:path*"],
};
