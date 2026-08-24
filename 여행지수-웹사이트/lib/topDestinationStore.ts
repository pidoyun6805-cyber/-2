import { Redis } from "@upstash/redis";
import type { TopDestinationsPayload } from "./topDestination";

const redis = Redis.fromEnv();
const KEY = "topDestinations:daily";
const TTL_SECONDS = 30 * 60 * 60; // 30시간 — 크론이 하루 1번인데, 실패해도 다음날까지는 이전 데이터가 남도록 여유

export const topDestinationStore = {
  async get(): Promise<TopDestinationsPayload | null> {
    try {
      const data = await redis.get<TopDestinationsPayload>(KEY);
      return data ?? null;
    } catch (err) {
      // Redis 장애 시에도 API 라우트가 죽지 않고 "아직 준비 안 됨"으로 처리하게 한다.
      console.error("[topDestinationStore] get 실패, null로 처리:", err);
      return null;
    }
  },

  async set(payload: TopDestinationsPayload): Promise<void> {
    await redis.set(KEY, payload, { ex: TTL_SECONDS });
  },
};
