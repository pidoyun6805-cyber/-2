import { test } from "node:test";
import assert from "node:assert";
import { DESTINATIONS } from "./destinations.ts";
import { DESTINATION_COLOR, destinationColor } from "./destinationTheme.ts";

test("DESTINATION_COLOR: 모든 목적지에 색이 배정돼 있다", () => {
  for (const key of Object.keys(DESTINATIONS)) {
    assert.ok(DESTINATION_COLOR[key], `${key}에 색이 없음`);
  }
});

test("DESTINATION_COLOR: 등록되지 않은 목적지 키가 섞여있지 않다", () => {
  for (const key of Object.keys(DESTINATION_COLOR)) {
    assert.ok(DESTINATIONS[key], `${key}는 DESTINATIONS에 없는 목적지`);
  }
});

test("destinationColor: 모르는 키는 폴백 색을 준다", () => {
  assert.equal(destinationColor("없는도시"), "var(--dest-teal)");
});
