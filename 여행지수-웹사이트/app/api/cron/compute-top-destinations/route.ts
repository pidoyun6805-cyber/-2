import { NextRequest, NextResponse } from "next/server";
import { computeAllDestinationResults } from "@/lib/topDestination";
import { topDestinationStore } from "@/lib/topDestinationStore";

export const runtime = "nodejs";
export const maxDuration = 300; // 17개 목적지 x 3구간 배치라 기본 제한(10~60초)보다 여유 필요

// Vercel Cron이 매일 이 경로를 호출한다. CRON_SECRET 없거나 안 맞으면 401(기존 크론과 동일한 fail-closed).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await computeAllDestinationResults();
  await topDestinationStore.set(payload);

  return NextResponse.json({ computedAt: payload.computedAt, count: payload.results.length });
}
