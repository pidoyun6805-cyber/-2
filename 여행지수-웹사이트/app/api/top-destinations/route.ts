import { NextResponse } from "next/server";
import { topDestinationStore } from "@/lib/topDestinationStore";

// 인증은 기존 proxy.ts(사이트 전체 쿠키 게이트)가 /api/* 전체에 자동 적용 — 여기서 별도 처리 안 함.
export async function GET() {
  const payload = await topDestinationStore.get();

  if (!payload) {
    return NextResponse.json({ error: "아직 계산되지 않았습니다. 잠시 후 다시 시도해주세요." }, { status: 404 });
  }

  return NextResponse.json(payload);
}
