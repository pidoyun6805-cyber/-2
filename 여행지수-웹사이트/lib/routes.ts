import { DESTINATIONS } from "./destinations";
import { ORIGIN_AIRPORT, haversineDistanceKm } from "./geo";

export interface RouteMeta {
  destinationKey: string;
  routeKey: string; // 예: "PUS-KIX"
  distanceKm: number;
}

// 등록된 목적지들로부터 노선 목록을 만든다. 노선 = 출발지(PUS 고정) + 도착지 공항 조합.
// distanceKm은 목적지 좌표(destinations.ts)를 기준으로 매번 계산 — 별도로 하드코딩해두지 않는다.
// 같은 flightRouteKey를 쓰는 목적지가 둘 이상이어도 노선 기준으로는 한 번만 포함시킨다.
export function getAllRoutes(): RouteMeta[] {
  const routes = new Map<string, RouteMeta>();

  for (const [destinationKey, dest] of Object.entries(DESTINATIONS)) {
    if (routes.has(dest.flightRouteKey)) continue;
    routes.set(dest.flightRouteKey, {
      destinationKey,
      routeKey: dest.flightRouteKey,
      distanceKm: haversineDistanceKm(ORIGIN_AIRPORT.lat, ORIGIN_AIRPORT.lon, dest.lat, dest.lon),
    });
  }

  return [...routes.values()];
}
