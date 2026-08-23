import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFromGrade, candidateWindows } from "./topDestination.ts";

test("bandFromGrade: 최적기/좋음은 good", () => {
  assert.equal(bandFromGrade("최적기"), "good");
  assert.equal(bandFromGrade("좋음"), "good");
});

test("bandFromGrade: 보통은 warning", () => {
  assert.equal(bandFromGrade("보통"), "warning");
});

test("bandFromGrade: 비추천/최악은 serious", () => {
  assert.equal(bandFromGrade("비추천"), "serious");
  assert.equal(bandFromGrade("최악"), "serious");
});

test("candidateWindows: 오늘 기준 +14/+30/+45일, 각 2박(출발+2일=도착)", () => {
  const today = new Date("2026-09-01T00:00:00.000Z");
  const windows = candidateWindows(today);
  assert.deepEqual(windows, [
    { departDate: "2026-09-15", returnDate: "2026-09-17" },
    { departDate: "2026-10-01", returnDate: "2026-10-03" },
    { departDate: "2026-10-16", returnDate: "2026-10-18" },
  ]);
});
