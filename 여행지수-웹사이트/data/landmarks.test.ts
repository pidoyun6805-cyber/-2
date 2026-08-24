import { test } from "node:test";
import assert from "node:assert/strict";
import { DESTINATIONS } from "../lib/destinations.ts";
import landmarks from "./landmarks.json" with { type: "json" };

test("landmarks.json: DESTINATIONS의 모든 키가 landmarks.json에 존재한다", () => {
  const missing = Object.keys(DESTINATIONS).filter((key) => !(key in landmarks));
  assert.deepEqual(missing, []);
});

test("landmarks.json: 이미지가 있는 항목은 4개 필드가 다 채워져 있다", () => {
  for (const [key, entry] of Object.entries(landmarks as Record<string, Record<string, string>>)) {
    if (entry.imageUrl === "") continue; // 라이선스 못 찾아 빈 값으로 남긴 항목은 예외
    assert.ok(entry.imageUrl.startsWith("https://upload.wikimedia.org/"), `${key}.imageUrl은 wikimedia 업로드 URL이어야 함`);
    assert.ok(entry.landmarkLabel.length > 0, `${key}.landmarkLabel 비어있음`);
    assert.ok(entry.credit.length > 0, `${key}.credit 비어있음`);
    assert.ok(entry.sourcePage.startsWith("https://commons.wikimedia.org/"), `${key}.sourcePage는 commons 페이지 URL이어야 함`);
  }
});
