import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveTopChips } from "./topChips.ts";

test("deriveTopChips: 5개 중 점수 높은 2개만 칩으로 반환", () => {
  const result = deriveTopChips({ flight: 91, hotel: 68, exchangeRate: 74, peakSeason: 85, climateComfort: 63 });
  assert.deepEqual(result, [
    { key: "flight", label: "항공권 좋음" },
    { key: "peakSeason", label: "성수기 한산" },
  ]);
});

test("deriveTopChips: null인 지수는 후보에서 제외", () => {
  const result = deriveTopChips({ flight: null, hotel: 60, exchangeRate: null, peakSeason: 100, climateComfort: 31 });
  assert.deepEqual(result, [
    { key: "peakSeason", label: "성수기 한산" },
    { key: "hotel", label: "숙박 저렴" },
  ]);
});

test("deriveTopChips: 유효한 값이 1개뿐이면 1개만 반환", () => {
  const result = deriveTopChips({ flight: 80, hotel: null, exchangeRate: null, peakSeason: null, climateComfort: null });
  assert.deepEqual(result, [{ key: "flight", label: "항공권 좋음" }]);
});

test("deriveTopChips: 전부 null이면 빈 배열", () => {
  const result = deriveTopChips({ flight: null, hotel: null, exchangeRate: null, peakSeason: null, climateComfort: null });
  assert.deepEqual(result, []);
});

test("deriveTopChips: 동점이면 breakdown에 정의된 순서(flight,hotel,exchangeRate,peakSeason,climateComfort)를 유지", () => {
  const result = deriveTopChips({ flight: 70, hotel: 70, exchangeRate: 70, peakSeason: null, climateComfort: null });
  assert.deepEqual(result, [
    { key: "flight", label: "항공권 좋음" },
    { key: "hotel", label: "숙박 저렴" },
  ]);
});
