import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getExpectedAuthValue } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/api/login") ||
    req.nextUrl.pathname.startsWith("/api/cron/")
  ) {
    // /api/cron/*은 Vercel Cron이 호출하는 경로라 site_auth 쿠키가 없다.
    // 대신 각 라우트 안에서 CRON_SECRET으로 인증한다.
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const expected = await getExpectedAuthValue();

  if (cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
