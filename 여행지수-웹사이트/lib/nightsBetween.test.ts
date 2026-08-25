import { test } from "node:test";
import assert from "node:assert";
import { nightsBetween } from "./topDestination.ts";

test("nightsBetween: 2박3일", () => {
  assert.equal(nightsBetween("2026-09-08", "2026-09-10"), 2);
});

test("nightsBetween: 임의 길이도 정확히 센다", () => {
  assert.equal(nightsBetween("2026-09-01", "2026-09-08"), 7);
  assert.equal(nightsBetween("2026-12-28", "2027-01-03"), 6);
});

test("nightsBetween: 같은 날이거나 역순이어도 최소 1박", () => {
  assert.equal(nightsBetween("2026-09-08", "2026-09-08"), 1);
  assert.equal(nightsBetween("2026-09-10", "2026-09-08"), 1);
});
