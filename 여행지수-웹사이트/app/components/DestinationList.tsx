"use client";

import { DESTINATIONS } from "@/lib/destinations";
import { destinationColor } from "@/lib/destinationTheme";
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
    <div className="flex flex-col gap-2">
      {results.map((r) => {
        const selected = selectedKey === r.destinationKey;
        const route = DESTINATIONS[r.destinationKey]?.flightRouteKey ?? "PUS-???";
        return (
          <button
            key={r.destinationKey}
            type="button"
            onClick={() => onSelect(r.destinationKey)}
            aria-current={selected ? "true" : undefined}
            className={`paper-grain group flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-xl pr-5 text-left transition-transform duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${
              selected ? "ring-2 ring-[var(--brand)]" : ""
            }`}
          >
            {/* 장식용 목적지 컬러 스텁 + 절취선 */}
            <span className="w-2.5 self-stretch" style={{ backgroundColor: destinationColor(r.destinationKey) }} aria-hidden="true" />
            <span className="perf-v -ml-2 self-stretch" aria-hidden="true" />

            <span className="ticket-num w-[86px] shrink-0 py-3.5 text-[10.5px] font-medium tracking-wider text-[var(--muted)]">{route.replace("-", " → ")}</span>

            <span className="w-[132px] shrink-0 text-[13.5px] font-bold text-[var(--ink)]">{r.label}</span>

            <span className="flex w-[92px] shrink-0 items-baseline gap-1.5">
              <span className="ticket-num text-[19px] font-semibold" style={{ color: `var(--${r.band})` }}>
                {r.totalScore}
              </span>
              <span className="text-[11px] font-semibold text-[var(--ink-2)]">{BAND_LABEL[r.band]}</span>
            </span>

            <span className="flex-1 truncate text-[12px] text-[var(--ink-2)]">{bestReasonText(r)}</span>

            <span className="text-[var(--muted)] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">
              →
            </span>
          </button>
        );
      })}
    </div>
  );
}
