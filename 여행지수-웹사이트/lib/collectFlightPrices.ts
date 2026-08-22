import { getAllRoutes, type RouteMeta } from "./routes";
import { getPriceFromTravelpayouts, type FlightPriceSource } from "./flightPriceSource";
import { kvFlightHistoryStore } from "./kvFlightHistoryStore";
import type { FlightHistoryStore } from "./flightHistoryStore";

export interface CollectResult {
  date: string;
  collected: { routeKey: string; price: number }[];
  failed: { routeKey: string; error: string }[];
}

// 등록된 모든 노선을 순회하며 오늘 가격을 조사해 이력 저장소(기본: Upstash Redis)에 누적한다.
// 한 노선에서 실패해도(API 에러, 네트워크 문제 등) 나머지 노선은 계속 진행하고,
// 실패한 노선은 그날 기록을 건너뛴 채 다음 실행(다음날) 때 다시 시도된다.
export async function collectDailyFlightPrices(
  source: FlightPriceSource = getPriceFromTravelpayouts,
  routes: RouteMeta[] = getAllRoutes(),
  store: FlightHistoryStore = kvFlightHistoryStore
): Promise<CollectResult> {
  const today = new Date().toISOString().slice(0, 10);
  const result: CollectResult = { date: today, collected: [], failed: [] };

  for (const route of routes) {
    try {
      const price = await source(route.routeKey);
      const existing = await store.get(route.routeKey);
      await store.set(route.routeKey, [...existing, { date: today, price }]);
      result.collected.push({ routeKey: route.routeKey, price });
    } catch (err) {
      result.failed.push({
        routeKey: route.routeKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
