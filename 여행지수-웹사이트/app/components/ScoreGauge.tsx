"use client";

import type { CSSProperties, ReactNode } from "react";

export interface ScoreGaugeProps {
  label: string;
  score: number | null;
  reason: string | null;
  colorLight: string;
  colorDark: string;
  emptyText: string;
  badge?: ReactNode;
}

// 0~100점을 채워지는 막대(meter)로 보여준다. 트랙은 채움색의 옅은 워시(color-mix)라
// "같은 색 계열의 밝은 단계"라는 메터 스펙을 팔레트 값을 늘리지 않고 만족시킨다.
// 채움 애니메이션은 JS state가 아니라 순수 CSS @keyframes(globals.css의 .gauge-fill)로
// 처리한다 — score가 바뀔 때마다 부모(app/page.tsx)가 이 div에 새 key를 줘서 리마운트시키고,
// 그때마다 0%에서 목표 width까지 다시 자라난다.
export function ScoreGauge({ label, score, reason, colorLight, colorDark, emptyText, badge }: ScoreGaugeProps) {
  const target = score === null ? 0 : Math.max(0, Math.min(100, score));
  const style = { "--viz-light": colorLight, "--viz-dark": colorDark } as CSSProperties;

  return (
    <div className="viz-accent flex flex-col gap-1.5" style={style}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
          {badge}
        </span>
        <span className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {score === null ? emptyText : `${Math.round(score)}점`}
        </span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full"
        style={{ background: "color-mix(in oklab, var(--viz-color) 16%, transparent)" }}
      >
        <div
          key={target}
          className="gauge-fill h-full rounded-full"
          style={{ "--gauge-target": `${target}%`, background: "var(--viz-color)" } as CSSProperties}
        />
      </div>
      {reason && <p className="text-xs text-zinc-500 dark:text-zinc-400">{reason}</p>}
    </div>
  );
}
