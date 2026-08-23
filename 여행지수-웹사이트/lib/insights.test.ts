import { test } from "node:test";
import assert from "node:assert/strict";
import {
  explainFlightPrice,
  explainExchangeRate,
  explainHotelPrice,
  explainPeakSeason,
  explainClimateComfort,
} from "./insights.ts";

test("explainFlightPrice: 과거 데이터가 아예 없으면(baseline 계산 불가) null", () => {
  assert.equal(explainFlightPrice(100000, []), null);
});

test("explainFlightPrice: 평균보다 싸면 '저렴' 문구 + 실제 %", () => {
  const text = explainFlightPrice(180000, [200000, 200000, 200000, 200000, 200000]);
  assert.match(text!, /저렴/);
  assert.match(text!, /10%/);
});

test("explainFlightPrice: 평균보다 비싸면 '비싼' 문구 + 실제 %", () => {
  const text = explainFlightPrice(220000, [200000, 200000, 200000, 200000, 200000]);
  assert.match(text!, /비싼/);
  assert.match(text!, /10%/);
});

test("explainExchangeRate: 과거 데이터 2개 미만이면 null", () => {
  assert.equal(explainExchangeRate(10, [10]), null);
});

test("explainExchangeRate: 오늘 환율이 평균보다 낮으면(유리) 실제 %와 함께 안내", () => {
  const text = explainExchangeRate(9, [10, 10, 10, 10]); // 평균 10, 오늘 9 -> 10% 낮음
  assert.match(text!, /낮/);
  assert.match(text!, /10%/);
});

test("explainExchangeRate: 오늘 환율이 평균보다 높으면(불리) 실제 %와 함께 안내", () => {
  const text = explainExchangeRate(11, [10, 10, 10, 10]); // 평균 10, 오늘 11 -> 10% 높음
  assert.match(text!, /높/);
  assert.match(text!, /10%/);
});

test("explainHotelPrice: 편차가 음수면 '저렴', 양수면 '비싼'", () => {
  assert.match(explainHotelPrice(-0.15), /저렴/);
  assert.match(explainHotelPrice(0.2), /비싼/);
});

test("explainHotelPrice: 편차 0이면 '비슷'", () => {
  assert.match(explainHotelPrice(0), /비슷/);
});

test("explainPeakSeason: 카테고리별 고유 문구", () => {
  const off = explainPeakSeason("off");
  const shoulder = explainPeakSeason("shoulder");
  const peak = explainPeakSeason("peak");
  const superPeak = explainPeakSeason("super_peak");
  const texts = new Set([off, shoulder, peak, superPeak]);
  assert.equal(texts.size, 4); // 넷 다 서로 다른 문장
  assert.match(off, /비수기/);
  assert.match(superPeak, /극성수기/);
});

test("explainClimateComfort: 점수가 null이면 null", () => {
  assert.equal(explainClimateComfort([{ tempC: 25, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 10 }], null), null);
});

test("explainClimateComfort: 실제 평균 기온을 문장에 그대로 반영", () => {
  const days = [
    { tempC: 20, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 10 },
    { tempC: 30, relHumidity: 70, cloudCoverPct: 15, precipMm: 0, windKmh: 10 },
  ];
  const text = explainClimateComfort(days, 80);
  assert.match(text!, /25\.0/); // (20+30)/2 = 25.0
  assert.match(text!, /쾌적/);
});
