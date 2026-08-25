/**
 * 데이터 출처 표기. Open-Meteo 데이터는 CC BY 4.0이라 출처 표기가 라이선스 의무다.
 * 나머지도 같은 자리에 함께 밝힌다.
 */
export function DataSources() {
  return (
    <footer className="mt-12 border-t border-[var(--border)] pt-5 pb-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
      <p>
        날씨 데이터 ©{" "}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ink)]">
          Open-Meteo
        </a>{" "}
        (
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--ink)]"
        >
          CC BY 4.0
        </a>
        ) · 환율 데이터{" "}
        <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ink)]">
          Frankfurter
        </a>{" "}
        (ECB) · 항공권 데이터 Travelpayouts
      </p>
      <p className="mt-1">랜드마크 사진은 Wikimedia Commons에서 가져왔고, 사진마다 저작자·라이선스·원본 링크를 사진 위에 표시합니다.</p>
    </footer>
  );
}
