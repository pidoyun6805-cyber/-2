"use client";

import landmarks from "@/data/landmarks.json" with { type: "json" };
import type { DestinationResult } from "@/lib/topDestination";

const RING_CIRCUMFERENCE = 213.6; // r=34인 원의 둘레(2*PI*34), 시안과 동일

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function Hero({ result, computedAt }: { result: DestinationResult; computedAt: string }) {
  const landmark = (landmarks as Record<string, { imageUrl: string; landmarkLabel: string; credit: string }>)[result.destinationKey];
  const computedDate = new Date(computedAt);
  const offset = RING_CIRCUMFERENCE * (1 - result.totalScore / 100);

  return (
    <div className="relative grid overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--hero-bg-2)] to-[var(--hero-bg-1)] shadow-xl sm:grid-cols-[1.15fr_0.85fr]">
      {/* z-10 없으면 뒤에 오는 랜드마크 사진(<img>)이 위로 덮어써서 배지가 안 보인다. */}
      <div className="absolute top-5 right-5 z-10 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-center text-[11px] font-bold text-[var(--accent-ink)]">
        오늘 기준
        <span className="mt-0.5 block text-[9.5px] font-medium opacity-85">{computedDate.getMonth() + 1}월 {computedDate.getDate()}일 계산</span>
      </div>

      <div className="p-9 text-[var(--hero-ink)]">
        <div className="mb-3 text-[11px] font-bold tracking-wide text-[var(--accent)] uppercase">등록된 목적지 전체 중 오늘의 1위</div>
        <h1 className="mb-3 font-serif text-2xl leading-snug font-bold">
          지금 계산으로는,
          <br />
          {result.label}가 가장 좋아요
        </h1>
        <p className="mb-5 max-w-[38ch] text-[12.5px] leading-relaxed opacity-95">
          오늘({computedDate.getMonth() + 1}/{computedDate.getDate()}) 기준으로 계산했고, <strong>앞으로 2개월 안</strong>에서 가장 조건 좋은 시기를 찾은
          결과예요. 항공권·호텔·환율·성수기·기후를 매일 다시 계산해요.
        </p>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
              <circle cx="42" cy="42" r="34" fill="none" stroke="var(--hero-track)" strokeWidth="8" />
              <circle
                cx="42"
                cy="42"
                r="34"
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                stroke={`var(--${result.band})`}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold">{result.totalScore}</span>
              <span className="text-[9px] font-semibold opacity-70">점</span>
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-[11px] font-semibold opacity-80">다음 추천 여행 · {result.nights}박 {result.nights + 1}일</div>
            <div className="mb-2 text-[15.5px] font-bold">
              {result.label} · {formatMonthDay(result.departDate)} ~ {formatMonthDay(result.returnDate)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.topChips.map((chip) => (
                <span key={chip.key} className="rounded-full border border-[var(--hero-track)] px-2.5 py-1 text-[11px] font-semibold">
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative min-h-[160px]">
        {landmark?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부(Wikimedia) 호스트 이미지, next/image 최적화 대상 아님 */}
            <img src={landmark.imageUrl} alt={landmark.landmarkLabel} className="h-full w-full object-cover" />
            <div className="absolute bottom-3 left-4 z-10 text-[10.5px] font-semibold text-white drop-shadow">📍 {landmark.landmarkLabel}</div>
            <div className="absolute right-2 bottom-1 z-10 text-[8.5px] text-white/70">{landmark.credit}</div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--hero-track)]">사진 준비 중</div>
        )}
      </div>
    </div>
  );
}
