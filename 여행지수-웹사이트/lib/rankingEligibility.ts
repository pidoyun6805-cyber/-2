import { WEIGHTS } from "./scoring.ts";

export type MetricKey = keyof typeof WEIGHTS;
export type Breakdown = Record<MetricKey, number | null>;

/**
 * 데이터 결손이 랭킹을 왜곡하는 문제를 한 곳에서 처리한다.
 *
 * calcTravelIndex는 채점 불가(null)한 지수를 총점에서 빼고 남은 지수끼리 가중치를 재분배한다.
 * 그래서 데이터가 없을수록 총점이 유리해진다 — 지금까지 세 번 같은 증상이 나왔다:
 *   환율(타이베이·다낭), 기후(싱가포르·괌·마닐라), 항공권(괌·사이판).
 * 지수별로 따로 땜질하면 네 번째가 또 나오므로 규칙으로 정리한다.
 *
 * 규칙:
 *  - 구조적 결손: 데이터 소스가 그 목적지를 영원히 지원하지 않는 경우.
 *    → 해당 지수를 "전 목적지" 랭킹에서 뺀다. 몇 곳을 영구히 후보에서 제외하는 건 과하기 때문.
 *  - 개별 결손: 지금 없을 뿐 나중에 생길 수 있는 경우.
 *    → 그 "목적지"를 랭킹에서 뺀다. 지수 자체는 나머지 목적지 랭킹에 그대로 쓴다.
 *
 * 어떤 목적지가 빠지는지는 절대 하드코딩하지 않고 매번 breakdown에서 계산한다.
 * (괌·사이판은 Aviasales 캐시가 검색 이력 기반이라 누군가 검색하면 데이터가 생긴다 —
 *  그러면 다음 배치에서 자동으로 다시 후보가 된다.)
 */
export type DeficitKind = "structural" | "transient";

// 결손이 영구적인지 일시적인지는 데이터 소스의 성질이라 지수별 상수다.
// 목적지 목록이 아니라 "소스의 성질"만 여기 적는다.
export const DEFICIT_KIND: Record<MetricKey, DeficitKind> = {
  // Frankfurter가 TWD/VND를 지원하지 않는다. 앞으로도 생길 가능성이 없다.
  exchangeRate: "structural",
  // Aviasales 캐시는 실제 사용자 검색 이력 기반이라 나중에 채워질 수 있다.
  flight: "transient",
  // Open-Meteo는 전 지역을 다루므로 결손은 일시적 실패다.
  climateComfort: "transient",
  // 고정 추정치/달력 기반이라 결손 자체가 나지 않지만, 규칙은 완전하게 채워둔다.
  hotel: "transient",
  peakSeason: "transient",
};

export interface RankingEligibility {
  /** 전 목적지 랭킹에서 제외한 지수 (구조적 결손). 어느 목적지 때문인지도 같이 남긴다. */
  excludedMetrics: { metric: MetricKey; missingDestinations: string[] }[];
  /** 순위 비교에서 제외한 목적지와 그 사유가 된 지수 (개별 결손) */
  excludedDestinations: { destinationKey: string; missing: MetricKey[] }[];
}

const METRIC_KEYS = Object.keys(WEIGHTS) as MetricKey[];

export const METRIC_LABEL: Record<MetricKey, string> = {
  flight: "항공권",
  hotel: "호텔",
  exchangeRate: "환율",
  peakSeason: "성수기",
  climateComfort: "기후",
};

export function computeRankingEligibility(
  entries: { destinationKey: string; breakdown: Breakdown }[]
): RankingEligibility {
  const excludedMetrics: { metric: MetricKey; missingDestinations: string[] }[] = [];
  const missingByDestination = new Map<string, MetricKey[]>();

  for (const metric of METRIC_KEYS) {
    const missing = entries.filter((e) => e.breakdown[metric] === null);
    if (missing.length === 0) continue;

    if (DEFICIT_KIND[metric] === "structural") {
      // 이 지수는 아무도 못 쓰게 한다 — 결손인 목적지만 유리해지는 걸 막는다.
      excludedMetrics.push({ metric, missingDestinations: missing.map((e) => e.destinationKey) });
    } else {
      for (const e of missing) {
        missingByDestination.set(e.destinationKey, [...(missingByDestination.get(e.destinationKey) ?? []), metric]);
      }
    }
  }

  return {
    excludedMetrics,
    excludedDestinations: [...missingByDestination].map(([destinationKey, missing]) => ({ destinationKey, missing })),
  };
}

/**
 * 랭킹 전용 점수. 표시용 totalScore와 달리 제외된 지수를 빼고 계산한다.
 * 화면에 보이는 breakdown/totalScore는 손대지 않는다 — 실측값 그대로 보여준다.
 */
export function rankingScoreFrom(breakdown: Breakdown, excludedMetrics: MetricKey[]): number {
  const usable: { score: number; weight: number }[] = [];
  for (const m of METRIC_KEYS) {
    if (excludedMetrics.includes(m)) continue;
    const score = breakdown[m];
    if (score === null) continue;
    usable.push({ score, weight: WEIGHTS[m] });
  }

  if (usable.length === 0) return 0;
  const totalWeight = usable.reduce((s, u) => s + u.weight, 0);
  return usable.reduce((s, u) => s + u.score * u.weight, 0) / totalWeight;
}

/** 랭킹에서 제외된 목적지를 뒤로 미룬 정렬 순서를 만든다. 제외돼도 목록에서 사라지지는 않는다. */
export function sortByRanking<T extends { destinationKey: string; breakdown: Breakdown }>(
  entries: T[],
  eligibility: RankingEligibility
): T[] {
  const excluded = new Set(eligibility.excludedDestinations.map((d) => d.destinationKey));
  return [...entries].sort((a, b) => {
    const aOut = excluded.has(a.destinationKey) ? 1 : 0;
    const bOut = excluded.has(b.destinationKey) ? 1 : 0;
    if (aOut !== bOut) return aOut - bOut;
    const excludedKeys = eligibility.excludedMetrics.map((m) => m.metric);
    return rankingScoreFrom(b.breakdown, excludedKeys) - rankingScoreFrom(a.breakdown, excludedKeys);
  });
}

/**
 * 랭킹에서 뺀 목적지/지수를 안내 문구로 만든다. 제외가 없으면 null.
 *
 * 조사(은/는) 앞에는 반드시 고정된 단어가 오게 문장을 짠다 —
 * "곳은", "지수는"처럼. 변수 뒤에 조사를 붙이면 받침에 따라 은/는이 갈려서
 * "환율은(는)" 같은 문구가 나온다. 그래서 종성 판정 헬퍼가 필요 없다.
 */
export function eligibilityNotice(eligibility: RankingEligibility, labelOf: (key: string) => string): string | null {
  // 목록이 길어지지 않게 "도쿄 (일본)" 같은 괄호 설명은 떼고 도시명만 쓴다.
  const shortName = (key: string) => labelOf(key).replace(/\s*\(.*\)$/, "");
  const parts: string[] = [];

  if (eligibility.excludedDestinations.length > 0) {
    const reasons = [...new Set(eligibility.excludedDestinations.flatMap((d) => d.missing))].map((m) => METRIC_LABEL[m]);
    const names = eligibility.excludedDestinations.map((d) => shortName(d.destinationKey));
    parts.push(`${reasons.join("·")} 데이터가 없는 ${names.join("·")} ${names.length}곳은 순위 비교에서 제외했어요.`);
  }

  for (const { metric, missingDestinations } of eligibility.excludedMetrics) {
    const names = missingDestinations.map(shortName).join("·");
    parts.push(
      `${names}처럼 영구적으로 받을 수 없는 곳이 있어서, 공정한 비교를 위해 ${METRIC_LABEL[metric]} 지수는 모든 목적지의 순위 계산에서 뺐어요.`
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}
