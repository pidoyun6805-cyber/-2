import { NextRequest, NextResponse } from "next/server";
import { calcTravelIndex, getFlightPriceScore, exchangeRateScore, type RoutePriceSample } from "@/lib/scoring";
import { calcTotalCost } from "@/lib/cost";
import { DESTINATIONS } from "@/lib/destinations";
import { lookupPeakCategory } from "@/lib/peakSeason";
import { getExchangeRateHistory, getSeasonalWeather, getPeriodClimate } from "@/lib/externalApi";
import { getHistoricalPricesNearDate } from "@/lib/flightHistory";
import { getAllRoutes } from "@/lib/routes";
import { computeResultForWindow } from "@/lib/topDestination";
import { kvFlightHistoryStore } from "@/lib/kvFlightHistoryStore";
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

  // 검색 결과에도 지수 카드 5개를 그려야 하는데, 카드는 그래프용 상세 데이터
  // (일자별 기후/항공권 이력/환율 시계열/성수기 마커)를 필요로 한다. 배치 크론과 같은
  // 계산 경로(computeOneDestination)를 재사용해서 두 벌이 어긋나지 않게 한다.
  const { result: cardResult, peakSeasonYearCurve } = await computeResultForWindow(destinationKey, departDate, returnDate);

  const totalCost = calcTotalCost({
    flightPricePerPerson: flight.currentPrice,
    hotelPricePerNight: hotel.currentPrice,
    nights,
    people,
    dailyCost,
  });

  return NextResponse.json({
    travelIndex,
    totalCost,
    nights,
    peakCategory,
    seasonalWeather,
    // 지수 카드 5개를 검색 결과로도 그리기 위한 상세 데이터
    result: cardResult,
    peakSeasonYearCurve,
  });
}
