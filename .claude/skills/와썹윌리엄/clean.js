// 아카이브 원문에서 내용이 아닌 것을 걷어낸다.
// 네이버 프리미엄 본문에는 글마다 같은 상용구와 문단 구분용 제로폭 문자가 잔뜩 붙어 있다.
// 글을 읽을 때마다 그게 같이 실리므로 원본에서 지운다. 새로 수집한 뒤에도 다시 돌리면 된다.
//
//   node clean.js          무엇이 얼마나 지워지는지 보기만 함
//   node clean.js --write  실제로 지움
//
// 본문 문장은 건드리지 않는다. 서론이나 잡담을 골라 지우려면 글마다 읽고 판단해야 하는데,
// 858개를 그렇게 훑는 비용이 절약분보다 크다. 그래서 기계적으로 확실한 것만 지운다.

const fs = require('fs');
const path = require('path');

const VAULT = 'C:/도윤/와썹윌리엄';

const RULES = [
  // 글 끝에 843개 파일마다 똑같이 붙는 면책 고지. 이 뒤로는 썸네일 링크뿐이다.
  ['면책 고지', /\[콘텐츠 법적 안내 및 면책 고지\][\s\S]*$/g],
  ['주요 공지', /주요 공지!\s*\n[\s\S]*?어금망!🥭/g],
  ['저작권 경고', /본 자료는[^\n]*저작권[\s\S]*?늘 감사드립니다\./g],
  // 매 글 첫 줄의 인사말.
  ['인사말', /^와썹 윌리엄!.*$/gm],
  // 댓글 수 채우기·구독 유도와 단축 링크.
  ['댓글·구독 유도', /^[^\n]*(댓글 목표|깔끔하게 \d+개|naver\.me)[^\n]*$/gm],
  // 네이버 CDN 썸네일. 인코딩된 URL이 한 줄에 수백 바이트인데 읽는 쪽에 정보를 주지 않는다.
  ['썸네일 링크', /^!\[[^\]]*\]\([^)]*\)[ \t]*$/gm],
  // 완독 소요시간 머리말.
  ['readTime', /^readTime: .*$\r?\n?/m],
  // 문단 사이마다 끼어 있는 제로폭 공백. 전체의 6%를 차지한다.
  ['제로폭 문자', /\u200b/g],
];

function clean(text) {
  let out = text;
  for (const [, re] of RULES) out = out.replace(re, '');
  return out
    .replace(/[ \t]+$/gm, '')          // 줄 끝 공백
    .replace(/(?:\r?\n){3,}/g, '\r\n\r\n')  // 빈 줄이 연달아 남은 것
    .trimEnd() + '\r\n';
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const write = process.argv.includes('--write');
const hits = Object.fromEntries(RULES.map(([n]) => [n, 0]));
let before = 0, after = 0, touched = 0;

for (const file of walk(VAULT)) {
  const raw = fs.readFileSync(file, 'utf8');
  for (const [name, re] of RULES) {
    const m = raw.match(re);
    if (m) hits[name] += m.length;
  }
  const cleaned = clean(raw);
  before += Buffer.byteLength(raw);
  after += Buffer.byteLength(cleaned);
  if (cleaned !== raw) {
    touched++;
    if (write) fs.writeFileSync(file, cleaned, 'utf8');
  }
}

const n = x => x.toLocaleString();
console.log(write ? '정리 완료' : '미리보기 (--write 안 붙임)');
for (const [name] of RULES) console.log(`  ${name.padEnd(14)} ${n(hits[name]).padStart(8)}건`);
console.log(`  ${'대상 파일'.padEnd(13)} ${n(touched).padStart(8)}개`);
console.log(`  ${n(before)} B → ${n(after)} B`);
console.log(`  절감 ${n(before - after)} B (${((before - after) / before * 100).toFixed(1)}%)`);
