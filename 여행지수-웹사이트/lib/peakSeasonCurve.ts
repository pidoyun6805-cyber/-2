import { lookupPeakCategory } from "./peakSeason.ts";
import { scorePeakSeason } from "./scoring.ts";

export interface PeakSeasonCurvePoint {
  date: string; // YYYY-MM-DD
  score: number;
}

// 올해(또는 지정한 연도) 1/1~12/31 전체를 성수기 공식으로 순회해 곡선을 만든다.
// 목적지와 무관하게 동일한 곡선 — 성수기 공식은 달력 기준일 뿐 위치를 안 쓴다. 배치당 1회만 계산.
export function buildPeakSeasonYearCurve(referenceYear: number = new Date().getFullYear()): PeakSeasonCurvePoint[] {
  const isLeap = (referenceYear % 4 === 0 && referenceYear % 100 !== 0) || referenceYear % 400 === 0;
  const dayCount = isLeap ? 366 : 365;
  const start = new Date(Date.UTC(referenceYear, 0, 1));

  const points: PeakSeasonCurvePoint[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const month = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    points.push({ date: d.toISOString().slice(0, 10), score: scorePeakSeason(lookupPeakCategory(month, day)) });
  }
  return points;
}

// 여행 날짜(dateStr)의 월-일이 곡선의 몇 번째 지점인지 찾는다(연도는 무시 — 곡선은 항상 한 연도 기준).
// 일치하는 지점이 없으면(있을 수 없지만 방어적으로) 0번째로 폴백.
export function findCurveIndexForDate(curve: PeakSeasonCurvePoint[], dateStr: string): number {
  const targetMonthDay = dateStr.slice(5, 10); // MM-DD
  const idx = curve.findIndex((p) => p.date.slice(5, 10) === targetMonthDay);
  return idx >= 0 ? idx : 0;
}
