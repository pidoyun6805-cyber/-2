import type { Grade } from "./scoring";
import { DESTINATIONS, type DestinationConfig } from "./destinations.ts";
import { calcTravelIndex, getFlightPriceScore, exchangeRateScore, type RoutePriceSample, type TravelIndexResult } from "./scoring.ts";
import { lookupPeakCategory } from "./peakSeason.ts";
import { getPeriodClimate, getExchangeRateHistory } from "./externalApi.ts";
import { getAllRoutes } from "./routes.ts";
import { kvFlightHistoryStore } from "./kvFlightHistoryStore.ts";
import { getHistoricalPricesNearDate, type FlightPriceRecord } from "./flightHistory.ts";
import { deriveTopChips, type TopChip } from "./topChips.ts";
import { buildPeakSeasonYearCurve, findCurveIndexForDate, type PeakSeasonCurvePoint } from "./peakSeasonCurve.ts";
import { getPeriodClimateDaily, getClimateBaseline10y, type ClimateDayDetail } from "./climateDetail.ts";
import hotels from "../data/hotels.json" with { type: "json" };
import flights from "../data/flights.json" with { type: "json" };

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

export function nightsBetween(departDate: string, returnDate: string): number {
  const ms = new Date(returnDate).getTime() - new Date(departDate).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
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

// ---- Part B: 17개 목적지 배치 오케스트레이션 ----

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
): Promise<{ result: DestinationResult; rankingScore: number }> {
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
      return { window, travelIndex, flightScore, peakCategory, climateDays };
    })
  );

  const best = evaluated.reduce((a, b) => (b.travelIndex.totalScore > a.travelIndex.totalScore ? b : a));

  // 순위용 점수: best와 동일한 4개 실측 입력(flightScore/hotelDeviationPct/peakCategory/climateDays)에
  // exchangeRateScore만 강제로 null로 넣어 재계산한다. Frankfurter가 TWD/VND(타이베이/다낭)를 지원하지
  // 않아 이 두 목적지만 항상 exchangeRateScore=null이 되고, calcTravelIndex가 그만큼 가중치를 나머지
  // 요소로 재분배해 구조적으로 유리해지는 문제를 막기 위해 — 모든 목적지에 동일하게 환율을 제외한
  // 점수로만 순위를 매긴다. 화면에 표시되는 실제 totalScore/grade/breakdown은 그대로 실측값을 쓴다.
  const rankingTravelIndex = calcTravelIndex({
    flightScore: best.flightScore,
    hotelDeviationPct,
    exchangeRateScore: null,
    peakCategory: best.peakCategory,
    climateDays: best.climateDays,
  });

  const [climateDaily, climateBaseline10y] = await Promise.all([
    getPeriodClimateDaily(destination.lat, destination.lon, best.window.departDate, best.window.returnDate),
    getClimateBaseline10y(destination.lat, destination.lon, best.window.departDate, best.window.returnDate),
  ]);

  const sortedHistory = [...routeHistory].sort((a, b) => a.date.localeCompare(b.date));

  return {
    result: {
      destinationKey,
      label: destination.label,
      totalScore: best.travelIndex.totalScore,
      grade: best.travelIndex.grade,
      band: bandFromGrade(best.travelIndex.grade),
      departDate: best.window.departDate,
      returnDate: best.window.returnDate,
      // 배치 후보 구간은 항상 2박이지만, 검색 패널은 임의 날짜를 넣으므로 구간에서 직접 계산한다.
      nights: nightsBetween(best.window.departDate, best.window.returnDate),
      breakdown: best.travelIndex.breakdown,
      topChips: deriveTopChips(best.travelIndex.breakdown),
      climateDaily,
      climateBaseline10y,
      flightPriceHistory30d: sortedHistory.slice(-30),
      exchangeRateSeries: exchangeRateHistory,
      peakMarkerIndex: findCurveIndexForDate(peakSeasonYearCurve, best.window.departDate),
    },
    rankingScore: rankingTravelIndex.totalScore,
  };
}

// 17개 목적지 전체를 배치로 계산한다. 하루 1번 크론에서만 호출 — 무거운 연산(약 85회 외부 API 호출).
// 목적지 하나가 실패해도(예: 환율 미지원 통화) 전체가 죽지 않도록 destination별로 격리하지는 않는다 —
// 이미 destination 내부의 각 외부 호출이 자체적으로 null/폴백 처리를 하므로(exchangeRateHistory.catch 등),
// Promise.all 레벨에서 흡수할 예외는 남아있지 않다는 전제(계획 리뷰에서 이 전제를 검증할 것).
// 검색 패널용 — 사용자가 지정한 단일 구간으로 DestinationResult를 만든다.
// 후보 구간을 1개만 넘겨 computeOneDestination을 그대로 재사용하므로, 배치 크론과
// 완전히 같은 계산 경로를 탄다(한쪽만 고쳐지는 사고가 안 난다).
export async function computeResultForWindow(
  destinationKey: string,
  departDate: string,
  returnDate: string
): Promise<{ result: DestinationResult; peakSeasonYearCurve: PeakSeasonCurvePoint[] }> {
  const destination = DESTINATIONS[destinationKey];
  if (!destination) throw new Error(`지원하지 않는 목적지: ${destinationKey}`);

  const peakSeasonYearCurve = buildPeakSeasonYearCurve();
  const { result } = await computeOneDestination(destinationKey, destination, [{ departDate, returnDate }], peakSeasonYearCurve);
  return { result, peakSeasonYearCurve };
}

export async function computeAllDestinationResults(): Promise<TopDestinationsPayload> {
  const peakSeasonYearCurve = buildPeakSeasonYearCurve();
  const windows = candidateWindows();

  const computed = await Promise.all(
    Object.entries(DESTINATIONS).map(([destinationKey, destination]) =>
      computeOneDestination(destinationKey, destination, windows, peakSeasonYearCurve)
    )
  );

  // 정렬은 환율을 제외한 rankingScore로 하고(위 computeOneDestination 설명 참고), 반환하는 결과에는
  // 실측 totalScore가 담긴 DestinationResult만 노출한다 — rankingScore는 정렬 전용 내부 값이라 버린다.
  computed.sort((a, b) => b.rankingScore - a.rankingScore);
  const results = computed.map((c) => c.result);

  return { computedAt: new Date().toISOString(), results, peakSeasonYearCurve };
}
