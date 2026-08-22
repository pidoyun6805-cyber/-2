// 두 좌표 사이의 대권거리(km)를 Haversine 공식으로 계산.
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 지구 평균 반지름(km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// 출발지가 지금은 부산 김해공항(PUS) 하나로 고정돼 있음 (app/page.tsx 출발지 필드 참고).
// 출발지가 여러 곳이 되면 이 상수를 목적지별 설정으로 옮겨야 한다.
export const ORIGIN_AIRPORT = {
  code: "PUS",
  lat: 35.1795,
  lon: 128.9382,
};
