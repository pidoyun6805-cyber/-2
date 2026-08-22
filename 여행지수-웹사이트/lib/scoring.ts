// 여행지수 점수 계산 로직
// 가중치와 등급 구간은 원본 스킬(.claude/skills/여행지수/SKILL.md)에서 그대로 이식, 변경 금지.
// 각 요소의 0~100 환산 기준 중 "조정 가능"이라고 표시된 항목은 임시 기본값이므로
// 숫자만 바꾸면 됨 (사용자 피드백 받아 조정 예정).

export const WEIGHTS = {
  flight: 0.2,
  peakSeason: 0.2,
  exchangeRate: 0.2,
  weather: 0.15,
  temperature: 0.15,
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

// 환율: 최근 6개월 평균 대비 원화 강세(%). 양수 = 여행자에게 유리.
// 조정 가능한 기본값: 유리+5%=100, 평균=60, 불리-5%=40, 불리-10%=20
const EXCHANGE_RATE_POINTS: [number, number][] = [
  [-0.1, 20],
  [-0.05, 40],
  [0, 60],
  [0.05, 100],
];

export function scoreExchangeRate(favorableDeviationPct: number): number {
  return interpolate(EXCHANGE_RATE_POINTS, favorableDeviationPct);
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

// 날씨(하늘 상태): 사용자 확정값
export type WeatherCondition = "clear" | "cloudy" | "rain" | "snow";

const WEATHER_SCORES: Record<WeatherCondition, number> = {
  clear: 100,
  cloudy: 75,
  rain: 20,
  snow: 35,
};

export function scoreWeatherCondition(condition: WeatherCondition): number {
  return WEATHER_SCORES[condition];
}

// 기온: 특정 온도(℃) 하나를 0~100점으로 채점 (사용자 확정값).
// 12~23도가 만점. 더운 쪽은 33.54도, 추운 쪽은 -12도에서 0점이 되도록 구간별로 점점 가파르게 감점.
// 온도가 없거나(null/undefined) 숫자가 아니면(NaN/Infinity) 채점 불가로 보고 null을 반환한다.
export function temperatureScore(temp: number | null | undefined): number | null {
  if (temp === null || temp === undefined || !Number.isFinite(temp)) return null;

  if (temp >= 12 && temp <= 23) return 100;

  if (temp > 23 && temp <= 25) return 100 - 5 * (temp - 23);
  if (temp > 25 && temp <= 28) return 90 - 8 * (temp - 25);
  if (temp > 28 && temp <= 31) return 66 - 11 * (temp - 28);
  if (temp > 31 && temp <= 33.54) return Math.max(0, 33 - 13 * (temp - 31));
  if (temp > 33.54) return 0;

  if (temp < 12 && temp >= -3) return 100 - ((12 - temp) / (12 - -3)) * 60;
  if (temp < -3 && temp >= -12) return 40 - ((-3 - temp) / (-3 - -12)) * 40;
  return 0; // -12도 미만
}

// 하루치 기온 점수: 낮 기온 70% + 밤 기온 30% 가중평균.
// 한쪽 값만 없으면 있는 값만으로 채점하고, 둘 다 없으면 그날은 채점 불가(null)로 본다.
export function dailyTemperatureScore(
  dayTemp: number | null | undefined,
  nightTemp: number | null | undefined
): number | null {
  const dayScore = temperatureScore(dayTemp);
  const nightScore = temperatureScore(nightTemp);

  if (dayScore === null && nightScore === null) return null;
  if (dayScore === null) return nightScore;
  if (nightScore === null) return dayScore;
  return dayScore * 0.7 + nightScore * 0.3;
}

export interface DayTemperature {
  day: number | null | undefined;
  night: number | null | undefined;
}

// 여행 기간 전체의 기온 점수: 날짜별 점수를 평균. 채점 불가한 날짜는 평균에서 제외.
// days가 비어 있거나 모든 날짜가 채점 불가면, 상위 시스템(외부 날씨 API 호출부)이
// 잘못된 입력을 넘긴 것이므로 조용히 기본값을 만들어내지 않고 에러를 던진다.
export function periodTemperatureScore(days: DayTemperature[]): number {
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error("periodTemperatureScore: days 배열이 비어 있습니다.");
  }

  const scores = days
    .map((d) => dailyTemperatureScore(d.day, d.night))
    .filter((s): s is number => s !== null);

  if (scores.length === 0) {
    throw new Error("periodTemperatureScore: 유효한 기온 데이터가 하나도 없습니다.");
  }

  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

export interface TravelIndexInputs {
  flightScore: number | null; // getFlightPriceScore()로 미리 계산해서 넘긴다
  hotelDeviationPct: number;
  exchangeFavorableDeviationPct: number;
  peakCategory: PeakCategory;
  weatherCondition: WeatherCondition;
  temperatureDays: DayTemperature[];
}

export interface TravelIndexResult {
  totalScore: number;
  grade: Grade;
  breakdown: {
    flight: number | null;
    hotel: number;
    exchangeRate: number;
    peakSeason: number;
    weather: number;
    temperature: number;
  };
}

export function calcTravelIndex(inputs: TravelIndexInputs): TravelIndexResult {
  const breakdown = {
    flight: inputs.flightScore,
    hotel: scoreHotelPrice(inputs.hotelDeviationPct),
    exchangeRate: scoreExchangeRate(inputs.exchangeFavorableDeviationPct),
    peakSeason: scorePeakSeason(inputs.peakCategory),
    weather: scoreWeatherCondition(inputs.weatherCondition),
    temperature: periodTemperatureScore(inputs.temperatureDays),
  };

  // 항공권처럼 채점 불가(null)한 요소는 총점 계산에서 제외하고, 남은 요소끼리 가중치를 재분배한다.
  const weighted: [number | null, number][] = [
    [breakdown.flight, WEIGHTS.flight],
    [breakdown.hotel, WEIGHTS.hotel],
    [breakdown.exchangeRate, WEIGHTS.exchangeRate],
    [breakdown.peakSeason, WEIGHTS.peakSeason],
    [breakdown.weather, WEIGHTS.weather],
    [breakdown.temperature, WEIGHTS.temperature],
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
