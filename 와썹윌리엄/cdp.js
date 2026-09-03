// 전용 크롬(디버그 포트 9222)에 붙어서 페이지를 읽는 도우미
// 사용: node cdp.js goto <url>      → 이동 후 제목/URL 출력
//       node cdp.js text            → 현재 페이지 본문 텍스트 출력
//       node cdp.js eval "<js식>"   → 현재 페이지에서 JS 실행, JSON 출력
const { chromium } = require('playwright-core');
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => !p.url().startsWith('chrome')) || ctx.pages()[0];
  if (cmd === 'goto') {
    await page.goto(rest[0], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    console.log(await page.title(), '|', page.url());
  } else if (cmd === 'text') {
    console.log(await page.evaluate(() => document.body.innerText));
  } else if (cmd === 'eval') {
    const r = await page.evaluate(rest.join(' '));
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(await page.title(), '|', page.url());
  }
  await browser.close();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
