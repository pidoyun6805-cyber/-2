"use client";

export interface LineChartPoint {
  x: string; // 날짜 라벨 (YYYY-MM-DD)
  y: number;
}

export interface LineChartProps {
  points: LineChartPoint[];
  highlight?: "min" | "last"; // 강조할 지점 — 최저값 또는 마지막(오늘) 값
  markerIndex?: number; // 특정 인덱스를 강조(성수기 곡선의 "이번 여행 날짜" 마커용)
  showAverageLine?: boolean;
  colorVar?: string; // CSS 변수명, 기본 --chart
  height?: number;
}

const WIDTH = 380;
const PAD_TOP = 16;
const PAD_BOTTOM = 10;

export function average(points: LineChartPoint[]): number {
  return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

export function LineChart({ points, highlight, markerIndex, showAverageLine = false, colorVar = "--chart", height = 76 }: LineChartProps) {
  if (points.length < 2) {
    return <p className="text-[11.5px] text-[var(--ink-2)]">데이터가 더 쌓이면 추이 그래프가 보여요.</p>;
  }

  const values = points.map((p) => p.y);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  const innerH = height - PAD_TOP - PAD_BOTTOM;

  const pts = points.map((p, i) => ({
    x: WIDTH * (i / (points.length - 1)),
    y: PAD_TOP + (1 - (p.y - lo) / range) * innerH,
    v: p.y,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${WIDTH} ${height} L 0 ${height} Z`;

  const highlightIdx =
    typeof markerIndex === "number"
      ? markerIndex
      : highlight === "last"
        ? pts.length - 1
        : pts.reduce((bestIdx, p, i, arr) => (p.v < arr[bestIdx].v ? i : bestIdx), 0);
  const hl = pts[highlightIdx];

  const avg = showAverageLine ? average(points) : null;
  const avgY = avg !== null ? PAD_TOP + (1 - (avg - lo) / range) * innerH : null;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} className="w-full overflow-visible" style={{ display: "block" }}>
      <line x1={0} y1={PAD_TOP} x2={WIDTH} y2={PAD_TOP} stroke="var(--grid, #e2ded4)" strokeWidth={1} />
      <line x1={0} y1={height - PAD_BOTTOM} x2={WIDTH} y2={height - PAD_BOTTOM} stroke="var(--grid, #e2ded4)" strokeWidth={1} />
      {avgY !== null && (
        <line x1={0} y1={avgY} x2={WIDTH} y2={avgY} stroke="var(--muted, #8c8c97)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      <path d={areaPath} fill={`var(${colorVar})`} fillOpacity={0.1} stroke="none" />
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke={`var(${colorVar})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {hl && <circle cx={hl.x} cy={hl.y} r={4} stroke={`var(${colorVar})`} strokeWidth={2} fill="var(--paper, #fffefb)" />}
    </svg>
  );
}
