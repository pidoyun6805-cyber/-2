"use client";

import { useRef, useState } from "react";
import { DESTINATIONS } from "@/lib/destinations";
import type { Grade } from "@/lib/scoring";
import { useTravelpayoutsWidget } from "@/hooks/useTravelpayoutsWidget";

const AVIASALES_WIDGET_SRC =
  "https://tpwgt.com/content?currency=krw&trs=565302&shmarker=768270&show_hotels=true&powered_by=true&locale=ko&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100";

interface IndexResponse {
  travelIndex: {
    totalScore: number;
    grade: Grade;
    breakdown: {
      flight: number | null;
      hotel: number;
      exchangeRate: number | null;
      peakSeason: number;
      climateComfort: number | null;
    };
  };
  totalCost: {
    flightTotal: number;
    hotelTotal: number;
    dailyCostTotal: number;
    grandTotal: number;
  };
  nights: number;
  peakCategory: string;
  seasonalWeather: { avgTempC: number | null; condition: string | null };
  error?: string;
}

const GRADE_COLOR: Record<Grade, string> = {
  최적기: "text-emerald-600",
  좋음: "text-lime-600",
  보통: "text-amber-600",
  비추천: "text-orange-600",
  최악: "text-red-600",
};

function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function Home() {
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
      if (!res.ok) {
        setError(data.error ?? "계산에 실패했습니다.");
      } else {
        setResult(data);
      }
    } catch {
      setError("서버와 통신할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4">
      <main className="mx-auto max-w-xl">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900">여행지수</h1>
        <p className="mb-8 text-zinc-500">출발지·목적지·날짜·인원수만 입력하면 지금이 여행 가기 좋은 때인지, 총 경비는 얼마쯤 드는지 알려드려요.</p>

        <div ref={aviasalesWidgetRef} className="mb-8 rounded-xl bg-white p-6 shadow-sm" />

        <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">출발지</label>
            <input value="부산 (김해공항, PUS)" disabled className="w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-zinc-500" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">목적지</label>
            <select
              value={destinationKey}
              onChange={(e) => setDestinationKey(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            >
              {destinationKeys.map((key) => (
                <option key={key} value={key}>
                  {DESTINATIONS[key].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">가는 날</label>
              <input
                type="date"
                required
                value={departDate}
                onChange={(e) => setDepartDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-zinc-700">오는 날</label>
              <input
                type="date"
                required
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">인원수</label>
            <input
              type="number"
              min={1}
              required
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? "계산 중..." : "계산하기"}
          </button>
        </form>

        {error && <p className="mb-8 text-red-600">{error}</p>}

        {result && (
          <div className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
            <div className="text-center">
              <div className="text-5xl font-bold text-zinc-900">{result.travelIndex.totalScore}점</div>
              <div className={`text-xl font-semibold ${GRADE_COLOR[result.travelIndex.grade]}`}>
                {result.travelIndex.grade}
              </div>
            </div>

            <ul className="grid grid-cols-2 gap-2 text-sm text-zinc-600">
              <li>
                항공권:{" "}
                {result.travelIndex.breakdown.flight === null
                  ? "가격 데이터 수집 중"
                  : `${Math.round(result.travelIndex.breakdown.flight)}점`}
              </li>
              <li>호텔: {Math.round(result.travelIndex.breakdown.hotel)}점</li>
              <li>
                환율:{" "}
                {result.travelIndex.breakdown.exchangeRate === null ? (
                  "환율 정보 없음"
                ) : (
                  <>
                    {Math.round(result.travelIndex.breakdown.exchangeRate)}점{" "}
                    <span
                      className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
                      title="여행일의 환율은 미리 알 수 없어서 오늘 환율을 대신 써요. 단기~중기 환율은 오늘 값이 가장 나은 예측치라는 연구(Meese-Rogoff)에 따른 설계예요."
                    >
                      📅 오늘 기준
                    </span>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      오늘 기준 환율입니다. 실제 여행일 환율은 다를 수 있어요 — 출발일이 가까워지면 다시 확인해보세요.
                    </p>
                  </>
                )}
              </li>
              <li>성수기: {Math.round(result.travelIndex.breakdown.peakSeason)}점</li>
              <li>
                기후쾌적지수:{" "}
                {result.travelIndex.breakdown.climateComfort === null
                  ? "기후 데이터 없음"
                  : `${Math.round(result.travelIndex.breakdown.climateComfort)}점`}
              </li>
            </ul>

            <hr className="my-2 border-zinc-100" />

            <div>
              <h2 className="mb-2 text-lg font-semibold text-zinc-900">
                예상 총 경비 ({result.nights}박 {people}인)
              </h2>
              <ul className="flex flex-col gap-1 text-zinc-600">
                <li>항공권: {formatKRW(result.totalCost.flightTotal)}</li>
                <li>숙박: {formatKRW(result.totalCost.hotelTotal)}</li>
                <li>현지 체류비(식비/교통/잡비): {formatKRW(result.totalCost.dailyCostTotal)}</li>
              </ul>
              <div className="mt-2 text-xl font-bold text-zinc-900">
                총 {formatKRW(result.totalCost.grandTotal)}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
