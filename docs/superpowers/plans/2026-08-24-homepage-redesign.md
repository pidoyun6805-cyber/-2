# 홈페이지 리디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행지수 웹사이트(`여행지수-웹사이트/`)의 메인 페이지를, "등록된 17개 목적지 중 오늘 계산 기준 1위" 히어로 + 5개 지수 카드(실데이터 그래프 포함) + 목적지 가로 리스트로 다시 만든다.

**Architecture:** 17개 목적지 × 3개 고정 후보 구간(오늘+14/+30/+45일, 2박3일)에 대해 기존 `calcTravelIndex`를 매일 1번 배치(크론)로 계산해 목적지별 최고점 구간 + 카드에 필요한 상세 데이터(항공권 30일 이력, 환율 2년 이력, 기후 일자별, 성수기 1년 곡선)를 통째로 Redis(`topDestinations:daily`)에 캐싱한다. 홈페이지는 페이지 로드 시 이 캐시 하나만 읽어서(`GET /api/top-destinations`) 히어로/카드/목적지 리스트를 전부 그린다 — 목적지를 클릭해도 추가 API 호출 없음. 기존 "계산하기" 검색 패널(`POST /api/index`)은 완전히 그대로 둔다.

**Tech Stack:** Next.js(App Router, Tailwind), Upstash Redis(`@upstash/redis`), Open-Meteo(무료, 키 불필요), Frankfurter.app(환율), Wikimedia Commons(정적 이미지 URL, 키 불필요), `node --test`(라이브러리 레이어), 기존 프로젝트 컨벤션.

**Spec:** `c:\Users\PC\Downloads\homepage-handoff-prompt_1.md` (요구사항 원문) + 디자인 시안 아티팩트(`https://claude.ai/code/artifact/0506819c-7ffc-4c3f-aca0-742f3a36a367`, 2026-08-24 세션에서 이미 열람·분석함). 이 둘을 합쳐 스펙으로 삼는다 — 별도 스펙 문서는 없음.

## Global Constraints

- **색상 규칙**: 지수 점수(항공권/호텔/환율/성수기/기후)의 색은 그 점수의 좋고 나쁨(초록=good/노랑=warning/주황=serious)만 나타낸다. 목적지나 카테고리를 구분하려고 다른 색을 쓰지 않는다. 브랜드 장식색(그린/테라코타 계열)은 지수 색과 완전히 분리해서 히어로 배경이나 그래프 라인 같은 곳에만 쓴다. 기존 `app/components/palette.ts`의 `SERIES_COLORS`(지수별 고유색)는 **이 화면에서 그대로 쓰지 않는다** — 그 팔레트는 "지수 종류 구분"용이라 이번 규칙(점수 좋고나쁨만 색으로 구분)과 충돌한다. 이 작업에서는 good/warning/serious 3색 체계를 새로 쓴다(디자인 시안의 `--good`/`--warning`/`--serious` CSS 변수 참고).
- **그래프-텍스트 동일 소스 원칙**: 차트에 쓰인 %, 평균, 평년 대비 같은 수치는 반드시 그 차트에 쓰인 실제 배열 데이터에서 그 자리에서(클라이언트 컴포넌트 안에서) 계산한다. 서버에서 따로 하드코딩하거나 별도 계산식으로 산출한 숫자를 텍스트에만 꽂아 넣지 않는다.
- **호텔 카드는 그래프 없음**: 호텔은 `data/hotels.json`의 고정 추정치 하나뿐이라 실제 이력 데이터가 없다. 그래프를 그리지 않고, "실시간 가격 추이 연동 준비 중 — 지금은 고정 추정치예요" 배지로 데이터 부족을 명확히 드러낸다.
- **출발지 고정**: 부산(김해공항, PUS)만 지원. 기존 검색 패널의 출발지 필드/로직을 바꾸지 않는다.
- **검색 패널 기능 불변**: 기존 "계산하기" 폼(목적지 선택 + 가는날/오는날 + 인원수 → `POST /api/index`)의 동작 로직은 그대로 유지한다. 레이아웃만 히어로 아래 한 줄 패널로 바꾼다.
- **목적지 목록은 가로 한 줄**: 세로 카드 그리드가 아니라 한 행에 아이콘+이름+점수 배지+이유 텍스트가 다 들어가는 가로 리스트. 클릭하면 히어로+카드 5개가 전부 그 목적지 데이터로 바뀐다(이미 로드된 캐시 데이터 안에서 전환, 재요청 없음).
- **오늘 기준 시점 명시**: 히어로에 "오늘(계산일) 기준으로 계산했고, 앞으로 2개월 안에서 가장 조건 좋은 시기를 찾은 결과"라는 문구를 반드시 넣는다.
- **데이터 없으면 지어내지 않는다**: 이 프로젝트 전체에서 지켜온 원칙. 캐시가 아직 없으면(첫 배포 등) `null`/명확한 에러 상태로 처리하고 화면에 "계산 준비 중"류로 표시 — 가짜 데이터를 채우지 않는다.
- **완료 후 커밋만, 푸시는 하지 않는다.**
- **고정된 배치 계산 방식**(이번 세션에서 사용자와 합의): 17개 목적지 각각에 대해 오늘+14일/+30일/+45일 3개 후보(각 2박3일)만 계산해서 그중 최고점 구간을 그 목적지의 "베스트"로 쓴다. 목적지 간 API 호출량을 줄이기 위해 이보다 많은 후보를 탐색하지 않는다.
- **성수기 1년 곡선은 있는 데이터 그대로**: `data/peakSeason.json`을 확장하지 않는다(설날/추석 데이터 없음 — 정상, 정직한 그래프로 남긴다). 이 곡선은 목적지와 무관하게 동일하다(성수기 공식이 달력 기준이라 위치를 안 씀) — 배치당 한 번만 계산한다.
- **기후 "평년" 기준**: "이번 여행 예상치"는 기존 3년 평균 로직(변경 안 함)을 그대로 쓰고, "평년"은 이번에 새로 만드는 10년 평균 함수로 별도 계산한다. 서로 다른 두 숫자를 비교해서 "평년보다 X도" 문구를 만든다.
- **랜드마크 사진**: Wikimedia Commons 이미지 URL을 정적 데이터 파일에 미리 조사해서 박아넣는다(런타임 API 호출 없음). 라이선스를 반드시 확인하고 출처를 표시한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/topChips.ts` | `deriveTopChips` 순수 함수 — 5개 지수 breakdown에서 상위 2개를 칩 라벨로 뽑음 |
| `lib/topChips.test.ts` | 위 함수 유닛테스트 |
| `lib/peakSeasonCurve.ts` | `buildPeakSeasonYearCurve`/`findCurveIndexForDate` 순수 함수 — 1년치 성수기 곡선(목적지 무관, 배치당 1회) |
| `lib/peakSeasonCurve.test.ts` | 위 함수들 유닛테스트 |
| `lib/climateDetail.ts` | `getPeriodClimateDaily`(일자별 최저/최고/날씨상태, 3년), `getClimateBaseline10y`(평년 평균기온, 10년) — 기존 `getPeriodClimate`는 건드리지 않음 |
| `lib/topDestination.ts` | `bandFromGrade`/`candidateWindows`(순수) + `computeAllDestinationResults`(오케스트레이션) — 17개 목적지 배치 계산 |
| `lib/topDestination.test.ts` | `bandFromGrade`/`candidateWindows` 유닛테스트 |
| `lib/topDestinationStore.ts` | Redis(`topDestinations:daily`) 캐시 읽기/쓰기 |
| `app/api/cron/compute-top-destinations/route.ts` | 매일 1회 `computeAllDestinationResults` 호출하는 크론 (`CRON_SECRET` 인증) |
| `app/api/top-destinations/route.ts` | `GET` → 캐시된 페이로드 JSON (기존 `proxy.ts` 게이트가 자동 적용됨) |
| `data/landmarks.json` | 17개 목적지 랜드마크 사진(Wikimedia Commons URL + 출처/라이선스) |
| `data/landmarks.test.ts` | `DESTINATIONS`의 모든 키가 `landmarks.json`에 있는지, 4개 필드가 다 채워졌는지 검증 |
| `app/components/LineChart.tsx` | 항공권/환율/성수기 3곳에서 재사용하는 범용 SVG 라인차트 — 평균선/최저점/마커/텍스트를 전달받은 배열에서 그 자리 계산 |
| `app/components/MetricCards.tsx` | 지수 카드 5개(FlightCard/HotelCard/ExchangeCard/PeakCard/ClimateCard) |
| `app/components/Hero.tsx` | 원형 게이지 + 랜드마크 사진 + 칩 2개 + "오늘 기준" 문구 |
| `app/components/DestinationList.tsx` | 목적지 가로 리스트(17행, 클릭 시 선택 전환) |
| `app/page.tsx` | 재작성 — `/api/top-destinations` 1회 fetch 후 Hero/MetricCards/DestinationList 조립 + 기존 검색 패널 보존 |

---

### Task 1: `lib/topChips.ts` — 상위 2개 지수 칩 뽑기

**Files:**
- Create: `여행지수-웹사이트/lib/topChips.ts`
- Test: `여행지수-웹사이트/lib/topChips.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, `ScoreBreakdown` 자체 정의 — 기존 `TravelIndexResult["breakdown"]`와 필드명 동일하게 맞춤: `flight`/`hotel`/`exchangeRate`/`peakSeason`/`climateComfort`, 전부 `number | null`)
- Produces: `ScoreBreakdown`, `TopChip { key, label }`, `deriveTopChips(breakdown): TopChip[]` — Task 4(`topDestination.ts`)가 그대로 씀

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/topChips.test.ts
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/topChips.test.ts`
Expected: FAIL — `Cannot find module './topChips.ts'`

- [ ] **Step 3: 최소 구현 작성**

```ts
// lib/topChips.ts
export interface ScoreBreakdown {
  flight: number | null;
  hotel: number | null;
  exchangeRate: number | null;
  peakSeason: number | null;
  climateComfort: number | null;
}

export interface TopChip {
  key: keyof ScoreBreakdown;
  label: string;
}

const CHIP_LABELS: Record<keyof ScoreBreakdown, string> = {
  flight: "항공권 좋음",
  hotel: "숙박 저렴",
  exchangeRate: "환율 유리",
  peakSeason: "성수기 한산",
  climateComfort: "기후 쾌적",
};

const KEY_ORDER: (keyof ScoreBreakdown)[] = ["flight", "hotel", "exchangeRate", "peakSeason", "climateComfort"];

// breakdown 중 null이 아닌 값을 점수 내림차순(동점이면 KEY_ORDER 순서)으로 정렬해 상위 2개를 칩으로 뽑는다.
// 유효한 값이 2개 미만이면 있는 만큼만 반환한다(억지로 채우지 않음).
export function deriveTopChips(breakdown: ScoreBreakdown): TopChip[] {
  const entries = KEY_ORDER
    .map((key) => [key, breakdown[key]] as const)
    .filter((e): e is [keyof ScoreBreakdown, number] => e[1] !== null)
    .sort((a, b) => b[1] - a[1]);

  return entries.slice(0, 2).map(([key]) => ({ key, label: CHIP_LABELS[key] }));
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/topChips.test.ts`
Expected: PASS (5개 전부)

- [ ] **Step 5: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/topChips.ts lib/topChips.test.ts
git commit -m "여행지수 웹사이트: 상위 2개 지수 칩 뽑기(deriveTopChips) 추가"
```

---

### Task 2: `lib/peakSeasonCurve.ts` — 1년 성수기 곡선

**Files:**
- Create: `여행지수-웹사이트/lib/peakSeasonCurve.ts`
- Test: `여행지수-웹사이트/lib/peakSeasonCurve.test.ts`

**Interfaces:**
- Consumes: 기존 `lookupPeakCategory`(`./peakSeason`), `scorePeakSeason`(`./scoring`)
- Produces: `PeakSeasonCurvePoint { date, score }`, `buildPeakSeasonYearCurve(referenceYear?): PeakSeasonCurvePoint[]`, `findCurveIndexForDate(curve, dateStr): number` — Task 4/5, `MetricCards.tsx`(Task 11)가 그대로 씀

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/peakSeasonCurve.test.ts
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/peakSeasonCurve.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```ts
// lib/peakSeasonCurve.ts
import { lookupPeakCategory } from "./peakSeason";
import { scorePeakSeason } from "./scoring";

export interface PeakSeasonCurvePoint {
  date: string; // YYYY-MM-DD
  score: number;
}

// 올해(또는 지정한 연도) 1/1~12/31 전체를 성수기 공식으로 순회해 곡선을 만든다.
// 목적지와 무관하게 동일한 곡선 — 성수기 공식은 달력 기준일 뿐 위치를 안 쓴다. 배치당 1회만 계산.
export function buildPeakSeasonYearCurve(referenceYear: number = new Date().getFullYear()): PeakSeasonCurvePoint[] {
  const isLeap = (referenceYear % 4 === 0 && referenceYear % 100 !== 0) || referenceYear % 400 === 0;
  const dayCount = isLeap ? 366 : 365;
  const start = new Date(Date.UTC(referenceYear, 0, 1));

  const points: PeakSeasonCurvePoint[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    points.push({ date: d.toISOString().slice(0, 10), score: scorePeakSeason(lookupPeakCategory(month, day)) });
  }
  return points;
}

// 여행 날짜(dateStr)의 월-일이 곡선의 몇 번째 지점인지 찾는다(연도는 무시 — 곡선은 항상 한 연도 기준).
// 일치하는 지점이 없으면(있을 수 없지만 방어적으로) 0번째로 폴백.
export function findCurveIndexForDate(curve: PeakSeasonCurvePoint[], dateStr: string): number {
  const targetMonthDay = dateStr.slice(5, 10); // MM-DD
  const idx = curve.findIndex((p) => p.date.slice(5, 10) === targetMonthDay);
  return idx >= 0 ? idx : 0;
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/peakSeasonCurve.test.ts`
Expected: PASS (6개 전부)

- [ ] **Step 5: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/peakSeasonCurve.ts lib/peakSeasonCurve.test.ts
git commit -m "여행지수 웹사이트: 1년 성수기 곡선(buildPeakSeasonYearCurve) 추가"
```

---

### Task 3: `lib/climateDetail.ts` — 일자별 최저/최고/날씨상태 + 평년(10년) 기준

**Files:**
- Create: `여행지수-웹사이트/lib/climateDetail.ts`

**Interfaces:**
- Consumes: `WeatherCondition`(`./scoring`, 타입만)
- Produces: `ClimateDayDetail`, `getPeriodClimateDaily(lat, lon, departDate, returnDate): Promise<ClimateDayDetail[]>`, `getClimateBaseline10y(lat, lon, departDate, returnDate): Promise<number | null>` — Task 5(`topDestination.ts`)가 그대로 씀

**중요**: 기존 `lib/externalApi.ts`의 `getPeriodClimate`는 **건드리지 않는다** — `/api/index`와 별도 기능(destination-calendar)의 실제 채점 경로에서 쓰이는 함수라 리스크를 최소화하기 위해 이 파일에 독립적으로 새로 만든다(패턴은 복사하되 코드는 공유하지 않음 — 약간의 중복은 감수).

- [ ] **Step 1: 구현**

```ts
// lib/climateDetail.ts
import type { WeatherCondition } from "./scoring";

export interface ClimateDayDetail {
  date: string; // YYYY-MM-DD
  tempC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  relHumidity: number | null;
  cloudCoverPct: number | null;
  precipMm: number | null;
  windKmh: number | null;
  condition: WeatherCondition | null;
}

// WMO weathercode -> 카테고리. externalApi.ts의 동일 로직을 이 파일 전용으로 복제(공유 안 함 — 위 설명 참고).
function weatherCodeToCondition(code: number): WeatherCondition {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  if ([0, 1].includes(code)) return "clear";
  return "cloudy";
}

function averageValid(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function modeValid(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of valid) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tripDayCount(departDate: string, returnDate: string): number {
  const depart = new Date(departDate);
  const ret = new Date(returnDate);
  return Math.max(1, Math.round((ret.getTime() - depart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

// 여행 기간 각 날짜의 최저/최고기온/날씨상태를 최근 3년 같은 날짜대의 평균(기온)·최빈값(날씨코드)으로 추정.
// getPeriodClimate와 같은 "연도별 실패는 그 해만 건너뛴다" 방어 패턴.
export async function getPeriodClimateDaily(
  lat: number,
  lon: number,
  departDate: string,
  returnDate: string
): Promise<ClimateDayDetail[]> {
  const depart = new Date(departDate);
  const dayCount = tripDayCount(departDate, returnDate);

  const perYear = await Promise.all(
    [1, 2, 3].map(async (yearsAgo) => {
      const shiftedStart = new Date(depart);
      shiftedStart.setFullYear(depart.getFullYear() - yearsAgo);
      const shiftedEnd = new Date(shiftedStart);
      shiftedEnd.setDate(shiftedStart.getDate() + (dayCount - 1));

      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${fmt(shiftedStart)}&end_date=${fmt(shiftedEnd)}` +
        `&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,relative_humidity_2m_mean,` +
        `cloud_cover_mean,precipitation_sum,wind_speed_10m_max,weathercode&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return {
        temp: json?.daily?.temperature_2m_mean as (number | null)[] | undefined,
        tempMin: json?.daily?.temperature_2m_min as (number | null)[] | undefined,
        tempMax: json?.daily?.temperature_2m_max as (number | null)[] | undefined,
        humidity: json?.daily?.relative_humidity_2m_mean as (number | null)[] | undefined,
        cloud: json?.daily?.cloud_cover_mean as (number | null)[] | undefined,
        precip: json?.daily?.precipitation_sum as (number | null)[] | undefined,
        wind: json?.daily?.wind_speed_10m_max as (number | null)[] | undefined,
        code: json?.daily?.weathercode as (number | null)[] | undefined,
      };
    })
  );

  const days: ClimateDayDetail[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(depart);
    d.setDate(d.getDate() + i);
    const codeMode = modeValid(perYear.map((y) => y?.code?.[i]));
    days.push({
      date: fmt(d),
      tempC: averageValid(perYear.map((y) => y?.temp?.[i])),
      tempMinC: averageValid(perYear.map((y) => y?.tempMin?.[i])),
      tempMaxC: averageValid(perYear.map((y) => y?.tempMax?.[i])),
      relHumidity: averageValid(perYear.map((y) => y?.humidity?.[i])),
      cloudCoverPct: averageValid(perYear.map((y) => y?.cloud?.[i])),
      precipMm: averageValid(perYear.map((y) => y?.precip?.[i])),
      windKmh: averageValid(perYear.map((y) => y?.wind?.[i])),
      condition: codeMode === null ? null : weatherCodeToCondition(codeMode),
    });
  }
  return days;
}

// "평년" 기준값: 과거 10년(같은 날짜대) 평균기온 하나만. 여행 기간 전체를 하나의 숫자로 뭉갠다
// (일자별 breakdown은 필요 없음 — "평년보다 X도" 델타 텍스트 용도이므로).
export async function getClimateBaseline10y(
  lat: number,
  lon: number,
  departDate: string,
  returnDate: string
): Promise<number | null> {
  const depart = new Date(departDate);
  const dayCount = tripDayCount(departDate, returnDate);
  const years = Array.from({ length: 10 }, (_, i) => i + 1);

  const perYear = await Promise.all(
    years.map(async (yearsAgo) => {
      const shiftedStart = new Date(depart);
      shiftedStart.setFullYear(depart.getFullYear() - yearsAgo);
      const shiftedEnd = new Date(shiftedStart);
      shiftedEnd.setDate(shiftedStart.getDate() + (dayCount - 1));

      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${fmt(shiftedStart)}&end_date=${fmt(shiftedEnd)}&daily=temperature_2m_mean&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return averageValid((json?.daily?.temperature_2m_mean as (number | null)[] | undefined) ?? []);
    })
  );

  return averageValid(perYear);
}
```

- [ ] **Step 2: 실제 호출로 검증** (이 프로젝트 컨벤션 — 외부 API 함수는 유닛테스트 대신 실제 호출로 검증. `flightPriceSource.ts`/`flightCalendarSource.ts`도 같은 패턴)

Run:
```bash
cd 여행지수-웹사이트
node -e "
import('./lib/climateDetail.ts').then(async (m) => {
  const daily = await m.getPeriodClimateDaily(34.6937, 135.5023, '2026-09-18', '2026-09-20');
  console.log('daily:', JSON.stringify(daily, null, 2));
  const baseline = await m.getClimateBaseline10y(34.6937, 135.5023, '2026-09-18', '2026-09-20');
  console.log('baseline10y:', baseline);
});
"
```
Expected: `daily`는 3개(9/18~9/20) 원소, 각각 `tempMinC < tempMaxC`이고 `condition`이 4개 카테고리 중 하나. `baseline10y`는 숫자(대략 20~30 사이, 9월 오사카 기준).

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/climateDetail.ts
git commit -m "여행지수 웹사이트: 일자별 기후 상세(getPeriodClimateDaily) + 10년 평년 기준(getClimateBaseline10y) 추가"
```

---

### Task 4: `lib/topDestination.ts` (Part A) — 순수 헬퍼(bandFromGrade, candidateWindows)

**Files:**
- Create: `여행지수-웹사이트/lib/topDestination.ts` (이 태스크에서는 순수 부분만 — Task 5에서 같은 파일에 오케스트레이션 함수를 추가함)
- Test: `여행지수-웹사이트/lib/topDestination.test.ts`

**Interfaces:**
- Consumes: `Grade`(`./scoring`, 타입만)
- Produces: `Band`, `bandFromGrade(grade): Band`, `CandidateWindow { departDate, returnDate }`, `candidateWindows(today?): CandidateWindow[]` — Task 5(같은 파일의 오케스트레이션), `MetricCards.tsx`/`DestinationList.tsx`(Task 11/13)가 `Band`를 그대로 씀

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// lib/topDestination.test.ts
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/topDestination.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 작성**

```ts
// lib/topDestination.ts (Part A — 순수 헬퍼. 오케스트레이션은 Task 5에서 이어서 추가)
import type { Grade } from "./scoring";

export type Band = "good" | "warning" | "serious";

const GRADE_BAND: Record<Grade, Band> = {
  최적기: "good",
  좋음: "good",
  보통: "warning",
  비추천: "serious",
  최악: "serious",
};

export function bandFromGrade(grade: Grade): Band {
  return GRADE_BAND[grade];
}

export interface CandidateWindow {
  departDate: string;
  returnDate: string;
}

const TRIP_NIGHTS = 2; // 2박3일 고정 (사용자 확정값)
const CANDIDATE_OFFSET_DAYS = [14, 30, 45]; // 사용자 확정값 — 이보다 늘리지 않는다(API 부하)

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 오늘 기준 +14/+30/+45일 시점을 출발일로 하는 3개 고정 후보 구간(각 2박3일)을 만든다.
export function candidateWindows(today: Date = new Date()): CandidateWindow[] {
  return CANDIDATE_OFFSET_DAYS.map((offset) => {
    const depart = new Date(today);
    depart.setUTCDate(depart.getUTCDate() + offset);
    const ret = new Date(depart);
    ret.setUTCDate(ret.getUTCDate() + TRIP_NIGHTS);
    return { departDate: fmt(depart), returnDate: fmt(ret) };
  });
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test lib/topDestination.test.ts`
Expected: PASS (4개 전부)

- [ ] **Step 5: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/topDestination.ts lib/topDestination.test.ts
git commit -m "여행지수 웹사이트: 배치 계산용 순수 헬퍼(bandFromGrade, candidateWindows) 추가"
```

---

### Task 5: `lib/topDestination.ts` (Part B) — 17개 목적지 배치 오케스트레이션

**Files:**
- Modify: `여행지수-웹사이트/lib/topDestination.ts` (Task 4 파일에 이어서 추가)

**Interfaces:**
- Consumes: `bandFromGrade`/`candidateWindows`(Task 4, 같은 파일), `deriveTopChips`(Task 1), `buildPeakSeasonYearCurve`/`findCurveIndexForDate`(Task 2), `getPeriodClimateDaily`/`getClimateBaseline10y`(Task 3), 기존 `DESTINATIONS`/`calcTravelIndex`/`getFlightPriceScore`/`exchangeRateScore`/`lookupPeakCategory`/`getPeriodClimate`/`getExchangeRateHistory`/`getAllRoutes`/`kvFlightHistoryStore`/`getHistoricalPricesNearDate`, `data/hotels.json`, `data/flights.json`
- Produces: `DestinationResult`, `TopDestinationsPayload { results, peakSeasonYearCurve, computedAt }`, `computeAllDestinationResults(): Promise<TopDestinationsPayload>` — Task 6(Redis 저장), Task 7(크론)이 그대로 씀

**⚠️ 참고**: `app/api/index/route.ts`의 `calcTravelIndex` 입력 조립 로직(플라이트 점수/호텔 편차/환율 점수/성수기 카테고리 계산)을 그대로 재사용한다 — 그 파일을 먼저 열어서 정확히 같은 패턴으로 조립할 것.

- [ ] **Step 1: 구현** (기존 파일 `lib/topDestination.ts`에 아래 내용을 이어서 추가)

```ts
// lib/topDestination.ts에 이어서 추가 (Part B — 오케스트레이션)
import { DESTINATIONS, type DestinationConfig } from "./destinations";
import { calcTravelIndex, getFlightPriceScore, exchangeRateScore, type RoutePriceSample, type TravelIndexResult } from "./scoring";
import { lookupPeakCategory } from "./peakSeason";
import { getPeriodClimate, getExchangeRateHistory } from "./externalApi";
import { getAllRoutes } from "./routes";
import { kvFlightHistoryStore } from "./kvFlightHistoryStore";
import { getHistoricalPricesNearDate, type FlightPriceRecord } from "./flightHistory";
import { deriveTopChips, type TopChip } from "./topChips";
import { buildPeakSeasonYearCurve, findCurveIndexForDate, type PeakSeasonCurvePoint } from "./peakSeasonCurve";
import { getPeriodClimateDaily, getClimateBaseline10y, type ClimateDayDetail } from "./climateDetail";
import hotels from "@/data/hotels.json" with { type: "json" };
import flights from "@/data/flights.json" with { type: "json" };

export interface DestinationResult {
  destinationKey: string;
  label: string;
  totalScore: number;
  grade: TravelIndexResult["grade"];
  band: Band;
  departDate: string;
  returnDate: string;
  nights: number;
  breakdown: TravelIndexResult["breakdown"];
  topChips: TopChip[];
  climateDaily: ClimateDayDetail[];
  climateBaseline10y: number | null;
  flightPriceHistory30d: FlightPriceRecord[];
  exchangeRateSeries: { currentRate: number; historicalRates: number[] } | null;
  peakMarkerIndex: number;
}

export interface TopDestinationsPayload {
  computedAt: string;
  results: DestinationResult[];
  peakSeasonYearCurve: PeakSeasonCurvePoint[];
}

async function computeOneDestination(
  destinationKey: string,
  destination: DestinationConfig,
  windows: CandidateWindow[],
  peakSeasonYearCurve: PeakSeasonCurvePoint[]
): Promise<DestinationResult> {
  const hotel = (hotels as Record<string, { avgPrice: number; currentPrice: number }>)[destinationKey];
  const hotelDeviationPct = (hotel.currentPrice - hotel.avgPrice) / hotel.avgPrice;

  const [exchangeRateHistory, routeHistory] = await Promise.all([
    getExchangeRateHistory(destination.currency).catch(() => null),
    kvFlightHistoryStore.get(destination.flightRouteKey),
  ]);
  const exchangeScore = exchangeRateHistory
    ? exchangeRateScore(exchangeRateHistory.currentRate, exchangeRateHistory.historicalRates)
    : null;

  const allRoutes = getAllRoutes();
  const currentRoute = allRoutes.find((r) => r.routeKey === destination.flightRouteKey);
  const flightsByRoute = flights as Record<string, { currentPrice: number }>;
  const flight = flightsByRoute[destination.flightRouteKey] as { currentPrice: number } | undefined;
  const allRoutePrices: RoutePriceSample[] = allRoutes
    .filter((r) => flightsByRoute[r.routeKey])
    .map((r) => ({ price: flightsByRoute[r.routeKey].currentPrice, distanceKm: r.distanceKm }));

  const evaluated = await Promise.all(
    windows.map(async (window) => {
      const climateDays = await getPeriodClimate(destination.lat, destination.lon, window.departDate, window.returnDate);
      const month = Number(window.departDate.slice(5, 7));
      const day = Number(window.departDate.slice(8, 10));
      const peakCategory = lookupPeakCategory(month, day);
      const historicalPrices = getHistoricalPricesNearDate(routeHistory, window.departDate);
      const flightScore =
        currentRoute && flight
          ? getFlightPriceScore({
              currentPrice: flight.currentPrice,
              distanceKm: currentRoute.distanceKm,
              historicalPrices,
              allRoutes: allRoutePrices,
            })
          : null;

      const travelIndex = calcTravelIndex({
        flightScore,
        hotelDeviationPct,
        exchangeRateScore: exchangeScore,
        peakCategory,
        climateDays,
      });
      return { window, travelIndex };
    })
  );

  const best = evaluated.reduce((a, b) => (b.travelIndex.totalScore > a.travelIndex.totalScore ? b : a));

  const [climateDaily, climateBaseline10y] = await Promise.all([
    getPeriodClimateDaily(destination.lat, destination.lon, best.window.departDate, best.window.returnDate),
    getClimateBaseline10y(destination.lat, destination.lon, best.window.departDate, best.window.returnDate),
  ]);

  const sortedHistory = [...routeHistory].sort((a, b) => a.date.localeCompare(b.date));

  return {
    destinationKey,
    label: destination.label,
    totalScore: best.travelIndex.totalScore,
    grade: best.travelIndex.grade,
    band: bandFromGrade(best.travelIndex.grade),
    departDate: best.window.departDate,
    returnDate: best.window.returnDate,
    nights: TRIP_NIGHTS,
    breakdown: best.travelIndex.breakdown,
    topChips: deriveTopChips(best.travelIndex.breakdown),
    climateDaily,
    climateBaseline10y,
    flightPriceHistory30d: sortedHistory.slice(-30),
    exchangeRateSeries: exchangeRateHistory,
    peakMarkerIndex: findCurveIndexForDate(peakSeasonYearCurve, best.window.departDate),
  };
}

// 17개 목적지 전체를 배치로 계산한다. 하루 1번 크론에서만 호출 — 무거운 연산(약 85회 외부 API 호출).
// 목적지 하나가 실패해도(예: 환율 미지원 통화) 전체가 죽지 않도록 destination별로 격리하지는 않는다 —
// 이미 destination 내부의 각 외부 호출이 자체적으로 null/폴백 처리를 하므로(exchangeRateHistory.catch 등),
// Promise.all 레벨에서 흡수할 예외는 남아있지 않다는 전제(계획 리뷰에서 이 전제를 검증할 것).
export async function computeAllDestinationResults(): Promise<TopDestinationsPayload> {
  const peakSeasonYearCurve = buildPeakSeasonYearCurve();
  const windows = candidateWindows();

  const results = await Promise.all(
    Object.entries(DESTINATIONS).map(([destinationKey, destination]) =>
      computeOneDestination(destinationKey, destination, windows, peakSeasonYearCurve)
    )
  );

  results.sort((a, b) => b.totalScore - a.totalScore);

  return { computedAt: new Date().toISOString(), results, peakSeasonYearCurve };
}
```

- [ ] **Step 2: 실제 데이터로 통합 검증** (Task 6~7 이전이라 아직 Redis 캐시 자체는 없음 — 함수를 직접 호출해서 검증)

```bash
cd 여행지수-웹사이트
node --env-file=.env.local -e "
import('./lib/topDestination.ts').then(async (m) => {
  const payload = await m.computeAllDestinationResults();
  console.log('results count:', payload.results.length);
  console.log('#1:', JSON.stringify(payload.results[0], null, 2).slice(0, 800));
  console.log('peakSeasonYearCurve length:', payload.peakSeasonYearCurve.length);
});
"
```
Expected: 에러 없이 17개 `results` 출력, 점수 내림차순 정렬 확인, `peakSeasonYearCurve.length`가 365 또는 366. 이 호출은 17×3개 조합에 대해 Open-Meteo/환율/Redis를 호출하므로 몇 분 걸릴 수 있음 — 정상.

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/topDestination.ts
git commit -m "여행지수 웹사이트: 17개 목적지 배치 계산 오케스트레이션(computeAllDestinationResults) 추가"
```

---

### Task 6: `lib/topDestinationStore.ts` — Redis 캐시

**Files:**
- Create: `여행지수-웹사이트/lib/topDestinationStore.ts`

**Interfaces:**
- Consumes: `TopDestinationsPayload`(Task 5)
- Produces: `topDestinationStore.get(): Promise<TopDestinationsPayload | null>`, `topDestinationStore.set(payload): Promise<void>` — Task 7(크론), Task 8(API 라우트)이 그대로 씀

- [ ] **Step 1: 구현** (`kvFlightHistoryStore.ts`/`kvFlightCalendarStore.ts`와 같은 Upstash Redis 패턴)

```ts
// lib/topDestinationStore.ts
import { Redis } from "@upstash/redis";
import type { TopDestinationsPayload } from "./topDestination";

const redis = Redis.fromEnv();
const KEY = "topDestinations:daily";
const TTL_SECONDS = 30 * 60 * 60; // 30시간 — 크론이 하루 1번인데, 실패해도 다음날까지는 이전 데이터가 남도록 여유

export const topDestinationStore = {
  async get(): Promise<TopDestinationsPayload | null> {
    try {
      const data = await redis.get<TopDestinationsPayload>(KEY);
      return data ?? null;
    } catch (err) {
      // Redis 장애 시에도 API 라우트가 죽지 않고 "아직 준비 안 됨"으로 처리하게 한다.
      console.error("[topDestinationStore] get 실패, null로 처리:", err);
      return null;
    }
  },

  async set(payload: TopDestinationsPayload): Promise<void> {
    await redis.set(KEY, payload, { ex: TTL_SECONDS });
  },
};
```

- [ ] **Step 2: 실제 Redis에 쓰고 읽어서 검증**

```bash
cd 여행지수-웹사이트
node -e "
import('./lib/topDestinationStore.ts').then(async (m) => {
  const test = { computedAt: '2026-08-24T00:00:00.000Z', results: [], peakSeasonYearCurve: [] };
  await m.topDestinationStore.set(test);
  const back = await m.topDestinationStore.get();
  console.log(JSON.stringify(back));
});
"
```
Expected: 저장한 것과 같은 객체가 그대로 나옴.

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add lib/topDestinationStore.ts
git commit -m "여행지수 웹사이트: 오늘의 목적지 배치 결과 Redis 캐시(topDestinationStore) 추가"
```

---

### Task 7: `app/api/cron/compute-top-destinations/route.ts` — 매일 배치 크론

**Files:**
- Create: `여행지수-웹사이트/app/api/cron/compute-top-destinations/route.ts`
- Modify: `여행지수-웹사이트/vercel.json`

**Interfaces:**
- Consumes: `computeAllDestinationResults`(Task 5), `topDestinationStore`(Task 6)

- [ ] **Step 1: 구현** (`app/api/cron/collect-flight-prices/route.ts`와 동일한 `CRON_SECRET` 인증 패턴)

```ts
// app/api/cron/compute-top-destinations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { computeAllDestinationResults } from "@/lib/topDestination";
import { topDestinationStore } from "@/lib/topDestinationStore";

export const runtime = "nodejs";
export const maxDuration = 300; // 17개 목적지 x 3구간 배치라 기본 제한(10~60초)보다 여유 필요

// Vercel Cron이 매일 이 경로를 호출한다. CRON_SECRET 없거나 안 맞으면 401(기존 크론과 동일한 fail-closed).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await computeAllDestinationResults();
  await topDestinationStore.set(payload);

  return NextResponse.json({ computedAt: payload.computedAt, count: payload.results.length });
}
```

- [ ] **Step 2: `vercel.json`에 크론 스케줄 추가** (기존 `collect-flight-prices` 항목 옆에 추가 — 실행 시점에 파일을 먼저 열어서 그 시점의 실제 내용에 맞춰 추가할 것. 다른 배치와 겹치지 않는 새벽 시간대로: 매일 22시)

```json
{
  "crons": [
    { "path": "/api/cron/collect-flight-prices", "schedule": "0 21 * * *" },
    { "path": "/api/cron/compute-top-destinations", "schedule": "0 22 * * *" }
  ]
}
```

- [ ] **Step 3: 로컬에서 실제 크론 호출로 검증**

```bash
cd 여행지수-웹사이트
npm run dev &
curl -s -X GET "http://localhost:3000/api/cron/compute-top-destinations" \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```
Expected: `{"computedAt":"...","count":17}`. 17개 목적지를 순회하므로 응답까지 몇 분 걸릴 수 있음(정상 — `maxDuration`을 늘려둔 이유).

- [ ] **Step 4: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add app/api/cron/compute-top-destinations/route.ts vercel.json
git commit -m "여행지수 웹사이트: 목적지 배치 계산 크론(compute-top-destinations) 추가"
```

---

### Task 8: `app/api/top-destinations/route.ts` — 프론트용 GET 엔드포인트

**Files:**
- Create: `여행지수-웹사이트/app/api/top-destinations/route.ts`

**Interfaces:**
- Consumes: `topDestinationStore`(Task 6)
- Produces: `GET /api/top-destinations` → `TopDestinationsPayload` JSON | 404

- [ ] **Step 1: 구현**

```ts
// app/api/top-destinations/route.ts
import { NextResponse } from "next/server";
import { topDestinationStore } from "@/lib/topDestinationStore";

// 인증은 기존 proxy.ts(사이트 전체 쿠키 게이트)가 /api/* 전체에 자동 적용 — 여기서 별도 처리 안 함.
export async function GET() {
  const payload = await topDestinationStore.get();

  if (!payload) {
    return NextResponse.json({ error: "아직 계산되지 않았습니다. 잠시 후 다시 시도해주세요." }, { status: 404 });
  }

  return NextResponse.json(payload);
}
```

- [ ] **Step 2: 로컬에서 실제 호출로 검증** (Task 7에서 크론을 이미 한 번 돌려서 캐시가 채워져 있어야 함)

```bash
cd 여행지수-웹사이트
npm run dev &
COOKIES=/tmp/cookies.txt
curl -s -c "$COOKIES" -X POST http://localhost:3000/api/login -H "Content-Type: application/json" -d '{"password":"020422"}'
curl -s -b "$COOKIES" "http://localhost:3000/api/top-destinations" | head -c 500
```
Expected: `TopDestinationsPayload` 모양의 JSON. 로그인 쿠키 없이 호출하면 `proxy.ts`에 의해 `/login`으로 리다이렉트되는지도 확인.

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add app/api/top-destinations/route.ts
git commit -m "여행지수 웹사이트: GET /api/top-destinations 엔드포인트 추가"
```

---

### Task 9: `data/landmarks.json` — 17개 목적지 랜드마크 사진 데이터

**Files:**
- Create: `여행지수-웹사이트/data/landmarks.json`
- Test: `여행지수-웹사이트/data/landmarks.test.ts`

**Interfaces:**
- Produces: `data/landmarks.json` — `Record<destinationKey, { imageUrl, landmarkLabel, credit, sourcePage }>`, `Hero.tsx`(Task 12)가 그대로 씀

**중요 — 이 태스크는 코드 작성이 아니라 실제 조사가 핵심이다.** `DESTINATIONS`(`lib/destinations.ts`)의 17개 키 각각에 대해:
1. Wikimedia Commons(commons.wikimedia.org)에서 그 도시/국가의 대표 랜드마크 사진을 웹 검색/열람으로 직접 찾는다(예: 오사카→오사카성, 방콕→왓아룬 등 — 시안의 4곳 예시를 참고하되 나머지 13곳도 직접 판단).
2. 사진의 라이선스를 실제로 확인한다 — 퍼블릭 도메인이거나, 상업적 이용을 허용하는 CC 라이선스(CC0/CC BY/CC BY-SA 등)여야 한다. 라이선스가 불명확하거나 비상업 전용(NC)이거나 확인이 안 되면 **그 이미지를 쓰지 말고 다른 후보를 찾는다.**
3. 합리적인 노력 안에서 라이선스가 명확한 사진을 못 찾은 목적지가 있으면, 억지로 불확실한 이미지를 넣지 말고 그 destinationKey를 보고에 명시하고 `imageUrl`을 빈 문자열로 남겨둔다(Hero 컴포넌트 쪽에서 폴백 처리 — Task 12에서 다룸). 데이터를 지어내지 않는다는 이 프로젝트의 원칙과 동일하게 적용.
4. Commons 파일 페이지에서 직접 이미지 파일 URL(`https://upload.wikimedia.org/wikipedia/commons/...`)을 확인해서 쓴다(hotlink 허용 — Wikimedia 정책상 문제없음).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// data/landmarks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DESTINATIONS } from "../lib/destinations.ts";
import landmarks from "./landmarks.json" with { type: "json" };

test("landmarks.json: DESTINATIONS의 모든 키가 landmarks.json에 존재한다", () => {
  const missing = Object.keys(DESTINATIONS).filter((key) => !(key in landmarks));
  assert.deepEqual(missing, []);
});

test("landmarks.json: 이미지가 있는 항목은 4개 필드가 다 채워져 있다", () => {
  for (const [key, entry] of Object.entries(landmarks as Record<string, Record<string, string>>)) {
    if (entry.imageUrl === "") continue; // 라이선스 못 찾아 빈 값으로 남긴 항목은 예외
    assert.ok(entry.imageUrl.startsWith("https://upload.wikimedia.org/"), `${key}.imageUrl은 wikimedia 업로드 URL이어야 함`);
    assert.ok(entry.landmarkLabel.length > 0, `${key}.landmarkLabel 비어있음`);
    assert.ok(entry.credit.length > 0, `${key}.credit 비어있음`);
    assert.ok(entry.sourcePage.startsWith("https://commons.wikimedia.org/"), `${key}.sourcePage는 commons 페이지 URL이어야 함`);
  }
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd 여행지수-웹사이트 && node --test data/landmarks.test.ts`
Expected: FAIL — `data/landmarks.json`이 아직 없음

- [ ] **Step 3: 17개 목적지 조사 후 `data/landmarks.json` 작성**

조사 결과를 아래 스키마로 채운다(예시 — 실제 값은 조사해서 채울 것):

```json
{
  "오사카": {
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/.../Osaka_Castle.jpg",
    "landmarkLabel": "오사카성 · 도톤보리",
    "credit": "작성자명, CC BY-SA 4.0, via Wikimedia Commons",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:..."
  }
}
```
`DESTINATIONS`의 17개 키(오사카/후쿠오카/도쿄/삿포로/오키나와/타이베이/홍콩/칭다오/다낭/세부/방콕/마닐라/싱가포르/쿠알라룸푸르/발리/괌/사이판) 전부에 대해 반복.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd 여행지수-웹사이트 && node --test data/landmarks.test.ts`
Expected: PASS (2개 전부)

- [ ] **Step 5: 커밋** (이 파일은 데이터라 tsc/eslint 대상 아님 — 테스트만 통과하면 됨)

```bash
cd 여행지수-웹사이트
git add data/landmarks.json data/landmarks.test.ts
git commit -m "여행지수 웹사이트: 17개 목적지 랜드마크 사진(Wikimedia Commons) 데이터 추가"
```

---

### Task 10: `app/globals.css` 디자인 토큰 추가 + `app/components/LineChart.tsx` — 범용 SVG 라인차트

**Files:**
- Modify: `여행지수-웹사이트/app/globals.css:1-20` (기존 `:root`/다크모드 블록 — `--background`/`--foreground`는 그대로 두고 아래에 새 토큰을 추가. 기존 규칙을 리팩토링하지 않는다)
- Create: `여행지수-웹사이트/app/components/LineChart.tsx`

**Interfaces:**
- Consumes: 없음(순수 프레젠테이션 컴포넌트)
- Produces: `LineChartPoint { x: string; y: number }`, `LineChart` 컴포넌트 — `MetricCards.tsx`(Task 11)가 항공권(30일)/환율(2년)/성수기(1년) 3곳에서 재사용. `app/globals.css`의 CSS 변수들(`--good`/`--warning`/`--serious`/`--chart`/`--hero-bg-1`/`--hero-bg-2`/`--hero-ink`/`--hero-track`/`--accent`/`--accent-ink`/`--surface`/`--surface-2`/`--page`/`--ink`/`--ink-2`/`--muted`/`--grid`/`--border`) — Task 11/12/13/14가 Tailwind 임의값(`bg-[var(--surface)]` 등)으로 그대로 참조

**⚠️ Global Constraint 재확인**: 이 컴포넌트에 전달되는 평균선/최저점/마커는 전부 `points` prop 배열에서 그 자리 계산해야 한다 — 부모가 미리 계산해서 별도 prop으로 값만 넘기지 않는다(그래프-텍스트 동일 소스 원칙을 컴포넌트 레벨에서 강제). 색 토큰은 지수 점수의 좋고나쁨(good/warning/serious)과 브랜드 장식색(accent/hero-bg/chart)을 서로 다른 변수로 분리해서 정의한다 — 이 분리 자체가 색상 규칙을 코드 레벨에서 강제하는 장치다.

- [ ] **Step 0: `app/globals.css`에 디자인 토큰 추가** (기존 `:root { --background; --foreground; }` 블록 뒤에 이어서 추가 — 디자인 시안 아티팩트의 라이트/다크 팔레트를 그대로 이식)

```css
/* app/globals.css — 기존 :root/@theme inline/다크모드 블록 뒤에 추가 */
:root {
  --page: #f7f2e7;
  --surface: #fffdf8;
  --surface-2: #f1e9d8;
  --ink: #1c1a15;
  --ink-2: #55503f;
  --muted: #8c8672;
  --grid: #e7ded0;
  --border: rgba(28, 26, 21, 0.08);
  --hero-bg-1: #16261f;
  --hero-bg-2: #223d30;
  --hero-ink: #f3ede0;
  --hero-track: rgba(243, 237, 224, 0.22);
  --accent: #c1602f;
  --accent-ink: #fff6ec;
  --good: #0ca30c;
  --warning: #fab219;
  --serious: #ec835a;
  --good-track: #e2f0df;
  --warning-track: #fbf0d6;
  --serious-track: #fbe4da;
  --chart: #2a78d6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --page: #16140f;
    --surface: #201d17;
    --surface-2: #29251d;
    --ink: #f3ede0;
    --ink-2: #cfc7b3;
    --muted: #9a9484;
    --grid: #332e24;
    --border: rgba(243, 237, 224, 0.1);
    --hero-bg-1: #0e1a15;
    --hero-bg-2: #16281f;
    --hero-ink: #f3ede0;
    --hero-track: rgba(243, 237, 224, 0.16);
    --accent: #e0864a;
    --accent-ink: #2a1508;
    --good: #0ca30c;
    --warning: #fab219;
    --serious: #ec835a;
    --good-track: #16350f;
    --warning-track: #3d2e08;
    --serious-track: #3d2317;
    --chart: #4f95ef;
  }
}
```

- [ ] **Step 1: 구현**

```tsx
// app/components/LineChart.tsx
"use client";

export interface LineChartPoint {
  x: string; // 날짜 라벨 (YYYY-MM-DD)
  y: number;
}

export interface LineChartProps {
  points: LineChartPoint[];
  highlight?: "min" | "last"; // 강조할 지점 — 최저값 또는 마지막(오늘) 값
  markerIndex?: number; // 특정 인덱스를 강조(성수기 곡선의 "이번 여행 날짜" 마커용)
  showAverageLine?: boolean;
  colorVar?: string; // CSS 변수명, 기본 --chart
  height?: number;
}

const WIDTH = 380;
const PAD_TOP = 16;
const PAD_BOTTOM = 10;

export function average(points: LineChartPoint[]): number {
  return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

export function LineChart({ points, highlight, markerIndex, showAverageLine = false, colorVar = "--chart", height = 76 }: LineChartProps) {
  if (points.length < 2) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">데이터가 더 쌓이면 추이 그래프가 보여요.</p>;
  }

  const values = points.map((p) => p.y);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  const pts = points.map((p, i) => ({
    x: WIDTH * (i / (points.length - 1)),
    y: PAD_TOP + (1 - (p.y - lo) / range) * innerH,
    v: p.y,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${WIDTH} ${height} L 0 ${height} Z`;

  const highlightIdx =
    typeof markerIndex === "number"
      ? markerIndex
      : highlight === "last"
        ? pts.length - 1
        : pts.reduce((bestIdx, p, i, arr) => (p.v < arr[bestIdx].v ? i : bestIdx), 0);
  const hl = pts[highlightIdx];

  const avg = showAverageLine ? average(points) : null;
  const avgY = avg !== null ? PAD_TOP + (1 - (avg - lo) / range) * innerH : null;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full overflow-visible" style={{ display: "block" }}>
      <line x1={0} y1={PAD_TOP} x2={WIDTH} y2={PAD_TOP} stroke="var(--grid, #e7ded0)" strokeWidth={1} />
      <line x1={0} y1={height - PAD_BOTTOM} x2={WIDTH} y2={height - PAD_BOTTOM} stroke="var(--grid, #e7ded0)" strokeWidth={1} />
      {avgY !== null && (
        <line x1={0} y1={avgY} x2={WIDTH} y2={avgY} stroke="var(--muted, #8c8672)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      <path d={areaPath} fill={`var(${colorVar})`} fillOpacity={0.1} stroke="none" />
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={`var(${colorVar})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {hl && <circle cx={hl.x} cy={hl.y} r={4} stroke={`var(${colorVar})`} strokeWidth={2} fill="var(--surface, #fffdf8)" />}
    </svg>
  );
}
```

- [ ] **Step 2: dev 서버로 렌더 확인** (이 프로젝트는 UI 컴포넌트 유닛테스트 컨벤션이 없음 — `app/api/index/route.ts`를 포함해 기존 모든 UI 코드가 실제 브라우저/dev 서버 확인으로만 검증됨. 이 태스크도 동일 컨벤션. Task 11에서 실제로 이 컴포넌트를 데이터와 함께 렌더해서 시각 확인)

Run: `cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint` (타입/린트만 이 단계에서 확인, 렌더 확인은 Task 11에서)

- [ ] **Step 3: 커밋**

```bash
cd 여행지수-웹사이트
git add app/globals.css app/components/LineChart.tsx
git commit -m "여행지수 웹사이트: 홈페이지 리디자인 색상 토큰 추가 + 공용 SVG 라인차트(LineChart) 추가"
```

---

### Task 11: `app/components/MetricCards.tsx` — 지수 카드 5개

**Files:**
- Create: `여행지수-웹사이트/app/components/MetricCards.tsx`

**Interfaces:**
- Consumes: `LineChart`/`average`(Task 10), `DestinationResult`(Task 5), `PeakSeasonCurvePoint`(Task 2)
- Produces: `MetricCards` 컴포넌트(`{ result, peakSeasonYearCurve }` props) — `app/page.tsx`(Task 14)가 그대로 씀

**Global Constraints 재확인**: (1) 색은 good/warning/serious 3색만 — `result.breakdown`의 각 지수 점수를 자체적으로 good(65+)/warning(35~64)/serious(<35) 밴드로 변환해서 쓴다(destination 전체의 `band`가 아니라 카드별로 각자의 점수 기준). (2) 모든 %/평균/평년대비 텍스트는 이 컴포넌트 안에서 받은 배열로부터 계산한다. (3) 호텔 카드엔 그래프 없음, "준비 중" 배지만.

- [ ] **Step 1: 구현**

```tsx
// app/components/MetricCards.tsx
"use client";

import { LineChart, average, type LineChartPoint } from "./LineChart";
import type { DestinationResult } from "@/lib/topDestination";
import type { PeakSeasonCurvePoint } from "@/lib/peakSeasonCurve";
import type { Band } from "@/lib/topDestination";

function bandFromScore(score: number | null): Band {
  if (score === null) return "warning";
  if (score >= 65) return "good";
  if (score >= 35) return "warning";
  return "serious";
}

const BAND_TEXT: Record<Band, string> = { good: "text-[var(--good)]", warning: "text-[var(--warning)]", serious: "text-[var(--serious)]" };
const BAND_BG: Record<Band, string> = { good: "bg-[var(--good-track)]", warning: "bg-[var(--warning-track)]", serious: "bg-[var(--serious-track)]" };

function CardShell({ band, icon, label, score, children }: { band: Band; icon: string; label: string; score: number | null; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${BAND_BG[band]}`}>{icon}</div>
        <div className="flex-1 text-sm font-bold">{label}</div>
        <div className={`text-sm font-bold ${BAND_TEXT[band]}`}>{score === null ? "정보 없음" : `${Math.round(score)}점`}</div>
      </div>
      {children}
    </div>
  );
}

function FlightCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.flight;
  const points: LineChartPoint[] = result.flightPriceHistory30d.map((p) => ({ x: p.date, y: p.price / 10000 }));
  const band = bandFromScore(score);
  const today = points[points.length - 1];
  const avg = points.length > 0 ? average(points) : null;
  const pct = avg && today ? Math.round((Math.abs(today.y - avg) / avg) * 1000) / 10 : null;
  const dir = avg && today && today.y < avg ? "저렴한" : "비싼";

  return (
    <CardShell band={band} icon="✈️" label="항공권" score={score}>
      {points.length >= 2 ? (
        <>
          <LineChart points={points} highlight="min" colorVar="--chart" />
          <p className="mt-2 text-xs text-[var(--muted)]">
            {avg !== null && today ? `최근 30일 평균 ${avg.toFixed(1)}만원보다 ${pct}% ${dir} ${today.y.toFixed(1)}만원대예요.` : "가격 데이터가 더 쌓이는 중이에요."}
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--muted)]">가격 데이터가 더 쌓이면 추이 그래프가 보여요.</p>
      )}
    </CardShell>
  );
}

function HotelCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.hotel;
  return (
    <CardShell band={bandFromScore(score)} icon="🏨" label="호텔" score={score}>
      <p className="text-xs text-[var(--muted)]">현지 숙박은 고정 추정치를 기준으로 채점돼요. 실제 이력 데이터가 쌓이면 그래프가 추가될 예정이에요.</p>
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]" /> 실시간 가격 추이 연동 준비 중 — 지금은 고정 추정치예요
      </div>
    </CardShell>
  );
}

function ExchangeCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.exchangeRate;
  const series = result.exchangeRateSeries;
  const points: LineChartPoint[] = series ? series.historicalRates.map((rate, i) => ({ x: String(i), y: rate })) : [];
  const avg = points.length > 0 ? average(points) : null;
  const current = series?.currentRate ?? null;
  const pct = avg !== null && current !== null ? Math.round((Math.abs(current - avg) / avg) * 1000) / 10 : null;
  const dir = avg !== null && current !== null && current < avg ? "낮아요" : "높아요";

  return (
    <CardShell band={bandFromScore(score)} icon="💱" label="환율" score={score}>
      {series && points.length >= 2 ? (
        <>
          <LineChart points={points} highlight="last" showAverageLine colorVar="--chart" />
          <p className="mt-2 text-xs text-[var(--muted)]">
            오늘 환율은 최근 2년 평균보다 {pct}% {dir}.
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--muted)]">이 통화는 아직 환율 데이터가 없어서 표시할 수 없어요.</p>
      )}
    </CardShell>
  );
}

function PeakCard({ result, peakSeasonYearCurve }: { result: DestinationResult; peakSeasonYearCurve: PeakSeasonCurvePoint[] }) {
  const score = result.breakdown.peakSeason;
  const points: LineChartPoint[] = peakSeasonYearCurve.map((p) => ({ x: p.date, y: p.score }));
  const avg = average(points);
  const markerScore = peakSeasonYearCurve[result.peakMarkerIndex]?.score ?? score ?? 0;
  const pct = Math.round((Math.abs(markerScore - avg) / avg) * 100);
  const dir = markerScore > avg ? "한산해요" : "붐벼요";

  return (
    <CardShell band={bandFromScore(score)} icon="📅" label="성수기" score={score}>
      <LineChart points={points} markerIndex={result.peakMarkerIndex} showAverageLine colorVar="--chart" />
      <p className="mt-2 text-xs text-[var(--muted)]">이 시기 혼잡도는 연중 평균보다 {pct}% {dir}.</p>
    </CardShell>
  );
}

const CONDITION_ICON: Record<string, string> = { clear: "☀️", cloudy: "☁️", rain: "🌧️", snow: "❄️" };
const CONDITION_LABEL: Record<string, string> = { clear: "맑음", cloudy: "흐림", rain: "비", snow: "눈" };

function ClimateCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.climateComfort;
  const days = result.climateDaily;
  const validTemps = days.filter((d) => d.tempC !== null);
  const avgTemp = validTemps.length > 0 ? validTemps.reduce((s, d) => s + (d.tempC ?? 0), 0) / validTemps.length : null;
  const lo = Math.min(...days.map((d) => d.tempMinC ?? Infinity).filter(Number.isFinite));
  const hi = Math.max(...days.map((d) => d.tempMaxC ?? -Infinity).filter(Number.isFinite));
  const delta = avgTemp !== null && result.climateBaseline10y !== null ? avgTemp - result.climateBaseline10y : null;
  const avgHumidity = days.length > 0 ? days.reduce((s, d) => s + (d.relHumidity ?? 0), 0) / days.length : null;
  const avgWind = days.length > 0 ? days.reduce((s, d) => s + (d.windKmh ?? 0), 0) / days.length : null;

  return (
    <CardShell band={bandFromScore(score)} icon="🌤️" label="기후쾌적지수" score={score}>
      {avgTemp !== null ? (
        <p className="text-xs text-[var(--muted)]">
          평균기온 {avgTemp.toFixed(1)}℃({Number.isFinite(lo) ? `최저 ${lo.toFixed(0)}℃·최고 ${hi.toFixed(0)}℃` : "일자별 상세 없음"})
          {delta !== null && `, 평년보다 ${Math.abs(delta).toFixed(1)}℃ ${delta >= 0 ? "높아요" : "낮아요"}`}. 습도 {avgHumidity?.toFixed(0) ?? "-"}% · 풍속{" "}
          {avgWind?.toFixed(1) ?? "-"}m/s예요.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">기후 데이터가 아직 없어요.</p>
      )}
      <div className="mt-3 flex gap-2">
        {days.map((d) => (
          <div key={d.date} className="flex-1 rounded-lg bg-[var(--surface-2)] px-1.5 py-2 text-center">
            <div className="text-[10px] font-bold text-[var(--muted)]">{d.date.slice(5)}</div>
            <div className="my-1 text-lg">{d.condition ? CONDITION_ICON[d.condition] : "❔"}</div>
            <div className="text-[11.5px] font-bold tabular-nums">
              {d.tempMinC !== null && d.tempMaxC !== null ? `${d.tempMinC.toFixed(0)}~${d.tempMaxC.toFixed(0)}℃` : "-"}
            </div>
            <div className="text-[9.5px] text-[var(--muted)]">{d.condition ? CONDITION_LABEL[d.condition] : "-"}</div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

export function MetricCards({ result, peakSeasonYearCurve }: { result: DestinationResult; peakSeasonYearCurve: PeakSeasonCurvePoint[] }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <FlightCard result={result} />
      <HotelCard result={result} />
      <ExchangeCard result={result} />
      <PeakCard result={result} peakSeasonYearCurve={peakSeasonYearCurve} />
      <ClimateCard result={result} />
    </div>
  );
}
```

- [ ] **Step 2: dev 서버 + 실제 데이터로 렌더 확인** (Task 14에서 `app/page.tsx`에 연결한 뒤 브라우저로 최종 확인 — 이 시점에서는 타입/린트만)

Run: `cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint`

- [ ] **Step 3: 커밋**

```bash
cd 여행지수-웹사이트
git add app/components/MetricCards.tsx
git commit -m "여행지수 웹사이트: 지수 카드 5개(MetricCards) 추가"
```

---

### Task 12: `app/components/Hero.tsx` — 히어로(원형 게이지 + 랜드마크 + 칩)

**Files:**
- Create: `여행지수-웹사이트/app/components/Hero.tsx`

**Interfaces:**
- Consumes: `DestinationResult`(Task 5), `data/landmarks.json`(Task 9)
- Produces: `Hero` 컴포넌트(`{ result, computedAt }` props) — `app/page.tsx`(Task 14)가 그대로 씀

**Global Constraints 재확인**: 원형 게이지 색은 good/warning/serious 3색만(`bandFromScore`처럼 total 점수 기준 — `result.band`를 그대로 씀). "오늘(계산일) 기준 + 앞으로 2개월 안" 문구 필수.

- [ ] **Step 1: 구현**

```tsx
// app/components/Hero.tsx
"use client";

import landmarks from "@/data/landmarks.json" with { type: "json" };
import type { DestinationResult } from "@/lib/topDestination";

const RING_CIRCUMFERENCE = 213.6; // r=34인 원의 둘레(2*PI*34), 시안과 동일

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function Hero({ result, computedAt }: { result: DestinationResult; computedAt: string }) {
  const landmark = (landmarks as Record<string, { imageUrl: string; landmarkLabel: string; credit: string }>)[result.destinationKey];
  const computedDate = new Date(computedAt);
  const offset = RING_CIRCUMFERENCE * (1 - result.totalScore / 100);

  return (
    <div className="relative grid overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--hero-bg-2)] to-[var(--hero-bg-1)] shadow-xl sm:grid-cols-[1.15fr_0.85fr]">
      <div className="absolute top-5 right-5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-center text-[11px] font-bold text-[var(--accent-ink)]">
        오늘 기준
        <span className="mt-0.5 block text-[9.5px] font-medium opacity-85">{computedDate.getMonth() + 1}월 {computedDate.getDate()}일 계산</span>
      </div>

      <div className="p-9 text-[var(--hero-ink)]">
        <div className="mb-3 text-[11px] font-bold tracking-wide text-[var(--accent)] uppercase">등록된 목적지 전체 중 오늘의 1위</div>
        <h1 className="mb-3 font-serif text-2xl leading-snug font-bold">
          지금 계산으로는,
          <br />
          {result.label}가 가장 좋아요
        </h1>
        <p className="mb-5 max-w-[38ch] text-[12.5px] leading-relaxed opacity-95">
          오늘({computedDate.getMonth() + 1}/{computedDate.getDate()}) 기준으로 계산했고, <strong>앞으로 2개월 안</strong>에서 가장 조건 좋은 시기를 찾은
          결과예요. 항공권·호텔·환율·성수기·기후를 매일 다시 계산해요.
        </p>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
              <circle cx="42" cy="42" r="34" fill="none" stroke="var(--hero-track)" strokeWidth="8" />
              <circle
                cx="42"
                cy="42"
                r="34"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                stroke={`var(--${result.band})`}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold">{result.totalScore}</span>
              <span className="text-[9px] font-semibold opacity-70">점</span>
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-[11px] font-semibold opacity-80">다음 추천 여행 · {result.nights}박 {result.nights + 1}일</div>
            <div className="mb-2 text-[15.5px] font-bold">
              {result.label} · {formatMonthDay(result.departDate)} ~ {formatMonthDay(result.returnDate)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.topChips.map((chip) => (
                <span key={chip.key} className="rounded-full border border-[var(--hero-track)] px-2.5 py-1 text-[11px] font-semibold">
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-h-[160px]">
        {landmark?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부(Wikimedia) 호스트 이미지, next/image 최적화 대상 아님 */}
            <img src={landmark.imageUrl} alt={landmark.landmarkLabel} className="h-full w-full object-cover" />
            <div className="absolute bottom-3 left-4 z-10 text-[10.5px] font-semibold text-white drop-shadow">📍 {landmark.landmarkLabel}</div>
            <div className="absolute right-2 bottom-1 z-10 text-[8.5px] text-white/70">{landmark.credit}</div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--hero-track)]">사진 준비 중</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입/린트 확인**

Run: `cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint`

- [ ] **Step 3: 커밋**

```bash
cd 여행지수-웹사이트
git add app/components/Hero.tsx
git commit -m "여행지수 웹사이트: 히어로(원형 게이지 + 랜드마크 + 칩) 컴포넌트 추가"
```

---

### Task 13: `app/components/DestinationList.tsx` — 목적지 가로 리스트

**Files:**
- Create: `여행지수-웹사이트/app/components/DestinationList.tsx`

**Interfaces:**
- Consumes: `DestinationResult`(Task 5)
- Produces: `DestinationList` 컴포넌트(`{ results, selectedKey, onSelect }` props) — `app/page.tsx`(Task 14)가 그대로 씀

**Global Constraint 재확인**: 세로 카드 그리드가 아니라 한 행에 다 들어가는 가로 리스트. 색은 `result.band` 기반 3색만.

- [ ] **Step 1: 구현**

```tsx
// app/components/DestinationList.tsx
"use client";

import type { DestinationResult } from "@/lib/topDestination";

const BAND_LABEL: Record<string, string> = { good: "좋음", warning: "보통", serious: "아쉬움" };

function bestReasonText(result: DestinationResult): string {
  const chipLabels = result.topChips.map((c) => c.label).join(", ");
  return chipLabels ? `${chipLabels}이 좋은 시기예요.` : "지금 계산된 조건으로 추천돼요.";
}

export function DestinationList({
  results,
  selectedKey,
  onSelect,
}: {
  results: DestinationResult[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {results.map((r) => (
        <button
          key={r.destinationKey}
          type="button"
          onClick={() => onSelect(r.destinationKey)}
          className={`flex w-full items-center gap-4 border-b border-[var(--grid)] px-5 py-4 text-left last:border-b-0 hover:bg-[var(--surface-2)] ${
            selectedKey === r.destinationKey ? "bg-[var(--surface-2)] shadow-[inset_3px_0_0_var(--accent)]" : ""
          }`}
        >
          <div className="w-32 shrink-0">
            <div className="text-[13.5px] font-bold">{r.label}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-bold">
              <span className={`h-1.5 w-1.5 rounded-full bg-[var(--${r.band})]`} />
              {r.totalScore}점 · {BAND_LABEL[r.band]}
            </div>
          </div>
          <div className="flex-1 text-xs leading-relaxed text-[var(--muted)]">{bestReasonText(r)}</div>
          <div className="text-sm text-[var(--muted)]">→</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 타입/린트 확인**

Run: `cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint`

- [ ] **Step 3: 커밋**

```bash
cd 여행지수-웹사이트
git add app/components/DestinationList.tsx
git commit -m "여행지수 웹사이트: 목적지 가로 리스트(DestinationList) 컴포넌트 추가"
```

---

### Task 14: `app/page.tsx` 재작성 — 전체 조립 + 기존 검색 패널 보존

**Files:**
- Modify: `여행지수-웹사이트/app/page.tsx`

**Interfaces:**
- Consumes: `Hero`(Task 12), `MetricCards`(Task 11), `DestinationList`(Task 13), `GET /api/top-destinations`(Task 8), 기존 `POST /api/index` 플로우(변경 없음)

- [ ] **Step 1: 구현** (기존 파일의 검색 패널 관련 state/핸들러/JSX는 그대로 유지하고, 그 위에 히어로/카드/목적지 리스트를 새로 추가하는 형태로 재작성)

```tsx
// app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { DESTINATIONS } from "@/lib/destinations";
import type { Grade } from "@/lib/scoring";
import type { DestinationResult } from "@/lib/topDestination";
import type { PeakSeasonCurvePoint } from "@/lib/peakSeasonCurve";
import { useTravelpayoutsWidget } from "@/hooks/useTravelpayoutsWidget";
import { Hero } from "@/app/components/Hero";
import { MetricCards } from "@/app/components/MetricCards";
import { DestinationList } from "@/app/components/DestinationList";

const AVIASALES_WIDGET_SRC =
  "https://tpwgt.com/content?currency=krw&trs=565302&shmarker=768270&show_hotels=true&powered_by=true&locale=ko&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100";

interface IndexResponse {
  travelIndex: { totalScore: number; grade: Grade; breakdown: Record<string, number | null> };
  totalCost: { flightTotal: number; hotelTotal: number; dailyCostTotal: number; grandTotal: number };
  nights: number;
  error?: string;
}

interface TopDestinationsPayload {
  computedAt: string;
  results: DestinationResult[];
  peakSeasonYearCurve: PeakSeasonCurvePoint[];
}

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function Home() {
  // --- 오늘의 추천 / 히어로 / 카드 / 목적지 리스트 ---
  const [topData, setTopData] = useState<TopDestinationsPayload | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/top-destinations")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setTopError(data.error ?? "불러오지 못했어요.");
          return;
        }
        const data: TopDestinationsPayload = await res.json();
        setTopData(data);
        setSelectedKey(data.results[0]?.destinationKey ?? null);
      })
      .catch(() => setTopError("서버와 통신할 수 없습니다."));
  }, []);

  const selectedResult = topData?.results.find((r) => r.destinationKey === selectedKey) ?? null;

  // --- 기존 "계산하기" 검색 패널 — 로직/동작 변경 없음, 레이아웃만 이동 ---
  const destinationKeys = Object.keys(DESTINATIONS);
  const [destinationKey, setDestinationKey] = useState(destinationKeys[0]);
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [people, setPeople] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IndexResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aviasalesWidgetRef = useRef<HTMLDivElement>(null);
  useTravelpayoutsWidget(AVIASALES_WIDGET_SRC, aviasalesWidgetRef);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationKey, departDate, returnDate, people }),
      });
      const data: IndexResponse = await res.json();
      if (!res.ok) setError(data.error ?? "계산에 실패했습니다.");
      else setResult(data);
    } catch {
      setError("서버와 통신할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page)] px-4 py-8">
      <main className="mx-auto max-w-[1040px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="font-serif text-lg font-bold">여행지수</div>
            <div className="text-[11px] text-[var(--muted)]">실제 데이터로 계산하는 다음 여행</div>
          </div>
        </div>

        {topError && <p className="mb-6 text-sm text-[var(--muted)]">{topError}</p>}

        {selectedResult && topData && (
          <>
            <Hero result={selectedResult} computedAt={topData.computedAt} />

            <div ref={aviasalesWidgetRef} className="mt-5 rounded-xl bg-[var(--surface)] p-4 shadow-sm" />

            <form onSubmit={handleSubmit} className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="min-w-[180px] flex-[1.6]">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">목적지</label>
                <select value={destinationKey} onChange={(e) => setDestinationKey(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm">
                  {destinationKeys.map((key) => (
                    <option key={key} value={key}>
                      {DESTINATIONS[key].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px] flex-1">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">가는 날</label>
                <input type="date" required value={departDate} onChange={(e) => setDepartDate(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm" />
              </div>
              <div className="min-w-[140px] flex-1">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">오는 날</label>
                <input type="date" required value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm" />
              </div>
              <button type="submit" disabled={loading} className="rounded-lg bg-[var(--hero-bg-2)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--hero-ink)] disabled:opacity-50">
                {loading ? "계산 중..." : "여행지수 계산하기"}
              </button>
            </form>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            {result && (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="text-2xl font-extrabold">{result.travelIndex.totalScore}점 · {result.travelIndex.grade}</div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  총 {formatKRW(result.totalCost.grandTotal)} ({result.nights}박 {people}인)
                </div>
              </div>
            )}

            <div className="mt-8 mb-3.5 flex items-baseline justify-between">
              <h2 className="font-serif text-[19px] font-bold">{selectedResult.label}는 지금 왜 좋은가요</h2>
            </div>
            <MetricCards result={selectedResult} peakSeasonYearCurve={topData.peakSeasonYearCurve} />

            <div className="mt-8 mb-3.5">
              <h2 className="font-serif text-[19px] font-bold">등록된 목적지 (17곳)</h2>
            </div>
            <DestinationList results={topData.results} selectedKey={selectedResult.destinationKey} onSelect={setSelectedKey} />
          </>
        )}

        {!selectedResult && !topError && <p className="text-sm text-[var(--muted)]">오늘의 추천을 계산하는 중이에요...</p>}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: dev 서버로 실제 확인**

```bash
cd 여행지수-웹사이트
npm run dev &
```
브라우저(또는 `claude-in-chrome`)로 `http://localhost:3000`에 접속해서(로그인 필요) 다음을 확인:
- 히어로에 오늘의 1위 목적지, 점수 게이지, 랜드마크 사진, 칩 2개, "오늘 기준" 문구가 보이는지
- 5개 지수 카드가 각각 독립 박스로 보이고, 항공권/환율/성수기에 실제 그래프가 그려지는지
- 호텔 카드엔 그래프 없이 배지만 있는지
- 목적지 리스트가 가로 한 줄씩이고, 클릭하면 히어로+카드가 그 목적지로 즉시(재요청 없이) 바뀌는지
- 기존 "계산하기" 폼이 정상 동작하는지(제출 → 결과 표시)

Expected: 위 항목이 전부 실제로 동작. 문제 있으면 이 단계에서 수정.

- [ ] **Step 3: tsc/eslint 확인 후 커밋**

```bash
cd 여행지수-웹사이트 && npx tsc --noEmit && npx eslint
git add app/page.tsx
git commit -m "여행지수 웹사이트: 홈페이지 리디자인 — 히어로/지수카드/목적지 가로리스트로 전면 재작성"
```

---

## Self-Review

**Spec coverage:**
- 1. 히어로 "오늘의 추천" (17곳, 시점 명시, 배치+캐시, 링게이지+칩2개+랜드마크) → Task 4/5(계산)/6/7/8(캐시·API) + Task 12(Hero)
- 2. 랜드마크 실사진(17곳, 라이선스 확인) → Task 9
- 3. 검색 패널(기존 그대로, 한 줄 배치) → Task 14
- 4-1. 항공권 30일 차트 + 동일소스 % → Task 10(LineChart) + Task 11(FlightCard)
- 4-2. 환율 2년 차트 + 평균선 + 동일소스 % + TWD/VND 정보없음 처리 → Task 11(ExchangeCard)
- 4-3. 호텔 그래프 없음 + 준비중 배지 → Task 11(HotelCard)
- 4-4. 성수기 1년 곡선(목적지 무관, 1회 계산) + 마커 + 동일소스 % → Task 2/5(계산) + Task 11(PeakCard)
- 4-5. 기후 일자별 최저/최고/날씨 + 평년(10년) 대비 → Task 3(climateDetail) + Task 11(ClimateCard)
- 5. 목적지 가로 리스트, 클릭 시 전체 전환(재요청 없음) → Task 13/14
- 6. 색상 규칙(지수=good/warning/serious만, 브랜드색 분리) → Global Constraints + 모든 UI 태스크에서 재확인 문구로 강제
- 7. 완료 후 커밋만, 푸시 안 함 → Global Constraints, 각 태스크 커밋 스텝에 push 없음

**Placeholder scan:** 전체 재확인함 — TBD/TODO/"적절히 처리" 류 없음. Task 9(landmarks.json)는 성격상 "조사해서 채울 것" 지시가 불가피하지만(코드가 아니라 데이터 수집이 태스크 자체), 스키마·검증 테스트·조사 절차·실패 시 처리 방식(빈 문자열 + 폴백)까지 전부 구체적으로 명시해 placeholder가 아니라 절차로 대체함.

**Type consistency:** `ScoreBreakdown`(Task 1) → `TravelIndexResult["breakdown"]`(기존 scoring.ts)와 필드명 동일 확인. `PeakSeasonCurvePoint`(Task 2) → Task 5의 `TopDestinationsPayload.peakSeasonYearCurve`, Task 11의 `PeakCard` props에서 동일 타입 재사용 확인. `Band`(Task 4) → Task 11(`bandFromScore`가 별도 정의하지만 반환 타입은 동일 `Band`)/Task 12/13에서 재사용 확인. `DestinationResult`(Task 5) → Task 11/12/13/14 전부 이 타입을 그대로 import해서 씀, 필드명 불일치 없음 확인(`climateDaily`/`climateBaseline10y`/`flightPriceHistory30d`/`exchangeRateSeries`/`peakMarkerIndex` 전부 정의부와 사용부 일치).

**범위 밖(다음 계획으로 미룸):** `hooks/useTravelpayoutsWidget` 자체는 기존 그대로 재사용(수정 없음). (계획 작성 시점에 `app/globals.css`를 실제로 확인한 결과 `--good`/`--warning`/`--serious` 등 이 계획이 참조하는 색상 토큰이 하나도 정의돼 있지 않은 것을 발견 — Task 10에 Step 0으로 토큰 정의를 추가해서 해결함, 더 이상 범위 밖 아님.)
