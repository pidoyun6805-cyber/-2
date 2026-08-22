import { NextRequest, NextResponse } from "next/server";
import { calcTravelIndex } from "@/lib/scoring";
import { calcTotalCost } from "@/lib/cost";
import { DESTINATIONS } from "@/lib/destinations";
import { lookupPeakCategory } from "@/lib/peakSeason";
import { getExchangeFavorability, getSeasonalWeather } from "@/lib/externalApi";
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

  const [exchangeFavorableDeviationPct, seasonalWeather] = await Promise.all([
    getExchangeFavorability(destination.currency),
    getSeasonalWeather(destination.lat, destination.lon, month, day),
  ]);

  const flightDeviationPct = (flight.currentPrice - flight.avgPrice) / flight.avgPrice;
  const hotelDeviationPct = (hotel.currentPrice - hotel.avgPrice) / hotel.avgPrice;
  const peakCategory = lookupPeakCategory(month, day);

  const travelIndex = calcTravelIndex({
    flightDeviationPct,
    hotelDeviationPct,
    exchangeFavorableDeviationPct,
    peakCategory,
    weatherCondition: seasonalWeather.condition,
    month,
    avgTempC: seasonalWeather.avgTempC,
  });

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
  });
}
