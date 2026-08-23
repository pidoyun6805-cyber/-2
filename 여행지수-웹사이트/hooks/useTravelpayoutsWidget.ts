"use client";

import { useEffect, useRef, type RefObject } from "react";

// Travelpayouts 위젯(<script async src="...">)을 containerRef 위치에 한 번만 삽입한다.
// React StrictMode가 개발모드에서 effect를 두 번 실행하는 것 때문에 위젯이 중복 렌더링되는 걸
// ref 플래그로 막는다 (state로 하면 재렌더가 걸려서 오히려 다시 실행될 수 있어 ref를 씀).
export function useTravelpayoutsWidget(scriptSrc: string, containerRef: RefObject<HTMLDivElement | null>) {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.charset = "utf-8";
    containerRef.current?.appendChild(script);
  }, [scriptSrc, containerRef]);
}
