// 지원 목적지 목록. 새 도시를 추가하려면 여기에 좌표/통화 등록 + data/*.json에 가격 데이터 추가.
export interface DestinationConfig {
  label: string;
  flightRouteKey: string;
  lat: number;
  lon: number;
  currency: string;
}

export const DESTINATIONS: Record<string, DestinationConfig> = {
  오사카: {
    label: "오사카 (일본)",
    flightRouteKey: "PUS-KIX",
    lat: 34.6937,
    lon: 135.5023,
    currency: "JPY",
  },
};
