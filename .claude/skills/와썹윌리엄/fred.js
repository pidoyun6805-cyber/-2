#!/usr/bin/env node
// 윌리엄이 지목한 거시지표의 현재 값을 FRED에서 한 번에 받아온다.
//
//   node fred.js            핵심 지표 전부 (최신값 + 추세)
//   node fred.js WRESBAL    특정 시리즈 하나 (최근 12개 관측치)
//   node fred.js --list     시리즈 목록과 그의 판정 기준
//
// FRED CSV 엔드포인트를 쓴다. API 키 불필요.
// 값을 못 받은 시리즈는 "미확인"으로 출력된다 — 기억으로 채우지 말 것.

// 주의: Node의 https 모듈은 FRED에서 ECONNRESET을 받는다(2026-09-03 확인).
// curl은 정상 동작하므로 curl을 통해 받는다.
const { execFile } = require('child_process');

// 시리즈 ID → [표시명, 단위, 그의 판정 기준(출처)]
const SERIES = {
  WRESBAL: ['은행 준비금', '백만달러', '기울기만 본다: 증가둔화→수평눕기→하락전환→하락가속 (비밀지표 1편 2026-01-03) / 2.5조 아래면 결제망 불안정 (네프콘 6·7편)'],
  SOFR: ['초단기담보금리(SOFR)', '%', 'IORB와의 관계만 본다. 정상=붙었다 재접근 / 경계=괴리 반복 / 방어=괴리 고착 (비밀지표 2편 2026-01-07)'],
  IORB: ['지급준비금 이자율(IORB)', '%', 'SOFR와 겹쳐서 본다 (비밀지표 2편)'],
  RRPONTSYD: ['역레포 잔액', '십억달러', 'near zero면 돈이 리포로 흘러감. 그림자 유동성 폭발 (네프콘 3편 2025-11-02)'],
  DRTSCILM: ['은행 대출기준 순응답(SLOOS)', '%', '0선이 절대 기준. 0선 위 지속 분기 수가 전부. 2분기 연속=선별 개시 / 3분기 이상 고착=구조적 차단 (비밀지표 4편 2026-01-15)'],
  STLFSI4: ['금융스트레스지수', '표준편차', '0 위=긴장 / 0 아래=안정. 단 "지수가 낮을 때가 오히려 더 위험"(2007·2019) (네프콘 10편 2025-11-09)'],
  BAMLH0A0HYM2: ['하이일드 스프레드', '%', '3.0~4.0 정상 / 4.0~6.0 압박 / 6.0 이상 시장 붕괴 위험 (비밀 매뉴얼 2탄 2025-08-05)'],
  WTREGEN: ['재무부 일반계정(TGA)', '백만달러', '"계좌가 아니라 수도꼭지 밸브". 국가가 개입해야만 유동성이 유지되는 상태가 진짜 위험 (비밀지표 8편 2026-02-11)'],
  WALCL: ['연준 대차대조표', '백만달러', '축소=QT / 확대=QE (네프콘 6편 2025-11-09)'],
  T10Y2Y: ['장단기 금리차 (10Y-2Y)', '%p', '역전 = 6~18개월 내 침체 예고. 역전 상태에서 급격히 정상화되면 침체 임박 최종 확정 신호 (2025-08-04)'],
  ICSA: ['신규 실업수당 청구', '건', '25만 초과=소비 둔화 초기 / 4주 연속 증가 + 30만 돌파=본격 위기 (비밀 매뉴얼 2탄)'],
  DRCRELEXFACBS: ['상업용부동산 연체율', '%', 'SLOOS 0선 위 고착 후 6~18개월 시간차를 두고 상승 (후행 확인) (비밀지표 5편 2026-01-20)'],
  A053RC1Q027SBEA: ['기업 이자보상 관련', '십억달러', 'SLOOS와 병용. 상승 둔화·변동성 확대·고점 후 횡보면 이익 완충 약화 (비밀지표 6편 2026-01-26)'],
  DTWEXBGS: ['브로드 달러지수', '지수', '주의: 그의 DXY 105/100 기준과는 다른 지수다. DXY는 별도 확인 필요 (2025-09-05)'],
  DGS10: ['미 10년물 국채금리', '%', '달러 강세의 질 판정에 함께 쓴다 (비밀지표 10편)'],
  M2SL: ['통화량 M2', '십억달러', 'Fed Balance↑ + RRP↓ + M2↑ = 유동성 확장 공격 모드 / 반대면 축소 방어 모드 (2025-09-05)'],
};

function fetchCsv(id, start) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`;
  return new Promise(resolve => {
    execFile('curl', ['-s', '-L', '--max-time', '25', url], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      // HTML(차단 페이지)이 오면 실패로 본다
      if (stdout.trimStart().startsWith('<')) return resolve(null);
      const rows = stdout.trim().split('\n').slice(1)
        .map(l => l.trim().split(','))
        .filter(p => p.length >= 2 && p[1] !== '.' && p[1] !== '')
        .map(p => ({ date: p[0], value: parseFloat(p[1]) }))
        .filter(r => !Number.isNaN(r.value));
      resolve(rows.length ? rows : null);
    });
  });
}

function fmt(v, unit) {
  if (unit === '백만달러') {
    if (v >= 1000000) return (v / 1000000).toFixed(3) + '조 달러';
    return (v / 1000).toFixed(1) + '십억 달러';
  }
  if (unit === '건') return v.toLocaleString('ko-KR') + '건';
  if (unit === '%' || unit === '%p') return v.toFixed(2) + '%';
  return v.toLocaleString('ko-KR');
}

(async () => {
  const arg = process.argv[2];

  if (arg === '--list') {
    console.log('시리즈 목록과 그의 판정 기준\n');
    for (const [id, [name, unit, rule]] of Object.entries(SERIES)) {
      console.log(`${id.padEnd(16)} ${name} (${unit})`);
      console.log(`${' '.repeat(17)}${rule}\n`);
    }
    return;
  }

  if (arg && SERIES[arg]) {
    const [name, unit, rule] = SERIES[arg];
    const rows = await fetchCsv(arg, '2025-01-01');
    console.log(`# ${name} (${arg})`);
    console.log(`판정 기준: ${rule}\n`);
    if (!rows) return console.log('미확인 (FRED 응답 실패)');
    rows.slice(-12).forEach(r => console.log(`  ${r.date}  ${fmt(r.value, unit)}`));
    return;
  }

  console.log('# 윌리엄 지표 현재값 (FRED)\n');
  console.log(`조회 시각: ${new Date().toLocaleString('ko-KR')}\n`);

  const ids = Object.keys(SERIES);
  // FRED는 공개 데이터 배포처이고 시리즈 16개뿐이라 병렬로 받는다
  const results = await Promise.all(
    ids.map(async id => [id, await fetchCsv(id, '2025-06-01')])
  );

  console.log('| 지표 | 최신값 | 기준일 | 3개월 전 | 방향 |');
  console.log('|---|---|---|---|---|');
  for (const [id, rows] of results) {
    const [name, unit] = SERIES[id];
    if (!rows) { console.log(`| ${name} | 미확인 | — | — | — |`); continue; }
    const last = rows[rows.length - 1];
    // 3개월 전과 가장 가까운 관측치
    const target = new Date(last.date); target.setMonth(target.getMonth() - 3);
    const prior = rows.reduce((best, r) =>
      Math.abs(new Date(r.date) - target) < Math.abs(new Date(best.date) - target) ? r : best, rows[0]);
    const dir = last.value > prior.value ? '상승' : last.value < prior.value ? '하락' : '보합';
    console.log(`| ${name} | ${fmt(last.value, unit)} | ${last.date} | ${fmt(prior.value, unit)} (${prior.date}) | ${dir} |`);
  }

  // 스프레드 파생값
  const sofr = results.find(r => r[0] === 'SOFR')?.[1];
  const iorb = results.find(r => r[0] === 'IORB')?.[1];
  if (sofr && iorb) {
    const s = sofr[sofr.length - 1], i = iorb[iorb.length - 1];
    const spread = (s.value - i.value).toFixed(2);
    console.log(`\nSOFR − IORB = ${spread}%p  (SOFR ${s.value}% @${s.date} / IORB ${i.value}% @${i.date})`);
    console.log('  판정: 정상=붙었다 재접근 / 경계=괴리 반복 / 방어=괴리 고착 (비밀지표 2편)');
  }

  console.log('\n웹 검색으로 따로 확인해야 하는 것:');
  console.log('  ISM 제조업 PMI (45 이하 3개월이면 위기) / 마진데트(yardeni.com) / DXY 달러지수(105·100 기준)');
  console.log('  크로스 커런시 베이시스(MacroMicro) / 프라이머리 딜러 순포지션(NY Fed) / 국가 CDS');
  console.log('  MMF 총자산 주간치 / 공포탐욕지수(CNN, 매수 20 이하·매도 80 이상)');
})();
