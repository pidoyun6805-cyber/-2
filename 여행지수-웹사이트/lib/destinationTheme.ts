// 목적지별 장식 컬러. 절취선 왼쪽(일러스트 패널)에서만 쓰는 순수 장식값이라
// 점수 색(good/warning/serious)과 의미가 겹치지 않는다.
// 같은 나라가 연달아 나와도 단조로워 보이지 않게 색을 흩어 배치했다.
export const DESTINATION_COLOR: Record<string, string> = {
  오사카: "var(--dest-yellow)",
  후쿠오카: "var(--dest-teal)",
  도쿄: "var(--dest-pink)",
  삿포로: "var(--dest-sky)",
  오키나와: "var(--dest-mint)",
  타이베이: "var(--dest-coral)",
  홍콩: "var(--dest-lavender)",
  칭다오: "var(--dest-teal)",
  다낭: "var(--dest-green)",
  세부: "var(--dest-yellow)",
  방콕: "var(--dest-lavender)",
  마닐라: "var(--dest-coral)",
  싱가포르: "var(--dest-mint)",
  쿠알라룸푸르: "var(--dest-green)",
  발리: "var(--dest-pink)",
  괌: "var(--dest-sky)",
  사이판: "var(--dest-teal)",
};

export function destinationColor(destinationKey: string): string {
  return DESTINATION_COLOR[destinationKey] ?? "var(--dest-teal)";
}
