import type { FlightHistoryStore } from "./flightHistoryStore";
import type { FlightPriceRecord } from "./flightHistory";

// 테스트/로컬 실험용 인메모리 구현. 실제 Redis 연결 없이 collectFlightPrices 로직을 검증할 때 쓴다.
export function createInMemoryFlightHistoryStore(
  initial: Record<string, FlightPriceRecord[]> = {}
): FlightHistoryStore {
  const data = new Map<string, FlightPriceRecord[]>(Object.entries(initial));

  return {
    async get(routeKey) {
      return data.get(routeKey) ?? [];
    },
    async set(routeKey, records) {
      data.set(routeKey, records);
    },
  };
}
