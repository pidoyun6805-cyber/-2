/**
 * Open-Meteo 호출을 한 곳으로 모아 동시 실행 수를 제한하고 재시도를 붙인다.
 *
 * 배치 1회가 Open-Meteo에 374회를 Promise.all로 동시 발사하고 있었고,
 * 그중 167회(45%)가 429 "Too many concurrent requests"로 실패했다.
 * getPeriodClimate는 `if (!res.ok) return null`로 이걸 조용히 삼켜서,
 * "우리가 못 가져온 것"이 "그 목적지에 데이터가 없음"으로 둔갑했다.
 * 그 탓에 삿포로(89점)·도쿄(85점) 같은 1위 후보가 랭킹에서 빠졌다.
 *
 * 실측(374회 기준): 동시 4 → 429 0건, 동시 8 → 148건 실패, 동시 16 → 전멸.
 * 그래서 4로 고정한다.
 */
const MAX_CONCURRENT = 4;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

let active = 0;
const queue: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  active++;
}

function release(): void {
  active--;
  queue.shift()?.();
}

/** 429/5xx는 일시적 실패로 보고 지수 백오프로 재시도한다. 4xx(429 제외)는 재시도해도 소용없어 그대로 반환. */
export async function openMeteoFetch(url: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await acquire();
    let res: Response | null = null;
    try {
      res = await fetch(url);
    } catch {
      res = null; // 네트워크 오류도 재시도 대상
    } finally {
      release();
    }

    if (res && res.ok) return res;

    const retriable = res === null || res.status === 429 || res.status >= 500;
    if (!retriable) return res;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** (attempt - 1)));
    }
  }
  return null;
}
