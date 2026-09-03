// 와썹윌리엄 전체 글 → 옵시디언 볼트에 md 파일로 저장
// 재개 가능: 이미 있는 파일은 건너뜀 (중단 후 다시 실행하면 이어서 진행)
//
// 봇차단 방지 정책
//  - 순차 1개씩만 요청 (병렬 없음)
//  - 기본 대기 7~12초, 40~60개마다 50~90초 휴식
//  - 적응형 템포: 응답이 느려지거나 실패/빈본문이 나오면 대기시간을 배로 늘리고,
//    깨끗하게 30개 연속 성공하면 조금씩 원래 속도로 회복
//  - 로그인 요구/캡차/접근제한 문구가 보이면 즉시 중단
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const VAULT = 'C:/도윤/와썹윌리엄';
const INDEX = JSON.parse(fs.readFileSync(path.join(__dirname, 'index.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
const safe = s => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
const stamp = () => new Date().toLocaleTimeString('ko-KR');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => !p.url().startsWith('chrome')) || ctx.pages()[0];

  const items = [...INDEX].reverse(); // 오래된 글부터
  let done = 0, skipped = 0, failStreak = 0, cleanStreak = 0;
  let slowFactor = 1;              // 적응형 배율
  let nextRestAt = rand(40, 60);   // 다음 긴 휴식까지 남은 저장 수
  const loadTimes = [];
  const started = Date.now();

  for (const [i, it] of items.entries()) {
    const cat = safe(it.category || '기타');
    const dir = path.join(VAULT, cat);
    const dateStr = (it.date || '').replace(/\./g, '-').replace(/-$/, '');
    const file = path.join(dir, `${dateStr} ${safe(it.title)} (${it.id}).md`);
    if (fs.existsSync(file)) { skipped++; continue; }

    let data, elapsed = 0;
    try {
      const t0 = Date.now();
      await page.goto(`https://contents.premium.naver.com/willam/william/contents/${it.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      elapsed = Date.now() - t0;
      data = await page.evaluate(() => {
        const c = document.querySelector('.se-main-container');
        // 본문을 정상적으로 읽었으면 차단이 아님 — 차단 문구 검사는 본문이 없을 때만 한다
        // (본문 안에 "접근이 제한적이야" 같은 표현이 들어있어 오탐이 났던 이력이 있음)
        if (c) {
          const imgs = [...c.querySelectorAll('img')].map(im => im.getAttribute('data-src') || im.src).filter(Boolean);
          return { ok: true, alarm: false, text: c.innerText, imgs };
        }
        const bodyText = document.body.innerText;
        const alarm = /로그인이 필요|자동입력 방지|보안문자|일시적으로 제한|비정상적인 접근|잠시 후 다시 시도/.test(bodyText)
          || /nid\.naver\.com|captcha/i.test(location.href);
        return { ok: false, alarm, reason: 'no-container', snippet: bodyText.slice(0, 300) };
      });
    } catch (e) {
      console.log(`${stamp()} FAIL ${it.id} :: ${e.message.slice(0, 80)}`);
      cleanStreak = 0;
      slowFactor = Math.min(slowFactor * 2, 8);
      console.log(`   → 템포 완화: 배율 ${slowFactor}배`);
      if (++failStreak >= 3) { console.log('!! 연속 실패 3회 — 중단 (나중에 다시 실행하면 이어서 진행)'); break; }
      await sleep(rand(60000, 120000) * slowFactor);
      continue;
    }

    if (data.alarm) {
      console.log(`${stamp()} !! 차단/로그인 요구 감지 — 즉시 중단`);
      console.log(data.snippet || '');
      break;
    }
    if (!data.ok || !data.text || data.text.length < 50) {
      console.log(`${stamp()} EMPTY ${it.id} (${data.reason || 'short'})`);
      cleanStreak = 0;
      slowFactor = Math.min(slowFactor * 1.5, 8);
      if (++failStreak >= 5) { console.log('!! 빈 본문 5회 — 중단'); break; }
      await sleep(rand(30000, 60000) * slowFactor);
      continue;
    }

    failStreak = 0;
    cleanStreak++;

    // 응답 지연 감시: 최근 평균보다 2.5배 이상 느려지면 템포 완화
    loadTimes.push(elapsed);
    if (loadTimes.length > 20) loadTimes.shift();
    const avg = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
    if (loadTimes.length >= 10 && elapsed > avg * 2.5 && elapsed > 12000) {
      slowFactor = Math.min(slowFactor * 1.5, 8);
      console.log(`${stamp()}    → 응답 지연(${(elapsed / 1000).toFixed(1)}s, 평균 ${(avg / 1000).toFixed(1)}s) 템포 완화: 배율 ${slowFactor.toFixed(1)}배`);
    }
    // 깨끗하게 30개 연속이면 서서히 회복
    if (cleanStreak > 0 && cleanStreak % 30 === 0 && slowFactor > 1) {
      slowFactor = Math.max(1, slowFactor / 1.5);
      console.log(`${stamp()}    → 안정적, 템포 회복: 배율 ${slowFactor.toFixed(1)}배`);
    }

    fs.mkdirSync(dir, { recursive: true });
    const out = [
      '---',
      `title: "${it.title.replace(/"/g, "'")}"`,
      `category: "${it.category}"`,
      `date: ${dateStr}`,
      `readTime: "${it.readTime}"`,
      `id: ${it.id}`,
      `source: https://contents.premium.naver.com/willam/william/contents/${it.id}`,
      'tags: [와썹윌리엄]',
      '---',
      '',
      `# ${it.title}`,
      '',
      data.text.trim(),
    ];
    if (data.imgs.length) out.push('', '## 첨부 이미지', ...data.imgs.map(u => `![](${u})`));
    fs.writeFileSync(file, out.join('\n'), 'utf8');
    done++;

    if (done % 10 === 0) {
      const min = (Date.now() - started) / 60000;
      const remain = items.length - skipped - done;
      const eta = done > 0 ? (min / done) * remain : 0;
      console.log(`${stamp()} [${i + 1}/${items.length}] 저장 ${done} / 남은 ${remain} / 경과 ${min.toFixed(0)}분 / 예상 ${eta.toFixed(0)}분 :: ${dateStr} ${it.title.slice(0, 30)}`);
    }

    if (--nextRestAt <= 0) {
      const restMs = rand(50000, 90000);
      console.log(`${stamp()}    ...${Math.round(restMs / 1000)}초 휴식`);
      await sleep(restMs);
      nextRestAt = rand(40, 60);
    }
    await sleep(rand(7000, 12000) * slowFactor);
  }
  const totalMin = ((Date.now() - started) / 60000).toFixed(0);
  console.log(`\n${stamp()} 완료: 저장 ${done} / 기존 ${skipped} / 총 ${totalMin}분`);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
