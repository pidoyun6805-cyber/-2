export interface ScoreBreakdown {
  flight: number | null;
  hotel: number | null;
  exchangeRate: number | null;
  peakSeason: number | null;
  climateComfort: number | null;
}

export interface TopChip {
  key: keyof ScoreBreakdown;
  label: string;
}

const CHIP_LABELS: Record<keyof ScoreBreakdown, string> = {
  flight: "항공권 좋음",
  hotel: "숙박 저렴",
  exchangeRate: "환율 유리",
  peakSeason: "성수기 한산",
  climateComfort: "기후 쾌적",
};

const KEY_ORDER: (keyof ScoreBreakdown)[] = ["flight", "hotel", "exchangeRate", "peakSeason", "climateComfort"];

// breakdown 중 null이 아닌 값을 점수 내림차순(동점이면 KEY_ORDER 순서)으로 정렬해 상위 2개를 칩으로 뽑는다.
// 유효한 값이 2개 미만이면 있는 만큼만 반환한다(억지로 채우지 않음).
export function deriveTopChips(breakdown: ScoreBreakdown): TopChip[] {
  const entries = KEY_ORDER
    .map((key) => [key, breakdown[key]] as const)
    .filter((e): e is [keyof ScoreBreakdown, number] => e[1] !== null)
    .sort((a, b) => b[1] - a[1]);

  return entries.slice(0, 2).map(([key]) => ({ key, label: CHIP_LABELS[key] }));
}
