import type { WeatherCondition } from "./scoring.ts";

export interface ClimateDayDetail {
  date: string; // YYYY-MM-DD
  tempC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  relHumidity: number | null;
  cloudCoverPct: number | null;
  precipMm: number | null;
  windKmh: number | null;
  condition: WeatherCondition | null;
}

// WMO weathercode -> 카테고리. externalApi.ts의 동일 로직을 이 파일 전용으로 복제(공유 안 함 — 위 설명 참고).
function weatherCodeToCondition(code: number): WeatherCondition {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "rain";
  if ([0, 1].includes(code)) return "clear";
  return "cloudy";
}

function averageValid(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function modeValid(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of valid) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tripDayCount(departDate: string, returnDate: string): number {
  const depart = new Date(departDate);
  const ret = new Date(returnDate);
  return Math.max(1, Math.round((ret.getTime() - depart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

// 여행 기간 각 날짜의 최저/최고기온/날씨상태를 최근 3년 같은 날짜대의 평균(기온)·최빈값(날씨코드)으로 추정.
// getPeriodClimate와 같은 "연도별 실패는 그 해만 건너뛴다" 방어 패턴.
export async function getPeriodClimateDaily(
  lat: number,
  lon: number,
  departDate: string,
  returnDate: string
): Promise<ClimateDayDetail[]> {
  const depart = new Date(departDate);
  const dayCount = tripDayCount(departDate, returnDate);

  const perYear = await Promise.all(
    [1, 2, 3].map(async (yearsAgo) => {
      const shiftedStart = new Date(depart);
      shiftedStart.setFullYear(depart.getFullYear() - yearsAgo);
      const shiftedEnd = new Date(shiftedStart);
      shiftedEnd.setDate(shiftedStart.getDate() + (dayCount - 1));

      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${fmt(shiftedStart)}&end_date=${fmt(shiftedEnd)}` +
        `&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max,relative_humidity_2m_mean,` +
        `cloud_cover_mean,precipitation_sum,wind_speed_10m_max,weathercode&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return {
        temp: json?.daily?.temperature_2m_mean as (number | null)[] | undefined,
        tempMin: json?.daily?.temperature_2m_min as (number | null)[] | undefined,
        tempMax: json?.daily?.temperature_2m_max as (number | null)[] | undefined,
        humidity: json?.daily?.relative_humidity_2m_mean as (number | null)[] | undefined,
        cloud: json?.daily?.cloud_cover_mean as (number | null)[] | undefined,
        precip: json?.daily?.precipitation_sum as (number | null)[] | undefined,
        wind: json?.daily?.wind_speed_10m_max as (number | null)[] | undefined,
        code: json?.daily?.weathercode as (number | null)[] | undefined,
      };
    })
  );

  const days: ClimateDayDetail[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(depart);
    d.setDate(d.getDate() + i);
    const codeMode = modeValid(perYear.map((y) => y?.code?.[i]));
    days.push({
      date: fmt(d),
      tempC: averageValid(perYear.map((y) => y?.temp?.[i])),
      tempMinC: averageValid(perYear.map((y) => y?.tempMin?.[i])),
      tempMaxC: averageValid(perYear.map((y) => y?.tempMax?.[i])),
      relHumidity: averageValid(perYear.map((y) => y?.humidity?.[i])),
      cloudCoverPct: averageValid(perYear.map((y) => y?.cloud?.[i])),
      precipMm: averageValid(perYear.map((y) => y?.precip?.[i])),
      windKmh: averageValid(perYear.map((y) => y?.wind?.[i])),
      condition: codeMode === null ? null : weatherCodeToCondition(codeMode),
    });
  }
  return days;
}

// "평년" 기준값: 과거 10년(같은 날짜대) 평균기온 하나만. 여행 기간 전체를 하나의 숫자로 뭉갠다
// (일자별 breakdown은 필요 없음 — "평년보다 X도" 델타 텍스트 용도이므로).
export async function getClimateBaseline10y(
  lat: number,
  lon: number,
  departDate: string,
  returnDate: string
): Promise<number | null> {
  const depart = new Date(departDate);
  const dayCount = tripDayCount(departDate, returnDate);
  const years = Array.from({ length: 10 }, (_, i) => i + 1);

  const perYear = await Promise.all(
    years.map(async (yearsAgo) => {
      const shiftedStart = new Date(depart);
      shiftedStart.setFullYear(depart.getFullYear() - yearsAgo);
      const shiftedEnd = new Date(shiftedStart);
      shiftedEnd.setDate(shiftedStart.getDate() + (dayCount - 1));

      const url =
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${fmt(shiftedStart)}&end_date=${fmt(shiftedEnd)}&daily=temperature_2m_mean&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      return averageValid((json?.daily?.temperature_2m_mean as (number | null)[] | undefined) ?? []);
    })
  );

  return averageValid(perYear);
}
