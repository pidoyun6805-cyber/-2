import { calculateBaseline, type PeakCategory, type ClimateDay } from "./scoring.ts";

// 각 하위 지수 점수가 "왜 이 점수인지"를 실제 계산값(baseline/z-score/평균 등)을 그대로
// 문장에 꽂아넣어 생성한다. 고정 문구가 아니라 매번 실제 숫자로 다시 계산됨.

// 항공권: getFlightPriceScore가 baseline(과거 평균) 방식을 쓸 때와 같은 계산식 재사용.
// baseline을 못 구하면(과거 데이터 5개 미만) 점수 자체가 null이 나오는 케이스와 맞춰 null.
export function explainFlightPrice(currentPrice: number, historicalPrices: number[]): string | null {
  const baseline = calculateBaseline(historicalPrices);
  if (baseline === null) return null;

  const pct = Math.round(((baseline - currentPrice) / baseline) * 100);
  if (pct > 0) return `최근 평균 대비 ${pct}% 저렴해요.`;
  if (pct < 0) return `최근 평균 대비 ${Math.abs(pct)}% 비싼 편이에요.`;
  return "최근 평균과 비슷한 가격이에요.";
}

// 환율: exchangeRateScore의 z-score 계산에 쓰이는 baseline(2년 평균)을 그대로 재사용해서
// "오늘 환율이 평균보다 몇 % 유리/불리한지"를 사람이 읽을 문장으로 바꾼다.
export function explainExchangeRate(currentRate: number, historicalRates: number[]): string | null {
  if (historicalRates.length < 2) return null;

  const baseline = historicalRates.reduce((a, b) => a + b, 0) / historicalRates.length;
  const pct = Math.round((((baseline - currentRate) / baseline) * 100) * 10) / 10;

  if (pct > 0) return `오늘 환율이 2년 평균보다 ${pct}% 낮아요(유리해요).`;
  if (pct < 0) return `오늘 환율이 2년 평균보다 ${Math.abs(pct)}% 높아요(불리해요).`;
  return "오늘 환율이 2년 평균과 거의 같아요.";
}

// 호텔: scoreHotelPrice에 넘기는 편차(deviationPct)를 그대로 문장으로.
export function explainHotelPrice(deviationPct: number): string {
  const pct = Math.round(deviationPct * 100);
  if (pct < 0) return `평소보다 ${Math.abs(pct)}% 저렴해요.`;
  if (pct > 0) return `평소보다 ${pct}% 비싼 편이에요.`;
  return "평소 가격대와 비슷해요.";
}

const PEAK_SEASON_TEXT: Record<PeakCategory, string> = {
  off: "비수기라 한산하고 여유로워요.",
  shoulder: "준성수기예요, 적당히 붐벼요.",
  peak: "성수기라 붐비는 편이에요.",
  super_peak: "극성수기라 많이 붐벼요.",
};

export function explainPeakSeason(category: PeakCategory): string {
  return PEAK_SEASON_TEXT[category];
}

// 기후쾌적지수: 여행 기간의 실제 평균 기온/강수량을 문장에 그대로 반영하고,
// 어조(쾌적/보통/힘듦)는 이미 계산된 climateComfort 점수를 그대로 따라간다
// (문구와 점수가 서로 다른 기준으로 어긋나지 않도록).
export function explainClimateComfort(days: ClimateDay[], score: number | null): string | null {
  if (score === null) return null;

  const temps = days.map((d) => d.tempC).filter((t): t is number => typeof t === "number");
  if (temps.length === 0) return null;

  const precips = days.map((d) => d.precipMm).filter((p): p is number => typeof p === "number");
  const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
  const avgPrecip = precips.length > 0 ? precips.reduce((a, b) => a + b, 0) / precips.length : 0;

  const tone = score >= 65 ? "쾌적한 편이에요" : score >= 40 ? "그럭저럭 다닐 만해요" : "다소 힘든 날씨예요";

  return `이 시기 평균 기온 ${avgTemp.toFixed(1)}°C, 평균 강수량 ${avgPrecip.toFixed(1)}mm로 ${tone}.`;
}
