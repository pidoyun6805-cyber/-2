import type { ClimateDay, WeatherCondition } from "./scoring";

// 환율: Frankfurter.app (무료, 키 불필요). 오늘 환율과 최근 2년(730일)치 일별 환율을 가져온다.
// exchangeRateScore()의 z-score 채점에 넘길 원본 데이터.
export async function getExchangeRateHistory(
  currency: string
): Promise<{ currentRate: number; historicalRates: number[] }> {
  const today = new Date();
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setDate(twoYearsAgo.getDate() - 730);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const [currentRes, seriesRes] = await Promise.all([
    fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=KRW`),
    fetch(`https://api.frankfurter.dev/v1/${fmt(twoYearsAgo)}..${fmt(today)}?base=${currency}&symbols=KRW`),
  ]);

  const current = await currentRes.json();
  const series = await seriesRes.json();

  const currentRate: number = current.rates.KRW;
  const historicalRates: number[] = Object.values(series.rates).map(
    (r: unknown) => (r as { KRW: number }).KRW
  );

  return { currentRate, historicalRates };
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

function averageValid(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

// 여행 기간(가는 날~오는 날) 동안의 날짜별 기온/습도/구름량/강수량/풍속을
// 최근 3년 같은 날짜대의 평균으로 추정 (기후쾌적지수 HCI:Urban 계산용 입력).
// Open-Meteo 응답에 값이 없으면 해당 연도는 평균에서 제외.
export async function getPeriodClimate(
  lat: number,
  lon: number,
  departDate: string,
  returnDate: string
): Promise<ClimateDay[]> {
  const depart = new Date(departDate);
  const ret = new Date(returnDate);
  const tripDayCount = Math.max(
    1,
    Math.round((ret.getTime() - depart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const perYear = await Promise.all(
    [1, 2, 3].map(async (yearsAgo) => {
      const shiftedStart = new Date(depart);
      shiftedStart.setFullYear(depart.getFullYear() - yearsAgo);
      const shiftedEnd = new Date(shiftedStart);
      shiftedEnd.setDate(shiftedStart.getDate() + (tripDayCount - 1));

      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${fmt(shiftedStart)}&end_date=${fmt(shiftedEnd)}` +
        `&daily=temperature_2m_mean,relative_humidity_2m_mean,cloud_cover_mean,precipitation_sum,wind_speed_10m_max` +
        `&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return {
        temp: json?.daily?.temperature_2m_mean as (number | null)[] | undefined,
        humidity: json?.daily?.relative_humidity_2m_mean as (number | null)[] | undefined,
        cloud: json?.daily?.cloud_cover_mean as (number | null)[] | undefined,
        precip: json?.daily?.precipitation_sum as (number | null)[] | undefined,
        wind: json?.daily?.wind_speed_10m_max as (number | null)[] | undefined,
      };
    })
  );

  const days: ClimateDay[] = [];
  for (let i = 0; i < tripDayCount; i++) {
    days.push({
      tempC: averageValid(perYear.map((y) => y?.temp?.[i])),
      relHumidity: averageValid(perYear.map((y) => y?.humidity?.[i])),
      cloudCoverPct: averageValid(perYear.map((y) => y?.cloud?.[i])),
      precipMm: averageValid(perYear.map((y) => y?.precip?.[i])),
      windKmh: averageValid(perYear.map((y) => y?.wind?.[i])),
    });
  }

  return days;
}
