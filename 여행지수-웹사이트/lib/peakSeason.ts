import peakSeasonData from "../data/peakSeason.json" with { type: "json" };
import type { PeakCategory } from "./scoring";

const CATEGORY_RANK: Record<PeakCategory, number> = {
  off: 0,
  shoulder: 1,
  peak: 2,
  super_peak: 3,
};

function inRange(month: number, day: number, entry: (typeof peakSeasonData)[number]): boolean {
  const value = month * 100 + day;
  const start = entry.startMonth * 100 + entry.startDay;
  const end = entry.endMonth * 100 + entry.endDay;
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end; // 연말-연초 넘어가는 구간 대비
}

export function lookupPeakCategory(month: number, day: number): PeakCategory {
  let best: PeakCategory = "off";
  for (const entry of peakSeasonData) {
    if (inRange(month, day, entry) && CATEGORY_RANK[entry.category as PeakCategory] > CATEGORY_RANK[best]) {
      best = entry.category as PeakCategory;
    }
  }
  return best;
}
