"use client";

/* 티켓 프리미티브. 절취선과 반원 노치는 장식이 아니라 의미 경계다 —
   왼쪽은 장식용 목적지 컬러 패널, 오른쪽은 점수/데이터가 놓이는 종이면. */

export function TicketShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`paper-grain relative overflow-hidden rounded-2xl text-[var(--ink)] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] ${className}`}>{children}</div>;
}

/** 세로 절취선 + 위아래 반원 노치. 부모가 relative여야 한다. */
export function PerforationV({ left }: { left: string }) {
  return (
    <>
      <div className="perf-v pointer-events-none absolute top-0 bottom-0 z-10" style={{ left }} />
      <div className="notch pointer-events-none z-10" style={{ left, top: 0, transform: "translate(-50%, -50%)" }} />
      <div className="notch pointer-events-none z-10" style={{ left, bottom: 0, transform: "translate(-50%, 50%)" }} />
    </>
  );
}

/** 원형 잉크 스탬프. 레퍼런스의 "DISCOVER" 도장 자리에 총점을 찍는다. */
export function ScoreStamp({ score, grade, band }: { score: number; grade: string; band: string }) {
  return (
    <div
      className="flex h-[104px] w-[104px] shrink-0 -rotate-12 flex-col items-center justify-center rounded-full border-[3px] text-center"
      style={{ borderColor: `var(--${band})`, color: `var(--${band})` }}
    >
      <span className="text-[9px] font-bold tracking-[0.18em]">여행지수</span>
      <span className="ticket-num text-[34px] leading-none font-semibold">{score}</span>
      <span className="text-[10.5px] font-bold">{grade}</span>
    </div>
  );
}

/** 티켓 메타데이터 한 칸 (Flight no. / Boarding time 자리). */
export function MetaCell({ label, value, valueClass = "" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div>
      <div className="text-[8.5px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">{label}</div>
      <div className={`mt-0.5 text-[13px] font-semibold text-[var(--ink)] ${valueClass}`}>{value}</div>
    </div>
  );
}

/** 바코드. 실제 데이터를 인코딩하진 않지만 티켓의 시각 문법이라 넣는다 — 폭을 키에서 유도해 목적지마다 다르게 보이게 한다. */
export function Barcode({ seed, className = "" }: { seed: string; className?: string }) {
  const bars = Array.from({ length: 44 }, (_, i) => {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    return (code % 3) + 1;
  });
  return (
    <div className={`flex items-end gap-[2px] ${className}`} aria-hidden="true">
      {bars.map((w, i) => (
        <span key={i} className="block h-full bg-[var(--ink)]" style={{ width: `${w}px`, opacity: w === 2 ? 0.85 : 1 }} />
      ))}
    </div>
  );
}
