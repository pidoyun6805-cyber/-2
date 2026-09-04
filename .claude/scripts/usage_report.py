# -*- coding: utf-8 -*-
"""Claude Code 토큰 사용량 리포트 생성.

C:\\Users\\PC\\.claude\\projects\\ 아래 세션 로그(.jsonl)를 읽어 usage.html을 만든다.
Claude를 거치지 않으므로 돌려도 토큰이 들지 않는다.

사용법:  python usage_report.py     (또는 usage.bat 더블클릭)
"""
import collections
import re
import datetime
import glob
import html
import io
import json
import os
import webbrowser

PROJECTS = os.path.join(os.path.expanduser("~"), ".claude", "projects")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage.html")
DAYS = 30
KST = datetime.timedelta(hours=9)


def to_kst(ts):
    return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")) + KST


def scan():
    """(날짜별 합계, 어제/오늘 에이전트별 상세)를 돌려준다."""
    daily = collections.defaultdict(collections.Counter)
    agents = collections.defaultdict(dict)  # 날짜 -> 파일 -> 집계
    for path in glob.glob(os.path.join(PROJECTS, "**", "*.jsonl"), recursive=True):
        is_sub = os.sep + "subagents" + os.sep in path
        for line in io.open(path, encoding="utf-8", errors="ignore"):
            if ('"usage"' not in line and '"tool_use"' not in line
                    and '"role":"user"' not in line):
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            ts = rec.get("timestamp")
            msg = rec.get("message")
            if not ts or not isinstance(msg, dict):
                continue
            try:
                day = to_kst(ts).strftime("%Y-%m-%d")
            except ValueError:
                continue

            row = agents[day].setdefault(
                path, {"tok": 0, "tools": 0, "web": 0, "sub": is_sub,
                       "first": ts, "last": ts, "what": ""})
            row["last"] = max(row["last"], ts)
            row["first"] = min(row["first"], ts)

            usage = msg.get("usage")
            if usage:
                n = sum(usage.get(k) or 0 for k in (
                    "input_tokens", "output_tokens",
                    "cache_creation_input_tokens", "cache_read_input_tokens"))
                daily[day]["tok"] += n
                daily[day]["calls"] += 1
                row["tok"] += n

            content = msg.get("content")
            if rec.get("type") == "assistant" and isinstance(content, list):
                for part in content:
                    if part.get("type") == "tool_use":
                        row["tools"] += 1
                        daily[day]["tools"] += 1
                        if part["name"] in ("WebSearch", "WebFetch"):
                            row["web"] += 1
                        if part["name"] == "Agent":
                            daily[day]["spawns"] += 1
            elif rec.get("type") == "user" and not row["what"]:
                text = content if isinstance(content, str) else " ".join(
                    p.get("text", "") for p in content
                    if isinstance(p, dict) and p.get("type") == "text"
                ) if isinstance(content, list) else ""
                text = re.sub(r"<system-reminder>.*?</system-reminder>", "",
                              text, flags=re.S).strip()
                if text and not text.startswith("<") and "Caveat" not in text:
                    row["what"] = " ".join(text.split())[:110]
    return daily, agents


def fmt(n):
    return "{:,}".format(n)


def bar_rows(daily, days):
    peak = max((daily[d]["tok"] for d in days), default=1) or 1
    out = []
    for d in days:
        c = daily[d]
        pct = c["tok"] / peak * 100
        out.append(
            '<tr><td class="d">%s</td><td class="n">%s</td>'
            '<td class="n dim">%s</td><td class="n dim">%s</td>'
            '<td class="bar"><i style="width:%.1f%%"></i></td></tr>'
            % (d, fmt(c["tok"]), fmt(c["calls"]), fmt(c.get("spawns", 0)), pct))
    return "\n".join(out)


def detail_rows(agents, day):
    rows = sorted(agents.get(day, {}).items(), key=lambda kv: -kv[1]["tok"])
    total = sum(r["tok"] for _, r in rows) or 1
    out = []
    for path, r in rows[:25]:
        if not r["tok"]:
            continue
        kind = "서브" if r["sub"] else "메인"
        span = "%s~%s" % (to_kst(r["first"]).strftime("%H:%M"),
                          to_kst(r["last"]).strftime("%H:%M"))
        warn = " warn" if r["tools"] > 40 else ""
        out.append(
            '<tr class="%s"><td>%s</td><td class="d">%s</td>'
            '<td class="n">%s</td><td class="n">%.0f%%</td>'
            '<td class="n%s">%d</td><td class="n">%d</td><td class="w">%s</td></tr>'
            % (kind == "서브" and "sub" or "", kind, span, fmt(r["tok"]),
               r["tok"] / total * 100, warn, r["tools"], r["web"],
               html.escape(r["what"] or "-")))
    return "\n".join(out)


def build():
    daily, agents = scan()
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    days = sorted(daily)[-DAYS:]
    focus = today if daily.get(today, {}).get("tok") else (days[-1] if days else today)

    week = [d for d in days if d > (datetime.datetime.now()
                                    - datetime.timedelta(days=7)).strftime("%Y-%m-%d")]
    week_tok = sum(daily[d]["tok"] for d in week)

    page = TEMPLATE % {
        "gen": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "today_tok": fmt(daily.get(today, {}).get("tok", 0)),
        "week_tok": fmt(week_tok),
        "week_avg": fmt(week_tok // max(len(week), 1)),
        "focus": focus,
        "bars": bar_rows(daily, days),
        "details": detail_rows(agents, focus),
    }
    io.open(OUT, "w", encoding="utf-8").write(page)
    print("생성 완료:", OUT)
    return OUT


TEMPLATE = u"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Code 사용량</title>
<style>
:root{color-scheme:light dark;--bg:#fbfaf8;--fg:#1c1a17;--dim:#7a736a;--line:#e5e0d8;
--accent:#b4643c;--warn:#c0392b;--card:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#16150f;--fg:#eae6de;--dim:#8f887c;
--line:#2e2b24;--accent:#d98a5f;--warn:#e8735c;--card:#1e1d16}}
*{box-sizing:border-box}
body{margin:0;padding:32px 20px 60px;background:var(--bg);color:var(--fg);
font:14px/1.6 -apple-system,"Segoe UI","Malgun Gothic",sans-serif}
.wrap{max-width:920px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:13px;margin-bottom:28px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:32px}
.card{flex:1 1 180px;background:var(--card);border:1px solid var(--line);
border-radius:10px;padding:14px 16px}
.card b{display:block;font-size:24px;font-weight:600;letter-spacing:-.02em}
.card span{color:var(--dim);font-size:12px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);
margin:32px 0 10px;font-weight:600}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{width:100%%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-weight:600;color:var(--dim);font-size:11px;
text-transform:uppercase;letter-spacing:.06em;padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:7px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
tr:last-child td{border-bottom:0}
.n{text-align:right;font-variant-numeric:tabular-nums}
.d{color:var(--dim)}
.dim{color:var(--dim)}
.w{white-space:normal;color:var(--dim);font-size:12px;min-width:260px}
.bar{width:38%%;padding-right:16px}
.bar i{display:block;height:7px;border-radius:4px;background:var(--accent);min-width:2px}
.warn{color:var(--warn);font-weight:600}
tr.sub td:first-child{color:var(--dim)}
.note{margin-top:24px;color:var(--dim);font-size:12px;line-height:1.7}
</style></head><body><div class="wrap">
<h1>Claude Code 사용량</h1>
<div class="sub">%(gen)s 기준 · 로컬 세션 로그에서 직접 집계</div>

<div class="cards">
<div class="card"><b>%(today_tok)s</b><span>오늘 토큰</span></div>
<div class="card"><b>%(week_tok)s</b><span>최근 7일</span></div>
<div class="card"><b>%(week_avg)s</b><span>일평균</span></div>
</div>

<h2>일별</h2>
<div class="scroll"><table>
<tr><th>날짜</th><th class="n">토큰</th><th class="n">API 호출</th>
<th class="n">에이전트</th><th></th></tr>
%(bars)s
</table></div>

<h2>%(focus)s 상세 — 토큰 많이 쓴 순</h2>
<div class="scroll"><table>
<tr><th>구분</th><th>시간</th><th class="n">토큰</th><th class="n">비중</th>
<th class="n">툴</th><th class="n">웹</th><th>무슨 일</th></tr>
%(details)s
</table></div>

<div class="note">
툴 호출이 <b>40회를 넘는 에이전트</b>는 빨갛게 표시된다 — 길게 끄는 에이전트일수록
호출 1회당 단가가 오르므로, 그런 줄이 보이면 일을 더 잘게 쪼개야 한다는 신호다.<br>
갱신하려면 <code>usage.bat</code>을 다시 실행한다. 토큰은 들지 않는다.
</div>
</div></body></html>
"""

if __name__ == "__main__":
    webbrowser.open("file:///" + build().replace("\\", "/"))
