import { NextRequest, NextResponse } from "next/server";
import { calcTravelIndex, getFlightPriceScore, exchangeRateScore, type RoutePriceSample } from "@/lib/scoring";
import { calcTotalCost } from "@/lib/cost";
import { DESTINATIONS } from "@/lib/destinations";
import { lookupPeakCategory } from "@/lib/peakSeason";
import { getExchangeRateHistory, getSeasonalWeather, getPeriodClimate } from "@/lib/externalApi";
import { getHistoricalPricesNearDate } from "@/lib/flightHistory";
import { getAllRoutes } from "@/lib/routes";
import { kvFlightHistoryStore } from "@/lib/kvFlightHistoryStore";
import {
  explainFlightPrice,
  explainExchangeRate,
  explainHotelPrice,
  explainPeakSeason,
  explainClimateComfort,
} from "@/lib/insights";
import flights from "@/data/flights.json";
import hotels from "@/data/hotels.json";
import dailyCosts from "@/data/dailyCost.json";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { destinationKey, departDate, returnDate, people } = body as {
    destinationKey: string;
    departDate: string;
    returnDate: string;
    people: number;
  };

  const destination = DESTINATIONS[destinationKey];
  if (!destination) {
    return NextResponse.json({ error: "지원하지 않는 목적지입니다." }, { status: 400 });
  }

  const flight = (flights as Record<string, { avgPrice: number; currentPrice: number }>)[
    destination.flightRouteKey
  ];
  const hotel = (hotels as Record<string, { avgPrice: number; currentPrice: number }>)[destinationKey];
  const dailyCost = (dailyCosts as Record<string, { food: number; localTransport: number; misc: number }>)[
    destinationKey
  ];

  if (!flight || !hotel || !dailyCost) {
    return NextResponse.json({ error: "해당 목적지의 가격 데이터가 아직 없습니다." }, { status: 400 });
  }

  const depart = new Date(departDate);
  const ret = new Date(returnDate);
  const nights = Math.max(1, Math.round((ret.getTime() - depart.getTime()) / (1000 * 60 * 60 * 24)));
  const month = depart.getMonth() + 1;
  const day = depart.getDate();

  // 환율 API(Frankfurter.app)가 목적지 통화를 지원하지 않는 경우(예: TWD, VND)
  // getExchangeRateHistory가 던지는데, 이것 때문에 여행지수 전체가 500으로 죽지 않도록
  // 여기서만 null로 눌러서 "환율 정보 없음"으로 처리한다.
  const [exchangeRateHistory, seasonalWeather, climateDays, routeHistory] = await Promise.all([
    getExchangeRateHistory(destination.currency).catch(() => null),
    getSeasonalWeather(destination.lat, destination.lon, month, day),
    getPeriodClimate(destination.lat, destination.lon, departDate, returnDate),
    kvFlightHistoryStore.get(destination.flightRouteKey),
  ]);

  const exchangeScore = exchangeRateHistory
    ? exchangeRateScore(exchangeRateHistory.currentRate, exchangeRateHistory.historicalRates)
    : null;

  const hotelDeviationPct = (hotel.currentPrice - hotel.avgPrice) / hotel.avgPrice;
  const peakCategory = lookupPeakCategory(month, day);

  const historicalPrices = getHistoricalPricesNearDate(routeHistory, departDate);

  const allRoutes = getAllRoutes();
  const currentRoute = allRoutes.find((r) => r.routeKey === destination.flightRouteKey);
  const flightsByRoute = flights as Record<string, { currentPrice: number }>;
  const allRoutePrices: RoutePriceSample[] = allRoutes
    .filter((r) => flightsByRoute[r.routeKey])
    .map((r) => ({ price: flightsByRoute[r.routeKey].currentPrice, distanceKm: r.distanceKm }));

  const flightScore = currentRoute
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

  const totalCost = calcTotalCost({
    flightPricePerPerson: flight.currentPrice,
    hotelPricePerNight: hotel.currentPrice,
    nights,
    people,
    dailyCost,
  });

  // 각 하위 지수 점수 옆에 보여줄 "왜 이 점수인지" 문장. 이미 위에서 계산한 실제 값
  // (baseline/편차/평균 등)을 그대로 넘겨서 만든다 — 고정 문구가 아니라 매 요청마다 재계산됨.
  const reasons = {
    flight: explainFlightPrice(flight.currentPrice, historicalPrices),
    hotel: explainHotelPrice(hotelDeviationPct),
    exchangeRate: exchangeRateHistory
      ? explainExchangeRate(exchangeRateHistory.currentRate, exchangeRateHistory.historicalRates)
      : null,
    peakSeason: explainPeakSeason(peakCategory),
    climateComfort: explainClimateComfort(climateDays, travelIndex.breakdown.climateComfort),
  };

  const exchangeRateDetail = exchangeRateHistory
    ? {
        currentRate: exchangeRateHistory.currentRate,
        baseline:
          exchangeRateHistory.historicalRates.reduce((a, b) => a + b, 0) /
          exchangeRateHistory.historicalRates.length,
      }
    : null;

  const cheapestFlightRecord =
    routeHistory.length > 0
      ? routeHistory.reduce((min, r) => (r.price < min.price ? r : min), routeHistory[0])
      : null;

  return NextResponse.json({
    travelIndex,
    totalCost,
    nights,
    peakCategory,
    seasonalWeather,
    reasons,
    exchangeRateDetail,
    flightPriceHistory: routeHistory,
    cheapestFlightRecord,
  });
}
