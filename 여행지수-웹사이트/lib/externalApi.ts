import type { WeatherCondition } from "./scoring";

// 환율: Frankfurter.app (무료, 키 불필요). 최근 6개월 평균 대비 현재 환율의 유리한 정도(%)를 반환.
// 원화가 강세일수록(외화를 더 싸게 살 수 있을수록) 양수.
export async function getExchangeFavorability(currency: string): Promise<number> {
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [currentRes, seriesRes] = await Promise.all([
    fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=KRW`),
    fetch(`https://api.frankfurter.dev/v1/${fmt(sixMonthsAgo)}..${fmt(today)}?base=${currency}&symbols=KRW`),
  ]);

  const current = await currentRes.json();
  const series = await seriesRes.json();

  const currentRate: number = current.rates.KRW;
  const rates: number[] = Object.values(series.rates).map((r: unknown) => (r as { KRW: number }).KRW);
  const avgRate = rates.reduce((sum, r) => sum + r, 0) / rates.length;

  // 환율(원/외화)이 평균보다 낮을수록 원화 강세 = 여행자에게 유리
  return (avgRate - currentRate) / avgRate;
}

// WMO weathercode -> 카테고리 매핑 (Open-Meteo 기준)
function weatherCodeToCondition(code: number): WeatherCondition {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  if ([0, 1].includes(code)) return "clear";
  return "cloudy"; // 2,3,45,48 등
}

// 날씨/기온: Open-Meteo 과거 데이터(무료, 키 불필요)로 최근 3년 같은 날짜의 평균 기온/대표 날씨를 조회.
// 실제 여행일 예보 대신 "이맘때 평균적으로 어떤지"를 계절 지표로 사용.
export async function getSeasonalWeather(
  lat: number,
  lon: number,
  month: number,
  day: number
): Promise<{ avgTempC: number; condition: WeatherCondition }> {
  const now = new Date();
  const years = [1, 2, 3].map((n) => now.getFullYear() - n);
  const pad = (n: number) => String(n).padStart(2, "0");

  const results = await Promise.all(
    years.map(async (year) => {
      const dateStr = `${year}-${pad(month)}-${pad(day)}`;
      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_mean,weathercode&timezone=auto`;
      const res = await fetch(url);
      const json = await res.json();
      return {
        temp: json.daily.temperature_2m_mean[0] as number,
        code: json.daily.weathercode[0] as number,
      };
    })
  );

  const avgTempC = results.reduce((sum, r) => sum + r.temp, 0) / results.length;

  const codeCounts = new Map<number, number>();
  for (const r of results) codeCounts.set(r.code, (codeCounts.get(r.code) ?? 0) + 1);
  const modeCode = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return { avgTempC, condition: weatherCodeToCondition(modeCode) };
}
