import { getAllRoutes, type RouteMeta } from "./routes";
import { getPriceFromTravelpayouts, type FlightPriceSource } from "./flightPriceSource";
import { kvFlightHistoryStore } from "./kvFlightHistoryStore";
import { upsertRecord } from "./flightHistory";
import type { FlightHistoryStore } from "./flightHistoryStore";

export interface CollectResult {
  date: string;
  collected: { routeKey: string; price: number }[];
  noData: string[];
  failed: { routeKey: string; error: string }[];
}

// 등록된 모든 노선을 순회하며 오늘 가격을 조사해 이력 저장소(Upstash Redis)에 누적한다.
//
// 지켜야 할 두 가지:
// 1. 실데이터를 못 받으면 그날은 그냥 건너뛴다. 고정 추정치로 메우면 그래프가 거짓말을 한다
//    (예전 이력이 정확히 그래서 오염됐다 — 54개 항목 중 38개가 flights.json 고정값이었다).
// 2. 같은 날 여러 번 돌아도 항목이 늘지 않게 upsert한다. 예전엔 무조건 append라
//    노선당 같은 날짜가 2~4번씩 쌓여 "최근 N일 평균"의 N과 평균이 모두 틀어졌다.
//
// rate limit은 /v3/prices_for_dates 기준 분당 600건(문서 "API rate limits").
// 노선이 17개뿐이라 순차 호출로도 한참 못 미치지만, 노선이 늘어날 때를 대비해 간격을 둔다.
const REQUEST_INTERVAL_MS = 120;

export async function collectDailyFlightPrices(
  source: FlightPriceSource = getPriceFromTravelpayouts,
  routes: RouteMeta[] = getAllRoutes(),
  store: FlightHistoryStore = kvFlightHistoryStore
): Promise<CollectResult> {
  const today = new Date().toISOString().slice(0, 10);
  const result: CollectResult = { date: today, collected: [], noData: [], failed: [] };

  for (const route of routes) {
    try {
      const price = await source(route.routeKey);
      if (price === null) {
        // API가 정상 응답했지만 이 노선 캐시가 비어 있는 경우(괌·사이판이 실제로 그렇다).
        // 에러가 아니므로 조용히 건너뛰되, 어떤 노선이 그랬는지는 남긴다.
        result.noData.push(route.routeKey);
        continue;
      }
      const existing = await store.get(route.routeKey);
      await store.set(route.routeKey, upsertRecord(existing, { date: today, price, source: "api" }));
      result.collected.push({ routeKey: route.routeKey, price });
    } catch (err) {
      result.failed.push({
        routeKey: route.routeKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS));
  }

  return result;
}
