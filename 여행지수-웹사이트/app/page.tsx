"use client";

import { useEffect, useRef, useState } from "react";
import { DESTINATIONS } from "@/lib/destinations";
import type { Grade } from "@/lib/scoring";
import type { DestinationResult } from "@/lib/topDestination";
import type { PeakSeasonCurvePoint } from "@/lib/peakSeasonCurve";
import { useTravelpayoutsWidget } from "@/hooks/useTravelpayoutsWidget";
import { Hero } from "@/app/components/Hero";
import { MetricCards } from "@/app/components/MetricCards";
import { TopDestinations } from "@/app/components/TopDestinations";
import { ScoreGauge } from "@/app/components/ScoreGauge";

const AVIASALES_WIDGET_SRC =
  "https://tpwgt.com/content?currency=krw&trs=565302&shmarker=768270&show_hotels=true&powered_by=true&locale=ko&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100";

const TOP_N = 5; // 목적지 목록은 상위 5곳만 (17곳은 읽기 부담)

interface IndexResponse {
  travelIndex: { totalScore: number; grade: Grade; breakdown: Record<string, number | null> };
  totalCost: { flightTotal: number; hotelTotal: number; dailyCostTotal: number; grandTotal: number };
  nights: number;
  // 검색 결과로도 지수 카드 5개를 그리기 위한 상세 데이터
  result: DestinationResult;
  peakSeasonYearCurve: PeakSeasonCurvePoint[];
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

/** "9월 8일~10일 기준" — 같은 달이면 뒤쪽 월을 생략한다. */
function formatWindowLabel(departDate: string, returnDate: string) {
  const a = new Date(departDate);
  const b = new Date(returnDate);
  const head = `${a.getMonth() + 1}월 ${a.getDate()}일`;
  const tail = a.getMonth() === b.getMonth() ? `${b.getDate()}일` : `${b.getMonth() + 1}월 ${b.getDate()}일`;
  return `${head}~${tail} 기준`;
}

function SectionHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mt-9 mb-3.5">
      <h2 className="font-serif text-[19px] font-bold">{title}</h2>
      <div className="mt-1 text-[11.5px] text-[var(--muted)]">{sub}</div>
    </div>
  );
}

export default function Home() {
  // --- 오늘의 1위 (히어로 + 2번 지수 카드 세트). 검색과 완전히 독립된 상태다. ---
  const [topData, setTopData] = useState<TopDestinationsPayload | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/top-destinations")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setTopError(data.error ?? "불러오지 못했어요.");
          return;
        }
        setTopData(await res.json());
      })
      .catch(() => setTopError("서버와 통신할 수 없습니다."));
  }, []);

  // results의 순서는 rankingScore(환율 제외) 순 — 1위 선정은 그 편향 방지 순서를 그대로 쓴다.
  const heroResult = topData?.results[0] ?? null;
  // 목록은 화면에 점수를 그대로 보여주므로, 보이는 숫자와 순서가 어긋나지 않게 totalScore로 정렬한다.
  const topList = topData ? [...topData.results].sort((a, b) => b.totalScore - a.totalScore).slice(0, TOP_N) : [];

  // --- 검색 패널 (3번) + 검색 결과 (4·5번). 위 상태와 절대 섞지 않는다. ---
  const destinationKeys = Object.keys(DESTINATIONS);
  const [destinationKey, setDestinationKey] = useState(destinationKeys[0]);
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [people, setPeople] = useState(2);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState<IndexResponse | null>(null);
  const [searchedPeople, setSearchedPeople] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const aviasalesWidgetRef = useRef<HTMLDivElement>(null);
  useTravelpayoutsWidget(AVIASALES_WIDGET_SRC, aviasalesWidgetRef);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(null);
    try {
      const res = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationKey, departDate, returnDate, people }),
      });
      const data: IndexResponse = await res.json();
      if (!res.ok) setError(data.error ?? "계산에 실패했습니다.");
      else {
        setSearched(data);
        setSearchedPeople(people); // 결과 문구가 계산 당시 인원수를 쓰도록 고정
      }
    } catch {
      setError("서버와 통신할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page)] px-4 py-8">
      <main className="mx-auto max-w-[1040px]">
        <div className="mb-6">
          <div className="font-serif text-lg font-bold">여행지수</div>
          <div className="text-[11px] text-[var(--muted)]">실제 데이터로 계산하는 다음 여행</div>
        </div>

        {topError && <p className="mb-6 text-sm text-[var(--muted)]">{topError}</p>}

        {heroResult && topData && (
          <>
            {/* 1) 히어로 — 등록된 목적지 전체 중 오늘의 1위 */}
            <Hero result={heroResult} computedAt={topData.computedAt} />

            {/* 2) 오늘의 1위 목적지 지수 카드 — 히어로에 표시된 추천 날짜 기준이라 그 날짜를 함께 적는다 */}
            <SectionHeading
              title={`${heroResult.label}는 지금 왜 좋은가요`}
              sub={formatWindowLabel(heroResult.departDate, heroResult.returnDate)}
            />
            <MetricCards result={heroResult} peakSeasonYearCurve={topData.peakSeasonYearCurve} />

            {/* 3) 검색 패널 */}
            <SectionHeading title="직접 계산해보기" sub="목적지와 날짜를 고르면 그 기간의 여행지수를 계산해드려요" />
            <div ref={aviasalesWidgetRef} className="mb-4 rounded-xl bg-[var(--surface)] p-4 shadow-sm empty:hidden" />
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="min-w-[180px] flex-[1.6]">
                <label htmlFor="dest" className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">목적지</label>
                <select id="dest" value={destinationKey} onChange={(e) => setDestinationKey(e.target.value)} className="w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm">
                  {destinationKeys.map((key) => (
                    <option key={key} value={key}>
                      {DESTINATIONS[key].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px] flex-1">
                <label htmlFor="depart" className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">가는 날</label>
                <input id="depart" type="date" required value={departDate} onChange={(e) => setDepartDate(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm" />
              </div>
              <div className="min-w-[140px] flex-1">
                <label htmlFor="return" className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">오는 날</label>
                <input id="return" type="date" required value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm" />
              </div>
              <div className="min-w-[90px] flex-[0.6]">
                <label htmlFor="people" className="mb-1.5 block text-[11.5px] font-semibold text-[var(--ink-2)]">인원수</label>
                <input id="people" type="number" min={1} required value={people} onChange={(e) => setPeople(Number(e.target.value))} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm" />
              </div>
              <button type="submit" disabled={loading} className="cursor-pointer rounded-lg bg-[var(--hero-bg-2)] px-5 py-2.5 text-[13.5px] font-bold text-[var(--hero-ink)] disabled:opacity-50">
                {loading ? "계산 중..." : "여행지수 계산하기"}
              </button>
            </form>

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            {/* 4·5) 검색 결과 — 계산 전에는 안내만 띄운다(빈 카드/0점을 그리지 않는다) */}
            {!searched && !error && (
              <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center text-[12.5px] text-[var(--muted)]">
                목적지와 날짜를 선택하면 그 기간의 지수를 계산해드려요.
              </p>
            )}

            {searched && (
              <>
                {/* 4) 검색 결과 종합 점수 — 히어로와 같은 게이지를 쓴다 */}
                <div className="mt-4 flex flex-wrap items-center gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <ScoreGauge score={searched.result.totalScore} band={searched.result.band} />
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--muted)]">
                      내가 고른 일정 · {searched.nights}박 {searched.nights + 1}일 · {searchedPeople}인
                    </div>
                    <div className="mt-0.5 text-[17px] font-bold">
                      {searched.result.label} · {formatWindowLabel(searched.result.departDate, searched.result.returnDate).replace(" 기준", "")}
                    </div>
                    <div className="mt-1 text-[13px] font-semibold text-[var(--ink-2)]">
                      {searched.result.grade} · 총 {formatKRW(searched.totalCost.grandTotal)}
                    </div>
                  </div>
                </div>

                {/* 5) 검색한 목적지·날짜 기준 지수 카드 — 2)번과 같은 컴포넌트를 재사용한다 */}
                <SectionHeading
                  title={`${searched.result.label}는 그때 왜 좋은가요`}
                  sub={formatWindowLabel(searched.result.departDate, searched.result.returnDate)}
                />
                <MetricCards result={searched.result} peakSeasonYearCurve={searched.peakSeasonYearCurve} />
              </>
            )}

            {/* 6) 목적지 목록 — 상위 5곳, 읽기 전용 */}
            <SectionHeading title={`오늘의 추천 목적지 TOP ${TOP_N}`} sub="오늘 계산 기준 종합 점수가 높은 순서예요" />
            <TopDestinations results={topList} />
          </>
        )}

        {!heroResult && !topError && <p className="text-sm text-[var(--muted)]">오늘의 추천을 계산하는 중이에요...</p>}
      </main>
    </div>
  );
}
