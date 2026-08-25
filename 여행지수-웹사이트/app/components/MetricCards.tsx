"use client";

import { LineChart, average, type LineChartPoint } from "./LineChart";
import type { DestinationResult } from "@/lib/topDestination";
import type { PeakSeasonCurvePoint } from "@/lib/peakSeasonCurve";
import type { Band } from "@/lib/topDestination";

function bandFromScore(score: number | null): Band {
  if (score === null) return "warning";
  if (score >= 65) return "good";
  if (score >= 35) return "warning";
  return "serious";
}

function CardShell({ band, label, code, score, children }: { band: Band; label: string; code: string; score: number | null; children: React.ReactNode }) {
  return (
    <div className="paper-grain relative flex flex-col overflow-hidden rounded-xl px-5 pt-4 pb-5">
      {/* 카드 상단 절취선 — 티켓에서 뜯어낸 조각이라는 신호 */}
      <div className="perf-h absolute top-3 right-0 left-0" aria-hidden="true" />
      <div className="mt-2 mb-3 flex items-baseline justify-between gap-2">
        <div>
          <div className="ticket-num text-[8.5px] font-medium tracking-[0.16em] text-[var(--muted)] uppercase">{code}</div>
          <div className="text-[13.5px] font-bold text-[var(--ink)]">{label}</div>
        </div>
        <div className="ticket-num text-[20px] font-semibold" style={{ color: `var(--${band})` }}>
          {score === null ? <span className="text-[12px] font-semibold">정보 없음</span> : Math.round(score)}
        </div>
      </div>
      {children}
    </div>
  );
}

function FlightCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.flight;
  const points: LineChartPoint[] = result.flightPriceHistory30d.map((p) => ({ x: p.date, y: p.price / 10000 }));
  const band = bandFromScore(score);
  const today = points[points.length - 1];
  const avg = points.length > 0 ? average(points) : null;
  const pct = avg && today ? Math.round((Math.abs(today.y - avg) / avg) * 1000) / 10 : null;
  const dir = avg && today && today.y < avg ? "저렴한" : "비싼";

  return (
    <CardShell band={band} label="항공권" code="Flight" score={score}>
      {points.length >= 2 ? (
        <>
          <LineChart points={points} highlight="min" colorVar="--chart" />
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
            {/* 이력이 이제 막 쌓이는 중이라 표본은 최대 30일이지 30일이 아니다 — 실제 표본 일수를 그대로 쓴다.
                3일 미만이면 평균 비교가 사실상 의미 없어서 비교 문구 없이 현재가만 알린다. */}
            {points.length >= 3 && avg !== null
              ? `최근 ${points.length}일 평균 ${avg.toFixed(1)}만원보다 ${pct}% ${dir} ${today.y.toFixed(1)}만원대예요.`
              : `지금 ${today.y.toFixed(1)}만원대예요. 비교할 가격 이력이 더 쌓이는 중이에요.`}
          </p>
        </>
      ) : (
        <p className="text-[11.5px] text-[var(--ink-2)]">가격 데이터가 더 쌓이면 추이 그래프가 보여요.</p>
      )}
    </CardShell>
  );
}

function HotelCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.hotel;
  return (
    <CardShell band={bandFromScore(score)} label="호텔" code="Stay" score={score}>
      <p className="text-[11.5px] leading-relaxed text-[var(--ink-2)]">현지 숙박은 고정 추정치를 기준으로 채점돼요. 실제 이력 데이터가 쌓이면 그래프가 추가될 예정이에요.</p>
      <div className="mt-2.5 inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-[var(--rule)] bg-[var(--paper-2)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]" aria-hidden="true" /> 실시간 가격 추이 연동 준비 중 — 지금은 고정 추정치예요
      </div>
    </CardShell>
  );
}

function ExchangeCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.exchangeRate;
  const series = result.exchangeRateSeries;
  const points: LineChartPoint[] = series ? series.historicalRates.map((rate, i) => ({ x: String(i), y: rate })) : [];
  const avg = points.length > 0 ? average(points) : null;
  const current = series?.currentRate ?? null;
  const pct = avg !== null && current !== null ? Math.round((Math.abs(current - avg) / avg) * 1000) / 10 : null;
  const dir = avg !== null && current !== null && current < avg ? "낮아요" : "높아요";

  return (
    <CardShell band={bandFromScore(score)} label="환율" code="FX" score={score}>
      {series && points.length >= 2 ? (
        <>
          <LineChart points={points} highlight="last" showAverageLine colorVar="--chart" />
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
            오늘 환율은 최근 2년 평균보다 {pct}% {dir}.
          </p>
        </>
      ) : (
        <p className="text-[11.5px] text-[var(--ink-2)]">이 통화는 아직 환율 데이터가 없어서 표시할 수 없어요.</p>
      )}
    </CardShell>
  );
}

function PeakCard({ result, peakSeasonYearCurve }: { result: DestinationResult; peakSeasonYearCurve: PeakSeasonCurvePoint[] }) {
  const score = result.breakdown.peakSeason;
  const points: LineChartPoint[] = peakSeasonYearCurve.map((p) => ({ x: p.date, y: p.score }));
  const avg = points.length > 0 ? average(points) : null;
  const markerScore = peakSeasonYearCurve[result.peakMarkerIndex]?.score ?? score ?? 0;
  const pct = avg !== null ? Math.round((Math.abs(markerScore - avg) / avg) * 100) : null;
  const dir = avg !== null && markerScore > avg ? "한산해요" : "붐벼요";

  return (
    <CardShell band={bandFromScore(score)} label="성수기" code="Season" score={score}>
      {points.length >= 2 ? (
        <>
          <LineChart points={points} markerIndex={result.peakMarkerIndex} showAverageLine colorVar="--chart" />
          <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--ink-2)]">
            이 시기 혼잡도는 연중 평균보다 {pct}% {dir}.
          </p>
        </>
      ) : (
        <p className="text-[11.5px] text-[var(--ink-2)]">데이터가 더 쌓이면 추이 그래프가 보여요.</p>
      )}
    </CardShell>
  );
}

const CONDITION_ICON: Record<string, string> = { clear: "☀️", cloudy: "☁️", rain: "🌧️", snow: "❄️" };
const CONDITION_LABEL: Record<string, string> = { clear: "맑음", cloudy: "흐림", rain: "비", snow: "눈" };

function ClimateCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.climateComfort;
  const days = result.climateDaily;
  const validTemps = days.filter((d) => d.tempC !== null);
  const avgTemp = validTemps.length > 0 ? validTemps.reduce((s, d) => s + (d.tempC ?? 0), 0) / validTemps.length : null;
  const lo = Math.min(...days.map((d) => d.tempMinC ?? Infinity).filter(Number.isFinite));
  const hi = Math.max(...days.map((d) => d.tempMaxC ?? -Infinity).filter(Number.isFinite));
  const delta = avgTemp !== null && result.climateBaseline10y !== null ? avgTemp - result.climateBaseline10y : null;
  // null을 0으로 세어 평균 내면 값이 없을 때 "습도 0%"처럼 없는 데이터를 있는 것처럼 보여주게 된다 — 유효값만 평균낸다.
  const validHumidity = days.map((d) => d.relHumidity).filter((v) => v !== null);
  const validWind = days.map((d) => d.windKmh).filter((v) => v !== null);
  const avgHumidity = validHumidity.length > 0 ? validHumidity.reduce((s, v) => s + v, 0) / validHumidity.length : null;
  const avgWind = validWind.length > 0 ? validWind.reduce((s, v) => s + v, 0) / validWind.length : null;

  return (
    <CardShell band={bandFromScore(score)} label="기후쾌적지수" code="Climate" score={score}>
      {avgTemp !== null ? (
        <p className="text-[11.5px] leading-relaxed text-[var(--ink-2)]">
          평균기온 <span className="ticket-num font-semibold text-[var(--ink)]">{avgTemp.toFixed(1)}℃</span>
          {Number.isFinite(lo) && (
            <>
              {" "}
              (최저 <span className="ticket-num">{lo.toFixed(0)}</span>℃·최고 <span className="ticket-num">{hi.toFixed(0)}</span>℃)
            </>
          )}
          {delta !== null && `, 평년보다 ${Math.abs(delta).toFixed(1)}℃ ${delta >= 0 ? "높아요" : "낮아요"}`}. 습도{" "}
          {avgHumidity !== null ? `${avgHumidity.toFixed(0)}%` : "정보 없음"} · 풍속 {avgWind !== null ? `${avgWind.toFixed(1)}m/s` : "정보 없음"}
        </p>
      ) : (
        <p className="text-[11.5px] text-[var(--ink-2)]">기후 데이터가 아직 없어요.</p>
      )}
      <div className="mt-3 flex gap-2">
        {days.map((d) => (
          <div key={d.date} className="flex-1 rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-1.5 py-2 text-center">
            <div className="ticket-num text-[9.5px] font-medium text-[var(--muted)]">{d.date.slice(5)}</div>
            <div className="my-1 text-[17px]">{d.condition ? CONDITION_ICON[d.condition] : "❔"}</div>
            <div className="ticket-num text-[11px] font-semibold text-[var(--ink)]">
              {d.tempMinC !== null && d.tempMaxC !== null ? `${d.tempMinC.toFixed(0)}~${d.tempMaxC.toFixed(0)}℃` : "-"}
            </div>
            <div className="text-[9.5px] text-[var(--muted)]">{d.condition ? CONDITION_LABEL[d.condition] : "-"}</div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

export function MetricCards({ result, peakSeasonYearCurve }: { result: DestinationResult; peakSeasonYearCurve: PeakSeasonCurvePoint[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <FlightCard result={result} />
      <HotelCard result={result} />
      <ExchangeCard result={result} />
      <PeakCard result={result} peakSeasonYearCurve={peakSeasonYearCurve} />
      <ClimateCard result={result} />
    </div>
  );
}
