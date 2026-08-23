import { test } from "node:test";
import assert from "node:assert/strict";
import {
  humidex,
  tcScore,
  aScore,
  pScore,
  wScore,
  climateComfortScore,
  periodClimateComfortScore,
  exchangeRateScore,
  calcTravelIndex,
  WEIGHTS,
} from "./scoring.ts";

test("humidex: 체감온도 보정 e<10이면 원 기온 그대로", () => {
  assert.equal(humidex(5, 10), 5);
});

test("humidex: 고온다습이면 원 기온보다 높게 보정", () => {
  assert.ok(Math.abs(humidex(25, 70) - 31.74) < 0.1);
});

test("tcScore: 23~25도 구간이 만점 10점", () => {
  assert.equal(tcScore(23), 10);
  assert.equal(tcScore(25), 10);
});

test("tcScore: 39도 이상은 0점", () => {
  assert.equal(tcScore(39), 0);
  assert.equal(tcScore(50), 0);
});

test("tcScore: -6도 이하는 1점", () => {
  assert.equal(tcScore(-6), 1);
  assert.equal(tcScore(-20), 1);
});

test("aScore: 11~20%가 최고점 10점", () => {
  assert.equal(aScore(11), 10);
  assert.equal(aScore(20), 10);
});

test("aScore: 완전히 맑음(0%)은 최고점이 아니라 8점", () => {
  assert.equal(aScore(0), 8);
});

test("aScore: 1~10%는 9점", () => {
  assert.equal(aScore(1), 9);
  assert.equal(aScore(10), 9);
});

test("aScore: 21~30%는 9점", () => {
  assert.equal(aScore(21), 9);
  assert.equal(aScore(30), 9);
});

test("aScore: 100%는 1점", () => {
  assert.equal(aScore(100), 1);
});

test("pScore: 강수 0mm는 만점 10점", () => {
  assert.equal(pScore(0), 10);
});

test("pScore: 12mm 초과는 0점", () => {
  assert.equal(pScore(12.1), 0);
});

test("wScore: 풍속 50km/h 이상은 0점", () => {
  assert.equal(wScore(50), 0);
  assert.equal(wScore(80), 0);
});

test("wScore: 풍속 1~9km/h는 만점 10점", () => {
  assert.equal(wScore(5), 10);
});

test("climateComfortScore: 조건 하나로 합산한 예시값 검증", () => {
  // TC=6(humidex≈31.74->31~33구간), A=10(15%->11~20구간), P=10(0mm), W=9(15km/h->10~19구간)
  // 4*6 + 2*10 + 3*10 + 9 = 24+20+30+9 = 83
  const score = climateComfortScore(25, 70, 15, 0, 15);
  assert.equal(score, 83);
});

test("climateComfortScore: 값 하나라도 없으면 null", () => {
  assert.equal(climateComfortScore(null, 70, 15, 0, 15), null);
  assert.equal(climateComfortScore(25, undefined, 15, 0, 15), null);
});

test("periodClimateComfortScore: 여러 날짜 평균", () => {
  const days = [
    { tempC: 25, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 15 }, // 83
    { tempC: 25, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 15 }, // 83
  ];
  assert.equal(periodClimateComfortScore(days), 83);
});

test("periodClimateComfortScore: 채점 불가한 날짜는 평균에서 제외", () => {
  const days = [
    { tempC: 25, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 15 }, // 83
    { tempC: null, relHumidity: null, cloudCoverPct: null, precipMm: null, windKmh: null },
  ];
  assert.equal(periodClimateComfortScore(days), 83);
});

test("periodClimateComfortScore: 빈 배열이면 에러", () => {
  assert.throws(() => periodClimateComfortScore([]));
});

test("periodClimateComfortScore: 날짜는 있지만 유효한 기후 데이터가 하나도 없으면 null(예외 아님)", () => {
  const days = [
    { tempC: null, relHumidity: null, cloudCoverPct: null, precipMm: null, windKmh: null },
    { tempC: null, relHumidity: null, cloudCoverPct: null, precipMm: null, windKmh: null },
  ];
  assert.equal(periodClimateComfortScore(days), null);
});

test("exchangeRateScore: 오늘 환율이 과거 평균과 같으면 중립 50점", () => {
  const historicalRates = [9, 10, 11, 9, 10, 11]; // 평균 10
  assert.equal(exchangeRateScore(10, historicalRates), 50);
});

test("exchangeRateScore: 3.3표준편차만큼 유리한 쪽으로 벗어나면 포화 100점", () => {
  const historicalRates = [8, 10, 12, 8, 10, 12]; // 평균 10, 표준편차 1.633
  const baseline = historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;
  const variance =
    historicalRates.reduce((s, r) => s + (r - baseline) ** 2, 0) / historicalRates.length;
  const stdDev = Math.sqrt(variance);
  assert.equal(exchangeRateScore(baseline - 3.3 * stdDev, historicalRates), 100);
});

test("exchangeRateScore: 3.3표준편차만큼 불리한 쪽으로 벗어나면 포화 0점", () => {
  const historicalRates = [8, 10, 12, 8, 10, 12];
  const baseline = historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;
  const variance =
    historicalRates.reduce((s, r) => s + (r - baseline) ** 2, 0) / historicalRates.length;
  const stdDev = Math.sqrt(variance);
  assert.equal(exchangeRateScore(baseline + 3.3 * stdDev, historicalRates), 0);
});

test("exchangeRateScore: 실제 Frankfurter 데이터(오사카/JPY, 2년치)로 계산하면 95점 근처", () => {
  const baseline = 9.386754813359534;
  const stdDev = 0.22385828137219776;
  // baseline/stdDev를 그대로 재현할 historicalRates: 평균과 표준편차가 위 값과 같은 표본
  const historicalRates = [baseline - stdDev, baseline + stdDev];
  assert.equal(exchangeRateScore(8.7224, historicalRates), 95);
});

test("exchangeRateScore: 과거 데이터가 2개 미만이면 null", () => {
  assert.equal(exchangeRateScore(10, [10]), null);
  assert.equal(exchangeRateScore(10, []), null);
});

test("exchangeRateScore: 과거 데이터가 전부 같은 값(표준편차 0)이면 유리/불리로만 100/0점", () => {
  assert.equal(exchangeRateScore(9, [10, 10, 10]), 100);
  assert.equal(exchangeRateScore(11, [10, 10, 10]), 0);
});

test("exchangeRateScore: 0~100 범위를 벗어나면 saturate", () => {
  const historicalRates = [9.9, 10, 10.1]; // 표준편차 아주 작음
  assert.equal(exchangeRateScore(1, historicalRates), 100); // 극단적으로 유리
  assert.equal(exchangeRateScore(100, historicalRates), 0); // 극단적으로 불리
});

test("calcTravelIndex: 기후쾌적지수 가중치는 0.3이고 breakdown에 climateComfort로 노출된다", () => {
  assert.equal(WEIGHTS.climateComfort, 0.3);

  const result = calcTravelIndex({
    flightScore: 60,
    hotelDeviationPct: 0,
    exchangeRateScore: 60,
    peakCategory: "off",
    climateDays: [
      { tempC: 25, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 15 }, // 83
    ],
  });

  assert.equal(result.breakdown.climateComfort, 83);
  // flight 60*0.2 + hotel 60*0.1 + exchange 60*0.2 + peak 100*0.2 + climate 83*0.3
  const expected = 60 * 0.2 + 60 * 0.1 + 60 * 0.2 + 100 * 0.2 + 83 * 0.3;
  assert.equal(result.totalScore, Math.round(expected));
});

test("calcTravelIndex: 환율 데이터가 없으면(null) 남은 요소끼리 가중치를 재분배한다", () => {
  const result = calcTravelIndex({
    flightScore: 60,
    hotelDeviationPct: 0,
    exchangeRateScore: null,
    peakCategory: "off",
    climateDays: [{ tempC: 25, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 15 }], // 83
  });

  assert.equal(result.breakdown.exchangeRate, null);
  // exchangeRate(0.2) 제외한 나머지 가중치 합 0.8로 재분배
  const expected = (60 * 0.2 + 60 * 0.1 + 100 * 0.2 + 83 * 0.3) / 0.8;
  assert.equal(result.totalScore, Math.round(expected));
});

test("calcTravelIndex: 기후 데이터가 없으면(null) 남은 요소끼리 가중치를 재분배한다", () => {
  const result = calcTravelIndex({
    flightScore: 60,
    hotelDeviationPct: 0,
    exchangeRateScore: 60,
    peakCategory: "off",
    climateDays: [
      { tempC: null, relHumidity: null, cloudCoverPct: null, precipMm: null, windKmh: null },
    ],
  });

  assert.equal(result.breakdown.climateComfort, null);
  // climateComfort(0.3) 제외한 나머지 가중치 합 0.7로 재분배
  const expected = (60 * 0.2 + 60 * 0.1 + 60 * 0.2 + 100 * 0.2) / 0.7;
  assert.equal(result.totalScore, Math.round(expected));
});
