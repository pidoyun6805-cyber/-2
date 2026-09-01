# 목적지 캘린더(좋은 날 찾기) 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목적지 4곳(오사카/후쿠오카/도쿄/타이베이)에 대해, 오늘부터 60일간 일별 종합/항공권/기후쾌적지수/성수기 점수를 계산하고, 카테고리별 "베스트 일정 1개 + 좋은 기간 목록"을 반환하는 API(`GET /api/destination-calendar`)를 만든다. 이 계획은 백엔드/데이터 레이어까지만 다룬다 — 카드 UI(프론트 컴포넌트)는 별도 계획.

**Architecture:** Travelpayouts `aviasales/v3/prices_for_dates`(편도, 가는편/오는편 따로)를 매일 크론으로 수집해 Redis에 월 단위로 캐시. 요청 시점에 그 캐시 + Open-Meteo 기후 + 기존 `calcTravelIndex`를 조합해 60일 매트릭스를 만들고, 지수 종류에 무관한 공통 함수(`findGoodDates`)로 "베스트 1개 + 좋은 기간 목록"을 뽑는다.

**Tech Stack:** Next.js 16 API Route, Upstash Redis(`@upstash/redis`), Travelpayouts Data API, Open-Meteo(기존 `getPeriodClimate` 재사용), `node --test`(기존 프로젝트 테스트 컨벤션 그대로).

**Spec:** 이 대화의 설계 논의 (`docs/superpowers/plans/2026-08-23-destination-calendar.md`와 함께 다니는 spec 문서는 따로 없음 — 아래 Global Constraints가 spec을 대신함).

## Global Constraints

- 대상 노선은 4개 고정: 오사카(PUS-KIX), 후쿠오카(PUS-FUK), 도쿄(PUS-NRT), 타이베이(PUS-TPE). 다른 노선으로 확장하지 않는다.
- 타이베이만 **가는편(PUS→TPE)은 대한항공(KE)만**, 오는편(TPE→PUS)은 전체 항공사 최저가. 나머지 3개 노선은 왕복 다 전체 항공사 최저가.
- 데이터가 없으면(KE 요금 없음, 캐시 부족 등) **절대 지어내지 않는다** — `null` + 프론트에서 "데이터 없음"류 표시. 이 프로젝트 전체에서 이미 일관되게 지켜온 원칙.
- 여행일수는 매트릭스 계산에서 고정 3박(`tripNights = 3`)을 쓴다.
- "좋은 기간" 기준선: 종합/항공권/기후쾌적지수는 그 목적지 60일 분포의 상위 25%(75th percentile, null 제외하고 계산). 성수기는 고정 기준(70점 이상, 즉 off/shoulder)만 예외.
- `findGoodDates`는 지수 종류를 몰라야 한다(순수 함수, 숫자 배열만 받음) — 성수기냐 항공권이냐에 따라 분기하는 코드가 이 함수 안에 있으면 안 됨.
- Redis 항공권 캘린더 키는 월 단위로 쓴다: `flightCalendar:{routeKey}:{outbound|inbound}:{YYYY-MM}`, TTL 95일.
- 새 파일은 기존 프로젝트 컨벤션을 따른다: `lib/*.ts`는 순수 로직/데이터 접근, `node:test`로 유닛테스트, import는 프로덕션 코드에서 확장자 없이(`from "./scoring"`), 테스트 파일에서만 `.ts` 확장자(`from "./scoring.ts"`).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/dateRanges.ts` | `findGoodDates` 순수 함수 — 날짜별 점수 배열을 받아 베스트 1개 + 좋은 기간 목록 반환. 지수 종류 모름. |
| `lib/dateRanges.test.ts` | 위 함수 유닛테스트 |
| `lib/flightCalendarSource.ts` | Travelpayouts `prices_for_dates` 호출, 한 노선·한 방향·한 달치 원본 레코드를 가져옴 |
| `lib/flightCalendarStore.ts` | Redis(Upstash) 기반 캘린더 캐시 읽기/쓰기 (`kvFlightHistoryStore.ts`와 같은 패턴) |
| `lib/collectFlightCalendar.ts` | 4개 노선 × 2개 방향 × 3개월을 순회하며 source→store로 채우는 오케스트레이션 |
| `app/api/cron/collect-flight-calendar/route.ts` | 위를 매일 1회 호출하는 크론 엔드포인트 (기존 크론과 같은 `CRON_SECRET` 인증 패턴) |
| `lib/flightCalendarScore.ts` | 캐시된 가는편/오는편 레코드를 합쳐서 날짜별 항공권 점수로 바꿈. **타이베이 KE 필터가 사는 유일한 곳.** |
| `lib/destinationCalendar.ts` | 최상위 오케스트레이션 — 기후/성수기/항공권/종합 60일 매트릭스를 만들고 `findGoodDates`로 최종 응답 조립 |
| `app/api/destination-calendar/route.ts` | `GET ?destinationKey=오사카` → `DestinationCalendarResponse` JSON |

---

### Task 1: `lib/dateRanges.ts` — findGoodDates 순수 함수

**Files:**
- Create: `여행지수-웹사이트/lib/dateRanges.ts`
- Test: `여행지수-웹사이트/lib/dateRanges.test.ts`

**Interfaces:**
- Produces: `DailyScore`, `DateRangeSummary`, `ThresholdOption`, `GoodDatesResult`, `findGoodDates(scores, threshold?)` — 이후 모든 태스크가 이 타입/함수를 그대로 씀.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/dateRanges.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { findGoodDates } from "./dateRanges.ts";

test("findGoodDates: 빈 배열이면 best null, goodRanges 빈 배열", () => {
  const result = findGoodDates([]);
  assert.equal(result.best, null);
  assert.deepEqual(result.goodRanges, []);
});

test("findGoodDates: 전부 null 점수면 best null, goodRanges 빈 배열", () => {
  const result = findGoodDates([
    { date: "2026-09-01", score: null },
    { date: "2026-09-02", score: null },
  ]);
  assert.equal(result.best, null);
  assert.deepEqual(result.goodRanges, []);
});

test("findGoodDates: percentile 기본값(75)으로 상위 25%만 goodRanges에 포함", () => {
  // 점수 1~8, 오름차순 8개 -> threshold index = floor(8*75/100) = 6 -> sorted[6] = 7
  // 즉 7,8만 임계값 이상 (2개 = 25%)
  const scores = [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => ({
    date: `2026-09-0${i + 1}`,
    score: n,
  }));
  const result = findGoodDates(scores);
  assert.equal(result.threshold, 7);
  assert.deepEqual(
    result.goodRanges.map((r) => [r.start, r.end]),
    [["2026-09-07", "2026-09-08"]]
  );
});

test("findGoodDates: fixed threshold는 지정한 값을 그대로 기준선으로 씀", () => {
  const scores = [
    { date: "2026-09-01", score: 100 },
    { date: "2026-09-02", score: 70 },
    { date: "2026-09-03", score: 40 },
    { date: "2026-09-04", score: 20 },
  ];
  const result = findGoodDates(scores, { mode: "fixed", value: 70 });
  assert.equal(result.threshold, 70);
  // 100, 70인 날만 포함 (연속이라 한 구간)
  assert.deepEqual(
    result.goodRanges.map((r) => [r.start, r.end]),
    [["2026-09-01", "2026-09-02"]]
  );
});

test("findGoodDates: 끊긴 날짜는 별도 구간으로 나뉜다", () => {
  const scores = [
    { date: "2026-09-01", score: 90 },
    { date: "2026-09-02", score: 90 },
    { date: "2026-09-03", score: 10 }, // 기준 미달
    { date: "2026-09-04", score: 90 },
  ];
  const result = findGoodDates(scores, { mode: "fixed", value: 50 });
  assert.deepEqual(
    result.goodRanges.map((r) => [r.start, r.end]),
    [
      ["2026-09-01", "2026-09-02"],
      ["2026-09-04", "2026-09-04"],
    ]
  );
});

test("findGoodDates: best는 최고점 날, 동점이면 이른 날짜, 1일짜리 DateRangeSummary로 표현", () => {
  const scores = [
    { date: "2026-09-01", score: 50 },
    { date: "2026-09-02", score: 90 },
    { date: "2026-09-03", score: 90 },
  ];
  const result = findGoodDates(scores, { mode: "fixed", value: 0 });
  assert.deepEqual(result.best, {
    start: "2026-09-02",
    end: "2026-09-02",
    nights: 0,
    avgScore: 90,
  });
});

test("findGoodDates: best는 goodRanges에서 별도로 빠지지 않는다", () => {
  const scores = [
    { date: "2026-09-01", score: 90 },
    { date: "2026-09-02", score: 95 },
  ];
  const result = findGoodDates(scores, { mode: "fixed", value: 50 });
  assert.deepEqual(result.goodRanges, [
    { start: "2026-09-01", end: "2026-09-02", nights: 1, avgScore: 92.5 },
  ]);
  assert.deepEqual(result.best, {
    start: "2026-09-02",
    end: "2026-09-02",
    nights: 0,
    avgScore: 95,
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/dateRanges.test.ts`
Expected: FAIL — `Cannot find module './dateRanges.ts'` (모듈이 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

```ts
// lib/dateRanges.ts

export interface DailyScore {
  date: string; // YYYY-MM-DD
  score: number | null;
}

export interface DateRangeSummary {
  start: string;
  end: string;
  nights: number; // end - start 일수. 단일 날짜면 0.
  avgScore: number;
}

export type ThresholdOption = { mode: "percentile"; value?: number } | { mode: "fixed"; value: number };

export interface GoodDatesResult {
  best: DateRangeSummary | null;
  threshold: number;
  goodRanges: DateRangeSummary[];
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

function computeThreshold(sortedAscendingScores: number[], option: ThresholdOption): number {
  if (option.mode === "fixed") return option.value;
  const percentile = option.value ?? 75;
  const index = Math.min(sortedAscendingScores.length - 1, Math.floor((sortedAscendingScores.length * percentile) / 100));
  return sortedAscendingScores[index];
}

// 지수 종류를 모르는 순수 함수 — 날짜별 점수 배열만 보고 베스트 1개와 "좋은 기간" 목록을 뽑는다.
// threshold 기본값은 상위 25%(75th percentile). 성수기처럼 이산적인 값에는 { mode: "fixed", value } 사용.
export function findGoodDates(scores: DailyScore[], threshold: ThresholdOption = { mode: "percentile", value: 75 }): GoodDatesResult {
  const valid = scores.filter((s): s is { date: string; score: number } => s.score !== null);

  if (valid.length === 0) {
    return { best: null, threshold: 0, goodRanges: [] };
  }

  const sortedByScore = [...valid].sort((a, b) => a.score - b.score).map((s) => s.score);
  const thresholdValue = computeThreshold(sortedByScore, threshold);

  const bestEntry = valid.reduce((best, cur) => {
    if (cur.score > best.score) return cur;
    if (cur.score === best.score && cur.date < best.date) return cur;
    return best;
  });
  const best: DateRangeSummary = { start: bestEntry.date, end: bestEntry.date, nights: 0, avgScore: bestEntry.score };

  const goodDates = valid.filter((s) => s.score >= thresholdValue).sort((a, b) => (a.date < b.date ? -1 : 1));

  const goodRanges: DateRangeSummary[] = [];
  let rangeStart: { date: string; score: number } | null = null;
  let rangeScores: number[] = [];
  let prevDate: string | null = null;

  for (const entry of goodDates) {
    if (rangeStart && prevDate && daysBetween(prevDate, entry.date) === 1) {
      rangeScores.push(entry.score);
      prevDate = entry.date;
      continue;
    }
    if (rangeStart && prevDate) {
      goodRanges.push({
        start: rangeStart.date,
        end: prevDate,
        nights: daysBetween(rangeStart.date, prevDate),
        avgScore: Math.round((rangeScores.reduce((a, b) => a + b, 0) / rangeScores.length) * 10) / 10,
      });
    }
    rangeStart = entry;
    rangeScores = [entry.score];
    prevDate = entry.date;
  }
  if (rangeStart && prevDate) {
    goodRanges.push({
      start: rangeStart.date,
      end: prevDate,
      nights: daysBetween(rangeStart.date, prevDate),
      avgScore: Math.round((rangeScores.reduce((a, b) => a + b, 0) / rangeScores.length) * 10) / 10,
    });
  }

  return { best, threshold: thresholdValue, goodRanges };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/dateRanges.test.ts`
Expected: PASS (7개 전부)

- [ ] **Step 5: tsc/eslint 확인 후 커밋**

Run: `cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint`

```bash
git add 여행지수-웹사이트/lib/dateRanges.ts 여행지수-웹사이트/lib/dateRanges.test.ts
git commit -m "여행지수 웹사이트: 지수 종류 무관 좋은 날짜 찾기 함수(findGoodDates) 추가"
```

---

### Task 2: `lib/flightCalendarSource.ts` — Travelpayouts prices_for_dates 호출

**Files:**
- Create: `여행지수-웹사이트/lib/flightCalendarSource.ts`

**Interfaces:**
- Consumes: 없음 (외부 API 직접 호출)
- Produces: `FlightCalendarRecord { date: string; airline: string; price: number }`, `fetchPricesForDates(origin, destination, month): Promise<FlightCalendarRecord[]>`

- [ ] **Step 1: 구현**

```ts
// lib/flightCalendarSource.ts

export interface FlightCalendarRecord {
  date: string; // YYYY-MM-DD (출발일)
  airline: string; // IATA 2글자
  price: number;
}

interface PricesForDatesEntry {
  departure_at: string;
  airline: string;
  price: number;
}

interface PricesForDatesResponse {
  success: boolean;
  data: PricesForDatesEntry[] | null;
}

// Travelpayouts aviasales/v3/prices_for_dates — "최근 48시간 내 실사용자 검색 최저가" 캐시.
// 편도(one_way=true)로만 호출한다 — 왕복 모드는 가는편/오는편 항공사가 하나로 묶여 나와서
// "가는편만 KE" 같은 편도별 필터링이 불가능하기 때문(2026-08-23 세션에서 실제로 확인함).
export async function fetchPricesForDates(origin: string, destination: string, month: string): Promise<FlightCalendarRecord[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) {
    throw new Error("TRAVELPAYOUTS_API_TOKEN 환경변수가 설정되어 있지 않습니다.");
  }

  const url = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("departure_at", month);
  url.searchParams.set("currency", "krw");
  url.searchParams.set("one_way", "true");
  url.searchParams.set("limit", "100");
  url.searchParams.set("token", token);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Travelpayouts prices_for_dates 요청 실패 (${res.status}): ${origin}->${destination} ${month}`);
  }

  const json = (await res.json()) as PricesForDatesResponse;
  if (!json.success || !json.data) {
    return [];
  }

  return json.data.map((entry) => ({
    date: entry.departure_at.slice(0, 10),
    airline: entry.airline,
    price: entry.price,
  }));
}
```

- [ ] **Step 2: 실제 호출로 검증** (유닛테스트 대신 — 이 프로젝트의 기존 컨벤션. `flightPriceSource.ts`도 테스트 파일이 없고 실제 호출로만 검증됨)

Run:
```bash
cd 여행지수-웹사이트
node -e "
import('./lib/flightCalendarSource.ts').then(async (m) => {
  const records = await m.fetchPricesForDates('PUS', 'TPE', '2026-09');
  console.log(records.length, 'records');
  console.log(records.slice(0, 3));
});
"
```
Expected: 실제 레코드 배열 출력 (2026-08-23 세션에서 이미 이 API로 직접 확인한 것과 같은 모양 — `date`/`airline`/`price` 3개 필드만 있는 배열)

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/flightCalendarSource.ts
git commit -m "여행지수 웹사이트: Travelpayouts prices_for_dates(항공권 달력 캐시) 호출 함수 추가"
```

---

### Task 3: `lib/flightCalendarStore.ts` — Redis 캘린더 캐시

**Files:**
- Create: `여행지수-웹사이트/lib/flightCalendarStore.ts`

**Interfaces:**
- Consumes: `FlightCalendarRecord`(Task 2)
- Produces: `FlightCalendarDirection = "outbound" | "inbound"`, `flightCalendarStore.get(routeKey, direction, month)`, `flightCalendarStore.set(routeKey, direction, month, records)`

- [ ] **Step 1: 구현** (`kvFlightHistoryStore.ts`와 같은 Upstash Redis 패턴, TTL만 추가)

```ts
// lib/flightCalendarStore.ts
import { Redis } from "@upstash/redis";
import type { FlightCalendarRecord } from "./flightCalendarSource";

export type FlightCalendarDirection = "outbound" | "inbound";

const redis = Redis.fromEnv();

const TTL_SECONDS = 95 * 24 * 60 * 60; // 약 95일 — 그 달이 지나면 자동 정리

function keyFor(routeKey: string, direction: FlightCalendarDirection, month: string): string {
  return `flightCalendar:${routeKey}:${direction}:${month}`;
}

export const kvFlightCalendarStore = {
  async get(routeKey: string, direction: FlightCalendarDirection, month: string): Promise<FlightCalendarRecord[]> {
    try {
      const data = await redis.get<FlightCalendarRecord[]>(keyFor(routeKey, direction, month));
      return data ?? [];
    } catch (err) {
      // kvFlightHistoryStore.ts와 같은 방어: Redis 장애 시에도 "데이터 없음"으로 취급해
      // buildDestinationCalendar 전체가 죽지 않고 해당 구간만 null로 빠지게 한다.
      console.error(`[kvFlightCalendarStore] get(${routeKey}, ${direction}, ${month}) 실패, 빈 배열로 처리:`, err);
      return [];
    }
  },

  async set(routeKey: string, direction: FlightCalendarDirection, month: string, records: FlightCalendarRecord[]): Promise<void> {
    await redis.set(keyFor(routeKey, direction, month), records, { ex: TTL_SECONDS });
  },
};
```

- [ ] **Step 2: 실제 Redis에 쓰고 읽어서 검증**

Run:
```bash
cd 여행지수-웹사이트
node -e "
import('./lib/flightCalendarStore.ts').then(async (m) => {
  const test = [{ date: '2026-09-01', airline: 'KE', price: 300000 }];
  await m.kvFlightCalendarStore.set('PUS-TPE', 'outbound', '2026-09', test);
  const back = await m.kvFlightCalendarStore.get('PUS-TPE', 'outbound', '2026-09');
  console.log(JSON.stringify(back));
});
"
```
Expected: 저장한 것과 같은 배열이 그대로 나옴. `.env.local`의 `UPSTASH_REDIS_REST_URL`/`TOKEN`이 이미 설정되어 있어야 함(기존 프로젝트에 이미 있음).

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/flightCalendarStore.ts
git commit -m "여행지수 웹사이트: 항공권 캘린더 Redis 캐시 저장소(kvFlightCalendarStore) 추가"
```

---

### Task 4: `lib/collectFlightCalendar.ts` + 크론 라우트

**Files:**
- Create: `여행지수-웹사이트/lib/collectFlightCalendar.ts`
- Create: `여행지수-웹사이트/app/api/cron/collect-flight-calendar/route.ts`

**Interfaces:**
- Consumes: `fetchPricesForDates`(Task 2), `kvFlightCalendarStore`(Task 3)
- Produces: `CALENDAR_ROUTES`, `collectFlightCalendar(): Promise<CollectCalendarResult>`

- [ ] **Step 1: 구현**

```ts
// lib/collectFlightCalendar.ts
import { fetchPricesForDates } from "./flightCalendarSource";
import { kvFlightCalendarStore, type FlightCalendarDirection } from "./flightCalendarStore";

// 캘린더 수집 대상 — 카드 UI에 쓰는 4개 노선만. 다른 17개 목적지는 대상 아님(비용 문제).
export const CALENDAR_ROUTES: { routeKey: string; originCode: string; destCode: string }[] = [
  { routeKey: "PUS-KIX", originCode: "PUS", destCode: "KIX" },
  { routeKey: "PUS-FUK", originCode: "PUS", destCode: "FUK" },
  { routeKey: "PUS-NRT", originCode: "PUS", destCode: "NRT" },
  { routeKey: "PUS-TPE", originCode: "PUS", destCode: "TPE" },
];

function nextMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export interface CollectCalendarResult {
  collected: { routeKey: string; direction: FlightCalendarDirection; month: string; count: number }[];
  failed: { routeKey: string; direction: FlightCalendarDirection; month: string; error: string }[];
}

// 오늘부터 60일이 걸치는 3개월(이번 달 + 다음 2개월)치를, 4개 노선 x 2개 방향으로 수집한다.
// 한 조합이 실패해도 나머지는 계속 진행(기존 collectFlightPrices.ts와 같은 패턴).
export async function collectFlightCalendar(): Promise<CollectCalendarResult> {
  const months = nextMonths(3);
  const result: CollectCalendarResult = { collected: [], failed: [] };

  for (const route of CALENDAR_ROUTES) {
    const directions: { direction: FlightCalendarDirection; origin: string; destination: string }[] = [
      { direction: "outbound", origin: route.originCode, destination: route.destCode },
      { direction: "inbound", origin: route.destCode, destination: route.originCode },
    ];

    for (const { direction, origin, destination } of directions) {
      for (const month of months) {
        try {
          const records = await fetchPricesForDates(origin, destination, month);
          await kvFlightCalendarStore.set(route.routeKey, direction, month, records);
          result.collected.push({ routeKey: route.routeKey, direction, month, count: records.length });
        } catch (err) {
          result.failed.push({
            routeKey: route.routeKey,
            direction,
            month,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return result;
}
```

```ts
// app/api/cron/collect-flight-calendar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { collectFlightCalendar } from "@/lib/collectFlightCalendar";

export const runtime = "nodejs";

// 기존 /api/cron/collect-flight-prices와 같은 인증 패턴 — CRON_SECRET 없거나 안 맞으면 401.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await collectFlightCalendar();
  return NextResponse.json(result);
}
```

- [ ] **Step 2: `vercel.json`에 크론 스케줄 추가** — 기존 `collect-flight-prices`와 같은 파일에 항목만 추가

Modify: `여행지수-웹사이트/vercel.json` (기존 크론 등록 옆에 `/api/cron/collect-flight-calendar` 매일 1회 추가. 기존 파일 내용을 먼저 확인하고 그 포맷 그대로 따를 것.)

- [ ] **Step 3: 로컬에서 실제 크론 호출로 검증**

```bash
cd 여행지수-웹사이트
npm run dev &
curl -s -X GET "http://localhost:3000/api/cron/collect-flight-calendar" \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```
Expected: `{"collected":[...24개 항목...],"failed":[...]}` — PUS-TPE outbound만 KE 데이터 부족으로 `count`가 낮거나 0일 수 있음(정상, 1번 조사에서 이미 확인한 내용).

- [ ] **Step 4: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/collectFlightCalendar.ts app/api/cron/collect-flight-calendar/route.ts vercel.json
git commit -m "여행지수 웹사이트: 항공권 달력 수집 크론(collect-flight-calendar) 추가"
```

---

### Task 5: `lib/flightCalendarScore.ts` — 날짜별 항공권 점수 (KE 필터가 사는 곳)

**Files:**
- Create: `여행지수-웹사이트/lib/flightCalendarScore.ts`
- Test: `여행지수-웹사이트/lib/flightCalendarScore.test.ts`

**Interfaces:**
- Consumes: `FlightCalendarRecord`(Task 2), `DailyScore`(Task 1)
- Produces: `combineDirectionalPrices(...)`, `scoreCalendarPrices(...)`, `buildFlightScoreMatrix(...)`

**⚠️ 설계 판단 필요**: 날짜별 가격을 0~100점으로 바꾸는 공식은 이전 대화에서 명시적으로 합의된 적이 없습니다. 아래는 제 제안이며(기존 `flightPriceScoreFallback`의 "같은 노선 내 백분위 → `(1-percentile)*100`" 공식을 그대로 재사용 — 다만 다른 노선끼리 비교하는 게 아니라 같은 노선의 다른 *날짜*끼리 비교), 리뷰 시 이 부분만 특히 확인해주세요.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/flightCalendarScore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { combineDirectionalPrices, scoreCalendarPrices, buildFlightScoreMatrix } from "./flightCalendarScore.ts";

test("combineDirectionalPrices: 가는편+오는편 최저가를 합산", () => {
  const outbound = [
    { date: "2026-09-01", airline: "7C", price: 100000 },
    { date: "2026-09-01", airline: "ZE", price: 90000 },
  ];
  const inbound = [{ date: "2026-09-04", airline: "7C", price: 80000 }];
  const result = combineDirectionalPrices(outbound, inbound, ["2026-09-01"], 3, null);
  assert.deepEqual(result, [{ date: "2026-09-01", price: 90000 + 80000 }]);
});

test("combineDirectionalPrices: 가는편 항공사 필터 적용(타이베이 KE 케이스)", () => {
  const outbound = [
    { date: "2026-09-01", airline: "7C", price: 90000 }, // 더 싸지만 KE 아님
    { date: "2026-09-01", airline: "KE", price: 150000 },
  ];
  const inbound = [{ date: "2026-09-04", airline: "ZE", price: 80000 }];
  const result = combineDirectionalPrices(outbound, inbound, ["2026-09-01"], 3, "KE");
  assert.deepEqual(result, [{ date: "2026-09-01", price: 150000 + 80000 }]);
});

test("combineDirectionalPrices: 필터에 맞는 가는편이 없으면 null", () => {
  const outbound = [{ date: "2026-09-01", airline: "7C", price: 90000 }];
  const inbound = [{ date: "2026-09-04", airline: "ZE", price: 80000 }];
  const result = combineDirectionalPrices(outbound, inbound, ["2026-09-01"], 3, "KE");
  assert.deepEqual(result, [{ date: "2026-09-01", price: null }]);
});

test("combineDirectionalPrices: 오는편 데이터가 없으면 null", () => {
  const outbound = [{ date: "2026-09-01", airline: "7C", price: 90000 }];
  const result = combineDirectionalPrices(outbound, [], ["2026-09-01"], 3, null);
  assert.deepEqual(result, [{ date: "2026-09-01", price: null }]);
});

test("scoreCalendarPrices: 비교 대상 3개 미만이면 전부 null", () => {
  const points = [
    { date: "2026-09-01", price: 100 },
    { date: "2026-09-02", price: 200 },
  ];
  const result = scoreCalendarPrices(points);
  assert.deepEqual(result.map((r) => r.score), [null, null]);
});

test("scoreCalendarPrices: 가장 싼 날이 100점에 가깝다", () => {
  const points = [
    { date: "2026-09-01", price: 100 },
    { date: "2026-09-02", price: 200 },
    { date: "2026-09-03", price: 300 },
    { date: "2026-09-04", price: null },
  ];
  const result = scoreCalendarPrices(points);
  assert.equal(result[0].score, 100);
  assert.equal(result[3].score, null);
  assert.ok(result[0].score! > result[1].score!);
  assert.ok(result[1].score! > result[2].score!);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/flightCalendarScore.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```ts
// lib/flightCalendarScore.ts
import type { FlightCalendarRecord } from "./flightCalendarSource";
import type { DailyScore } from "./dateRanges";

export interface CalendarPricePoint {
  date: string;
  price: number | null;
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// 가는편(outboundRecords)과 오는편(inboundRecords)의 그날 최저가를 합쳐 왕복 가격을 만든다.
// outboundAirlineFilter가 주어지면(타이베이="KE") 가는편만 그 항공사로 제한 — 오는편은 항상 전체 최저가.
export function combineDirectionalPrices(
  outboundRecords: FlightCalendarRecord[],
  inboundRecords: FlightCalendarRecord[],
  departDates: string[],
  tripNights: number,
  outboundAirlineFilter: string | null
): CalendarPricePoint[] {
  return departDates.map((departDate) => {
    const outboundCandidates = outboundRecords.filter(
      (r) => r.date === departDate && (outboundAirlineFilter === null || r.airline === outboundAirlineFilter)
    );
    if (outboundCandidates.length === 0) return { date: departDate, price: null };
    const outboundPrice = Math.min(...outboundCandidates.map((r) => r.price));

    const returnDate = addDays(departDate, tripNights);
    const inboundCandidates = inboundRecords.filter((r) => r.date === returnDate);
    if (inboundCandidates.length === 0) return { date: departDate, price: null };
    const inboundPrice = Math.min(...inboundCandidates.map((r) => r.price));

    return { date: departDate, price: outboundPrice + inboundPrice };
  });
}

const MIN_SAMPLES_FOR_PERCENTILE = 3;

// 같은 노선의 다른 날짜들과 비교한 백분위로 0~100점을 매긴다 — 가장 싼 날이 100점에 가까움.
// 기존 flightPriceScoreFallback의 "(1-percentile)*100" 공식과 동일한 방식(노선간 비교 대신 날짜간 비교).
export function scoreCalendarPrices(points: CalendarPricePoint[]): DailyScore[] {
  const validPrices = points.filter((p): p is { date: string; price: number } => p.price !== null).map((p) => p.price);

  return points.map((p) => {
    if (p.price === null || validPrices.length < MIN_SAMPLES_FOR_PERCENTILE) {
      return { date: p.date, score: null };
    }
    const rank = validPrices.filter((v) => v <= (p.price as number)).length;
    const percentile = rank / validPrices.length;
    return { date: p.date, score: Math.round((1 - percentile) * 100) };
  });
}

// combineDirectionalPrices + scoreCalendarPrices를 이어붙인 편의 함수.
export function buildFlightScoreMatrix(
  outboundRecords: FlightCalendarRecord[],
  inboundRecords: FlightCalendarRecord[],
  departDates: string[],
  tripNights: number,
  outboundAirlineFilter: string | null
): DailyScore[] {
  const points = combineDirectionalPrices(outboundRecords, inboundRecords, departDates, tripNights, outboundAirlineFilter);
  return scoreCalendarPrices(points);
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/flightCalendarScore.test.ts`
Expected: PASS (6개 전부)

- [ ] **Step 5: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/flightCalendarScore.ts lib/flightCalendarScore.test.ts
git commit -m "여행지수 웹사이트: 날짜별 항공권 점수 계산(타이베이 KE 필터 포함) 추가"
```

---

### Task 6: `lib/destinationCalendar.ts` — 최상위 오케스트레이션

**Files:**
- Create: `여행지수-웹사이트/lib/destinationCalendar.ts`
- Test: `여행지수-웹사이트/lib/destinationCalendar.test.ts` (날짜 생성 등 순수 부분만; 외부 API 조합 부분은 Step 4에서 실제 호출로 검증)

**Interfaces:**
- Consumes: `findGoodDates`(Task 1), `kvFlightCalendarStore`(Task 3), `buildFlightScoreMatrix`(Task 5), 기존 `getPeriodClimate`/`climateComfortScore`/`lookupPeakCategory`/`scorePeakSeason`/`calcTravelIndex`/`DESTINATIONS`
- Produces: `DateRangeSummary`(재노출), `CategoryResult`, `DailyMatrixEntry`, `DestinationCalendarResponse`, `buildDestinationCalendar(destinationKey): Promise<DestinationCalendarResponse>`

- [ ] **Step 1: 날짜 생성 유틸 실패 테스트 작성**

```ts
// lib/destinationCalendar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDateRange } from "./destinationCalendar.ts";

test("generateDateRange: 시작일부터 N일치 날짜 문자열 배열", () => {
  const dates = generateDateRange("2026-09-28", 5);
  assert.deepEqual(dates, ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/destinationCalendar.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// lib/destinationCalendar.ts
import { DESTINATIONS } from "./destinations";
import { getPeriodClimate, getExchangeRateHistory } from "./externalApi";
import { lookupPeakCategory } from "./peakSeason";
import { calcTravelIndex, climateComfortScore, exchangeRateScore, scorePeakSeason, type PeakCategory } from "./scoring";
import { findGoodDates, type DailyScore, type DateRangeSummary } from "./dateRanges";
import { kvFlightCalendarStore } from "./flightCalendarStore";
import { buildFlightScoreMatrix } from "./flightCalendarScore";
import hotels from "@/data/hotels.json";

export type { DateRangeSummary };

export interface CategoryResult {
  best: DateRangeSummary | null;
  goodPeriods: DateRangeSummary[];
}

export interface DailyMatrixEntry {
  date: string;
  totalScore: number | null;
  flightScore: number | null;
  climateComfortScore: number | null;
  peakSeasonScore: number;
}

export interface DestinationCalendarResponse {
  destinationKey: string;
  rangeStart: string;
  rangeEnd: string;
  tripNights: number;
  total: CategoryResult;
  flight: CategoryResult;
  climateComfort: CategoryResult;
  peakSeason: CategoryResult;
  daily: DailyMatrixEntry[];
}

const MATRIX_DAYS = 60;
const TRIP_NIGHTS = 3;
// 타이베이만 가는편 항공사를 대한항공으로 제한. 나머지 노선은 전체 항공사 최저가(null).
const OUTBOUND_AIRLINE_FILTER: Record<string, string | null> = {
  오사카: null,
  후쿠오카: null,
  도쿄: null,
  타이베이: "KE",
};

export function generateDateRange(start: string, days: number): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  for (let i = 0; i < days; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function monthsSpanning(dates: string[]): string[] {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return [...months];
}

function toCategoryResult(dailyScores: DailyScore[], threshold: Parameters<typeof findGoodDates>[1]): CategoryResult {
  const { best, goodRanges } = findGoodDates(dailyScores, threshold);
  return { best, goodPeriods: goodRanges };
}

export async function buildDestinationCalendar(destinationKey: string): Promise<DestinationCalendarResponse> {
  const destination = DESTINATIONS[destinationKey];
  if (!destination) {
    throw new Error(`지원하지 않는 목적지입니다: ${destinationKey}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dates = generateDateRange(today, MATRIX_DAYS);
  const rangeStart = dates[0];
  const rangeEnd = dates[dates.length - 1];
  const months = monthsSpanning(dates);

  // 오늘 스냅샷 값(호텔/환율)은 60일 내내 고정 — 이 프로젝트의 기존 설계(환율은 "오늘 기준")와 일관됨.
  const hotel = (hotels as Record<string, { avgPrice: number; currentPrice: number }>)[destinationKey];
  const hotelDeviationPct = (hotel.currentPrice - hotel.avgPrice) / hotel.avgPrice;

  const [outboundByMonth, inboundByMonth, climateDays, exchangeRateHistory] = await Promise.all([
    Promise.all(months.map((m) => kvFlightCalendarStore.get(destination.flightRouteKey, "outbound", m))),
    Promise.all(months.map((m) => kvFlightCalendarStore.get(destination.flightRouteKey, "inbound", m))),
    getPeriodClimate(destination.lat, destination.lon, rangeStart, rangeEnd),
    getExchangeRateHistory(destination.currency).catch(() => null),
  ]);

  const outboundRecords = outboundByMonth.flat();
  const inboundRecords = inboundByMonth.flat();
  const exchangeScore = exchangeRateHistory
    ? exchangeRateScore(exchangeRateHistory.currentRate, exchangeRateHistory.historicalRates)
    : null;

  const flightScores = buildFlightScoreMatrix(
    outboundRecords,
    inboundRecords,
    dates,
    TRIP_NIGHTS,
    OUTBOUND_AIRLINE_FILTER[destinationKey] ?? null
  );

  const daily: DailyMatrixEntry[] = dates.map((date, i) => {
    const day = Number(date.slice(8, 10));
    const monthNum = Number(date.slice(5, 7));
    const peakCategory: PeakCategory = lookupPeakCategory(monthNum, day);
    const peakSeasonScore = scorePeakSeason(peakCategory);
    const climateDay = climateDays[i];
    const climateScore = climateDay
      ? climateComfortScore(climateDay.tempC, climateDay.relHumidity, climateDay.cloudCoverPct, climateDay.precipMm, climateDay.windKmh)
      : null;
    const flightScore = flightScores[i]?.score ?? null;

    const travelIndex = calcTravelIndex({
      flightScore,
      hotelDeviationPct,
      exchangeRateScore: exchangeScore,
      peakCategory,
      climateDays: climateDay ? [climateDay] : [],
    });

    return {
      date,
      totalScore: travelIndex.totalScore,
      flightScore,
      climateComfortScore: climateScore,
      peakSeasonScore,
    };
  });

  const totalDailyScores: DailyScore[] = daily.map((d) => ({ date: d.date, score: d.totalScore }));
  const flightDailyScores: DailyScore[] = daily.map((d) => ({ date: d.date, score: d.flightScore }));
  const climateDailyScores: DailyScore[] = daily.map((d) => ({ date: d.date, score: d.climateComfortScore }));
  const peakDailyScores: DailyScore[] = daily.map((d) => ({ date: d.date, score: d.peakSeasonScore }));

  const total = toCategoryResult(totalDailyScores, { mode: "percentile", value: 75 });
  // total.best만 실제 여행 구간(출발~+3박)으로 넓힌다 — "베스트 일정"이 하루짜리로 보이면 안 되므로.
  if (total.best) {
    const departDate = total.best.start;
    total.best = {
      start: departDate,
      end: generateDateRange(departDate, TRIP_NIGHTS + 1)[TRIP_NIGHTS],
      nights: TRIP_NIGHTS,
      avgScore: total.best.avgScore,
    };
  }

  return {
    destinationKey,
    rangeStart,
    rangeEnd,
    tripNights: TRIP_NIGHTS,
    total,
    flight: toCategoryResult(flightDailyScores, { mode: "percentile", value: 75 }),
    climateComfort: toCategoryResult(climateDailyScores, { mode: "percentile", value: 75 }),
    peakSeason: toCategoryResult(peakDailyScores, { mode: "fixed", value: 70 }),
    daily,
  };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/destinationCalendar.test.ts`
Expected: PASS

- [ ] **Step 5: 실제 데이터로 통합 검증** (Task 4 크론을 먼저 한 번 돌려서 Redis에 캘린더가 채워져 있어야 함)

```bash
cd 여행지수-웹사이트
node -e "
import('./lib/destinationCalendar.ts').then(async (m) => {
  const result = await m.buildDestinationCalendar('타이베이');
  console.log('best:', result.total.best);
  console.log('flight goodPeriods:', result.flight.goodPeriods.length, '개');
  console.log('daily[0]:', result.daily[0]);
});
"
```
Expected: 에러 없이 응답 객체 출력. 타이베이는 `flight.goodPeriods`가 비어 있거나 매우 적을 수 있음(1번 조사에서 예상한 대로 — 버그 아님).

- [ ] **Step 6: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/destinationCalendar.ts lib/destinationCalendar.test.ts
git commit -m "여행지수 웹사이트: 목적지 60일 매트릭스 오케스트레이션(buildDestinationCalendar) 추가"
```

---

### Task 7: `app/api/destination-calendar/route.ts` — HTTP 엔드포인트

**Files:**
- Create: `여행지수-웹사이트/app/api/destination-calendar/route.ts`

**Interfaces:**
- Consumes: `buildDestinationCalendar`(Task 6)
- Produces: `GET /api/destination-calendar?destinationKey=오사카` → `DestinationCalendarResponse` JSON

- [ ] **Step 1: 구현**

```ts
// app/api/destination-calendar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildDestinationCalendar } from "@/lib/destinationCalendar";

export async function GET(req: NextRequest) {
  const destinationKey = req.nextUrl.searchParams.get("destinationKey");
  if (!destinationKey) {
    return NextResponse.json({ error: "destinationKey가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await buildDestinationCalendar(destinationKey);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes("지원하지 않는 목적지")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
```

- [ ] **Step 2: 로컬에서 실제 호출로 검증** (기존 `/api/index`와 같은 비밀번호 게이트를 이미 씀 — `proxy.ts`가 경로 패턴으로 전체 `/api/*`를 감싸는지 먼저 확인. 아니라면 이 스텝에서 게이트 우회 여부를 판단해서 추가 조치)

```bash
cd 여행지수-웹사이트
npm run dev &
COOKIES=/tmp/cookies.txt
curl -s -c "$COOKIES" -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"password":"020422"}'
curl -s -b "$COOKIES" "http://localhost:3000/api/destination-calendar?destinationKey=오사카" | head -c 1000
```
Expected: `DestinationCalendarResponse` 모양의 JSON. `destinationKey`가 잘못됐을 때 400 에러도 확인.

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add app/api/destination-calendar/route.ts
git commit -m "여행지수 웹사이트: GET /api/destination-calendar 엔드포인트 추가"
```

---

## Self-Review

**Spec coverage:**
- Redis 키 구조/TTL → Task 3
- 수집 주기(하루 1회, 24콜) → Task 4
- 타이베이 KE 필터 → Task 2(편도만 호출하는 이유), Task 5(필터 로직), Task 6(노선별 필터 매핑)
- findGoodDates 공통 함수, percentile/fixed threshold → Task 1
- best/goodPeriods 카테고리별 분리, 같은 타입 통일 → Task 6의 `CategoryResult`
- total.best만 tripNights 구간으로 확장 → Task 6 Step 3
- 카드 API 스키마 → Task 6(타입 정의) + Task 7(엔드포인트)

**Placeholder scan:** 전체 재확인함 — TBD/TODO/"적절히 처리" 류 없음. 유일하게 확정 안 된 부분(항공권 가격→점수 공식)은 placeholder가 아니라 실제 코드로 구현하고 Task 5 상단에 "판단 필요" 표시로 명시함.

**Type consistency:** `DailyScore`/`DateRangeSummary`/`GoodDatesResult`(Task 1) → `CategoryResult`/`DestinationCalendarResponse`(Task 6)에서 그대로 재사용. `FlightCalendarRecord`(Task 2) → Task 3/5에서 동일 타입 재사용. 함수명 일치 확인함(`findGoodDates`, `kvFlightCalendarStore.get/set`, `buildFlightScoreMatrix`, `buildDestinationCalendar`).

**범위 밖(다음 계획으로 미룸):** 카드 UI 컴포넌트(프론트), `vercel.json` 크론 스케줄의 정확한 cron 표현식(Task 4에서 "기존 파일 포맷 그대로 따를 것"이라고만 적어둠 — 실행 시 기존 파일 확인 후 채울 것), `proxy.ts`가 `/api/destination-calendar`도 자동으로 막아주는지 확인(Task 7에서 실행 시 확인).
