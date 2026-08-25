"use client";

import landmarks from "@/data/landmarks.json" with { type: "json" };
import type { DestinationResult, Band } from "@/lib/topDestination";

const METRICS = [
  { key: "flight", label: "항공권" },
  { key: "hotel", label: "호텔" },
  { key: "exchangeRate", label: "환율" },
  { key: "peakSeason", label: "성수기" },
  { key: "climateComfort", label: "기후" },
] as const;

// 색은 점수의 좋고 나쁨만 나타낸다 — 목적지 구분에는 쓰지 않는다.
function bandFromScore(score: number | null): Band {
  if (score === null) return "warning";
  if (score >= 65) return "good";
  if (score >= 35) return "warning";
  return "serious";
}

const BAND_TEXT: Record<Band, string> = { good: "text-[var(--good)]", warning: "text-[var(--warning)]", serious: "text-[var(--serious)]" };
const BAND_BG: Record<Band, string> = { good: "bg-[var(--good-track)]", warning: "bg-[var(--warning-track)]", serious: "bg-[var(--serious-track)]" };

function thumbUrl(destinationKey: string): string | null {
  const lm = (landmarks as Record<string, { imageUrl: string }>)[destinationKey];
  // 저장된 URL은 1280px 썸네일 — 행 아이콘은 훨씬 작아서 Wikimedia 표준 폭 120px로 낮춘다.
  return lm ? lm.imageUrl.replace("/1280px-", "/120px-") : null;
}

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 5개 지수 중 가장 높은/낮은 것을 짚어 한 줄로 만든다. 값이 있는 지수만 후보로 쓴다. */
function highlightText(result: DestinationResult): string {
  const scored: { label: string; score: number }[] = [];
  for (const m of METRICS) {
    const score = result.breakdown[m.key];
    if (score !== null) scored.push({ label: m.label, score });
  }
  if (scored.length === 0) return "아직 계산된 지수가 없어요.";

  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
  if (best.label === worst.label) return `${best.label} ${Math.round(best.score)}점.`;
  return `${best.label}(${Math.round(best.score)}점)이 가장 좋고, ${worst.label}(${Math.round(worst.score)}점)이 가장 아쉬워요.`;
}

function MetricChip({ label, score }: { label: string; score: number | null }) {
  const band = bandFromScore(score);
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${BAND_BG[band]}`}>
      <span className="text-[var(--ink-2)]">{label}</span>
      <span className={BAND_TEXT[band]}>{score === null ? "–" : Math.round(score)}</span>
    </span>
  );
}

export function TopDestinations({ results }: { results: DestinationResult[] }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {results.map((r, i) => {
        const thumb = thumbUrl(r.destinationKey);
        return (
          <div key={r.destinationKey} className="flex items-center gap-3.5 border-b border-[var(--grid)] px-4 py-3.5 last:border-b-0">
            <div className="w-4 shrink-0 text-center text-[12px] font-bold text-[var(--muted)]">{i + 1}</div>

            {thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element -- 외부(Wikimedia) 호스트 이미지, next/image 최적화 대상 아님 */
              <img src={thumb} alt="" aria-hidden="true" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-xl bg-[var(--surface-2)]" aria-hidden="true" />
            )}

            <div className="w-[124px] shrink-0">
              <div className="text-[13px] font-bold">{r.label}</div>
              <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">
                {formatMonthDay(r.departDate)}~{formatMonthDay(r.returnDate)} · {r.nights}박
              </div>
            </div>

            <div className="flex w-[74px] shrink-0 items-baseline gap-1">
              <span className={`text-[19px] font-extrabold ${BAND_TEXT[r.band]}`}>{r.totalScore}</span>
              <span className="text-[10.5px] font-semibold text-[var(--muted)]">점</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1">
                {METRICS.map((m) => (
                  <MetricChip key={m.key} label={m.label} score={r.breakdown[m.key]} />
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-[var(--muted)]">{highlightText(r)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
