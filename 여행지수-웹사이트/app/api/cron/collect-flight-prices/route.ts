import { NextRequest, NextResponse } from "next/server";
import { collectDailyFlightPrices } from "@/lib/collectFlightPrices";

export const runtime = "nodejs";

// Vercel Cron이 매일 이 경로를 호출한다 (vercel.json 참고).
// Vercel은 CRON_SECRET이 설정돼 있으면 크론 요청에 자동으로 Authorization: Bearer <CRON_SECRET>을
// 붙여 보낸다. CRON_SECRET이 아예 설정 안 돼 있으면 인증 없이 아무나 이 엔드포인트를 호출해
// 매번 외부 API(Travelpayouts)를 소모하고 이력 데이터를 오염시킬 수 있으므로,
// fail-closed로 — 시크릿이 없거나 안 맞으면 무조건 401.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await collectDailyFlightPrices();
  return NextResponse.json(result);
}
