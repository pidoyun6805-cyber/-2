"use client";

import { LineChart, average, type LineChartPoint } from "./LineChart";
import type { DestinationResult } from "@/lib/topDestination";
import { countDistinctDates } from "@/lib/flightHistory";
import type { PeakSeasonCurvePoint } from "@/lib/peakSeasonCurve";
import type { Band } from "@/lib/topDestination";

function bandFromScore(score: number | null): Band {
  if (score === null) return "warning";
  if (score >= 65) return "good";
  if (score >= 35) return "warning";
  return "serious";
}

const BAND_TEXT: Record<Band, string> = { good: "text-[var(--good)]", warning: "text-[var(--warning)]", serious: "text-[var(--serious)]" };
const BAND_BG: Record<Band, string> = { good: "bg-[var(--good-track)]", warning: "bg-[var(--warning-track)]", serious: "bg-[var(--serious-track)]" };

function CardShell({ band, icon, label, score, children }: { band: Band; icon: string; label: string; score: number | null; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${BAND_BG[band]}`}>{icon}</div>
        <div className="flex-1 text-sm font-bold">{label}</div>
        <div className={`text-sm font-bold ${BAND_TEXT[band]}`}>{score === null ? "정보 없음" : `${Math.round(score)}점`}</div>
      </div>
      {children}
    </div>
  );
}

function FlightCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.flight;
  const history = result.flightPriceHistory30d;
  const points: LineChartPoint[] = history.map((p) => ({ x: p.date, y: p.price / 10000 }));
  const band = bandFromScore(score);
  const today = points[points.length - 1];
  const avg = points.length > 0 ? average(points) : null;
  const pct = avg && today ? Math.round((Math.abs(today.y - avg) / avg) * 1000) / 10 : null;
  const dir = avg && today && today.y < avg ? "저렴한" : "비싼";
  // "며칠치"는 항목 수가 아니라 고유 날짜 수다. 예전에 항목 수로 세는 바람에
  // 같은 날짜가 3번 중복된 이력이 "최근 4일"로 표시되고 있었다.
  const distinctDays = countDistinctDates(history);

  // 점수가 null이면 이 노선은 실가격 자체를 못 받은 것 — 그래프도 문구도 만들지 않는다.
  if (score === null) {
    return (
      <CardShell band={band} icon="✈️" label="항공권" score={null}>
        <p className="text-xs text-[var(--muted)]">이 노선은 아직 실시간 가격 데이터를 받지 못했어요. 받는 대로 점수와 추이가 표시됩니다.</p>
      </CardShell>
    );
  }

  return (
    <CardShell band={band} icon="✈️" label="항공권" score={score}>
      {points.length >= 2 ? (
        <>
          <LineChart points={points} highlight="min" colorVar="--chart" />
          <p className="mt-2 text-xs text-[var(--muted)]">
            {/* 고유 날짜가 1일뿐이면 비교 대상이 자기 자신이라 평균 비교가 무의미하다 — 현재가만 알린다. */}
            {distinctDays >= 2 && avg !== null
              ? `최근 ${distinctDays}일 평균 ${avg.toFixed(1)}만원보다 ${pct}% ${dir} ${today.y.toFixed(1)}만원대예요.`
              : `지금 ${today.y.toFixed(1)}만원대예요. 비교할 가격 이력이 더 쌓이는 중이에요.`}
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {today ? `지금 ${today.y.toFixed(1)}만원대예요. ` : ""}가격 데이터가 더 쌓이면 추이 그래프가 보여요.
        </p>
      )}
    </CardShell>
  );
}

function HotelCard({ result }: { result: DestinationResult }) {
  const score = result.breakdown.hotel;
  return (
    <CardShell band={bandFromScore(score)} icon="🏨" label="호텔" score={score}>
      <p className="text-xs text-[var(--muted)]">현지 숙박은 고정 추정치를 기준으로 채점돼요. 실제 이력 데이터가 쌓이면 그래프가 추가될 예정이에요.</p>
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]" /> 실시간 가격 추이 연동 준비 중 — 지금은 고정 추정치예요
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
    <CardShell band={bandFromScore(score)} icon="💱" label="환율" score={score}>
      {series && points.length >= 2 ? (
        <>
          <LineChart points={points} highlight="last" showAverageLine colorVar="--chart" />
          <p className="mt-2 text-xs text-[var(--muted)]">
            오늘 환율은 최근 2년 평균보다 {pct}% {dir}.
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--muted)]">이 통화는 아직 환율 데이터가 없어서 표시할 수 없어요.</p>
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
    <CardShell band={bandFromScore(score)} icon="📅" label="성수기" score={score}>
      {points.length >= 2 ? (
        <>
          <LineChart points={points} markerIndex={result.peakMarkerIndex} showAverageLine colorVar="--chart" />
          <p className="mt-2 text-xs text-[var(--muted)]">이 시기 혼잡도는 연중 평균보다 {pct}% {dir}.</p>
        </>
      ) : (
        <p className="text-xs text-[var(--muted)]">데이터가 더 쌓이면 추이 그래프가 보여요.</p>
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
    <CardShell band={bandFromScore(score)} icon="🌤️" label="기후쾌적지수" score={score}>
      {avgTemp !== null ? (
        <p className="text-xs text-[var(--muted)]">
          평균기온 {avgTemp.toFixed(1)}℃({Number.isFinite(lo) ? `최저 ${lo.toFixed(0)}℃·최고 ${hi.toFixed(0)}℃` : "일자별 상세 없음"})
          {delta !== null && `, 평년보다 ${Math.abs(delta).toFixed(1)}℃ ${delta >= 0 ? "높아요" : "낮아요"}`}. 습도{" "}
          {avgHumidity !== null ? `${avgHumidity.toFixed(0)}%` : "정보 없음"} · 풍속 {avgWind !== null ? `${avgWind.toFixed(1)}m/s` : "정보 없음"}
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">기후 데이터가 아직 없어요.</p>
      )}
      <div className="mt-3 flex gap-2">
        {days.map((d) => (
          <div key={d.date} className="flex-1 rounded-lg bg-[var(--surface-2)] px-1.5 py-2 text-center">
            <div className="text-[10px] font-bold text-[var(--muted)]">{d.date.slice(5)}</div>
            <div className="my-1 text-lg">{d.condition ? CONDITION_ICON[d.condition] : "❔"}</div>
            <div className="text-[11.5px] font-bold tabular-nums">
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
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <FlightCard result={result} />
      <HotelCard result={result} />
      <ExchangeCard result={result} />
      <PeakCard result={result} peakSeasonYearCurve={peakSeasonYearCurve} />
      <ClimateCard result={result} />
    </div>
  );
}
