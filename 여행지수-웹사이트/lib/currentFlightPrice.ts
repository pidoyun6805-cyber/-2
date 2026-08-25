import { getAllRoutes, type RouteMeta } from "./routes.ts";
import { kvFlightHistoryStore } from "./kvFlightHistoryStore.ts";
import type { FlightHistoryStore } from "./flightHistoryStore.ts";
import type { FlightPriceRecord } from "./flightHistory.ts";

/** 노선의 "지금 시세" = 이력 중 가장 최근의 실데이터(source: "api") 가격. 없으면 null. */
export function latestApiPrice(records: FlightPriceRecord[] | null | undefined): number | null {
  if (!records || records.length === 0) return null;
  // 출처가 api인 것만 인정한다. 예전 이력에는 고정 추정치가 섞여 있었고(source 필드 없음),
  // 그걸 "실데이터"로 취급하면 화면이 다시 거짓말을 하게 된다.
  const apiOnly = records.filter((r) => r.source === "api");
  if (apiOnly.length === 0) return null;
  return apiOnly.reduce((a, b) => (b.date.localeCompare(a.date) > 0 ? b : a)).price;
}

export interface RoutePriceMapEntry {
  price: number | null;
  distanceKm: number;
  history: FlightPriceRecord[];
}

/**
 * 전 노선의 현재 시세와 이력을 한 번에 읽는다.
 *
 * 배치(17곳)와 검색이 같은 함수를 쓰게 하려고 분리했다. 목적지별로 이걸 호출하면
 * 거리대 폴백 계산 때문에 17×17번 읽게 되므로, 호출하는 쪽에서 한 번만 만들어 넘긴다.
 */
export async function loadRoutePriceMap(
  routes: RouteMeta[] = getAllRoutes(),
  store: FlightHistoryStore = kvFlightHistoryStore
): Promise<Map<string, RoutePriceMapEntry>> {
  const entries = await Promise.all(
    routes.map(async (route) => {
      const history = await store.get(route.routeKey);
      return [route.routeKey, { price: latestApiPrice(history), distanceKm: route.distanceKm, history: history ?? [] }] as const;
    })
  );
  return new Map(entries);
}
