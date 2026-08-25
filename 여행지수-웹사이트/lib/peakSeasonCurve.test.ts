import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPeakSeasonYearCurve, findCurveIndexForDate } from "./peakSeasonCurve.ts";

test("buildPeakSeasonYearCurve: 평년(2026, 윤년 아님)은 365개 지점", () => {
  const curve = buildPeakSeasonYearCurve(2026);
  assert.equal(curve.length, 365);
  assert.equal(curve[0].date, "2026-01-01");
  assert.equal(curve[364].date, "2026-12-31");
});

test("buildPeakSeasonYearCurve: 윤년(2028)은 366개 지점", () => {
  const curve = buildPeakSeasonYearCurve(2028);
  assert.equal(curve.length, 366);
});

test("buildPeakSeasonYearCurve: 신정 연휴(1/1)는 super_peak=20점", () => {
  const curve = buildPeakSeasonYearCurve(2026);
  assert.equal(curve[0].score, 20);
});

test("buildPeakSeasonYearCurve: 평범한 3월 중순은 off=100점", () => {
  const curve = buildPeakSeasonYearCurve(2026);
  const mar15 = curve.find((p) => p.date === "2026-03-15");
  assert.equal(mar15?.score, 100);
});

test("findCurveIndexForDate: 월-일이 일치하는 지점의 인덱스를 찾는다", () => {
  const curve = buildPeakSeasonYearCurve(2026);
  const idx = findCurveIndexForDate(curve, "2026-09-18");
  assert.equal(curve[idx].date, "2026-09-18");
});

test("findCurveIndexForDate: 곡선과 다른 연도의 날짜도 월-일만 맞춰 찾는다", () => {
  const curve = buildPeakSeasonYearCurve(2026);
  const idx = findCurveIndexForDate(curve, "2027-09-18");
  assert.equal(curve[idx].date, "2026-09-18");
});
