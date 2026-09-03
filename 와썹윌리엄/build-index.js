// 채널 전체 글 목록을 목록 API로 수집해 index.json에 저장
const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => !p.url().startsWith('chrome')) || ctx.pages()[0];
  if (!page.url().includes('premium.naver.com')) await page.goto('https://contents.premium.naver.com/willam/william', { waitUntil: 'domcontentloaded' });
  const seen = new Map();
  let last = '';
  for (let i = 0; i < 80; i++) {
    const items = await page.evaluate(async (last) => {
      const r = await fetch(`/ch/template/SCS_PREMIUM_CONTENT_LIST?cpName=willam&subId=william&categoryId=&tag=&authorId=&allianceId=&lastContentId=${last}&_=${Date.now()}`);
      const j = await r.json();
      const d = new DOMParser().parseFromString(j.renderedComponent.SCS_PREMIUM_CONTENT_LIST, 'text/html');
      return [...d.querySelectorAll('li.content_item')].map(li => {
        const link = li.querySelector('a.content_text_link');
        const id = (link?.getAttribute('href') || '').split('/contents/')[1] || '';
        const infos = [...li.querySelectorAll('.content_info_text')].map(e => e.textContent.trim());
        return {
          id,
          title: li.querySelector('.content_title')?.textContent.trim() || '',
          category: li.querySelector('.content_category')?.textContent.trim() || '',
          date: infos.find(t => /^\d{4}\.\d{2}\.\d{2}/.test(t)) || '',
          readTime: infos.find(t => /소요/.test(t)) || '',
          locked: !!li.querySelector('.content_lock'),
        };
      }).filter(x => x.id);
    }, last);
    let added = 0;
    for (const it of items) if (!seen.has(it.id)) { seen.set(it.id, it); added++; }
    const lastItem = items[items.length - 1];
    process.stdout.write(`page ${i + 1}: +${added} (total ${seen.size})\n`);
    if (!lastItem || added === 0 || lastItem.id === last) break;
    last = lastItem.id;
    await page.waitForTimeout(1500);
  }
  const list = [...seen.values()];
  fs.writeFileSync('index.json', JSON.stringify(list, null, 2));
  console.log('saved', list.length, 'items');
  const cats = {};
  list.forEach(x => cats[x.category] = (cats[x.category] || 0) + 1);
  console.log(cats);
  console.log('date range:', list[list.length - 1].date, '~', list[0].date);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
