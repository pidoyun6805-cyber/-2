// 노선의 "오늘 항공권 가격"을 가져오는 함수 타입.
// 데이터를 못 받으면 null을 돌려준다 — 예전엔 던졌지만, 호출하는 쪽이 실패와 "데이터 없음"을
// 구분해서 이력에 아무것도 쌓지 않도록 하려면 null이 명시적이다.
export type FlightPriceSource = (routeKey: string) => Promise<number | null>;

interface PricesForDatesEntry {
  origin: string;
  destination: string;
  price: number;
  departure_at: string;
  transfers: number;
}

interface PricesForDatesResponse {
  success: boolean;
  data?: PricesForDatesEntry[];
  error?: string | null;
}

// 문서: https://support.travelpayouts.com/hc/en-us/articles/203956163-Aviasales-Data-API
// "Flight tickets for specific dates". 예전에 쓰던 /v2/prices/latest는 공식 deprecated이고
// 문서가 이 엔드포인트로 교체를 권고한다. rate limit은 분당 600건(문서 "API rate limits").
const PRICES_FOR_DATES_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

export async function fetchAviasalesPrices(origin: string, destination: string): Promise<PricesForDatesEntry[]> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) {
    throw new Error("TRAVELPAYOUTS_API_TOKEN 환경변수가 설정되어 있지 않습니다.");
  }

  const url = new URL(PRICES_FOR_DATES_URL);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("currency", "krw");
  url.searchParams.set("one_way", "true");
  url.searchParams.set("sorting", "price");
  url.searchParams.set("limit", "30");
  // market을 지정하지 않으면 ru로 떨어진다(문서). 부산 출발이라 kr 캐시를 쓴다.
  url.searchParams.set("market", "kr");

  const res = await fetch(url, { headers: { "X-Access-Token": token } });
  if (!res.ok) {
    throw new Error(`Aviasales API 요청 실패 (${res.status}): ${origin}->${destination}`);
  }

  const json = (await res.json()) as PricesForDatesResponse;
  if (!json.success) {
    throw new Error(`Aviasales API 실패 응답: ${origin}->${destination} ${json.error ?? ""}`);
  }

  return json.data ?? [];
}

function parseRouteKey(routeKey: string): { origin: string; destination: string } {
  const [origin, destination] = routeKey.split("-");
  if (!origin || !destination) {
    throw new Error(`잘못된 routeKey 형식: ${routeKey}`);
  }
  return { origin, destination };
}

// 노선의 "지금 시세" 하나를 고른다. sorting=price로 받았으므로 최저가가 대표값이다.
// 캐시에 이 노선 검색 이력이 없으면 data가 빈 배열로 오는데(괌·사이판이 실제로 그렇다),
// 그건 에러가 아니라 "데이터 없음"이므로 null을 돌려준다.
export const getPriceFromTravelpayouts: FlightPriceSource = async (routeKey) => {
  const { origin, destination } = parseRouteKey(routeKey);
  const entries = await fetchAviasalesPrices(origin, destination);
  if (entries.length === 0) return null;
  return Math.min(...entries.map((e) => e.price));
};
