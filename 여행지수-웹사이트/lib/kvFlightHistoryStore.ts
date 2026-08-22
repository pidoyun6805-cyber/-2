import { Redis } from "@upstash/redis";
import type { FlightHistoryStore } from "./flightHistoryStore";
import type { FlightPriceRecord } from "./flightHistory";

// Redis.fromEnv()는 UPSTASH_REDIS_REST_URL/TOKEN 또는(Vercel 마켓플레이스 경유일 때)
// KV_REST_API_URL/TOKEN 둘 중 있는 쪽을 알아서 읽는다.
const redis = Redis.fromEnv();

function keyFor(routeKey: string): string {
  return `flightPriceHistory:${routeKey}`;
}

// 노선(출발지+도착지 공항코드 조합)을 키로, { date, price } 배열을 값으로 통째로 저장.
// 하루 1번(크론)만 쓰는 정도라 read-modify-write로도 충분 — 굳이 Redis 리스트/원자적 append는 안 씀.
export const kvFlightHistoryStore: FlightHistoryStore = {
  async get(routeKey) {
    try {
      const records = await redis.get<FlightPriceRecord[]>(keyFor(routeKey));
      return records ?? [];
    } catch (err) {
      // KV 미설정(로컬 개발 초기)이나 일시적 장애 시에도 "이력 없음"으로 취급해
      // /api/index 전체가 죽지 않고 폴백 경로로 넘어가게 한다.
      console.error(`[kvFlightHistoryStore] get(${routeKey}) 실패, 이력 없음으로 처리:`, err);
      return [];
    }
  },
  async set(routeKey, records) {
    await redis.set(keyFor(routeKey), records);
  },
};
