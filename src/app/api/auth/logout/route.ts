import { NextResponse } from "next/server";
import { route } from "@/lib/api/envelope";
import { destroyAdminSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await destroyAdminSession(req);

  const res = NextResponse.json({ ok: true, data: { authenticated: false } }, { status: 200 });
  res.cookies.set({ name: SESSION_COOKIE, value: "", ...sessionCookieOptions(), maxAge: 0 });
  return res as NextResponse;
});
