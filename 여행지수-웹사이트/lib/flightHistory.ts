export interface FlightPriceRecord {
  date: string; // YYYY-MM-DD, 이 가격을 조사한 날짜
  price: number;
}

// route(출발지+도착지 조합)의 과거 가격 중, 대상 날짜와 월-일 기준(연도 무관) ±windowDays 이내인
// 것만 가격 배열로 반환. 데이터가 아직 없으면 빈 배열.
export function getHistoricalPricesNearDate(
  records: FlightPriceRecord[] | null | undefined,
  targetDate: string,
  windowDays = 14
): number[] {
  if (!records || records.length === 0) return [];

  const target = dayOfYear(targetDate);

  return records
    .filter((record) => circularDayDistance(dayOfYear(record.date), target) <= windowDays)
    .map((record) => record.price);
}

function dayOfYear(dateStr: string): number {
  const d = new Date(dateStr);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / (1000 * 60 * 60 * 24));
}

// 연말/연초를 넘나드는 경우(예: 12월 29일과 1월 3일)도 가깝게 취급하기 위한 순환 거리.
function circularDayDistance(a: number, b: number, yearLength = 365): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, yearLength - diff);
}
