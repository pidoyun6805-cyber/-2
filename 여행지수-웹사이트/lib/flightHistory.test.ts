import { test } from "node:test";
import assert from "node:assert/strict";
import { getHistoricalPricesNearDate } from "./flightHistory.ts";

test("getHistoricalPricesNearDate: ±14일 이내 가격만 골라낸다", () => {
  const records = [
    { date: "2026-09-01", price: 150000 }, // 9/15 기준 14일 전 -> 포함
    { date: "2026-09-15", price: 160000 }, // 정확히 대상 날짜 -> 포함
    { date: "2026-09-28", price: 170000 }, // 9/15로부터 13일 -> 포함
    { date: "2026-08-01", price: 999999 }, // 너무 멀어서 제외
  ];
  const prices = getHistoricalPricesNearDate(records, "2026-09-15", 14);
  assert.deepEqual(prices.sort((a, b) => a - b), [150000, 160000, 170000]);
});

test("getHistoricalPricesNearDate: 연말/연초를 넘나드는 경우도 가깝게 취급", () => {
  const records = [{ date: "2025-12-30", price: 200000 }];
  const prices = getHistoricalPricesNearDate(records, "2026-01-03", 14);
  assert.deepEqual(prices, [200000]);
});

test("getHistoricalPricesNearDate: 데이터가 없으면 빈 배열", () => {
  assert.deepEqual(getHistoricalPricesNearDate([], "2026-09-15"), []);
  assert.deepEqual(getHistoricalPricesNearDate(undefined, "2026-09-15"), []);
});
