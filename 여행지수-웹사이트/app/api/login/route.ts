import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getExpectedAuthValue, sha256Hex } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json()) as { password: string };

  const [hashedInput, expected] = await Promise.all([sha256Hex(password ?? ""), getExpectedAuthValue()]);

  if (hashedInput !== expected) {
    return NextResponse.json({ error: "비밀번호가 틀렸습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
