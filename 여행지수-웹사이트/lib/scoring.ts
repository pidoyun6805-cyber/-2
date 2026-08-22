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

// 항공권 가격: 최근 평균가 대비 편차(%). 예: -0.3 = 30% 더 저렴.
// 사용자 확정값: -30%=100, -15%=80, 0%=60, +20%=40, +40%=20 (양끝 saturate)
const PRICE_DEVIATION_POINTS: [number, number][] = [
  [-0.3, 100],
  [-0.15, 80],
  [0, 60],
  [0.2, 40],
  [0.4, 20],
];

export function scoreFlightPrice(deviationPct: number): number {
  return interpolate(PRICE_DEVIATION_POINTS, deviationPct);
}

// 호텔 가격: 항공권과 동일한 상대평가 구간 재사용 (조정 가능한 기본값)
export function scoreHotelPrice(deviationPct: number): number {
  return interpolate(PRICE_DEVIATION_POINTS, deviationPct);
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

// 기온: 봄(3~5월)/가을(9~11월)=100 고정 (사용자 확정)
// 여름(6~8월): 28도 이하=100, 28~40도 선형 감소, 40도 이상=0 (사용자 확정)
// 겨울(12~2월): 5도 이상=100, 5~-10도 선형 감소, -10도 이하=0 (조정 가능한 기본값, 여름과 대칭 형태로 임시 설정)
const SUMMER_TEMP_POINTS: [number, number][] = [
  [28, 100],
  [40, 0],
];

const WINTER_TEMP_POINTS: [number, number][] = [
  [-10, 0],
  [5, 100],
];

export function scoreTemperature(month: number, avgTempC: number): number {
  const isSpringOrFall = [3, 4, 5, 9, 10, 11].includes(month);
  if (isSpringOrFall) return 100;

  const isSummer = [6, 7, 8].includes(month);
  if (isSummer) return interpolate(SUMMER_TEMP_POINTS, avgTempC);

  // 겨울 (12, 1, 2)
  return interpolate(WINTER_TEMP_POINTS, avgTempC);
}

export interface TravelIndexInputs {
  flightDeviationPct: number;
  hotelDeviationPct: number;
  exchangeFavorableDeviationPct: number;
  peakCategory: PeakCategory;
  weatherCondition: WeatherCondition;
  month: number;
  avgTempC: number;
}

export interface TravelIndexResult {
  totalScore: number;
  grade: Grade;
  breakdown: {
    flight: number;
    hotel: number;
    exchangeRate: number;
    peakSeason: number;
    weather: number;
    temperature: number;
  };
}

export function calcTravelIndex(inputs: TravelIndexInputs): TravelIndexResult {
  const breakdown = {
    flight: scoreFlightPrice(inputs.flightDeviationPct),
    hotel: scoreHotelPrice(inputs.hotelDeviationPct),
    exchangeRate: scoreExchangeRate(inputs.exchangeFavorableDeviationPct),
    peakSeason: scorePeakSeason(inputs.peakCategory),
    weather: scoreWeatherCondition(inputs.weatherCondition),
    temperature: scoreTemperature(inputs.month, inputs.avgTempC),
  };

  const totalScore =
    breakdown.flight * WEIGHTS.flight +
    breakdown.hotel * WEIGHTS.hotel +
    breakdown.exchangeRate * WEIGHTS.exchangeRate +
    breakdown.peakSeason * WEIGHTS.peakSeason +
    breakdown.weather * WEIGHTS.weather +
    breakdown.temperature * WEIGHTS.temperature;

  return {
    totalScore: Math.round(totalScore),
    grade: gradeFromScore(totalScore),
    breakdown,
  };
}
