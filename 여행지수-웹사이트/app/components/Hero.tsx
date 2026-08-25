"use client";

import landmarks from "@/data/landmarks.json" with { type: "json" };
import { DESTINATIONS } from "@/lib/destinations";
import { destinationColor } from "@/lib/destinationTheme";
import type { DestinationResult } from "@/lib/topDestination";
import { TicketShell, PerforationV, ScoreStamp, MetaCell, Barcode } from "./Ticket";

function formatMonthDay(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export function Hero({ result, computedAt }: { result: DestinationResult; computedAt: string }) {
  const landmark = (landmarks as Record<string, { imageUrl: string; landmarkLabel: string; credit: string }>)[result.destinationKey];
  const computedDate = new Date(computedAt);
  const color = destinationColor(result.destinationKey);
  const [origin, destination] = (DESTINATIONS[result.destinationKey]?.flightRouteKey ?? "PUS-???").split("-");
  const cityName = result.label.replace(/\s*\(.*\)$/, "");

  // 히어로 높이를 고정한다 — 안 그러면 세로로 긴 랜드마크 사진이 카드 높이를 밀어올려서
  // 오른쪽 종이면에 빈 공간이 크게 남는다(사진 비율마다 히어로 높이가 달라짐).
  return (
    <TicketShell className="grid sm:h-[420px] sm:grid-cols-[0.85fr_1.15fr]">
      {/* 절취선 왼쪽: 장식용 목적지 컬러 패널 */}
      <div className="relative h-[220px] overflow-hidden sm:h-full" style={{ backgroundColor: color }}>
        {landmark?.imageUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부(Wikimedia) 호스트 이미지, next/image 최적화 대상 아님 */}
            <img src={landmark.imageUrl} alt={landmark.landmarkLabel} className="h-full w-full object-cover mix-blend-luminosity opacity-90" />
            <div className="absolute inset-0" style={{ backgroundColor: color, mixBlendMode: "color", opacity: 0.55 }} />
            <div className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/55 to-transparent px-4 pt-8 pb-3">
              <div className="text-[11px] font-bold text-white drop-shadow">{landmark.landmarkLabel}</div>
              <div className="text-[8px] text-white/70">{landmark.credit}</div>
            </div>
          </>
        )}
      </div>

      <PerforationV left="calc(0.85 / 2 * 100%)" />

      {/* 절취선 오른쪽: 종이면 — 점수와 데이터만 */}
      <div className="relative flex flex-col px-7 py-7 sm:px-9">
        <div className="ticket-num text-[9.5px] font-medium tracking-[0.2em] text-[var(--muted)] uppercase">
          Travel Index · {computedDate.getMonth() + 1}.{computedDate.getDate()} 계산
        </div>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-[26px] leading-none tracking-tight text-[var(--ink)]">TRIP TO</div>
            <div className="font-script -mt-1 text-[46px] leading-[1.05] text-[var(--brand)]">{cityName}</div>
          </div>
          <ScoreStamp score={result.totalScore} grade={result.grade} band={result.band} />
        </div>

        <p className="mt-3 max-w-[42ch] text-[12px] leading-relaxed text-[var(--ink-2)]">
          오늘({computedDate.getMonth() + 1}/{computedDate.getDate()}) 기준으로 계산했고, <strong className="text-[var(--ink)]">앞으로 2개월 안</strong>에서 가장 조건 좋은
          시기를 찾은 결과예요.
        </p>

        <div className="mt-5 grid grid-cols-[auto_auto_1fr] items-end gap-x-7 gap-y-4">
          <MetaCell label="From" value={origin} valueClass="ticket-num text-[22px]" />
          <MetaCell label="To" value={destination} valueClass="ticket-num text-[22px]" />
          <MetaCell
            label="Departure — Return"
            value={
              <span className="ticket-num">
                {formatMonthDay(result.departDate)} — {formatMonthDay(result.returnDate)}
                <span className="ml-2 text-[10.5px] font-medium text-[var(--muted)]">
                  {result.nights}박 {result.nights + 1}일
                </span>
              </span>
            }
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {result.topChips.map((chip) => (
            <span key={chip.key} className="rounded-full border border-[var(--rule)] bg-[var(--paper-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)]">
              {chip.label}
            </span>
          ))}
        </div>

        {/* mt-auto로 바코드를 종이면 맨 아래에 붙인다 — 실제 티켓의 바코드 위치 */}
        <Barcode seed={result.destinationKey} className="mt-auto h-9 pt-5" />
      </div>
    </TicketShell>
  );
}
