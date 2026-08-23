import type { Grade } from "./scoring";

export type Band = "good" | "warning" | "serious";

const GRADE_BAND: Record<Grade, Band> = {
  최적기: "good",
  좋음: "good",
  보통: "warning",
  비추천: "serious",
  최악: "serious",
};

export function bandFromGrade(grade: Grade): Band {
  return GRADE_BAND[grade];
}

export interface CandidateWindow {
  departDate: string;
  returnDate: string;
}

const TRIP_NIGHTS = 2; // 2박3일 고정 (사용자 확정값)
const CANDIDATE_OFFSET_DAYS = [14, 30, 45]; // 사용자 확정값 — 이보다 늘리지 않는다(API 부하)

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 오늘 기준 +14/+30/+45일 시점을 출발일로 하는 3개 고정 후보 구간(각 2박3일)을 만든다.
export function candidateWindows(today: Date = new Date()): CandidateWindow[] {
  return CANDIDATE_OFFSET_DAYS.map((offset) => {
    const depart = new Date(today);
    depart.setUTCDate(depart.getUTCDate() + offset);
    const ret = new Date(depart);
    ret.setUTCDate(ret.getUTCDate() + TRIP_NIGHTS);
    return { departDate: fmt(depart), returnDate: fmt(ret) };
  });
}
