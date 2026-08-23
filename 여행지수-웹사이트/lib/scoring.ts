// 여행지수 점수 계산 로직
// 가중치와 등급 구간은 원본 스킬(.claude/skills/여행지수/SKILL.md)에서 그대로 이식, 변경 금지.
// 각 요소의 0~100 환산 기준 중 "조정 가능"이라고 표시된 항목은 임시 기본값이므로
// 숫자만 바꾸면 됨 (사용자 피드백 받아 조정 예정).

export const WEIGHTS = {
  flight: 0.2,
  peakSeason: 0.2,
  exchangeRate: 0.2,
  climateComfort: 0.3,
  hotel: 0.1,
} as const;

export type Grade = "최적기" | "좋음" | "보통" | "비추천" | "최악";

export function gradeFromScore(score: number): Grade {
  if (score >= 80) return "최적기";
  if (score >= 65) return "좋음";
  if (score >= 50) return "보통";
  if (score >= 35) return "비추천";
  return "최악";
}

// 정렬된 (x, y) 좌표 목록을 구간 선형보간. 범위를 벗어나면 양 끝값으로 고정(saturate).
function interpolate(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

// 호텔 가격: 최근 평균가 대비 편차(%). 예: -0.3 = 30% 더 저렴. (조정 가능한 기본값)
const HOTEL_PRICE_DEVIATION_POINTS: [number, number][] = [
  [-0.3, 100],
  [-0.15, 80],
  [0, 60],
  [0.2, 40],
  [0.4, 20],
];

export function scoreHotelPrice(deviationPct: number): number {
  return interpolate(HOTEL_PRICE_DEVIATION_POINTS, deviationPct);
}

// 항공권 가격: 절대값이나 다른 노선과 비교하지 않고, 같은 노선의 비슷한 시기 과거 가격 평균("기준가")
// 대비 지금 가격이 얼마나 싸거나 비싼지로 채점 (사용자 확정값).
// 할인율 0%(기준가와 동일)=60점. 할인(+)될수록 30%에서 100점까지 완만하게 상승(1%당 40/30점).
// 프리미엄(-)일수록 -30%에서 0점까지 더 가파르게 하락(1%당 60/30점) — 비싸지는 쪽에 더 민감.
// 기준가를 아직 모르면(과거 데이터 부족) 점수를 매기지 않고 null을 반환한다.
export function flightDealScore(currentPrice: number, baseline: number | null): number | null {
  if (baseline === null || !Number.isFinite(baseline) || baseline <= 0) return null;
  if (!Number.isFinite(currentPrice)) return null;

  const discountRate = ((baseline - currentPrice) / baseline) * 100;

  const score =
    discountRate >= 0 ? 60 + (40 / 30) * discountRate : 60 + (60 / 30) * discountRate;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// route별 기준가: 같은 시기 과거 가격들의 평균. 데이터가 없으면 null(=아직 기준가를 모름).
export function calculateBaseline(historicalPrices: number[] | null | undefined): number | null {
  if (!historicalPrices || historicalPrices.length === 0) return null;
  return historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
}

export type DistanceBand = "short" | "medium" | "long";

export function getDistanceBand(distanceKm: number): DistanceBand {
  if (distanceKm <= 1500) return "short";
  if (distanceKm <= 4000) return "medium";
  return "long";
}

export interface RoutePriceSample {
  price: number;
  distanceKm: number;
}

// 같은 거리대 비교 노선이 이보다 적으면 백분위 비교가 통계적으로 의미 없다고 보고 채점하지 않는다.
// (자기 자신 하나뿐이면 rank=1/percentile=1.0으로 항상 0점이 나오는 문제가 있었음 — 검증된 값은 아니고,
// "최소 이 정도는 있어야 순위 매기는 의미가 있다"는 감으로 잡은 임시 기준. 조정 가능.)
const MIN_BAND_SAMPLES_FOR_FALLBACK = 3;

// 노선의 과거 가격 데이터가 부족해 flightDealScore를 못 쓸 때 쓰는 임시 채점.
// 같은 거리대(단/중/장거리)의 다른 노선들과 km당 가격을 비교해 백분위로 매긴다 (사용자 확정값).
// 비교할 같은 거리대 노선이 충분치 않으면(자기 자신뿐인 경우 포함) null.
export function flightPriceScoreFallback(
  price: number,
  distanceKm: number,
  allRoutes: RoutePriceSample[]
): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;

  const pricePerKm = price / distanceKm;
  const band = getDistanceBand(distanceKm);

  const bandPrices = allRoutes
    .filter((r) => getDistanceBand(r.distanceKm) === band)
    .map((r) => r.price / r.distanceKm)
    .sort((a, b) => a - b);

  if (bandPrices.length < MIN_BAND_SAMPLES_FOR_FALLBACK) return null;

  const rank = bandPrices.filter((p) => p <= pricePerKm).length;
  const percentile = rank / bandPrices.length;

  return Math.round((1 - percentile) * 100);
}

const MIN_HISTORICAL_SAMPLES_FOR_BASELINE = 5;

export interface FlightRouteScoreInput {
  currentPrice: number;
  distanceKm: number;
  historicalPrices: number[]; // 이미 "비슷한 시기"로 필터링된 과거 가격들
  allRoutes: RoutePriceSample[]; // 폴백용 - 전체 노선의 현재가/거리
}

// 과거 가격 데이터가 5개 이상이면 할인율 방식(flightDealScore), 부족하면 거리대 폴백을 쓴다.
export function getFlightPriceScore(input: FlightRouteScoreInput): number | null {
  if (input.historicalPrices.length >= MIN_HISTORICAL_SAMPLES_FOR_BASELINE) {
    const baseline = calculateBaseline(input.historicalPrices);
    return flightDealScore(input.currentPrice, baseline);
  }
  return flightPriceScoreFallback(input.currentPrice, input.distanceKm, input.allRoutes);
}

// 환율: 최근 2년(730일) 일별 환율의 평균/표준편차 대비 오늘 환율이 몇 시그마 떨어져 있는지로 채점(z-score).
// 평균과 같으면 50점(중립), ±SATURATION_SIGMA에서 0점/100점으로 포화.
// 과거의 "1%p당 4점/8점 비대칭 감점" 방식은 환율이 무작위로 움직여도 점수가 60~80점대로 쏠리는
// 편향이 있어서 폐기. 과거 데이터가 2개 미만이면 채점 불가로 null.
//
// SATURATION_SIGMA=3.3은 이론적으로 도출된 값이 아니라, 실제 관측 데이터(오사카/JPY 기준
// z≈2.97) 기준으로 역산해서 정한 값이다. 2σ/2.5σ로 포화시키면 오늘자 같은 극단치가 이미
// 100점에 딱 붙어버려서 앞으로 환율이 더 극단적으로 움직여도 점수로 구분이 안 되는 문제가
// 있었음 — 그래서 오늘 같은 상황에서도 100점까지 약간의 여유(headroom)가 남도록 넓혔다.
// 다른 통화(변동성이 다른)를 추가하면서 재조정이 필요할 수 있어 상수로 분리해둔다.
const SATURATION_SIGMA = 3.3;

export function exchangeRateScore(currentRate: number, historicalRates: number[]): number | null {
  if (historicalRates.length < 2) return null;

  const baseline = historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;
  const variance =
    historicalRates.reduce((sum, r) => sum + (r - baseline) ** 2, 0) / historicalRates.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    const score = currentRate <= baseline ? 100 : 0;
    console.log(
      `[exchangeRateScore] n=${historicalRates.length} baseline=${baseline} stdDev=0 currentRate=${currentRate} score=${score}`
    );
    return score;
  }

  const z = (baseline - currentRate) / stdDev; // 원화 강세일수록(환율이 낮을수록) +
  const score = Math.round(Math.max(0, Math.min(100, 50 + z * (50 / SATURATION_SIGMA))));
  console.log(
    `[exchangeRateScore] n=${historicalRates.length} baseline=${baseline.toFixed(4)} ` +
      `stdDev=${stdDev.toFixed(4)} currentRate=${currentRate} z=${z.toFixed(3)} score=${score}`
  );
  return score;
}

// 성수기/혼잡도: 조정 가능한 기본값 4단계
export type PeakCategory = "off" | "shoulder" | "peak" | "super_peak";

const PEAK_SEASON_SCORES: Record<PeakCategory, number> = {
  off: 100,
  shoulder: 70,
  peak: 40,
  super_peak: 20,
};

export function scorePeakSeason(category: PeakCategory): number {
  return PEAK_SEASON_SCORES[category];
}

// 날씨(하늘 상태): getSeasonalWeather()의 계절 참고 표시(condition)에서 여전히 쓰는 타입.
// 채점 자체는 더 이상 이 타입을 쓰지 않고 climateComfortScore(HCI:Urban)로 대체됨.
export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow";

// 기후쾌적지수(HCI:Urban) — Scott, D., Rutty, M., Amelung, B., Tang, M. (2016).
// "An Inter-Comparison of the Holiday Climate Index (HCI) and the Tourism Climate Index (TCI)
// in Europe." Atmosphere, 7(6), 80.
// HCI:Urban = 4*TC + 2*A + (3*P + W), 만점 100. 기존에 따로 채점하던 기온(0.15)+날씨(0.15)를
// 이 지수 하나(가중치 0.3)로 통합.

// TC(체감온도) 계산에 원 논문은 유효온도(ET)를 쓰지만, 저자가 Humidex로 대체 가능하다고 명시함.
export function humidex(tempC: number, relHumidity: number): number {
  const e = 6.112 * Math.pow(10, (7.5 * tempC) / (237.7 + tempC)) * (relHumidity / 100);
  if (e < 10) return tempC; // 건조/저온에서는 험덱스 보정 안 함
  return tempC + (5 / 9) * (e - 10);
}

export function tcScore(effectiveTemp: number): number {
  const t = effectiveTemp;
  if (t >= 39) return 0;
  if (t >= 37) return 2;
  if (t >= 35) return 4;
  if (t >= 33) return 5;
  if (t >= 31) return 6;
  if (t >= 29) return 7;
  if (t >= 27) return 8;
  if (t >= 26) return 9;
  if (t >= 23) return 10; // 23~25 최적
  if (t >= 20) return 9;
  if (t >= 18) return 7;
  if (t >= 15) return 6;
  if (t >= 11) return 5;
  if (t >= 7) return 4;
  if (t >= 0) return 3;
  if (t >= -5) return 2;
  return 1; // -6 이하
}

// A(구름량 미관) 계산. 공인 HCI 표 기준: 0%는 8점(최고점 아님), 1~10%는 9점,
// 11~20%가 최고점 10점, 21~30%는 다시 9점, 그 뒤로는 구름이 많아질수록 계속 감점.
export function aScore(cloudCoverPct: number): number {
  const c = cloudCoverPct;
  if (c >= 100) return 1;
  if (c >= 90) return 2;
  if (c >= 81) return 3;
  if (c >= 71) return 4;
  if (c >= 61) return 5;
  if (c >= 51) return 6;
  if (c >= 41) return 7;
  if (c >= 31) return 8;
  if (c >= 21) return 9;
  if (c >= 11) return 10;
  if (c >= 1) return 9;
  return 8; // 0%
}

export function pScore(precipMm: number): number {
  if (precipMm > 12) return 0;
  if (precipMm >= 9) return 2;
  if (precipMm >= 6) return 5;
  if (precipMm >= 3) return 8;
  if (precipMm > 0) return 9;
  return 10; // 0.00mm
}

export function wScore(windKmh: number): number {
  if (windKmh >= 50) return 0; // 50km/h 이상은 표에 명시 없어 0으로 고정
  if (windKmh >= 40) return 3;
  if (windKmh >= 30) return 6;
  if (windKmh >= 20) return 8;
  if (windKmh >= 10) return 9;
  return 10; // 1~9
}

function isFiniteNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v);
}

// 위 4개 하위지표(TC/A/P/W)를 합산해 하루치 기후쾌적지수를 낸다.
// 다섯 입력값 중 하나라도 없으면(null/undefined/NaN) 채점 불가로 보고 null을 반환한다.
export function climateComfortScore(
  tempC: number | null | undefined,
  relHumidity: number | null | undefined,
  cloudCoverPct: number | null | undefined,
  precipMm: number | null | undefined,
  windKmh: number | null | undefined
): number | null {
  if (
    !isFiniteNum(tempC) ||
    !isFiniteNum(relHumidity) ||
    !isFiniteNum(cloudCoverPct) ||
    !isFiniteNum(precipMm) ||
    !isFiniteNum(windKmh)
  ) {
    return null;
  }

  const TC = tcScore(humidex(tempC, relHumidity));
  const A = aScore(cloudCoverPct);
  const P = pScore(precipMm);
  const W = wScore(windKmh);

  return 4 * TC + 2 * A + 3 * P + W;
}

export interface ClimateDay {
  tempC: number | null | undefined;
  relHumidity: number | null | undefined;
  cloudCoverPct: number | null | undefined;
  precipMm: number | null | undefined;
  windKmh: number | null | undefined;
}

// 여행 기간 전체의 기후쾌적지수: 날짜별 점수를 평균. 채점 불가한 날짜는 평균에서 제외.
// days가 비어 있거나 모든 날짜가 채점 불가면, 상위 시스템(외부 날씨 API 호출부)이
// 잘못된 입력을 넘긴 것이므로 조용히 기본값을 만들어내지 않고 에러를 던진다.
export function periodClimateComfortScore(days: ClimateDay[]): number {
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error("periodClimateComfortScore: days 배열이 비어 있습니다.");
  }

  const scores = days
    .map((d) => climateComfortScore(d.tempC, d.relHumidity, d.cloudCoverPct, d.precipMm, d.windKmh))
    .filter((s): s is number => s !== null);

  if (scores.length === 0) {
    throw new Error("periodClimateComfortScore: 유효한 기후 데이터가 하나도 없습니다.");
  }

  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

export interface TravelIndexInputs {
  flightScore: number | null; // getFlightPriceScore()로 미리 계산해서 넘긴다
  hotelDeviationPct: number;
  exchangeRateScore: number | null; // exchangeRateScore()로 미리 계산해서 넘긴다
  peakCategory: PeakCategory;
  climateDays: ClimateDay[];
}

export interface TravelIndexResult {
  totalScore: number;
  grade: Grade;
  breakdown: {
    flight: number | null;
    hotel: number;
    exchangeRate: number | null;
    peakSeason: number;
    climateComfort: number;
  };
}

export function calcTravelIndex(inputs: TravelIndexInputs): TravelIndexResult {
  const breakdown = {
    flight: inputs.flightScore,
    hotel: scoreHotelPrice(inputs.hotelDeviationPct),
    exchangeRate: inputs.exchangeRateScore,
    peakSeason: scorePeakSeason(inputs.peakCategory),
    climateComfort: periodClimateComfortScore(inputs.climateDays),
  };

  // 항공권처럼 채점 불가(null)한 요소는 총점 계산에서 제외하고, 남은 요소끼리 가중치를 재분배한다.
  const weighted: [number | null, number][] = [
    [breakdown.flight, WEIGHTS.flight],
    [breakdown.hotel, WEIGHTS.hotel],
    [breakdown.exchangeRate, WEIGHTS.exchangeRate],
    [breakdown.peakSeason, WEIGHTS.peakSeason],
    [breakdown.climateComfort, WEIGHTS.climateComfort],
  ];
  const available = weighted.filter((w): w is [number, number] => w[0] !== null);
  const totalWeight = available.reduce((sum, [, w]) => sum + w, 0);
  const totalScore = available.reduce((sum, [s, w]) => sum + s * w, 0) / totalWeight;

  return {
    totalScore: Math.round(totalScore),
    grade: gradeFromScore(totalScore),
    breakdown,
  };
}
