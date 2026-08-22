import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getExpectedAuthValue } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/api/login")) {
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
