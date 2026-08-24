"use client";

import type { DestinationResult } from "@/lib/topDestination";

const BAND_LABEL: Record<string, string> = { good: "좋음", warning: "보통", serious: "아쉬움" };

function bestReasonText(result: DestinationResult): string {
  const chipLabels = result.topChips.map((c) => c.label).join(", ");
  return chipLabels ? `${chipLabels}이 좋은 시기예요.` : "지금 계산된 조건으로 추천돼요.";
}

export function DestinationList({
  results,
  selectedKey,
  onSelect,
}: {
  results: DestinationResult[];
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      {results.map((r) => (
        <button
          key={r.destinationKey}
          type="button"
          onClick={() => onSelect(r.destinationKey)}
          className={`flex w-full items-center gap-4 border-b border-[var(--grid)] px-5 py-4 text-left last:border-b-0 hover:bg-[var(--surface-2)] ${
            selectedKey === r.destinationKey ? "bg-[var(--surface-2)] shadow-[inset_3px_0_0_var(--accent)]" : ""
          }`}
        >
          <div className="w-32 shrink-0">
            <div className="text-[13.5px] font-bold">{r.label}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-bold">
              <span className={`h-1.5 w-1.5 rounded-full bg-[var(--${r.band})]`} />
              {r.totalScore}점 · {BAND_LABEL[r.band]}
            </div>
          </div>
          <div className="flex-1 text-xs leading-relaxed text-[var(--muted)]">{bestReasonText(r)}</div>
          <div className="text-sm text-[var(--muted)]">→</div>
        </button>
      ))}
    </div>
  );
}
