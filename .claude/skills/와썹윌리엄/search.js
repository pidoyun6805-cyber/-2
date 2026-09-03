#!/usr/bin/env node
// 와썹윌리엄 아카이브 검색 — 858개 글을 다 읽지 않고 필요한 것만 찾는다.
//
//   node search.js "변압기 전력"          키워드 검색 (제목+본문), 관련도순
//   node search.js -t "대장주"            제목만 검색
//   node search.js -c                     카테고리 목록과 글 수
//   node search.js -c "국부론"            해당 카테고리의 글 목록
//   node search.js -r 30                  최근 30개 글 목록
//   node search.js -d 2026-08             해당 연월 글 목록
//   node search.js -p "<파일경로 일부>"    해당 글 본문 출력 (면책조항 제거)
//
// 검색 결과는 파일 경로를 주므로, 이후 -p 로 본문을 읽으면 된다.

const fs = require('fs');
const path = require('path');

const VAULT = 'C:/도윤/와썹윌리엄';
const NOISE = /\[콘텐츠 법적 안내 및 면책 고지\][\s\S]*$/;
const NOTICE = /주요 공지!\s*\n[\s\S]*?어금망!🥭/g;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md') && e.name !== 'README.md') out.push(p);
  }
  return out;
}

function meta(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm = m ? m[1] : '';
  const get = k => (fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?$`, 'm')) || [, ''])[1];
  let body = (m ? m[2] : raw).replace(NOISE, '').replace(NOTICE, '').trim();
  return {
    file,
    title: get('title'),
    category: get('category'),
    date: get('date'),
    source: get('source'),
    body,
  };
}

const files = walk(VAULT);
const [flag, ...rest] = process.argv.slice(2);
const arg = rest.join(' ');

// 카테고리 목록 / 특정 카테고리
if (flag === '-c') {
  const docs = files.map(meta);
  if (!arg) {
    const counts = {};
    docs.forEach(d => (counts[d.category] = (counts[d.category] || 0) + 1));
    Object.entries(counts).sort((a, b) => b[1] - a[1])
      .forEach(([c, n]) => console.log(String(n).padStart(4), c));
    console.log('\n합계', docs.length, '개');
  } else {
    docs.filter(d => d.category.includes(arg))
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(d => console.log(d.date, '|', d.title, '\n     ', d.file));
  }
  process.exit(0);
}

// 최근 N개
if (flag === '-r') {
  const n = parseInt(arg || '20', 10);
  files.map(meta).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
    .forEach(d => console.log(d.date, '|', `[${d.category}]`, d.title, '\n     ', d.file));
  process.exit(0);
}

// 연월
if (flag === '-d') {
  files.map(meta).filter(d => d.date.startsWith(arg)).sort((a, b) => a.date.localeCompare(b.date))
    .forEach(d => console.log(d.date, '|', `[${d.category}]`, d.title, '\n     ', d.file));
  process.exit(0);
}

// 본문 출력
if (flag === '-p') {
  const hit = files.find(f => f.includes(arg)) || files.find(f => path.basename(f).includes(arg));
  if (!hit) { console.error('찾지 못함:', arg); process.exit(1); }
  const d = meta(hit);
  console.log(`# ${d.title}\n날짜: ${d.date} | 카테고리: ${d.category}\n원문: ${d.source}\n\n${d.body}`);
  process.exit(0);
}

// 검색
const titleOnly = flag === '-t';
const query = titleOnly ? arg : [flag, ...rest].join(' ');
if (!query) {
  console.error('사용법: node search.js "키워드"  |  -t 제목검색  |  -c 카테고리  |  -r 최근  |  -d 연월  |  -p 본문');
  process.exit(1);
}
const terms = query.split(/\s+/).filter(Boolean);

const scored = files.map(meta).map(d => {
  const hay = titleOnly ? d.title : d.title + '\n' + d.body;
  let score = 0;
  for (const t of terms) {
    const inTitle = (d.title.match(new RegExp(t, 'gi')) || []).length;
    const inBody = titleOnly ? 0 : (d.body.match(new RegExp(t, 'gi')) || []).length;
    score += inTitle * 10 + Math.min(inBody, 20);
  }
  // 모든 키워드가 들어간 글에 가산점
  if (terms.every(t => new RegExp(t, 'i').test(hay))) score += 15;
  return { d, score };
}).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 25);

if (!scored.length) { console.log('결과 없음'); process.exit(0); }

console.log(`"${query}" 검색 결과 ${scored.length}건 (관련도순)\n`);
scored.forEach(({ d, score }) => {
  console.log(`[${score}] ${d.date} | ${d.category}`);
  console.log(`  ${d.title}`);
  // 첫 매치 주변 발췌
  if (!titleOnly) {
    const i = d.body.search(new RegExp(terms[0], 'i'));
    if (i >= 0) console.log('  ...' + d.body.slice(Math.max(0, i - 60), i + 120).replace(/\n+/g, ' ') + '...');
  }
  console.log(`  ${d.file}\n`);
});
