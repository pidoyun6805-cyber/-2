// 볼트에 저장된 개별 md들을 카테고리별 통합 파일로 합친다 (정리 작업용 읽기 단위)
// 사용: node merge-by-category.js            → 전체 카테고리
//       node merge-by-category.js "국부론"    → 이름에 해당 문자열이 든 카테고리만
const fs = require('fs');
const path = require('path');

const VAULT = 'C:/도윤/와썹윌리엄';
const OUT = path.join(__dirname, '_merged');
const filter = process.argv[2];

fs.mkdirSync(OUT, { recursive: true });

const cats = fs.readdirSync(VAULT, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .filter(c => !filter || c.includes(filter));

const summary = [];
for (const cat of cats) {
  const dir = path.join(VAULT, cat);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); // 파일명이 날짜로 시작 → 시간순
  if (!files.length) continue;

  const parts = [`# ${cat}`, `글 ${files.length}개`, ''];
  let chars = 0;
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    // 프론트매터 제거, 제목과 날짜만 헤더로 남김
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const meta = m ? m[1] : '';
    const body = (m ? m[2] : raw).replace(/^\s*#\s.*\n/, '').trim();
    const title = (meta.match(/title:\s*"(.*)"/) || [, f])[1];
    const date = (meta.match(/date:\s*(.*)/) || [, ''])[1].trim();
    const id = (meta.match(/id:\s*(.*)/) || [, ''])[1].trim();
    parts.push(`\n---\n\n## [${date}] ${title}`, `<!-- id:${id} -->`, '', body, '');
    chars += body.length;
  }
  const outFile = path.join(OUT, `${cat.replace(/[\\/:*?"<>|]/g, '')}.md`);
  fs.writeFileSync(outFile, parts.join('\n'), 'utf8');
  summary.push({ cat, files: files.length, chars, kb: Math.round(chars / 1024) });
}

summary.sort((a, b) => b.chars - a.chars);
console.log('카테고리별 통합 파일 생성 →', OUT);
console.log('');
console.log('글수   크기      카테고리');
summary.forEach(s => console.log(String(s.files).padStart(4), String(s.kb + 'KB').padStart(8), '  ' + s.cat));
console.log('');
console.log('합계:', summary.reduce((a, s) => a + s.files, 0), '개 글 /', Math.round(summary.reduce((a, s) => a + s.chars, 0) / 1024), 'KB');
