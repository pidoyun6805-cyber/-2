// 하위 지수별 고유 색상. dataviz 레퍼런스 팔레트(카테고리 순서 1~5)를 그대로 가져다 씀 —
// 이 순서가 라이트/다크 양쪽에서 인접 쌍 CVD 검증을 통과한 순서라 임의로 재배열하지 않는다.
export const SERIES_COLORS = {
  flight: { light: "#2a78d6", dark: "#3987e5" }, // slot 1 blue
  hotel: { light: "#eb6834", dark: "#d95926" }, // slot 2 orange
  climateComfort: { light: "#1baf7a", dark: "#199e70" }, // slot 3 aqua
  peakSeason: { light: "#eda100", dark: "#c98500" }, // slot 4 yellow
  exchangeRate: { light: "#e87ba4", dark: "#d55181" }, // slot 5 magenta
} as const;

// "이 지점이 최저가" 같은 강조 표시 전용 — 시리즈 색과 겹치지 않는 status-good.
export const HIGHLIGHT_COLOR = { light: "#0ca30c", dark: "#0ca30c" };
