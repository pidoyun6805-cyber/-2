import { test } from "node:test";
import assert from "node:assert/strict";
import {
  temperatureScore,
  dailyTemperatureScore,
  periodTemperatureScore,
  flightDealScore,
  calculateBaseline,
  getDistanceBand,
  flightPriceScoreFallback,
  getFlightPriceScore,
} from "./scoring.ts";

test("temperatureScore: 쾌적 구간(12~23도)은 100점", () => {
  assert.equal(temperatureScore(18), 100);
  assert.equal(temperatureScore(12), 100);
  assert.equal(temperatureScore(23), 100);
});

test("temperatureScore: 극단치는 saturate되어 0점", () => {
  assert.equal(temperatureScore(-20), 0);
  assert.equal(temperatureScore(40), 0);
});

test("temperatureScore: 더운 쪽 33.54도에서 정확히 0점", () => {
  assert.equal(temperatureScore(33.54), 0);
});

test("temperatureScore: 추운 쪽 -12도에서 정확히 0점", () => {
  assert.equal(temperatureScore(-12), 0);
});

test("temperatureScore: 잘못된 입력(null/undefined/NaN)은 null", () => {
  assert.equal(temperatureScore(null), null);
  assert.equal(temperatureScore(undefined), null);
  assert.equal(temperatureScore(NaN), null);
});

test("dailyTemperatureScore: 낮30/밤18 조합은 낮70%+밤30% 가중평균", () => {
  // temperatureScore(30) = 66 - 11*(30-28) = 44, temperatureScore(18) = 100
  // 44*0.7 + 100*0.3 = 60.8
  assert.equal(dailyTemperatureScore(30, 18), 60.8);
});

test("dailyTemperatureScore: 한쪽 값만 없으면 있는 값만으로 채점", () => {
  assert.equal(dailyTemperatureScore(null, 18), 100);
  assert.equal(dailyTemperatureScore(30, undefined), 44);
});

test("dailyTemperatureScore: 둘 다 없으면 null", () => {
  assert.equal(dailyTemperatureScore(null, undefined), null);
});

test("periodTemperatureScore: 날짜별 점수를 평균", () => {
  // day1: dailyTemperatureScore(18, 18) = 100
  // day2: dailyTemperatureScore(30, 18) = 60.8
  // 평균 = 80.4
  const result = periodTemperatureScore([
    { day: 18, night: 18 },
    { day: 30, night: 18 },
  ]);
  assert.equal(result, 80.4);
});

test("periodTemperatureScore: 채점 불가한 날짜는 평균에서 제외", () => {
  const result = periodTemperatureScore([
    { day: 18, night: 18 }, // 100
    { day: null, night: undefined }, // 채점 불가 -> 제외
  ]);
  assert.equal(result, 100);
});

test("periodTemperatureScore: 빈 배열이면 에러", () => {
  assert.throws(() => periodTemperatureScore([]));
});

test("periodTemperatureScore: 모든 날짜가 채점 불가면 에러", () => {
  assert.throws(() => periodTemperatureScore([{ day: null, night: undefined }]));
});

test("flightDealScore: 할인율 0%(기준가와 동일)는 60점", () => {
  assert.equal(flightDealScore(100000, 100000), 60);
});

test("flightDealScore: 할인율 +30%는 100점", () => {
  assert.equal(flightDealScore(70000, 100000), 100);
});

test("flightDealScore: 할인율 -30%(30% 비쌈)는 0점", () => {
  assert.equal(flightDealScore(130000, 100000), 0);
});

test("flightDealScore: 할인율 +15%는 80점", () => {
  assert.equal(flightDealScore(85000, 100000), 80);
});

test("flightDealScore: 0~100 범위를 벗어나지 않도록 clamp", () => {
  assert.equal(flightDealScore(1000, 100000), 100); // 할인율 99%
  assert.equal(flightDealScore(300000, 100000), 0); // 할인율 -200%
});

test("flightDealScore: 기준가가 null이면 채점하지 않고 null", () => {
  assert.equal(flightDealScore(100000, null), null);
});

test("calculateBaseline: 과거 가격 평균", () => {
  assert.equal(calculateBaseline([100000, 120000, 110000]), 110000);
});

test("calculateBaseline: 데이터가 없으면 null", () => {
  assert.equal(calculateBaseline([]), null);
  assert.equal(calculateBaseline(undefined), null);
});

test("getDistanceBand: 경계값 기준으로 단/중/장거리 구분", () => {
  assert.equal(getDistanceBand(1500), "short");
  assert.equal(getDistanceBand(1501), "medium");
  assert.equal(getDistanceBand(4000), "medium");
  assert.equal(getDistanceBand(4001), "long");
});

test("flightPriceScoreFallback: 같은 거리대에서 km당 가격 백분위로 채점", () => {
  const allRoutes = [
    { price: 80000, distanceKm: 1000 },
    { price: 100000, distanceKm: 1000 },
    { price: 150000, distanceKm: 1000 },
  ];
  // pricePerKm=100, bandPrices=[80,100,150] 중 100 이하가 2개 -> percentile 2/3 -> (1-2/3)*100=33.33
  assert.equal(flightPriceScoreFallback(100000, 1000, allRoutes), 33);
  // pricePerKm=80(제일 저렴) -> percentile 1/3 -> (1-1/3)*100=66.67
  assert.equal(flightPriceScoreFallback(80000, 1000, allRoutes), 67);
});

test("flightPriceScoreFallback: 같은 거리대에 비교 대상이 없으면 null", () => {
  const allRoutes = [{ price: 100000, distanceKm: 5000 }]; // long band
  assert.equal(flightPriceScoreFallback(100000, 1000, allRoutes), null); // 대상은 short band
});

test("flightPriceScoreFallback: 같은 거리대 노선이 자기 자신 하나뿐이면 null (버그 재현)", () => {
  // 고치기 전엔 bandPrices=[자기 자신] -> rank=1, percentile=1.0 -> 무조건 0점이 나오던 버그.
  const allRoutes = [{ price: 100000, distanceKm: 1000 }]; // 자기 자신뿐
  assert.equal(flightPriceScoreFallback(100000, 1000, allRoutes), null);
});

test("flightPriceScoreFallback: 최소 표본(3개) 미만이면 null", () => {
  const allRoutes = [
    { price: 80000, distanceKm: 1000 },
    { price: 100000, distanceKm: 1000 },
  ]; // 2개 -> MIN_BAND_SAMPLES_FOR_FALLBACK(3) 미만
  assert.equal(flightPriceScoreFallback(80000, 1000, allRoutes), null);
});

test("flightPriceScoreFallback: 표본이 정확히 3개면 정상적으로 채점", () => {
  const allRoutes = [
    { price: 80000, distanceKm: 1000 },
    { price: 100000, distanceKm: 1000 },
    { price: 150000, distanceKm: 1000 },
  ];
  assert.equal(flightPriceScoreFallback(80000, 1000, allRoutes), 67);
});

test("flightPriceScoreFallback: 거리값이 비정상이면 null", () => {
  assert.equal(flightPriceScoreFallback(100000, 0, []), null);
  assert.equal(flightPriceScoreFallback(100000, -100, []), null);
});

test("getFlightPriceScore: 과거 데이터가 5개 이상이면 할인율 방식(baseline)을 쓴다", () => {
  const score = getFlightPriceScore({
    currentPrice: 85000,
    distanceKm: 1000,
    historicalPrices: [100000, 100000, 100000, 100000, 100000],
    allRoutes: [], // baseline 경로에서는 쓰이지 않음
  });
  assert.equal(score, 80); // 할인율 +15% -> 80점
});

test("getFlightPriceScore: 과거 데이터가 5개 미만이고 폴백 표본도 부족하면 null(수집 중)", () => {
  const score = getFlightPriceScore({
    currentPrice: 80000,
    distanceKm: 1000,
    historicalPrices: [100000, 100000], // 2개 -> 부족
    allRoutes: [
      { price: 80000, distanceKm: 1000 },
      { price: 100000, distanceKm: 1000 },
    ], // 2개 -> 폴백 표본도 부족
  });
  assert.equal(score, null);
});

test("getFlightPriceScore: 과거 데이터가 5개 미만이어도 폴백 표본이 충분하면 채점한다", () => {
  const score = getFlightPriceScore({
    currentPrice: 80000,
    distanceKm: 1000,
    historicalPrices: [100000, 100000],
    allRoutes: [
      { price: 80000, distanceKm: 1000 },
      { price: 100000, distanceKm: 1000 },
      { price: 150000, distanceKm: 1000 },
    ],
  });
  assert.equal(score, 67);
});
