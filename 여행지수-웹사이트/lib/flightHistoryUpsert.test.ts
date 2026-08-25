import { test } from "node:test";
import assert from "node:assert";
import { upsertRecord, countDistinctDates, type FlightPriceRecord } from "./flightHistory.ts";

test("upsertRecord: 새 날짜는 뒤에 붙는다", () => {
  const base: FlightPriceRecord[] = [{ date: "2026-08-24", price: 100, source: "api" }];
  const out = upsertRecord(base, { date: "2026-08-25", price: 200, source: "api" });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.date), ["2026-08-24", "2026-08-25"]);
});

test("upsertRecord: 같은 날짜를 두 번 넣어도 항목이 안 늘고 최신값으로 갱신된다", () => {
  let recs: FlightPriceRecord[] = [];
  recs = upsertRecord(recs, { date: "2026-08-25", price: 100, source: "api" });
  recs = upsertRecord(recs, { date: "2026-08-25", price: 150, source: "api" });
  recs = upsertRecord(recs, { date: "2026-08-25", price: 175, source: "api" });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].price, 175);
});

test("upsertRecord: 날짜순으로 정렬된다", () => {
  let recs: FlightPriceRecord[] = [];
  recs = upsertRecord(recs, { date: "2026-08-25", price: 1, source: "api" });
  recs = upsertRecord(recs, { date: "2026-08-23", price: 2, source: "api" });
  recs = upsertRecord(recs, { date: "2026-08-24", price: 3, source: "api" });
  assert.deepEqual(recs.map((r) => r.date), ["2026-08-23", "2026-08-24", "2026-08-25"]);
});

test("countDistinctDates: 항목 수가 아니라 고유 날짜 수를 센다", () => {
  const recs: FlightPriceRecord[] = [
    { date: "2026-08-23", price: 1 },
    { date: "2026-08-23", price: 1 },
    { date: "2026-08-23", price: 1 },
    { date: "2026-08-24", price: 2 },
  ];
  assert.equal(recs.length, 4);
  assert.equal(countDistinctDates(recs), 2);
});

test("countDistinctDates: 빈 배열은 0", () => {
  assert.equal(countDistinctDates([]), 0);
});
