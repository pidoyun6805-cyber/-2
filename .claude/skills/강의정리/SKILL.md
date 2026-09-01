---
name: 강의정리
description: 사용자가 KCU/OCU 온라인 강의를 정리해달라고 할 때 사용 — "강의 정리해줘", "N주차 정리해줘", "/강의정리". 열려 있는 강의 재생창을 감지해 영상 다운로드→음성 전사(Whisper)→시험대비 요약노트 생성→옵시디언 볼트 커밋까지 처리한다.
---

# 강의정리 스킬

피도윤(창원대 국제무역학과)의 KCU·OCU 온라인 교양 강의를 정리한다.
출석(시청)은 본인이 직접 재생해서 채우고, 이 스킬은 내용 요약 노트만 만든다. 대리수강이 아니다.

## 전제

- 원격 디버깅 Chrome(포트 9222)이 떠 있고, 사용자가 KCU/OCU에 로그인해 그 주차 강의를 재생창으로 열어둔 상태여야 한다.
  - 안 떠 있으면: project_school-dashboard 메모리의 "학사시스템 스크랩 방법"대로 Chrome을 --remote-debugging-port=9222 --user-data-dir=<스크래치>\cdp-profile 로 띄우고 사용자에게 로그인+강의 열기를 요청.
- 도구는 이미 설치됨: faster-whisper, playwright (pip). 없으면 pip install.

## 절차

### 1. 열린 강의 감지
connect_over_cdp("http://127.0.0.1:9222") 로 붙어서, 페이지 중 URL에 iframe_view2(KCU) 등 재생 iframe이 있는 것을 찾는다.
그 안 vod.kcucon.or.kr 프레임에서 video/source의 currentSrc/src와 outerHTML의 .mp4 링크를 뽑는다.
- KCU 실제 강의 파일 패턴: .../contents/media_files/main_(<uuid>).mp4  (preloader.mp4는 제외)
- 과목명·주차는 재생창 topFrame 제목 또는 mainFrame(lectureplan) 텍스트에서 파싱. CourseCode(예: SSCH1003), 주차 번호 확보.

### 2. 다운로드
curl -s -H "Referer: https://vod.kcucon.or.kr/" -o "<스크래치>/lectures/<과목>_<N>주차.mp4" "<mp4 URL>"
URL에 괄호·특수문자 있으니 큰따옴표로 감쌀 것. 100~200MB. 백그라운드로.

### 3. 전사 (백그라운드, 20~50분)
from faster_whisper import WhisperModel
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(MP4, language="ko", vad_filter=True)
# [mm:ss] 텍스트 형식으로 <과목>_<N>주차_대본.txt 에 기록, 50줄마다 flush+진행출력
run_in_background=true 로 실행하고 완료 알림을 기다린다.

### 4. 요약 노트 작성
대본 전문을 읽고 C:\도윤\학교\노트\<과목명> <N>주차.md 를 만든다. frontmatter: 유형: 수업노트 / 과목 / 주차 / 날짜.
- 전사 오류를 문맥으로 교정: 법률 강의는 "인디차→임대차" 등 전문용어가 자주 깨진다. 요약할 때 바로잡는다.
- 구성: (1) 이번 주 핵심 3~5줄 (2) 소주제별 정리 (3) 시험 포인트(교수가 "중요/시험" 언급) (4) 낯선 법률용어 미니 사전.
- 과목 페이지의 LIST FROM "학교/노트" 쿼리에 잡히도록 파일명 앞부분을 과목명과 일치시킬 것.

### 5. 커밋
cd /c/도윤 && git add -A && git commit -m "강의노트: <과목> <N>주차 요약" && git push -q origin main

## 마무리 안내
요약노트 위치 + "강의 다 들으면 학습종료 버튼 눌러야 출석 저장됨"을 상기. 출석인정기간(강의계획서 표시)도 알려주면 좋다.

## 주의
- 다운로드 영상은 개인 학습용, 공유·업로드 금지, 학기 후 삭제. 스크래치 폴더라 세션 종료 시 정리됨.
- 출석·시험은 절대 대신 하지 않는다. 요약 노트 생성까지만.
- 관련 메모리: project_school-dashboard(스크랩 URL·프레임 구조).
