import { NextRequest, NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, isValidDemoSessionId } from "@/lib/demo-session";

/**
 * Assigns the anonymous demo-session cookie (ls_demo_sid).
 *
 * The public synthetic demo is per-session: middleware stamps a random
 * session id on the first document load, so every API call the hydrated
 * application makes already carries it — and one anonymous visitor's demo
 * state can never affect another's. HttpOnly + SameSite=Lax + Secure in
 * production; the cookie value is a random UUID carrying no personal data.
 */
export function middleware(req: NextRequest) {
  const existing = req.cookies.get(DEMO_SESSION_COOKIE)?.value;
  if (isValidDemoSessionId(existing)) {
    return NextResponse.next();
  }

  const sessionId = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  const cookieHeader = req.headers.get("cookie");
  requestHeaders.set(
    "cookie",
    cookieHeader ? `${cookieHeader}; ${DEMO_SESSION_COOKIE}=${sessionId}` : `${DEMO_SESSION_COOKIE}=${sessionId}`
  );

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.set(DEMO_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

export const config = {
  // Skip Next.js internals and static metadata assets.
  matcher: ["/((?!_next/static|_next/image|icon.svg|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|favicon.ico).*)"],
};
