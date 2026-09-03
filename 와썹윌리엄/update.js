// 새로 올라온 글만 받아서 아카이브를 최신화한다.
//   1) 전용 크롬이 떠 있어야 한다 (아래 안내 참고)
//   2) node update.js
//
// 전용 크롬 실행 (네이버 로그인된 별도 프로필, 디버그 포트 9222):
//   "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
//     --user-data-dir="C:\Users\PC\.claude\chrome-naver-profile" ^
//     --remote-debugging-port=9222 --no-first-run --no-default-browser-check
//
// 봇차단 방지: fetch-all.js의 순차·간격·적응형 감속 정책을 그대로 쓴다.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const VAULT_PATH = 'C:/도윤/와썹윌리엄';

function countSaved() {
  let n = 0;
  const w = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) w(p);
    else if (e.name.endsWith('.md') && e.name !== 'README.md') n++;
  });
  if (fs.existsSync(VAULT_PATH)) w(VAULT_PATH);
  return n;
}

const before = countSaved();
console.log(`현재 아카이브: ${before}개\n`);

console.log('1) 채널 글 목록 갱신...');
execFileSync('node', [path.join(DIR, 'build-index.js')], { stdio: 'inherit', cwd: DIR });

const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
fs.writeFileSync(path.join(DIR, 'index.full.json'), JSON.stringify(index));
console.log(`\n목록 ${index.length}개 확인 → 새 글 ${index.length - before}개 예상\n`);

if (index.length <= before) {
  console.log('새 글 없음. 종료.');
  process.exit(0);
}

console.log('2) 새 글 본문 수집... (이미 받은 글은 건너뜀)');
execFileSync('node', [path.join(DIR, 'fetch-all.js')], { stdio: 'inherit', cwd: DIR });

const after = countSaved();
console.log(`\n완료: ${before} → ${after} (${after - before}개 추가)`);
