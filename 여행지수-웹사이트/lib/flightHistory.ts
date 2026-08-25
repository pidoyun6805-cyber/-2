export interface FlightPriceRecord {
  date: string; // YYYY-MM-DD, 이 가격을 조사한 날짜
  price: number;
  // 이 값의 출처. 예전 이력에는 고정 추정치(flights.json)가 섞여 들어가 그래프가 거짓말을 했다.
  // 앞으로는 실데이터만 쌓지만, 나중에 또 감사하지 않아도 되도록 출처를 남긴다.
  // 필드가 없는 레코드는 출처 불명(오염 가능성 있음)으로 취급한다.
  source?: "api" | "fallback";
}

// 같은 날짜 기록이 이미 있으면 덮어쓰고, 없으면 뒤에 붙인 뒤 날짜순으로 정렬한다.
// 예전 수집기가 무조건 append해서 같은 날짜가 노선당 2~4번씩 중복 저장됐고,
// 그 탓에 "최근 N일 평균"의 N과 평균값이 둘 다 틀어졌다.
export function upsertRecord(records: FlightPriceRecord[], record: FlightPriceRecord): FlightPriceRecord[] {
  const rest = records.filter((r) => r.date !== record.date);
  return [...rest, record].sort((a, b) => a.date.localeCompare(b.date));
}

// 그래프/문구가 쓰는 "며칠치"의 기준. 항목 수가 아니라 고유 날짜 수를 세야 한다.
export function countDistinctDates(records: FlightPriceRecord[]): number {
  return new Set(records.map((r) => r.date)).size;
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
