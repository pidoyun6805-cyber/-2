// 수집 현황 점검: 진행률, 페이스, 누락 글, 이상 파일
const fs = require('fs');
const path = require('path');

const VAULT = 'C:/도윤/와썹윌리엄';
const INDEX = JSON.parse(fs.readFileSync(path.join(__dirname, 'index.json'), 'utf8'));

const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  e.isDirectory() ? walk(p) : files.push({ p, size: fs.statSync(p).size, t: fs.statSync(p).mtimeMs });
});
if (fs.existsSync(VAULT)) walk(VAULT);
files.sort((a, b) => a.t - b.t);

const savedIds = new Set(files.map(f => (f.p.match(/\(([a-z0-9]+)\)\.md$/) || [])[1]).filter(Boolean));
const missing = INDEX.filter(it => !savedIds.has(it.id));

console.log('=== 수집 현황 ===');
console.log(`저장 ${files.length} / 전체 ${INDEX.length}  (${(files.length / INDEX.length * 100).toFixed(1)}%)`);
if (files.length) {
  const last = files[files.length - 1];
  console.log(`마지막 저장: ${new Date(last.t).toLocaleTimeString('ko-KR')}  (${((Date.now() - last.t) / 1000).toFixed(0)}초 전)`);
  const rec = files.slice(-21);
  const gaps = [];
  for (let i = 1; i < rec.length; i++) gaps.push(rec[i].t - rec[i - 1].t);
  const clean = gaps.filter(g => g < 300000);
  if (clean.length) {
    const avg = clean.reduce((a, b) => a + b, 0) / clean.length / 1000;
    console.log(`최근 평균 간격: ${avg.toFixed(0)}초`);
    if (missing.length) console.log(`예상 완료: ${new Date(Date.now() + missing.length * avg * 1000).toLocaleTimeString('ko-KR')}`);
  }
}
console.log(`남은 글: ${missing.length}개`);

const tiny = files.filter(f => f.size < 600);
if (tiny.length) {
  console.log(`\n!! 내용이 너무 짧은 파일 ${tiny.length}개 (재수집 권장)`);
  tiny.slice(0, 10).forEach(f => console.log('   ', f.size + 'B', path.basename(f.p)));
}

if (missing.length && missing.length < 30) {
  console.log('\n남은 글 목록:');
  missing.forEach(m => console.log('   ', m.date, m.title.slice(0, 45)));
}
