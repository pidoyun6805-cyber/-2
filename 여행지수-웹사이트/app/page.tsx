"use client";

import { useEffect, useRef, useState } from "react";
import { DESTINATIONS } from "@/lib/destinations";
import type { Grade } from "@/lib/scoring";
import type { DestinationResult } from "@/lib/topDestination";
import type { PeakSeasonCurvePoint } from "@/lib/peakSeasonCurve";
import { useTravelpayoutsWidget } from "@/hooks/useTravelpayoutsWidget";
import { Hero } from "@/app/components/Hero";
import { MetricCards } from "@/app/components/MetricCards";
import { DestinationList } from "@/app/components/DestinationList";

const AVIASALES_WIDGET_SRC =
  "https://tpwgt.com/content?currency=krw&trs=565302&shmarker=768270&show_hotels=true&powered_by=true&locale=ko&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100";

interface IndexResponse {
  travelIndex: { totalScore: number; grade: Grade; breakdown: Record<string, number | null> };
  totalCost: { flightTotal: number; hotelTotal: number; dailyCostTotal: number; grandTotal: number };
  nights: number;
  error?: string;
}

interface TopDestinationsPayload {
  computedAt: string;
  results: DestinationResult[];
  peakSeasonYearCurve: PeakSeasonCurvePoint[];
}

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function Home() {
  // --- 오늘의 추천 / 히어로 / 카드 / 목적지 리스트 ---
  const [topData, setTopData] = useState<TopDestinationsPayload | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/top-destinations")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setTopError(data.error ?? "불러오지 못했어요.");
          return;
        }
        const data: TopDestinationsPayload = await res.json();
        setTopData(data);
        setSelectedKey(data.results[0]?.destinationKey ?? null);
      })
      .catch(() => setTopError("서버와 통신할 수 없습니다."));
  }, []);

  const selectedResult = topData?.results.find((r) => r.destinationKey === selectedKey) ?? null;

  // topData.results의 순서는 rankingScore(환율 제외) 순 — 히어로 1위 선정은 그 편향 방지 순서를 그대로 쓴다.
  // 반면 목록은 화면에 점수를 그대로 보여주므로, 보이는 숫자와 순서가 어긋나 보이지 않게 totalScore로 다시 정렬한다.
  const listResults = topData ? [...topData.results].sort((a, b) => b.totalScore - a.totalScore) : [];

  // --- 기존 "계산하기" 검색 패널 — 로직/동작 변경 없음, 레이아웃만 이동 ---
  const destinationKeys = Object.keys(DESTINATIONS);
  const [destinationKey, setDestinationKey] = useState(destinationKeys[0]);
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [people, setPeople] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IndexResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aviasalesWidgetRef = useRef<HTMLDivElement>(null);
  useTravelpayoutsWidget(AVIASALES_WIDGET_SRC, aviasalesWidgetRef);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationKey, departDate, returnDate, people }),
      });
      const data: IndexResponse = await res.json();
      if (!res.ok) setError(data.error ?? "계산에 실패했습니다.");
      else setResult(data);
    } catch {
      setError("서버와 통신할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page)] px-4 py-8">
      <main className="mx-auto max-w-[1040px]">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold">여행지수</div>
            <div className="text-[11px] text-[var(--page-muted)]">실제 데이터로 계산하는 다음 여행</div>
          </div>
        </div>

        {topError && <p className="mb-6 text-sm text-[var(--page-muted)]">{topError}</p>}

        {selectedResult && topData && (
          <>
            <Hero result={selectedResult} computedAt={topData.computedAt} />

            <div ref={aviasalesWidgetRef} className="mt-5 paper-grain rounded-xl p-4 text-[var(--ink)]" />

            <form onSubmit={handleSubmit} className="mt-5 flex flex-wrap items-end gap-3 paper-grain rounded-2xl p-5 text-[var(--ink)]">
              <div className="min-w-[180px] flex-[1.6]">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">목적지</label>
                <select value={destinationKey} onChange={(e) => setDestinationKey(e.target.value)} className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2.5 text-sm">
                  {destinationKeys.map((key) => (
                    <option key={key} value={key}>
                      {DESTINATIONS[key].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px] flex-1">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">가는 날</label>
                <input type="date" required value={departDate} onChange={(e) => setDepartDate(e.target.value)} className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2.5 text-sm" />
              </div>
              <div className="min-w-[140px] flex-1">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">오는 날</label>
                <input type="date" required value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2.5 text-sm" />
              </div>
              <div className="min-w-[90px] flex-[0.6]">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">인원수</label>
                <input type="number" min={1} required value={people} onChange={(e) => setPeople(Number(e.target.value))} className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-3 py-2.5 text-sm" />
              </div>
              <button type="submit" disabled={loading} className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--brand-ink)] cursor-pointer disabled:opacity-50">
                {loading ? "계산 중..." : "여행지수 계산하기"}
              </button>
            </form>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            {result && (
              <div className="mt-4 paper-grain rounded-2xl p-5 text-[var(--ink)]">
                <div className="text-2xl font-extrabold">{result.travelIndex.totalScore}점 · {result.travelIndex.grade}</div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  총 {formatKRW(result.totalCost.grandTotal)} ({result.nights}박 {people}인)
                </div>
              </div>
            )}

            <div className="mt-8 mb-3.5 flex items-baseline justify-between">
              <h2 className="font-display text-[19px] font-bold">{selectedResult.label}는 지금 왜 좋은가요</h2>
            </div>
            <MetricCards result={selectedResult} peakSeasonYearCurve={topData.peakSeasonYearCurve} />

            <div className="mt-8 mb-3.5">
              <h2 className="font-display text-[19px] font-bold">등록된 목적지 (17곳)</h2>
            </div>
            <DestinationList results={listResults} selectedKey={selectedResult.destinationKey} onSelect={setSelectedKey} />
          </>
        )}

        {!selectedResult && !topError && <p className="text-sm text-[var(--page-muted)]">오늘의 추천을 계산하는 중이에요...</p>}
      </main>
    </div>
  );
}
