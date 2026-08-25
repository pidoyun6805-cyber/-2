import { test } from "node:test";
import assert from "node:assert";
import { computeRankingEligibility, rankingScoreFrom, sortByRanking, eligibilityNotice, type Breakdown } from "./rankingEligibility.ts";

const full = (over: Partial<Breakdown> = {}): Breakdown => ({
  flight: 80,
  hotel: 60,
  exchangeRate: 90,
  peakSeason: 100,
  climateComfort: 70,
  ...over,
});

test("결손이 없으면 아무것도 제외하지 않는다", () => {
  const e = computeRankingEligibility([
    { destinationKey: "오사카", breakdown: full() },
    { destinationKey: "도쿄", breakdown: full() },
  ]);
  assert.deepEqual(e.excludedMetrics, []);
  assert.deepEqual(e.excludedDestinations, []);
});

test("구조적 결손(환율)은 지수 자체를 전 목적지에서 뺀다", () => {
  const e = computeRankingEligibility([
    { destinationKey: "타이베이", breakdown: full({ exchangeRate: null }) },
    { destinationKey: "오사카", breakdown: full() },
  ]);
  assert.deepEqual(e.excludedMetrics, ["exchangeRate"]);
  // 목적지는 하나도 빠지지 않는다 — 타이베이를 영원히 후보에서 빼는 건 과하다.
  assert.deepEqual(e.excludedDestinations, []);
});

test("개별 결손(항공권)은 그 목적지만 랭킹에서 뺀다", () => {
  const e = computeRankingEligibility([
    { destinationKey: "괌", breakdown: full({ flight: null }) },
    { destinationKey: "사이판", breakdown: full({ flight: null }) },
    { destinationKey: "오사카", breakdown: full() },
  ]);
  assert.deepEqual(e.excludedMetrics, []);
  assert.deepEqual(
    e.excludedDestinations.map((d) => d.destinationKey).sort(),
    ["괌", "사이판"]
  );
  assert.deepEqual(e.excludedDestinations[0].missing, ["flight"]);
});

test("구조적/개별 결손이 동시에 있어도 각각 규칙대로 처리한다", () => {
  const e = computeRankingEligibility([
    { destinationKey: "타이베이", breakdown: full({ exchangeRate: null }) },
    { destinationKey: "괌", breakdown: full({ flight: null }) },
    { destinationKey: "마닐라", breakdown: full({ climateComfort: null }) },
  ]);
  assert.deepEqual(e.excludedMetrics, ["exchangeRate"]);
  assert.deepEqual(e.excludedDestinations.map((d) => d.destinationKey).sort(), ["괌", "마닐라"]);
});

test("데이터가 생기면 자동으로 다시 후보가 된다(하드코딩 없음)", () => {
  const before = computeRankingEligibility([{ destinationKey: "괌", breakdown: full({ flight: null }) }]);
  assert.equal(before.excludedDestinations.length, 1);
  const after = computeRankingEligibility([{ destinationKey: "괌", breakdown: full() }]);
  assert.equal(after.excludedDestinations.length, 0);
});

test("rankingScoreFrom: 제외된 지수는 계산에서 빠진다", () => {
  const b = full({ exchangeRate: 100 });
  const withFx = rankingScoreFrom(b, []);
  const withoutFx = rankingScoreFrom(b, ["exchangeRate"]);
  assert.notEqual(withFx, withoutFx);
  // 환율만 100으로 높았으니 빼면 점수가 내려가야 한다
  assert.ok(withoutFx < withFx);
});

test("rankingScoreFrom: 결손 목적지가 재분배로 유리해지지 않는다", () => {
  // 항공권이 낮은 목적지 vs 항공권이 아예 없는 목적지 — 없는 쪽이 더 높아지면 안 된다는 게 원래 문제였다.
  const hasLowFlight = full({ flight: 10 });
  const noFlight = full({ flight: null });
  const excluded = ["flight" as const];
  // 항공권을 양쪽 모두에서 빼면 두 점수가 같아진다(공정 비교).
  assert.equal(rankingScoreFrom(hasLowFlight, excluded), rankingScoreFrom(noFlight, excluded));
});

test("sortByRanking: 제외된 목적지는 뒤로 가되 사라지지 않는다", () => {
  const entries = [
    { destinationKey: "괌", breakdown: full({ flight: null }) },
    { destinationKey: "오사카", breakdown: full({ flight: 50 }) },
  ];
  const e = computeRankingEligibility(entries);
  const sorted = sortByRanking(entries, e);
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].destinationKey, "오사카");
  assert.equal(sorted[1].destinationKey, "괌");
});

test("eligibilityNotice: 제외가 없으면 null", () => {
  const e = computeRankingEligibility([{ destinationKey: "오사카", breakdown: full() }]);
  assert.equal(eligibilityNotice(e, (k) => k), null);
});

test("eligibilityNotice: 제외된 목적지와 사유를 밝힌다", () => {
  const e = computeRankingEligibility([
    { destinationKey: "괌", breakdown: full({ flight: null }) },
    { destinationKey: "사이판", breakdown: full({ flight: null }) },
    { destinationKey: "오사카", breakdown: full() },
  ]);
  const msg = eligibilityNotice(e, (k) => k);
  assert.ok(msg && msg.includes("항공권"));
  assert.ok(msg && msg.includes("2곳"));
  assert.ok(msg && msg.includes("괌"));
});
