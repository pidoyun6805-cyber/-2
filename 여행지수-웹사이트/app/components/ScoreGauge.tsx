"use client";

import type { Band } from "@/lib/topDestination";

const RING_CIRCUMFERENCE = 213.6; // r=34인 원의 둘레(2*PI*34), 시안과 동일

// 히어로("오늘의 1위")와 검색 결과가 같은 시각 언어를 쓰도록 게이지를 공용화한다.
// tone="dark"는 어두운 히어로 배경 위, "light"는 밝은 카드 위.
export function ScoreGauge({ score, band, tone = "light", size = 80 }: { score: number; band: Band; tone?: "dark" | "light"; size?: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - score / 100);
  const track = tone === "dark" ? "var(--hero-track)" : "var(--grid)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r="34" fill="none" stroke={track} strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r="34"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          stroke={`var(--${band})`}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold">{score}</span>
        <span className="text-[9px] font-semibold opacity-70">점</span>
      </div>
    </div>
  );
}
