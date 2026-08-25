import { NextRequest, NextResponse } from "next/server";
import { calcTotalCost } from "@/lib/cost";
import { DESTINATIONS } from "@/lib/destinations";
import { lookupPeakCategory } from "@/lib/peakSeason";
import { getSeasonalWeather } from "@/lib/externalApi";
import { computeResultForWindow, nightsBetween } from "@/lib/topDestination";
import { latestApiPrice } from "@/lib/currentFlightPrice";
import { kvFlightHistoryStore } from "@/lib/kvFlightHistoryStore";
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

  const hotel = (hotels as Record<string, { avgPrice: number; currentPrice: number }>)[destinationKey];
  const dailyCost = (dailyCosts as Record<string, { food: number; localTransport: number; misc: number }>)[destinationKey];
  if (!hotel || !dailyCost) {
    return NextResponse.json({ error: "해당 목적지의 가격 데이터가 아직 없습니다." }, { status: 400 });
  }

  const nights = nightsBetween(departDate, returnDate);
  const depart = new Date(departDate);

  // 여행지수는 배치 크론과 똑같은 함수로 계산한다. 예전엔 이 라우트가 항공권 점수를 따로
  // 계산해서 경로가 갈라져 있었다 — 한쪽만 고치면 두 화면이 다른 값을 보여주게 된다.
  const [{ result, peakSeasonYearCurve }, seasonalWeather, routeHistory] = await Promise.all([
    computeResultForWindow(destinationKey, departDate, returnDate),
    getSeasonalWeather(destination.lat, destination.lon, depart.getMonth() + 1, depart.getDate()),
    kvFlightHistoryStore.get(destination.flightRouteKey),
  ]);

  // 총경비는 항공권 실가격이 있어야 계산할 수 있다. 고정 추정치로 메우지 않고,
  // 값이 없으면 null로 돌려 화면이 "정보 없음"으로 표시하게 한다.
  const flightPrice = latestApiPrice(routeHistory);
  const totalCost =
    flightPrice === null
      ? null
      : calcTotalCost({
          flightPricePerPerson: flightPrice,
          hotelPricePerNight: hotel.currentPrice,
          nights,
          people,
          dailyCost,
        });

  return NextResponse.json({
    travelIndex: { totalScore: result.totalScore, grade: result.grade, breakdown: result.breakdown },
    totalCost,
    nights,
    peakCategory: lookupPeakCategory(depart.getMonth() + 1, depart.getDate()),
    seasonalWeather,
    result,
    peakSeasonYearCurve,
  });
}
