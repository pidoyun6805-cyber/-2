import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineDistanceKm } from "./geo.ts";

test("haversineDistanceKm: 같은 지점이면 거리 0", () => {
  assert.equal(haversineDistanceKm(35.1795, 128.9382, 35.1795, 128.9382), 0);
});

test("haversineDistanceKm: 부산-오사카 대략적인 실측 거리(약 800~900km)와 비슷하다", () => {
  // 부산 김해공항(PUS) -> 오사카 간사이공항(KIX)
  const distance = haversineDistanceKm(35.1795, 128.9382, 34.6937, 135.5023);
  assert.ok(distance > 500 && distance < 700, `distance was ${distance}`);
});
