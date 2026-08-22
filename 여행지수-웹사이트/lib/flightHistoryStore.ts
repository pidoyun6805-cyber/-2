import type { FlightPriceRecord } from "./flightHistory";

// 노선별 가격 이력 저장소 인터페이스. 실제 구현(Upstash Redis)과 테스트용 구현을 갈아끼울 수 있게 분리.
export interface FlightHistoryStore {
  get(routeKey: string): Promise<FlightPriceRecord[]>;
  set(routeKey: string, records: FlightPriceRecord[]): Promise<void>;
}
