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
  후쿠오카: {
    label: "후쿠오카 (일본)",
    flightRouteKey: "PUS-FUK",
    lat: 33.5904,
    lon: 130.4017,
    currency: "JPY",
  },
  도쿄: {
    label: "도쿄 (일본)",
    flightRouteKey: "PUS-NRT",
    lat: 35.6762,
    lon: 139.6503,
    currency: "JPY",
  },
  삿포로: {
    label: "삿포로 (일본)",
    flightRouteKey: "PUS-CTS",
    lat: 43.0618,
    lon: 141.3545,
    currency: "JPY",
  },
  오키나와: {
    label: "오키나와 (일본)",
    flightRouteKey: "PUS-OKA",
    lat: 26.2124,
    lon: 127.6809,
    currency: "JPY",
  },
  타이베이: {
    label: "타이베이 (대만)",
    flightRouteKey: "PUS-TPE",
    lat: 25.033,
    lon: 121.5654,
    currency: "TWD",
  },
  홍콩: {
    label: "홍콩",
    flightRouteKey: "PUS-HKG",
    lat: 22.3193,
    lon: 114.1694,
    currency: "HKD",
  },
  칭다오: {
    label: "칭다오 (중국)",
    flightRouteKey: "PUS-TAO",
    lat: 36.0671,
    lon: 120.3826,
    currency: "CNY",
  },
  다낭: {
    label: "다낭 (베트남)",
    flightRouteKey: "PUS-DAD",
    lat: 16.0544,
    lon: 108.2022,
    currency: "VND",
  },
  세부: {
    label: "세부 (필리핀)",
    flightRouteKey: "PUS-CEB",
    lat: 10.3157,
    lon: 123.8854,
    currency: "PHP",
  },
  방콕: {
    label: "방콕 (태국)",
    flightRouteKey: "PUS-BKK",
    lat: 13.7563,
    lon: 100.5018,
    currency: "THB",
  },
  마닐라: {
    label: "마닐라 (필리핀)",
    flightRouteKey: "PUS-MNL",
    lat: 14.5995,
    lon: 120.9842,
    currency: "PHP",
  },
};
