// 노선의 "오늘 항공권 가격"을 가져오는 함수 타입.
// 다른 소스로 교체할 때는 이 시그니처(routeKey -> Promise<number>)만 지키면
// collectFlightPrices.ts 쪽 코드는 건드릴 필요가 없다.
export type FlightPriceSource = (routeKey: string) => Promise<number>;

interface TravelpayoutsPriceEntry {
  origin: string;
  destination: string;
  depart_date: string;
  value: number;
  number_of_changes: number;
  distance: number;
  actual: boolean;
}

interface TravelpayoutsResponse {
  success: boolean;
  data: TravelpayoutsPriceEntry[];
}

const TRAVELPAYOUTS_LATEST_PRICES_URL = "https://api.travelpayouts.com/v2/prices/latest";

// Travelpayouts Data API에서 출발지/도착지 사이의 최신 가격들을 조회한다.
// origin/destination은 IATA 코드. 재사용 가능하도록 노선(routeKey)과 분리해뒀다 —
// 노선이 늘어나도 이 함수는 그대로 두고 호출하는 쪽에서 코드만 바꿔주면 된다.
export async function fetchTravelpayoutsLatestPrices(
  origin: string,
  destination: string
): Promise<TravelpayoutsPriceEntry[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) {
    throw new Error("TRAVELPAYOUTS_API_TOKEN 환경변수가 설정되어 있지 않습니다.");
  }

  const url = new URL(TRAVELPAYOUTS_LATEST_PRICES_URL);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("currency", "krw");
  url.searchParams.set("limit", "30");

  const res = await fetch(url, {
    headers: { "x-access-token": token },
  });

  if (!res.ok) {
    throw new Error(`Travelpayouts API 요청 실패 (${res.status}): ${origin}->${destination}`);
  }

  const json = (await res.json()) as TravelpayoutsResponse;
  if (!json.success) {
    throw new Error(`Travelpayouts API가 실패 응답을 줌: ${origin}->${destination}`);
  }

  return json.data ?? [];
}

// data 배열(여러 날짜의 가격)에서 오늘 이후 날짜 중 제일 빠른 것을 대표 가격으로 고른다.
// flights.json이 특정 여행일이 아니라 "노선의 지금 시세" 하나만 다루던 것과 같은 맥락 —
// 가장 가까운 미래 날짜 가격을 "지금 시세"로 취급한다. 미래 날짜가 하나도 없으면(전부 과거)
// 가장 최근 날짜 것을 쓴다.
function pickRepresentativePrice(entries: TravelpayoutsPriceEntry[]): number {
  if (entries.length === 0) {
    throw new Error("가격 데이터가 비어 있습니다.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...entries].sort((a, b) => a.depart_date.localeCompare(b.depart_date));
  const upcoming = sorted.find((e) => e.depart_date >= today);

  return (upcoming ?? sorted[sorted.length - 1]).value;
}

function parseRouteKey(routeKey: string): { origin: string; destination: string } {
  const [origin, destination] = routeKey.split("-");
  if (!origin || !destination) {
    throw new Error(`잘못된 routeKey 형식: ${routeKey}`);
  }
  return { origin, destination };
}

// routeKey(예: "PUS-KIX")를 출발/도착 공항코드로 쪼개서 Travelpayouts에서 대표 가격을 가져온다.
// origin/destination에 공항코드(ICN/KIX)와 도시코드(SEL/OSA) 중 뭘 써야 실제로 데이터가 오는지는
// 토큰으로 직접 호출해봐야 확인 가능 — 지금은 destinations.ts에 이미 있는 공항코드를 그대로 쓴다.
// 만약 특정 노선에서 데이터가 안 온다면 이 함수 안에서 도시코드로 바꿔보는 것부터 시도할 것.
export const getPriceFromTravelpayouts: FlightPriceSource = async (routeKey) => {
  const { origin, destination } = parseRouteKey(routeKey);
  const entries = await fetchTravelpayoutsLatestPrices(origin, destination);
  return pickRepresentativePrice(entries);
};
