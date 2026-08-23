"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { HIGHLIGHT_COLOR } from "./palette";

export interface PriceHistoryPoint {
  date: string;
  price: number;
}

interface PriceHistoryChartProps {
  history: PriceHistoryPoint[];
  cheapest: PriceHistoryPoint | null;
  colorLight: string;
  colorDark: string;
}

const WIDTH = 600;
const HEIGHT = 180;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 12;

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 캐시된 항공권 가격 이력을 영역(area) 차트로 보여준다. 최저가 지점은 별도 색(초록)으로
// 강조하고, 마우스를 올리면 가장 가까운 지점의 날짜/가격을 툴팁으로 보여준다.
export function PriceHistoryChart({ history, cheapest, colorLight, colorDark }: PriceHistoryChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const sorted = useMemo(() => [...history].sort((a, b) => a.date.localeCompare(b.date)), [history]);

  const style = { "--viz-light": colorLight, "--viz-dark": colorDark } as CSSProperties;

  if (sorted.length < 2) {
    return (
      <p className="viz-accent text-sm text-zinc-500 dark:text-zinc-400" style={style}>
        가격 데이터가 더 쌓이면 추이 그래프가 보여요. (지금까지 {sorted.length}건 수집됨)
      </p>
    );
  }

  const prices = sorted.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const hasVariation = max > min;
  const range = max - min || 1;

  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  // 가격 변동이 전혀 없으면(모두 같은 값) 바닥에 눌러붙이지 않고 세로 중앙에 평평하게 그린다 —
  // "변동 없음"을 "전부 최저가"처럼 보이게 하지 않기 위함.
  const points = sorted.map((p, i) => ({
    x: PAD_X + (sorted.length === 1 ? 0 : (i / (sorted.length - 1)) * plotWidth),
    y: PAD_TOP + (hasVariation ? 1 - (p.price - min) / range : 0.5) * plotHeight,
    ...p,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const baseline = PAD_TOP + plotHeight;
  const areaPath =
    `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} ` +
    `L ${points[0].x.toFixed(1)} ${baseline.toFixed(1)} Z`;

  const cheapestIdx = cheapest
    ? sorted.findIndex((p) => p.date === cheapest.date && p.price === cheapest.price)
    : -1;
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div className="viz-accent" style={style}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={handleMove}
        >
          <path d={areaPath} fill="var(--viz-color)" fillOpacity={0.12} stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--viz-color)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {cheapestIdx >= 0 && (
            <circle
              cx={points[cheapestIdx].x}
              cy={points[cheapestIdx].y}
              r={6}
              fill={HIGHLIGHT_COLOR.light}
              stroke="var(--surface, #ffffff)"
              strokeWidth={2}
              className="dark:[stroke:#18181b]"
            />
          )}
          {hovered && (
            <>
              <line
                x1={hovered.x}
                y1={PAD_TOP}
                x2={hovered.x}
                y2={baseline}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={1}
                className="text-zinc-400"
              />
              <circle
                cx={hovered.x}
                cy={hovered.y}
                r={4}
                fill="var(--viz-color)"
                stroke="var(--surface, #ffffff)"
                strokeWidth={2}
                className="dark:[stroke:#18181b]"
              />
            </>
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
            style={{ left: `${(hovered.x / WIDTH) * 100}%`, top: `${(hovered.y / HEIGHT) * 100}%` }}
          >
            {formatMonthDay(hovered.date)} · {hovered.price.toLocaleString("ko-KR")}원
          </div>
        )}
      </div>
      {cheapest && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          최근 {new Set(sorted.map((p) => p.date)).size}일 중 가장 저렴했던 날:{" "}
          {formatMonthDay(cheapest.date)} · {cheapest.price.toLocaleString("ko-KR")}원
        </p>
      )}
    </div>
  );
}
