// 아카이브 원문에서 반복 상용구를 걷어낸다.
// 843개 파일에 똑같이 붙어 있는 [콘텐츠 법적 안내 및 면책 고지] 블록이 전체의 26%를 차지한다.
// 글을 읽을 때마다 이게 같이 실리므로 원본에서 지운다. 새로 수집한 뒤에도 다시 돌리면 된다.
//
//   node clean.js          무엇이 얼마나 지워지는지 보기만 함
//   node clean.js --write  실제로 지움

const fs = require('fs');
const path = require('path');

const VAULT = 'C:/도윤/와썹윌리엄';
const NOISE = /\[콘텐츠 법적 안내 및 면책 고지\][\s\S]*$/;
const NOTICE = /주요 공지!\s*\n[\s\S]*?어금망!🥭/g;
// 네이버 CDN 썸네일 링크. 인코딩된 URL이 한 줄에 수백 바이트씩 차지하는데
// 글을 읽는 쪽(에이전트)에는 아무 정보도 주지 않는다.
const IMG = /^!\[[^\]]*\]\([^)]*\)\s*$/gm;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const write = process.argv.includes('--write');
let before = 0, after = 0, touched = 0;

for (const file of walk(VAULT)) {
  const raw = fs.readFileSync(file, 'utf8');
  const cleaned = raw
    .replace(NOISE, '')
    .replace(NOTICE, '')
    .replace(IMG, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
  before += Buffer.byteLength(raw);
  after += Buffer.byteLength(cleaned);
  if (cleaned !== raw) {
    touched++;
    if (write) fs.writeFileSync(file, cleaned, 'utf8');
  }
}

const n = x => x.toLocaleString();
console.log(`${write ? '정리 완료' : '미리보기 (--write 안 붙임)'}`);
console.log(`  대상 파일   ${touched}개`);
console.log(`  ${n(before)} B → ${n(after)} B`);
console.log(`  절감        ${n(before - after)} B (${((before - after) / before * 100).toFixed(1)}%)`);
