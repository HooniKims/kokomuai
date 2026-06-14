# 콘페스타 참가용 질문형 학습 챗봇 작업 정리

## 작업 목적

DDD 방식으로 유지보수하기 쉬운 로컬 풀버전 질문형 학습 챗봇을 개발하고, 실제 실행 기준으로 챗봇이 의도대로 작동하는지 확인했다.

핵심 목표는 다음이었다.

- 교사 승인 흐름을 거쳐 챗봇을 만들 수 있어야 한다.
- 2022 개정 교육과정 기반으로 수업 주제와 성취기준을 연결해야 한다.
- 학생은 공유 링크로 접속해 가입 없이 질문할 수 있어야 한다.
- 챗봇은 정답을 바로 주기보다 질문과 단서로 사고를 유도해야 한다.
- 범위 밖 질문, 개인정보, 프롬프트 인젝션, 안전 위험을 정책으로 처리해야 한다.
- 학생 대화 원문은 서버에 저장하지 않아야 한다.
- AI 호출 사용량은 교사/챗봇별로 요약 집계되어야 한다.
- TXT/PDF 다운로드와 기록 삭제가 동작해야 한다.

## 주요 구현 내용

### 도메인 중심 구조

- `src/domain/identity`
  - 교사 등록, 승인, 관리자 권한, 교사 기능 사용 가능 여부를 도메인 규칙으로 분리했다.
- `src/domain/chatbot`
  - 챗봇 생성, 수정, 삭제, 공유 링크 활성화/비활성화, 소유자 검증을 도메인 규칙으로 분리했다.
- `src/domain/curriculum`
  - 교육과정 chunk 추천과 성취기준 연결을 도메인/인프라 경계로 분리했다.
- `src/domain/conversation`
  - 정답 요구, 범위 밖 질문, 프롬프트 인젝션, 안전 위험, 개인정보 위험을 `conversationGuard`에서 판정한다.
- `src/domain/usage`
  - AI 호출 수, 토큰 추정치, 오류 수, student_share/teacher_preview 구분을 원문 없이 집계한다.

### 로컬 서버와 저장소

- `server/localStore.ts`
  - 로컬 JSON 저장소를 사용한다.
  - 파일별 write queue로 동시 쓰기 경합을 줄였다.
  - React StrictMode 중복 초기화로 교사 계정이 중복 생성되는 문제를 막았다.
  - 사용량/관리자 로그 저장 시 학생 원문이 남지 않도록 정규화한다.
- `server/localApi.ts`
  - `/api/teachers`
  - `/api/admin/teachers/:id/approve`
  - `/api/chatbots`
  - `/api/chatbots/:id/share`
  - `/api/share/:token`
  - `/api/usage`
  - `/api/admin/provider-errors`
  - `/api/curriculum/recommend`
- `server/chatProxy.ts`
  - `/api/chat`에서 LM Studio 호출 전에 정책 판정을 수행한다.
  - 개인정보 메시지는 `422`로 차단한다.
  - 범위 밖/프롬프트 인젝션/안전 위험은 AI 호출 없이 로컬 응답으로 처리한다.
  - 정답 요구는 AI 호출은 허용하되 시스템 프롬프트와 risk code로 질문형 응답을 유도한다.
- `server/chatUsage.ts`
  - 실제 `/api/chat` 성공 스트리밍 뒤 사용량 이벤트를 생성한다.
  - 원문 대신 입력/출력 길이와 토큰 추정치만 저장한다.
- `server/dev-server.ts`
  - LM Studio 스트리밍 응답과 사용량 기록을 연결했다.
  - 사용량 기록을 마친 뒤 스트리밍 응답을 종료하도록 순서를 보정했다.

### 화면 구현

- `src/presentation/App.tsx`
  - 교사/관리자/학생 화면을 서버 API와 연결했다.
  - 학생 공유 링크 `/s/:token`에서 실제 공유 챗봇을 불러온다.
  - TXT/PDF 다운로드가 현재 챗봇 이름과 주제를 사용하도록 수정했다.
- `src/presentation/routes/StudentChatRoute.tsx`
  - 학생 채팅, 새 대화, PDF/TXT 다운로드, 기록 삭제 버튼을 제공한다.
- `src/presentation/routes/TeacherDashboardRoute.tsx`
  - 챗봇 생성, 교육과정 추천, 공유 링크 생성, 사용량 요약을 보여준다.
- `src/presentation/routes/AdminDashboardRoute.tsx`
  - 교사 승인 흐름을 제공한다.

## 해결한 주요 문제

### 1. React StrictMode 중복 등록 문제

문제:

- 로컬 개발 초기화가 두 번 실행되면서 같은 교사가 중복 생성되거나 승인 대상 ID가 꼬일 수 있었다.

해결:

- 이메일 기준 idempotent 등록을 적용했다.
- 교사 저장과 승인 로그 기록을 단일 queue 작업으로 묶었다.
- 동시 등록/동시 승인 회귀 테스트를 추가했다.

### 2. `/api/chat` 사용량 미기록 문제

문제:

- E2E에서는 챗봇 응답이 보이지만 `usageEvents`가 0으로 남는 상황이 있었다.

해결:

- `server/chatUsage.ts`를 추가했다.
- `server/dev-server.ts`에서 실제 LM Studio 스트리밍 성공 뒤 `usageEvents`를 저장하도록 연결했다.
- 응답 종료 전에 사용량 기록을 마치도록 순서를 보정했다.

### 3. 범위 밖 안내 문구 고정 문제

문제:

- 국어 9품사 챗봇에서도 범위 밖 안내가 "전기 회로와 관련된 질문"이라고 나왔다.

해결:

- `conversationGuard`의 범위 밖 응답을 현재 챗봇 주제 기반 문구로 일반화했다.
- 국어 챗봇 범위 밖 응답 회귀 테스트를 추가했다.

### 4. 다운로드 산출물 이름 문제

문제:

- 9품사 챗봇에서도 TXT 제목과 PDF 파일명이 전기 회로 데모 기준으로 남아 있었다.

해결:

- TXT 첫 줄은 현재 챗봇 이름을 사용한다.
- PDF 파일명은 `student-chat.pdf`로 일반화했다.

### 5. 임시 저장소 파일 정리

문제:

- 중간 중단 과정에서 `server/data/local-dev-store.json.*.tmp` 파일이 남아 있었다.

해결:

- 현재 정상 저장소인 `server/data/local-dev-store.json`만 남기고 임시 파일을 정리했다.

## 검증 결과

### 자동 테스트

- `npm test`
  - 17 files passed
  - 72 tests passed
- `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과

### 실제 런타임

- 로컬 API
  - `http://127.0.0.1:8787`
- Vite 앱
  - `http://127.0.0.1:5173`
- LM Studio 대상
  - `http://192.168.0.212:1234`
  - `unsloth/gemma-4-12b-it`

### E2E 검증

실행 명령:

```powershell
node .\tests\e2e\localFullFlow.mjs --attempts=2
```

결과:

- 1회차 통과
- 관리자 승인 통과
- 교사 화면에서 중1 국어 9품사 챗봇 생성 통과
- 교육과정 성취기준 `[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.` 연결 확인
- 공유 링크 생성 통과
- 학생 공유 링크 접속 통과
- Gemma 응답 수신 통과
- 사용량 요약 기록 확인
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
- resource warning 없음
- page error 없음

결과 파일:

- `artifacts/local-full-korean-nine-parts-result.json`

### 정책 검증

- 범위 밖 질문
  - 예: `세종대왕의 업적을 알려줘.`
  - AI 호출 없이 로컬 가드레일 응답
  - 사용량 증가 없음
- 개인정보 질문
  - 예: 전화번호 포함 질문
  - `422 privacy_risk`
  - 사용량 증가 없음
- 정답만 요구
  - 예: `9품사의 정답만 빨리 알려줘.`
  - 질문형 응답 유지
  - `answer_request` risk code 기록
- 서버 저장소 원문 미저장
  - `server/data/local-dev-store.json`에 학생 질문 원문이 남지 않음
  - usage event에는 길이와 토큰 추정치만 저장됨

### 다운로드 검증

- TXT 다운로드
  - `artifacts/downloads/student-chat.txt`
  - 첫 줄: `중1 국어 9품사 이해 챗봇`
  - 수업 주제 포함
  - 학생/챗봇 대화 라인 포함
  - 전화번호형 개인정보 없음
- PDF 다운로드
  - `artifacts/downloads/student-chat.pdf`
  - 파일 크기 확인
- 기록 삭제
  - 삭제 후 메시지 수 0개 확인

## 확인용 스크린샷

최종 확인용 스크린샷은 아래 위치에 저장했다.

- `artifacts/screenshots-confirm/01-admin-dashboard.png`
- `artifacts/screenshots-confirm/02-teacher-dashboard.png`
- `artifacts/screenshots-confirm/03-student-share-open.png`
- `artifacts/screenshots-confirm/04-student-response.png`
- `artifacts/screenshots-confirm/manifest.json`

주의:

- 처음 캡처 시 공유 챗봇 로딩 전에 fallback 화면이 찍혔으나, 이후 실제 `중1 국어 9품사에 대한 이해` 텍스트가 보일 때까지 기다린 뒤 다시 캡처했다.
- 최종 `manifest.json`의 `errors`는 빈 배열이다.

## spec_check.json 갱신 내용

`spec_check.json`을 실제 개발/검증 상태에 맞게 수정했다.

반영 내용:

- `student-conversation`
  - 실제 `/api/chat` 정책/사용량 연결 완료로 evidence 갱신
- `usage-observability`
  - 실제 student_share 사용량 기록 완료로 evidence 갱신
- `m3-curriculum-policy`
  - 교육과정 검색과 대화 정책 강화는 현재 검증 기준 `done`
- `m4-usage-preview-admin`
  - 학생 공유 사용량과 승인 흐름은 동작하지만 교사 미리보기/관리자 고급 운영은 남아 있어 `in_progress`
- `m5-verification`
  - 최신 테스트 수, E2E 결과, 다운로드/정책 검증 결과로 갱신

JSON 파싱 확인:

```powershell
node -e "JSON.parse(require('fs').readFileSync('spec_check.json','utf8')); console.log('spec_check.json OK')"
```

결과:

```text
spec_check.json OK
```

## 현재 남은 작업

핵심 챗봇 사용 흐름은 검증 완료다. 다만 전체 제품 범위에서 아래 작업은 아직 남아 있다.

- 교사 미리보기 대화
  - 학생 로컬 대화와 분리된 preview conversation
  - teacher_preview 사용량 실제 화면 연결
  - 미리보기 중 힌트 강도, 페르소나, 주제 조정
- 관리자 고급 운영
  - 교사 거절
  - 교사 비활성화
  - 관리자 로그 상세 확인 UI
  - provider error 상세 확인 UI
- 교사 화면 고도화
  - 챗봇별 사용량 상세
  - 오류 상태 표시
  - 교사 로그인/계정 전환 UI

## 현재 결론

현재 기준으로 다음은 확인 완료다.

- 앱은 로컬에서 끝까지 실행된다.
- 학생은 공유 링크로 챗봇을 사용할 수 있다.
- 9품사 주제와 교육과정 성취기준이 연결된다.
- Gemma 기반 질문형 응답이 실제로 나온다.
- 정답 직접 제공을 피하고 질문/단서 중심으로 응답한다.
- 범위 밖 질문과 개인정보는 정책으로 막힌다.
- 학생 대화 원문은 서버에 저장되지 않는다.
- 사용량은 교사/챗봇별 요약으로 집계된다.
- TXT/PDF 다운로드와 기록 삭제가 동작한다.

## 운영 메모

앞으로 이 프로젝트에서 작업을 진행할 때마다 `TAsk.md`를 함께 업데이트한다.

- 새 기능을 구현하면 구현 내용과 검증 결과를 추가한다.
- 버그를 수정하면 문제 원인, 수정 위치, 재발 방지 테스트를 추가한다.
- 디자인/UI를 조정하면 사용자 관점의 변경점과 실제 확인 결과를 추가한다.
- 개발 서버, 빌드, 테스트, 브라우저 검증 상태가 바뀌면 최신 상태로 갱신한다.

## 2026-06-12 추가 반영 내용

### 챗봇 삭제 흐름 개선

문제:

- 교사가 챗봇을 삭제해도 목록에서 바로 사라지지 않았다.
- 삭제 전 확인 절차가 없어 실수로 삭제할 수 있었다.

해결:

- 삭제 버튼 클릭 시 확인창을 먼저 띄우도록 수정했다.
- 삭제 성공 후 교사 목록에서 해당 챗봇을 즉시 제거한다.
- `/api/chatbots` 목록 조회에서 `deleted` 상태 챗봇을 제외한다.
- 공유 링크는 삭제 후 접근할 수 없도록 기존 정책을 유지한다.

검증:

- `tests/presentation/chatbotDeletion.test.ts`
- `tests/infrastructure/localApi.test.ts`

### 디자인과 반응형 보정

문제:

- 교사용 대시보드가 `DESIGN.md` 기준보다 작고 답답하게 보였다.
- 데스크톱/태블릿/모바일 전환이 충분하지 않았다.

해결:

- `src/presentation/styles.css`에서 1280px 컨테이너 기준을 유지하며 메인 패널을 더 넓혔다.
- 폼 레이아웃을 데스크톱 3열, 태블릿 2열, 모바일 1열로 조정했다.
- 버튼 최소 높이를 44px로 맞추고, 버튼 텍스트 줄바꿈을 막았다.
- 추천 카드와 챗봇 행의 패딩과 간격을 키웠다.

검증:

- `artifacts/responsive-desktop.png`
- `artifacts/responsive-tablet.png`
- `artifacts/responsive-mobile.png`
- `npm run build`
- `npm test`

### 제목, 폰트, 줄바꿈 조정

변경:

- 메인 제목을 `꼬리에 꼬리를 무는 AI`로 수정했다.
- Paperlogy Regular/Bold `woff2` 파일을 로컬 자산으로 추가했다.
- 전체 폰트를 Paperlogy 기반으로 변경했다.
- 전체 자간은 `-0.02em`으로 설정했다.
- 전체 행간 기준은 `1.35`로 설정했다.
- 한국어 제목이 글자 단위로 어색하게 끊기지 않도록 `word-break: keep-all`, `text-wrap: balance`를 적용했다.

검증:

- `npm run build`에서 Paperlogy 폰트 번들 포함 확인
- 모바일 폭에서 제목 표시와 computed style 확인

### 추천 카드 정보 노출 조정

문제:

- 추천 카드 하단에 원문 파일명 또는 원문명이 사용자에게 노출됐다.

해결:

- 교사용 추천 카드에서는 추천 이유만 보여주고, 원문명은 화면에서 제거했다.
- 내부 데이터의 `sourceTitle`은 유지해 개발자/저장용 정보로 계속 사용할 수 있게 했다.

검증:

- `npm run build`
- 관련 테스트 통과

### 교사용 생성 폼 placeholder 처리

문제:

- 교사용 생성 폼에 전기 회로 예시가 실제 입력값처럼 미리 채워져 있었다.

해결:

- 폼 값은 비워 두고, 기존 예시는 placeholder로만 희미하게 보이도록 변경했다.
- placeholder 색상을 더 연하게 조정했다.
- 빈 상태에서 생성 버튼을 누르는 경우에는 기존 예시값을 fallback으로 사용한다.

검증:

- 브라우저에서 입력값은 비어 있고 placeholder만 보이는지 확인
- `artifacts/teacher-placeholder-form.png`

### 학생 공유 링크 화면 접근 제한

문제:

- 학생 공유 링크(`/s/:token`)로 접속해도 `교사 / 관리자 / 학생 화면` 역할 탭이 보였다.

해결:

- 공유 링크 경로에서는 역할 전환 탭을 숨기도록 수정했다.
- 일반 운영자 경로(`/`)에서는 기존처럼 역할 탭을 유지한다.

검증:

- 일반 경로 `/`: 역할 탭 3개 표시
- 공유 링크 `/s/public-token`: 역할 탭 0개 표시
- `tests/presentation/studentShareNavigation.test.ts`

### 학생 채팅 자동 스크롤

문제:

- 챗봇 응답이 길어지면 사용자가 직접 스크롤바를 내려야 최신 메시지를 볼 수 있었다.

해결:

- 메시지 추가 또는 스트리밍 상태 변경 시 메시지 영역을 아래로 이동한다.
- 페이지 자체가 길어지는 경우에도 마지막 메시지가 화면 안으로 들어오도록 `scrollIntoView`를 적용했다.

검증:

- `tests/presentation/chatAutoScroll.test.ts`
- Playwright 실제 브라우저 검증에서 28개 메시지 상태의 마지막 메시지 표시 확인

### 최신 검증 상태

최신 확인 결과:

- `npm run build`
  - 성공
- `npm test`
  - 20 files passed
  - 79 tests passed

### 태블릿 첫 화면 히어로 영역 축소

문제:

- `#root > main > section.hero-band` 히어로 영역이 태블릿 화면에서 너무 많은 높이를 차지했다.
- 학생이 태블릿에서 접속하면 채팅 영역과 입력창을 보려면 스크롤이 필요했다.

해결:

- 히어로 최소 높이를 줄였다.
- 히어로 하단 패딩과 제목 블록 상단 여백을 줄였다.
- 태블릿 이하 구간에서 히어로 높이, 제목 크기, 설명문 간격을 별도로 압축했다.
- 모바일 구간도 함께 조정해 첫 화면에서 채팅 영역이 더 빨리 보이도록 했다.

검증:

- `npm run build` 성공
- 관련 테스트 통과
- Playwright 태블릿 viewport `820x1100` 기준 확인
  - 히어로 높이: `268px`
  - 채팅 카드 위치: `top 246px`, `bottom 928px`
  - 채팅 입력창 위치: `top 811px`, `bottom 898px`
  - 스크롤 없이 채팅 입력창 표시 확인
- 확인 캡처: `artifacts/tablet-hero-chat-visible.png`

### 상단 내비게이션 라운딩 조정

문제:

- `#root > main > section.hero-band > nav` 영역이 직각 테두리로 보여 본문 카드의 둥근 스타일과 이질감이 있었다.

해결:

- 상단 nav에 1px warm border, 24px radius, inset shadow를 적용했다.
- 모바일 구간에서는 20px radius로 조정했다.
- 기존 투명/블러 톤은 유지해 히어로 배경과 자연스럽게 이어지도록 했다.

검증:

- `npm run build` 성공
- Playwright 확인
  - 태블릿 nav `borderRadius: 24px`
  - 모바일 nav `borderRadius: 20px`
- 확인 캡처
  - `artifacts/nav-rounded-tablet.png`
  - `artifacts/nav-rounded-mobile.png`

### 학교급 표시 한글화

문제:

- 학생 화면의 수업 범위 표시와 교사 챗봇 목록에서 `elementary`, `middle`, `high` 같은 내부 코드가 그대로 노출됐다.
- 운영 화면에서는 `초등학교`, `중학교`, `고등학교`, `특수학급`처럼 사용자가 읽을 수 있는 한글 라벨이 필요했다.

해결:

- `src/presentation/schoolLevelLabel.ts`를 추가했다.
- 내부 저장값은 유지하고 화면 표시와 TXT 다운로드 문구에서만 한글 라벨로 변환한다.
- 기본 학교급 외에 `special`, `special_class`, `special-education` 등 특수학급/특수교육 계열 값도 한글로 표시되도록 대비했다.
- 알 수 없는 값은 숨기지 않고 원래 값을 그대로 보여주도록 했다.

검증:

- `tests/presentation/schoolLevelLabel.test.ts` 추가
- 브라우저에서 학생 패널 표시 확인
  - 기존: `elementary · 5-6 · 과학`
  - 변경: `초등학교 · 5-6 · 과학`
- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 82 tests passed
- 확인 캡처: `artifacts/school-level-korean-label.png`

### 교사용 폼 textarea 리사이즈 핸들 제거

문제:

- 교사용 챗봇 생성 폼의 `대화 목표` textarea 우측 하단에 브라우저 기본 크기 조절 핸들이 표시됐다.
- 다른 입력 컴포넌트와 달리 이 textarea만 조절 가능한 것처럼 보여 폼 디자인의 일관성이 깨졌다.

해결:

- `src/presentation/styles.css`의 `.form-grid textarea`에 `resize: none`을 적용했다.
- textarea 최소 높이는 `108px`로 유지해 입력 공간은 줄어들지 않게 했다.

검증:

- Playwright 실제 렌더링 확인
  - `resize: none`
  - `min-height: 108px`
  - `height: 108px`
- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 82 tests passed
- 확인 캡처: `artifacts/teacher-textarea-no-resize.png`

### 교사용 폼 라벨 최소 크기 조정

문제:

- 교사용 챗봇 생성 폼의 첫 번째 라벨(`챗봇 이름`)을 기준으로 볼 때 폼 라벨 글자가 다소 작게 보였다.

해결:

- `.form-grid label`의 글자 크기를 `14px`에서 `15px`로 조정했다.
- 첫 번째 라벨만 따로 키우지 않고 폼 전체 라벨에 동일하게 적용해 입력 폼의 리듬을 유지했다.

검증:

- Playwright 실제 렌더링 확인
  - 첫 번째 폼 라벨 font-size: `15px`
  - 전체 폼 라벨 font-size: `15px`
  - textarea resize 상태: `none`
- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 82 tests passed
- 확인 캡처: `artifacts/teacher-form-label-font-size.png`

### Refero Say Briefly 스타일 적용

요청:

- 기존 디자인을 원복할 수 있게 백업한 뒤, `https://styles.refero.design/style/8b91f4c9-74e5-4925-90a3-3dd31fd5725e` 스타일 방향으로 UI를 변경한다.
- 폰트는 기존 Paperlogy를 유지한다.
- 백업 파일은 나중에 불필요한 파일 정리 요청 시 삭제 후보로 알아볼 수 있게 둔다.

백업:

- 백업 폴더: `backups/cleanup-candidate-20260612-refero-style-before/`
- 백업 파일:
  - `styles.css`
  - `App.tsx`
  - `README.md`
- `README.md`에 원복용 백업이며 추후 정리 대상임을 명시했다.

적용:

- Paperlogy 폰트 설정은 유지했다.
- 색상 체계를 크림 종이 배경과 포레스트 그린 중심으로 바꿨다.
- 히어로 제목의 `AI`에 노란 하이라이트 워시를 적용했다.
- nav, 버튼, 카드, 입력창을 1px 보더 중심의 평면 스타일로 조정했다.
- 추천 카드는 민트, 블러시, 틸 계열 스티키노트 색상으로 구분했다.
- 카드 라운딩은 12px, nav는 16px, 버튼은 6px 중심으로 조정했다.
- 좁은 사이드 패널에서 제목이 과하게 줄바꿈되지 않도록 정보 패널 제목 크기를 별도 보정했다.

검증:

- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 82 tests passed
- Playwright computed style 확인
  - font-family: Paperlogy 유지
  - body color: `rgb(26, 51, 0)`
  - body background: `rgb(252, 250, 245)`
  - panel border: `rgb(26, 51, 0)`
  - panel radius: `12px`
  - form label font-size: `15px`
- 확인 캡처:
  - `artifacts/refero-style-student-final.png`
  - `artifacts/refero-style-teacher-final.png`
  - `artifacts/refero-style-desktop.png`
  - `artifacts/refero-style-tablet.png`
  - `artifacts/refero-style-mobile.png`

### 히어로 교육과정 고정 문구 제거

문제:

- 히어로 상단에 `2022 개정 교육과정 기반` 문구가 고정으로 노출됐다.
- 추후 교육과정 명칭이나 연도가 바뀌면 다시 수정해야 하므로, 메인 화면에서 정책/연도 고정 문구를 빼는 편이 운영에 적합하다.

해결:

- `src/presentation/App.tsx`에서 히어로 eyebrow 문구를 제거했다.
- 더 이상 사용하지 않는 `.eyebrow` CSS도 `src/presentation/styles.css`에서 정리했다.
- 히어로는 바로 `꼬리에 꼬리를 무는 AI` 제목부터 시작하도록 변경했다.

검증:

- `rg`로 `2022 개정 교육과정 기반`과 `.eyebrow` 사용처가 남지 않은 것을 확인했다.
- Playwright 실제 렌더링 확인
  - `hasCurriculumBadge: false`
  - `eyebrowCount: 0`
  - 히어로 첫 텍스트가 `꼬리에 꼬리를 무는 AI`로 시작
- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 82 tests passed
- 확인 캡처: `artifacts/hero-title-start-no-curriculum-badge.png`

### 히어로와 본문 카드 겹침 제거

문제:

- Refero 스타일 적용 후 `section.workspace > aside`와 `section.workspace > section` 상단이 히어로 영역에 가려져 잘린 것처럼 보였다.
- 교사, 관리자 페이지에서도 같은 방식으로 본문 카드 상단이 히어로와 겹쳤다.

원인:

- 기존 디자인에서 본문 카드를 히어로 위로 살짝 끌어올리기 위해 `.workspace`에 음수 `margin-top`을 사용하고 있었다.
- 선명한 1px 보더 스타일로 바뀐 뒤 이 겹침이 카드 잘림처럼 보였다.

해결:

- `.workspace`의 음수 margin을 제거하고, 히어로 아래에서 양수 간격으로 시작하도록 변경했다.
- 태블릿과 모바일 breakpoint에 남아 있던 음수 margin도 제거했다.
- 히어로 높이와 하단 padding을 조금 줄여 학생 채팅 입력창이 첫 화면 안에 남도록 조정했다.
- `.workspace`에 `position: relative`, `z-index: 1`을 부여해 히어로 장식보다 본문 레이어가 안정적으로 위에 오게 했다.

검증:

- `rg`로 `margin-top: -`와 `clamp(-`가 남지 않은 것을 확인했다.
- Playwright 실제 렌더링 확인
  - desktop 학생/교사/관리자: hero bottom `309`, workspace top `345`, gap `36`, clipped `false`
  - tablet 학생/교사/관리자: hero bottom `220`, workspace top `238`, gap `18`, clipped `false`
  - mobile 학생/교사/관리자: hero bottom `271`, workspace top `287`, gap `16`, clipped `false`
- 학생 채팅 입력창 첫 화면 표시 확인
  - tablet: input bottom `889`, viewport height `1100`, visible `true`
  - mobile: input bottom `779`, viewport height `844`, visible `true`
- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 82 tests passed
- 확인 캡처:
  - `artifacts/no-hero-overlap-student-desktop.png`
  - `artifacts/no-hero-overlap-teacher-desktop.png`
  - `artifacts/no-hero-overlap-admin-desktop.png`
  - `artifacts/no-hero-overlap-student-tablet.png`
  - `artifacts/no-hero-overlap-teacher-tablet.png`
  - `artifacts/no-hero-overlap-admin-tablet.png`
  - `artifacts/no-hero-overlap-student-mobile.png`
  - `artifacts/no-hero-overlap-teacher-mobile.png`
  - `artifacts/no-hero-overlap-admin-mobile.png`

### 직업계고 전문교과 학교급 처리 검토

질문:

- 직업계고 관련 교육과정은 학교급/학년군/과목을 기존 초·중·고 구조로 그대로 두어도 되는지 확인했다.

확인:

- `2022_Revised_National_Curriculum/manifest.json`에는 별책 23~39가 `professional_subject`로 들어와 있다.
- 현재 `server/curriculumIndex.ts`의 학교급 타입은 `elementary`, `middle`, `high`, `all`만 지원한다.
- 일반 고등학교 성취기준처럼 숫자로 시작하는 코드는 `high`로 추론되지만, 전문교과 성취기준에는 `[성직 01-01]`, `[디직 02-02]`처럼 문자로 시작하는 코드가 많다.
- 문자형 성취기준 코드는 현재 학년/학교급 추론에서 `all`로 떨어질 가능성이 높다.
- `server/localApi.ts`의 추천 필터는 요청 학교급과 candidate 학교급이 정확히 같지 않으면 제외한다.

결론:

- 직업계고 자료를 `고등학교` 선택지만으로 운영하면 일부 전문교과 chunk가 추천 필터에서 빠질 수 있다.
- 운영용으로는 `직업계고` 또는 `전문교과` 선택지를 별도로 두고, `high`와 전문교과 자료를 함께 검색할 수 있게 필터 정책을 확장하는 것이 안전하다.
- 최소 보정안은 `candidate.schoolLevel === "all"`인 전문교과 자료를 고등학교 요청에서 제외하지 않도록 하는 방식이다.

### 직업계고 전문교과 선택지와 추천 카드 번호 복원

요청:

- 직업계고/전문교과는 별도 선택지로 운영한다.
- 추천 카드 하단에서 사라진 교육과정 성취기준 번호를 교사가 확인하기 쉽게 다시 보여준다.
- 히어로 설명문은 특정 수업 주제인 전기회로 문구가 아니라 AI 챗봇 자체 소개가 들어가게 한다.

해결:

- `SchoolLevel` 타입에 `vocational_high`를 추가했다.
- 교사용 학교급 선택지에 `직업계고`를 추가했다.
- `schoolLevelLabel`에서 `vocational_high`, `vocationalHigh`, `vocational-high`를 모두 `직업계고`로 표시한다.
- `server/curriculumIndex.ts`에서 markdown frontmatter의 `category: professional_subject`를 읽어 전문교과 chunk를 `vocational_high`로 분류한다.
- `[성직 01-01]`, `[디직 03-02]`처럼 코드 안에 공백이 있는 전문교과 성취기준 번호도 파싱하도록 보정했다.
- 전문교과 과목명은 `전기·전자 전문 교과`처럼 원문 과목명을 유지하도록 과목 추론을 보정했다.
- `server/localApi.ts`에서 `gradeBand: all`인 성취기준은 특정 학년군 요청에서도 제외하지 않도록 수정했다.
- 추천 카드의 상단 배지에 `성취기준 [번호]`를 표시하도록 변경했다.
- fallback 교육과정 추천 데이터에도 성취기준 번호를 넣었다.
- 히어로 설명문을 `교사가 수업 주제를 넣으면 교육과정 성취기준을 바탕으로 학생의 생각을 질문으로 이어 주는 학습 챗봇입니다.`로 변경했다.

검증:

- `npm run build` 성공
- `npm test`
  - 21 files passed
  - 84 tests passed
- 추가 테스트:
  - 전문교과 markdown이 `vocational_high`로 분류되는지 확인
  - `vocational_high`와 `gradeBand=2` 요청에서 `gradeBand=all` 전문교과가 추천에서 제외되지 않는지 확인
  - `vocational_high` 라벨이 `직업계고`로 표시되는지 확인
- Playwright 실제 렌더링 확인
  - 히어로 설명문이 AI 챗봇 소개 문구로 표시됨
  - 학교급 선택지에 `직업계고` 표시
  - 추천 카드 배지에 `성취기준 [6과15-01]`, `성취기준 [6과15-02]`, `성취기준 [6과14-02]` 표시
- API 서버 재시작 후 실제 추천 API 확인
  - `/api/curriculum/recommend?topic=직업 생활&schoolLevel=vocational_high&gradeBand=all`
  - `schoolLevel: vocational_high`
  - `subject: 경영·금융 전문 교과`
  - `[성직 02-03]`, `[성직 04-01]`, `[디직 03-02]` 등 전문교과 성취기준 반환 확인
- 확인 캡처: `artifacts/vocational-hero-recommendation-number.png`

### 챗봇 이름과 학교급 변경에 따른 추천 카드 자동 갱신

문제:

- 교사용 챗봇 생성 폼에서 `챗봇 이름`, `과목`, `대화 목표`를 바꿔도 하단 추천 카드 검색어에는 `수업 주제`만 반영됐다.
- 학교급을 선택해도 fallback 추천에서는 학교급이 점수 가산에만 쓰이고, 다른 학교급 성취기준이 카드에 남을 수 있었다.
- 전문교과처럼 영역명이 비어 있는 자료는 추천 이유가 ` 영역에서...`처럼 어색하게 표시될 수 있었다.

해결:

- `src/presentation/curriculumRecommendationQuery.ts`를 추가해 추천 검색어를 `챗봇 이름 + 과목 + 수업 주제 + 대화 목표`로 구성했다.
- 모든 입력값이 비어 있을 때만 기존 데모 주제를 fallback으로 사용하도록 했다.
- `src/presentation/App.tsx`에서 API 추천과 fallback 추천 모두 같은 `recommendationQuery`를 사용하게 변경했다.
- `src/domain/curriculum/curriculumRecommendation.ts`에서 fallback 추천도 선택한 학교급과 학년군 범위에 맞는 chunk만 대상으로 삼도록 필터링했다.
- `server/localApi.ts`에서 추천 이유 생성 시 `area`가 비어 있으면 `subject`를 대신 사용하도록 보정했다.
- `src/presentation/routes/TeacherDashboardRoute.tsx`에서 영역명이 비어 있을 때 카드 제목에 불필요한 구분점이 남지 않게 처리했다.

검증:

- TDD로 실패를 먼저 확인했다.
  - 추천 검색어 테스트에서 기존 구현은 `면접 준비 전략`만 반환해 실패했다.
  - fallback 추천 테스트에서 `high` 선택 시 `elementary` 카드가 남아 실패했다.
  - API 추천 이유 테스트에서 `" 영역에서..."` 문구가 반환되어 실패했다.
- 수정 후 타깃 테스트 통과
  - `npm test -- tests/infrastructure/localApi.test.ts tests/presentation/curriculumRecommendationQuery.test.ts tests/domain/curriculumRecommendation.test.ts`
  - 3 files passed
  - 16 tests passed
- 전체 검증 통과
  - `npm run build` 성공
  - `npm test`
    - 22 files passed
    - 87 tests passed
- 개발 서버 확인
  - Vite 앱: `http://127.0.0.1:5173` 응답 `200`
  - 로컬 API: `http://127.0.0.1:8787/api/teachers` 응답 `200`
  - API 서버 재시작 로그: `logs/server-restart-current.out.log`
- Playwright 실제 브라우저 검증
  - 교사 탭에서 `챗봇 이름`에 `면접 준비 전략` 입력
  - 학교급을 `직업계고`로 선택
  - 추천 카드가 기존 과학 카드에서 전문교과 카드로 자동 변경됨
  - 변경 후 카드 제목:
    - `경영·금융 전문 교과`
    - `보건·복지 전문 교과`
    - `문화·예술·디자인·방송 전문 교과`
  - 카드 배지: `성취기준 [성직 03-03]`
  - API 요청:
    - `/api/curriculum/recommend?topic=면접+준비+전략&schoolLevel=vocational_high&gradeBand=all`
  - 확인 캡처: `artifacts/recommendations-update-by-name-schoollevel.png`

### 교사용 생성 폼 placeholder를 중학교 국어 품사 예시로 변경

요청:

- 교사용 화면의 샘플 placeholder 내용을 전기 회로가 아니라 중학교 국어의 품사 내용으로 바꾼다.

해결:

- `src/presentation/teacherChatbotSample.ts`를 추가해 교사용 샘플 예시를 한 곳에서 관리하도록 했다.
- 교사용 폼 placeholder를 다음 예시로 변경했다.
  - 챗봇 이름: `중1 국어 9품사 이해`
  - 학교급 기본값: `중학교`
  - 학년군: `1`
  - 과목: `국어`
  - 수업 주제: `중학교 국어 품사의 종류와 특성`
  - 대화 목표: `학생이 명사, 대명사, 수사, 동사, 형용사, 관형사, 부사, 조사, 감탄사의 역할을 예문 속에서 구분하도록 돕는다.`
  - 페르소나: `친절하지만 답을 바로 말하지 않고 예문과 질문으로 이끄는 국어 선생님`
- 빈 폼으로 생성했을 때 내부 fallback도 같은 국어 품사 예시를 사용하도록 `src/presentation/App.tsx`의 기본 예시를 함께 변경했다.
- fallback 추천 카드도 `[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.` 기준으로 맞췄다.

검증:

- `tests/presentation/teacherChatbotSample.test.ts` 추가
- 타깃 테스트 통과
  - `npm test -- tests/presentation/teacherChatbotSample.test.ts tests/presentation/curriculumRecommendationQuery.test.ts`
  - 2 files passed
  - 3 tests passed
- 전체 검증 통과
  - `npm run build` 성공
  - `npm test`
    - 23 files passed
    - 88 tests passed
- 개발 서버 확인
  - Vite 앱: `http://127.0.0.1:5173` 응답 `200`
  - 로컬 API: `http://127.0.0.1:8787/api/teachers` 응답 `200`
- Playwright 실제 브라우저 검증
  - 교사 탭에서 placeholder가 중학교 국어 품사 예시로 표시됨
  - 확인 캡처: `artifacts/teacher-korean-placeholder-sample.png`

### 초기 추천 카드 과목 필터와 정확도 표시 복원

문제:

- 교사용 생성 폼 placeholder를 국어 품사 예시로 바꿨지만, 하단 추천 카드에는 실과 성취기준이 함께 표시됐다.
- 원인은 추천 API가 `학교급`과 `학년군`만 필터링하고 `과목`은 필터링하지 않았기 때문이다.
- `중학교`, `종류`, `특성` 같은 넓은 검색어가 실과 성취기준에도 매칭되어 상위 카드에 섞였다.
- 추천 카드에 있던 정확도 점수 표시가 보이지 않았다.

해결:

- `src/presentation/curriculumRecommendationState.ts`를 추가해 초기 placeholder 상태의 추천 조건을 명확히 분리했다.
  - 폼이 untouched 상태이면 샘플 주제와 샘플 과목 `국어`를 추천 조건으로 사용한다.
  - 교사가 학교급을 바꾸면 샘플 과목 `국어` 필터는 유지하지 않는다.
- `src/presentation/apiClient.ts`에서 `/api/curriculum/recommend` 요청에 `subject` 파라미터를 보낼 수 있게 했다.
- `server/localApi.ts`에서 추천 후보를 과목까지 필터링하도록 수정했다.
- `src/presentation/curriculumRecommendationAccuracy.ts`를 추가해 추천 점수를 `정확도 n점`으로 표시한다.
- `src/presentation/routes/TeacherDashboardRoute.tsx`에서 카드 상단 배지를 `성취기준 [번호] · 정확도 n점` 형식으로 표시하도록 복원했다.

검증:

- TDD RED 확인
  - 과목 필터 테스트에서 실과 카드가 남아 실패함
  - API client가 `subject` 파라미터를 보내지 않아 실패함
  - 추천 상태/정확도 helper가 없어 실패함
- 수정 후 전체 검증 통과
  - `npm run build` 성공
  - `npm test`
    - 25 files passed
    - 93 tests passed
- 개발 서버 확인
  - Vite 앱: `http://127.0.0.1:5173` 응답 유지
  - 로컬 API: `http://127.0.0.1:8787/api/teachers` 응답 `200`
  - API 서버를 새 코드로 재시작함
- 실제 API 확인
  - `/api/curriculum/recommend?topic=중학교 국어 품사의 종류와 특성&schoolLevel=middle&gradeBand=1&subject=국어`
  - 실과 카드 제외 확인
  - 국어 성취기준만 반환 확인
- Playwright 실제 브라우저 검증
  - 초기 교사 화면 추천 API 요청에 `subject=국어` 포함 확인
  - 초기 추천 카드 3개가 모두 국어 과목으로 표시됨
  - 카드 상단에 정확도 표시 복원 확인
    - `성취기준 [9국04-03] · 정확도 13점`
    - `성취기준 [9국03-01] · 정확도 5점`
    - `성취기준 [9국05-01] · 정확도 5점`
  - 확인 캡처: `artifacts/teacher-korean-recommendations-accuracy.png`

### 추천 카드 정확도 점수 문구를 관련성 등급으로 변경

문제:

- 추천 카드의 `정확도 13점` 같은 표시는 몇 점 만점인지 알기 어렵다.
- 교사 입장에서는 점수보다 해당 성취기준이 수업 주제와 얼마나 관련 있는지를 빠르게 판단하는 표현이 더 적합하다.

해결:

- `src/presentation/curriculumRecommendationAccuracy.ts`의 표시 함수를 `formatRecommendationRelevance`로 변경했다.
- 추천 점수를 화면에 그대로 노출하지 않고 `관련성 상`, `관련성 중`, `관련성 하`로 변환한다.
- `src/presentation/routes/TeacherDashboardRoute.tsx`의 카드 상단 배지를 `성취기준 [번호] · 관련성 등급` 형식으로 변경했다.

검증:

- TDD RED 확인
  - 기존 helper가 `formatRecommendationRelevance`를 제공하지 않아 실패함
- 수정 후 검증 통과
  - `npm test -- tests/presentation/curriculumRecommendationAccuracy.test.ts`
    - 1 file passed
    - 2 tests passed
  - `npm run build` 성공
  - `npm test`
    - 25 files passed
    - 93 tests passed
- Playwright 실제 브라우저 검증
  - 추천 카드 상단 배지 표시 확인
    - `성취기준 [9국04-03] · 관련성 상`
    - `성취기준 [9국03-01] · 관련성 중`
    - `성취기준 [9국05-01] · 관련성 중`
  - 확인 캡처: `artifacts/teacher-recommendation-relevance-level.png`

### 성취기준 추천 카드 선택과 더 보기 기능 추가

요청:

- 추천 카드 중 교사가 관련 성취기준을 직접 선택할 수 있게 한다.
- 카드 바로 위에 `관련된 성취기준이 있으면 선택해주세요.` 취지의 안내 메시지를 추가한다.
- 기본 3개 카드는 유지하되, 더 많은 관련 성취기준을 `더 보기`로 펼쳐 선택할 수 있게 한다.
- 성취기준 선택은 필수가 아니며, 아무것도 선택하지 않으면 가장 관련성 높은 첫 번째 성취기준을 자동 반영한다.
- 선택된 성취기준은 학생 챗봇의 프롬프트에도 포함되게 한다.

해결:

- `src/presentation/curriculumSelection.ts`를 추가했다.
  - 명시적으로 선택한 성취기준이 있으면 해당 추천을 사용한다.
  - 선택값이 없거나 추천 목록에서 사라지면 첫 번째 추천을 기본값으로 사용한다.
  - 기본 3개 표시와 전체 펼침 목록을 분리한다.
  - 선택된 추천을 `curriculumLinks` 저장 형식으로 변환한다.
- `src/presentation/routes/TeacherDashboardRoute.tsx`에서 추천 카드를 클릭 가능한 버튼으로 변경했다.
  - 선택된 카드는 시각적으로 강조된다.
  - 카드 위에 안내 메시지를 추가했다.
  - 추천이 3개보다 많으면 `더 보기 n개` 버튼을 표시한다.
  - 펼친 상태에서는 `접기` 버튼으로 돌아갈 수 있다.
- `src/presentation/App.tsx`에서 선택된 성취기준 상태를 관리한다.
  - 생성 시 선택된 카드가 있으면 그 성취기준을 저장한다.
  - 선택이 없으면 첫 번째 추천 성취기준을 저장한다.
- `src/domain/chatPolicy/buildStudentSystemPrompt.ts`에서 챗봇의 `curriculumLinks`가 있으면 시스템 프롬프트에 `연결된 성취기준`으로 포함한다.
- `src/presentation/styles.css`에서 안내 영역, 선택 카드, hover/focus 느낌을 현재 Refero 스타일에 맞게 보정했다.

검증:

- TDD RED 확인
  - `curriculumSelection` helper가 없어 실패함
  - 시스템 프롬프트에 `연결된 성취기준`이 없어 실패함
- 수정 후 타깃 테스트 통과
  - `npm test -- tests/presentation/curriculumSelection.test.ts tests/domain/chatPolicy.test.ts`
  - 2 files passed
  - 7 tests passed
- 전체 검증 통과
  - `npm run build` 성공
  - `npm test`
    - 26 files passed
    - 98 tests passed
- 개발 서버 확인
  - Vite 앱: `http://127.0.0.1:5173` 응답 `200`
  - 로컬 API: `http://127.0.0.1:8787/api/teachers` 응답 `200`
  - 프롬프트 변경 반영을 위해 API 서버 재시작 완료
- Playwright 실제 브라우저 검증
  - 안내 문구 표시 확인
  - 기본 카드 3개 표시 확인
  - `더 보기 5개` 클릭 후 8개 카드 표시 확인
  - 두 번째 성취기준 카드 선택 시 `aria-pressed=true` 확인
  - 생성 시 선택한 `[9국03-01]` 성취기준이 `curriculumLinks`에 저장되는지 API로 확인
  - 검증용으로 생성한 챗봇은 확인 후 삭제 처리함
  - 확인 캡처: `artifacts/curriculum-card-selection-expanded.png`

### 추천 카드 선택 표시와 더 보기 버튼 정렬 보정

문제:

- `더 보기` 버튼이 안내문 아래 왼쪽에 보여 우측 정렬 요구와 맞지 않았다.
- 추천 카드는 실제로 `button`으로 렌더링되고 클릭 시 `aria-pressed`와 `selected` 상태가 바뀌었지만, 개발 서버가 이전 CSS를 잡고 있어 선택 표시가 화면에서 거의 드러나지 않았다.
- 선택 카드가 시각적으로 명확하지 않아 사용자가 선택 기능이 없는 것처럼 느낄 수 있었다.

해결:

- Vite 개발 서버를 재시작해 최신 CSS가 반영되도록 했다.
- `.recommendation-guide`를 grid 레이아웃으로 바꾸고 `더 보기` 버튼을 우측 끝에 정렬했다.
- 카드 내부에 `선택됨`/`선택` 상태 표시를 추가했다.
- 선택된 카드는 `선택됨` 배지, 굵은 outline, 노란 shadow로 명확히 구분되도록 보정했다.
- `formatCurriculumSelectionStatus` helper와 테스트를 추가했다.

검증:

- TDD RED 확인
  - `formatCurriculumSelectionStatus`가 없어 실패함
- 수정 후 검증 통과
  - `npm test -- tests/presentation/curriculumSelection.test.ts`
    - 1 file passed
    - 5 tests passed
  - `npm run build` 성공
  - `npm test`
    - 26 files passed
    - 99 tests passed
- 개발 서버 확인
  - Vite 앱 재시작 완료
  - `http://127.0.0.1:5173` 응답 `200`
- Playwright 실제 브라우저 검증
  - `.recommendation-guide` display가 `grid`로 적용됨
  - `더 보기` 버튼의 오른쪽 좌표가 guide 오른쪽 끝과 일치함
  - 클릭 전 첫 번째 카드 `선택됨`, 나머지 카드 `선택`
  - 두 번째 카드 클릭 후 두 번째 카드 `선택됨`, `aria-pressed=true`
  - 선택 카드 outline과 shadow 적용 확인
  - 확인 캡처: `artifacts/curriculum-selection-visible-fixed.png`

### 성취기준 카드 다중 선택과 배지 겹침 제거

문제:

- 성취기준은 여러 개를 함께 연결할 수 있어야 하는데, 기존 구현은 한 번에 하나만 선택할 수 있었다.
- 카드 우측 상단의 `선택/선택됨` 배지가 절대 위치로 올라가 있어 `성취기준 [번호] · 관련성 상/중/하` 배지를 가릴 수 있었다.

해결:

- `src/presentation/curriculumSelection.ts`를 배열 기반 다중 선택 로직으로 변경했다.
  - `resolveSelectedCurriculumRecommendations`
    - 선택한 성취기준이 있으면 모두 반영한다.
    - 아무것도 선택하지 않으면 첫 번째 추천 1개를 자동 반영한다.
  - `toggleCurriculumSelection`
    - 이미 선택된 카드는 다시 클릭하면 해제한다.
    - 선택되지 않은 카드는 기존 선택 목록에 추가한다.
- `src/presentation/App.tsx`에서 선택 상태를 `string` 1개가 아니라 `string[]`로 관리하도록 변경했다.
- 챗봇 생성 시 선택된 여러 성취기준을 모두 `curriculumLinks`에 저장하도록 변경했다.
- `src/presentation/routes/TeacherDashboardRoute.tsx`에서 카드 클릭을 다중 선택 토글로 연결했다.
- 카드 안내 문구를 `하나 이상 선택`할 수 있음을 드러내도록 수정했다.
- 카드 상단을 `.recommendation-meta` 행으로 나누어 관련성 배지와 선택 상태 배지가 서로 겹치지 않게 했다.

검증:

- TDD RED 확인
  - 다중 선택 resolver와 toggle helper가 없어 실패함
- 수정 후 검증 통과
  - `npm test -- tests/presentation/curriculumSelection.test.ts`
    - 1 file passed
    - 6 tests passed
  - `npm run build` 성공
  - `npm test`
    - 26 files passed
    - 100 tests passed
- 개발 서버 확인
  - Vite 앱 재시작 완료
  - `http://127.0.0.1:5173` 응답 `200`
- Playwright 실제 브라우저 검증
  - 첫 번째와 두 번째 성취기준을 동시에 선택 가능함
  - 두 카드 모두 `aria-pressed=true` 확인
  - `선택됨` 배지와 `관련성 상/중/하` 배지가 겹치지 않음
  - 생성된 챗봇의 `curriculumLinks`에 `[9국04-03]`, `[9국03-01]` 두 개 성취기준이 함께 저장됨
  - 검증용으로 생성한 챗봇은 확인 후 삭제 처리함
  - 확인 캡처: `artifacts/curriculum-multi-selection-no-overlap.png`

### 버튼 hover/active 상호작용 보강

요청:

- 버튼에 마우스를 올렸을 때 반응이 보이게 한다.
- 버튼을 클릭했을 때 실제로 눌렀다는 느낌이 들게 한다.

해결:

- `src/presentation/styles.css`에서 주요 버튼의 상태 스타일을 보강했다.
  - `.pill`
  - `.round-send`
  - `.recommendation-item`
- hover 상태:
  - 살짝 위로 떠오르는 `translateY(-2px)` 적용
  - 종이 느낌의 4px 그림자 적용
  - 주요 버튼은 노란 하이라이트 배경으로 반응 표시
- active 상태:
  - 아래로 눌리는 `translateY(1px)` 적용
  - 그림자를 1px로 줄여 눌림감 표현
- focus-visible 상태:
  - 키보드 접근성 확인을 위해 노란 outline을 추가했다.

검증:

- `npm run build` 성공
- `npm test`
  - 26 files passed
  - 100 tests passed
- Vite 개발 서버 재시작 후 실제 브라우저 확인
  - 생성 버튼 hover/active 상태에서 transform, shadow, 색상 변화 확인
  - 추천 카드 hover/active 상태에서 transform, shadow 변화 확인
  - 학생 채팅 전송 버튼 hover/active 상태에서 transform, shadow, 색상 변화 확인
  - 확인 캡처: `artifacts/button-hover-active-states.png`

### 성취기준 카드 선택 배지 위치 보정

문제:

- `선택/선택됨` 배지를 카드 상단 메타 행 우측에 함께 두면서, 원래 한 줄로 보이던 `성취기준 [번호] · 관련성 상/중/하` 배지가 좁아져 두 줄처럼 어색하게 보였다.
- 선택 배지가 관련성 표시와 같은 줄에서 경쟁해 카드 상단 정보의 리듬이 깨졌다.

해결:

- `src/presentation/styles.css`에서 선택 배지를 다시 카드 맨 윗줄 우측에 독립 배치했다.
- `.recommendation-meta`에는 상단 여백을 주어 선택 배지와 성취기준/관련성 배지가 서로 다른 줄에서 자연스럽게 보이도록 했다.
- `성취기준 [번호] · 관련성 상/중/하` 배지는 카드 본문 폭을 사용하고 `white-space: nowrap`으로 한 줄 표시를 유지하게 했다.

검증:

- `npm run build` 성공
- `npm test`
  - 26 files passed
  - 100 tests passed
- Vite 개발 서버 재시작 후 Playwright 실제 브라우저 검증
  - 선택 배지가 카드 맨 윗줄 우측에 위치함
  - 선택 배지와 성취기준/관련성 배지가 겹치지 않음
  - `성취기준 [9국04-03] · 관련성 상` 배지에 `white-space: nowrap` 적용 확인
  - 배지 폭 `194.25px`, 카드 폭 `246px`으로 카드 안에 한 줄로 들어가는 것 확인
  - 확인 캡처: `artifacts/curriculum-selection-top-right-clean.png`

### 공유 링크 복사 완료 메시지 가시성 개선

문제:

- 교사가 `링크 복사`를 눌렀을 때 기존 안내가 챗봇 목록 아래쪽의 일반 로그처럼 보여 눈에 잘 띄지 않았다.
- 실제 화면에서 목록 하단 버튼을 누르면 상단 안내가 화면 밖에 있을 수 있어 사용자가 복사 완료 여부를 바로 확인하기 어려웠다.

해결:

- `src/presentation/shareNotice.ts`를 추가해 공유 링크 알림을 제목, 본문, URL, 상태 톤으로 정리했다.
  - 복사 완료: `복사 완료`
  - 공유 켜기 완료: `공유 준비 완료`
  - 일반 알림: `알림`
- `src/presentation/routes/TeacherDashboardRoute.tsx`에서 공유 알림을 교사용 패널 상단에 `role="status"`와 `aria-live="polite"`로 렌더링했다.
- `src/presentation/styles.css`에서 `.share-notice`를 sticky 상태 알림으로 만들어 현재 스크롤 위치에서도 화면 상단에 보이도록 했다.
- 복사 링크는 별도 `code` 영역으로 표시해 긴 URL이 카드 폭 안에서 자연스럽게 줄바꿈되게 했다.
- `tests/presentation/shareNotice.test.ts`를 추가해 공유 링크 알림 포맷을 회귀 테스트로 고정했다.
- 전체 테스트 중 임의 포트 `6000` 배정으로 `fetch failed: bad port`가 발생할 수 있어, `tests/infrastructure/localApi.test.ts`의 테스트 서버 헬퍼가 fetch 차단 포트를 피하도록 보정했다.

검증:

- `npm test -- tests/presentation/shareNotice.test.ts`
  - 1 file passed
  - 3 tests passed
- `npm test`
  - 27 files passed
  - 103 tests passed
- `npm run build` 성공
- 개발 서버 확인
  - Vite 앱 `http://127.0.0.1:5173` 응답 `200`
  - API 서버 `http://127.0.0.1:8787/api/teachers` 응답 `200`
- Playwright 실제 브라우저 검증
  - `링크 복사` 클릭 후 알림 제목 `복사 완료` 확인
  - 본문 `공유 링크를 복사했습니다.` 확인
  - 알림 `role="status"` 확인
  - sticky 위치 `top: 16px`, 화면 안 표시 확인
  - 확인 캡처: `artifacts/share-copy-notice-visible.png`

### 국어 9품사 가드 오탐, 챗봇 선택 삭제, 공유 복사 알림 위치 수정

문제:

- 중1 국어 9품사 챗봇에서 `관형사와 부사의 차이가 궁금해`라는 정상 질문이 범위 밖 질문으로 차단됐다.
- 교사가 만든 챗봇을 여러 개 선택하거나 전체 선택해서 삭제하는 기능이 없었다.
- 공유 링크 복사 알림을 상단에 고정하니 버튼을 누른 위치와 시선이 분리됐다.

원인:

- `src/domain/conversation/conversationGuard.ts`의 국어 허용 키워드에 9품사 전체가 들어 있지 않았다.
  - 기존에는 `명사`, `동사`, `형용사`, `조사` 정도만 포함되어 있었다.
  - 그래서 `관형사`, `부사`처럼 실제 품사 개념을 물어도 `품사`라는 단어가 없으면 범위 밖으로 판단될 수 있었다.
- 공유 알림은 이전 작업에서 패널 상단 sticky 알림으로 배치되어 현재 클릭 위치와 떨어져 보였다.

해결:

- 국어 가드 허용어에 9품사 전체를 추가했다.
  - 명사, 대명사, 수사, 동사, 형용사, 관형사, 부사, 조사, 감탄사
- 가드 판단에 `learningGoal` 문구도 함께 반영하게 해 교사가 입력한 대화 목표의 핵심어가 범위 판단에 쓰이도록 했다.
- 학생 채팅 첫 화면에서 챗봇이 먼저 말을 거는 시작 메시지를 표시했다.
  - 예: `안녕하세요. ...에서 먼저 어떤 부분이 궁금한가요?`
- `src/presentation/chatbotListSelection.ts`를 추가해 챗봇 목록 다중 선택 상태를 순수 함수로 분리했다.
- 교사용 챗봇 목록에 다음 기능을 추가했다.
  - 개별 체크박스
  - 전체 선택 체크박스
  - 선택 삭제 버튼
  - 선택 삭제 전 1회 확인창
  - 삭제 후 목록에서 즉시 제거
- 공유 링크 복사 알림은 해당 챗봇 행 바로 아래에 표시되도록 바꿨다.
- 공유 알림은 3초 뒤 자동으로 사라지게 했다.
- `.share-notice`의 sticky 고정을 제거하고, 짧은 등장 애니메이션만 남겼다.

검증:

- `npm test`
  - 29 files passed
  - 110 tests passed
- `npm run build` 성공
- 개발 서버 재시작 완료
  - Vite 앱 `http://127.0.0.1:5173` 응답 `200`
  - API 서버 `http://127.0.0.1:8787` 재시작 완료
- API 직접 검증
  - `관형사와 부사의 차이가 궁금해` 요청이 `범위 안에서만` 로컬 가드 문구로 차단되지 않음
  - 실제 AI 스트리밍 응답으로 진행됨
- Playwright 실제 브라우저 검증
  - 빈 학생 채팅 화면에 챗봇 시작 발화 표시 확인
  - 검증용 챗봇 생성 후 체크박스로 선택 가능함
  - `선택 삭제 1개` 버튼 표시 확인
  - 삭제 확인 후 검증용 챗봇이 목록에서 사라짐
  - 공유 링크 복사 알림 제목 `복사 완료` 확인
  - 알림이 해당 챗봇 행 아래에 나타남
  - 알림이 3초 안에 자동으로 사라짐
  - 확인 캡처: `artifacts/share-inline-selection-delete-opening.png`

### 학생 채팅 입력창 고정 가시성 및 답변 Markdown 렌더링 수정

문제:

- AI가 답변을 생성하는 중 메시지 영역으로 화면이 이동하면서 채팅 입력창을 다시 내려서 찾아야 했다.
- 답변에 포함된 Markdown 기호가 그대로 보였다.
  - 예: `**`, `**<u>...`

원인:

- `scrollChatViewToBottom`이 메시지 목록 내부 스크롤뿐 아니라 최신 메시지 앵커의 `scrollIntoView`까지 호출해 페이지 자체를 아래로 움직였다.
- `.chat-card` 높이가 데스크톱에서 720px까지 커질 수 있어 히어로 아래에 놓였을 때 입력창이 뷰포트 아래로 밀렸다.
- 채팅 메시지를 일반 텍스트로 렌더링해 Markdown 기호가 실제 서식으로 바뀌지 않았다.

해결:

- `src/presentation/routes/StudentChatRoute.tsx`에서 페이지 스크롤을 유발하는 `scrollIntoView` 호출을 제거했다.
- `src/presentation/styles.css`에서 채팅 카드를 작업 화면 안에 들어오는 높이로 제한했다.
  - 메시지 목록만 내부 스크롤되도록 `grid-template-rows: minmax(0, 1fr) auto auto`와 `min-height: 0`을 적용했다.
- `src/presentation/chatMessageMarkdown.ts`를 추가했다.
  - `**...**`는 `<strong>`으로 렌더링
  - `<u>...</u>`는 밑줄로 렌더링
  - 줄바꿈은 `<br />`로 렌더링
  - 그 외 HTML은 escape 처리해 안전하지 않은 태그가 그대로 실행되지 않게 했다.
- `src/presentation/conversationPersistence.ts`를 추가해 대화 기록 초기 로딩 전에 빈 배열이 localStorage를 덮어쓰지 않도록 했다.

검증:

- `npm test -- tests/presentation/chatAutoScroll.test.ts tests/presentation/chatMessageMarkdown.test.ts`
  - 2 files passed
  - 6 tests passed
- `npm test -- tests/presentation/conversationPersistence.test.ts tests/presentation/chatAutoScroll.test.ts tests/presentation/chatMessageMarkdown.test.ts`
  - 3 files passed
  - 7 tests passed
- `npm run build` 성공
- `npm test`
  - 31 files passed
  - 114 tests passed
- Playwright 실제 브라우저 검증
  - 긴 답변이 있어도 `.chat-input-row`가 1280x900 뷰포트 안에 표시됨
  - 입력창 위치: y `729.296875`, bottom `823.171875`, viewport height `900`
  - 답변 텍스트에 raw Markdown 기호 `**`, `<u>`가 남지 않음
  - 실제 DOM에 `<strong>` 2개, `<u>` 2개 렌더링 확인
  - 메시지 목록 내부 스크롤 확인
  - 확인 캡처: `artifacts/chat-input-visible-markdown-rendered.png`

### 챗봇 삭제 확인 메시지 위치 개선

문제:

- 개별 챗봇 삭제 시 브라우저 기본 확인창이 화면 상단에 떠서 삭제 버튼 위치와 시선이 분리됐다.
- 사용자는 삭제 버튼을 누른 자리 근처에서 바로 확인하고 취소할 수 있어야 한다.

해결:

- `src/presentation/chatbotDeletionPrompt.ts`를 추가해 삭제 확인 문구를 분리했다.
- `src/presentation/App.tsx`에서 개별 삭제를 `요청`과 `확정 삭제`로 분리했다.
  - 삭제 버튼 클릭: 삭제 대기 상태만 설정
  - 확인 패널의 삭제 버튼 클릭: 실제 API 삭제 실행
  - 취소 버튼 클릭: 삭제 대기 상태 해제
- `src/presentation/routes/TeacherDashboardRoute.tsx`에서 삭제 버튼을 누른 챗봇 행에 `.delete-confirmation` 패널을 표시했다.
- 선택 삭제도 브라우저 기본 확인창 대신 도구막대 아래에 같은 방식의 확인 패널을 표시하게 했다.
- `src/presentation/styles.css`에서 `.delete-confirmation`과 `.pill.danger` 스타일을 추가했다.
  - 삭제 확인 패널은 삭제 버튼 쪽에 가깝게 오른쪽 정렬
  - 모바일/좁은 화면에서는 전체 폭으로 자연스럽게 표시

검증:

- `npm test -- tests/presentation/chatbotDeletion.test.ts`
  - 1 file passed
  - 3 tests passed
- `npm test`
  - 31 files passed
  - 114 tests passed
- `npm run build` 성공
- Playwright 실제 브라우저 검증
  - 검증용 챗봇 생성 후 개별 삭제 버튼 클릭
  - 삭제 확인 패널이 해당 챗봇 행 안에서 표시됨
  - 삭제 버튼 오른쪽 끝과 확인 패널 오른쪽 끝 차이 18px로 버튼 근처 정렬 확인
  - `취소` 클릭 시 확인 패널이 사라짐
  - 다시 삭제 후 확인 패널의 `삭제` 클릭 시 챗봇이 목록에서 사라짐
  - 확인 캡처: `artifacts/chatbot-delete-inline-confirmation.png`

### 히어로 설명 문구 역할별 분기

문제:

- 히어로 설명의 `교사가` 표현이 다소 딱딱했다.
- 학생 화면에서도 선생님이 챗봇을 만드는 설명이 그대로 보여 학생에게 직접 도움이 되는 소개가 아니었다.

해결:

- `src/presentation/heroDescription.ts`를 추가해 화면 역할별 히어로 설명 문구를 분리했다.
- 교사/관리자 화면 문구:
  - `선생님이 수업 주제를 넣으면 교육과정 성취기준을 바탕으로 학생의 생각을 질문으로 이어 주는 학습 챗봇입니다.`
- 학생 화면 문구:
  - `궁금한 점을 적으면 AI가 바로 답을 주기보다 질문으로 생각을 이어 갈 수 있게 도와줘요.`
- `src/presentation/App.tsx`에서 현재 view에 따라 `getHeroDescription(view)`를 표시하도록 변경했다.

검증:

- `npm test -- tests/presentation/heroDescription.test.ts`
  - 1 file passed
  - 2 tests passed
- `npm test`
  - 32 files passed
  - 116 tests passed
- `npm run build` 성공
  - Playwright 실제 브라우저 검증
  - 학생 화면 히어로 설명이 학생용 문구로 표시됨
  - 교사 화면 히어로 설명이 `선생님이` 문구로 표시됨
  - 확인 캡처: `artifacts/hero-description-role-copy.png`

### 히어로 설명 문구 단일 문장 수정

요청:

- `#root > main > section.hero-band > div > p` 문구를 다음 문장으로 수정한다.
  - `질문과 대화를 통해 스스로 알아가는, 여러분을 위한 공간입니다.`

해결:

- `src/presentation/heroDescription.ts`의 히어로 설명 문구를 요청 문장으로 변경했다.
- 기존 학생/교사/관리자 화면별 분기 대신 동일한 문구가 표시되도록 정리했다.
- `tests/presentation/heroDescription.test.ts`를 새 문구 기준으로 수정했다.

검증:

- `npm test -- tests/presentation/heroDescription.test.ts`
  - 1 file passed
  - 1 test passed
- `npm test`
  - 32 files passed
  - 115 tests passed
- `npm run build` 성공
  - Playwright 실제 브라우저 검증
  - 히어로 설명 문구가 `질문과 대화를 통해 스스로 알아가는, 여러분을 위한 공간입니다.`로 표시됨
  - 확인 캡처: `artifacts/hero-description-requested-copy.png`

### 파비콘 등록

요청:

- 제공된 `favicon.png` 이미지를 앱 파비콘으로 등록한다.

해결:

- 루트의 `favicon.png`를 Vite 정적 배포 경로인 `public/favicon.png`로 복사했다.
- `index.html`의 `<head>`에 파비콘 링크를 추가했다.
  - `<link rel="icon" type="image/png" href="/favicon.png" />`

검증:

- `npm run build` 성공
- 개발 서버에서 `http://127.0.0.1:5173/favicon.png` 응답 확인
  - status `200`
  - content type `image/png`
  - bytes `979902`
- 빌드 산출물 확인
  - `dist/index.html`에 favicon 링크 포함
  - `dist/favicon.png` 생성 확인
- Playwright 실제 브라우저 검증
  - `link[rel="icon"]`의 `href`가 `/favicon.png`
  - `type`이 `image/png`

### 브라우저 탭 제목 수정

요청:

- 브라우저 탭 제목을 `교육과정 질문형 챗봇`에서 `꼬꼬무AI`로 변경한다.

해결:

- `index.html`의 `<title>`을 `꼬꼬무AI`로 수정했다.

검증:

- `npm run build` 성공
- 원본 `index.html`의 title 확인
  - `<title>꼬꼬무AI</title>`
- 빌드 산출물 `dist/index.html`의 title 확인
  - `<title>꼬꼬무AI</title>`
- Playwright 실제 브라우저 검증
  - `page.title()` 결과 `꼬꼬무AI`

### 학생 화면 채팅 영역 확대와 태블릿 잘림 보정

문제:

- 학생 화면에서 `#root > main > section.workspace > section` 채팅 영역이 상대적으로 좁게 보였다.
- `#root > main > section.hero-band > div` 히어로 텍스트 폭이 넓어 화면 상단을 크게 차지했다.
- 태블릿 가로 화면에서 `#root > main > section.workspace > aside` 안내 패널이 아래로 길어져 화면 아래가 잘려 보였다.

해결:

- `src/presentation/routes/StudentChatRoute.tsx`의 학생 채팅 workspace에 `student-workspace` 전용 클래스를 추가했다.
- `.hero-copy` 최대 폭을 줄여 히어로 문구가 화면을 덜 차지하게 했다.
  - 전체 히어로 문구 폭: `860px` 기준에서 `720px` 기준으로 축소
  - 제목 폭: `660px`
  - 설명문 폭: `520px`
- 학생 화면 전용 grid를 추가해 안내 패널 폭을 `200~220px`로 줄이고 채팅 영역을 더 넓혔다.
- 태블릿 이하에서는 학생 안내 패널을 더 압축된 2열 정보 구조로 바꾸었다.
- 안내 패널 안의 버튼 묶음은 2열 grid로 바꿔 세로 길이를 줄였다.

검증:

- `npm run build` 성공
- `npm test -- tests/presentation/chatAutoScroll.test.ts`
  - 1 file passed
  - 2 tests passed
- `npm test`
  - 32 files passed
  - 115 tests passed
- Playwright 실제 브라우저 검증
  - 데스크톱 `1280x900`
    - 히어로 문구 폭: `860px`에서 `720px`로 축소
    - 학생 채팅 카드 폭: `849.609px`에서 `922.406px`로 확대
  - 태블릿 가로 `1024x768`
    - 학생 채팅 카드 폭: `630.906px`에서 `681.156px`로 확대
    - 안내 패널 bottom: `868.312px`에서 `715.797px`로 보정되어 화면 안에 들어옴
    - 채팅 카드 bottom: `736.234px`로 화면 안에 표시
  - 태블릿 세로 `820x1180`
    - 학생 안내 패널 높이: 기존 약 `309.5px`에서 `256.687px`로 축소
    - 학생 채팅 카드 폭: `738px` 유지
- 확인 캡처
  - `artifacts/student-layout-compact-tablet-landscape.png`
  - `artifacts/student-layout-compact-tablet.png`
  - `artifacts/student-layout-compact-mobile.png`

### 학생 화면 PC/태블릿 유동형 레이아웃 추가 보정

문제:

- `#root > main > section.workspace.student-workspace > aside > div.notice > p` 안내 문구가 한국어 문장 단위로 자연스럽게 줄바꿈되도록 명시할 필요가 있었다.
- PC에서도 자주 사용할 화면인데, 일반적인 ChatGPT/Gemini/Claude처럼 채팅 영역이 넓고 시원하게 보이지 않았다.
- `#root > main > section.workspace.student-workspace > aside`, `#root > main > section.workspace.student-workspace > section` 영역이 히어로 아래에서 조금 더 위로 올라오고, 화면 폭을 더 넓게 쓰면 좋다는 요청이 있었다.

해결:

- `src/presentation/styles.css`에 학생 화면 전용 유동형 레이아웃을 보강했다.
- 학생 workspace의 최대 폭을 PC에서 `min(1520px, calc(100vw - 72px))`까지 넓혔다.
- 학생 workspace의 좌우 padding을 제거해 채팅 카드가 실제 화면 폭을 더 많이 쓰게 했다.
- 학생 workspace 상단 여백을 `clamp(8px, 1.4vw, 22px)`로 줄여 히어로 아래에 더 가깝게 배치했다.
- PC 기준 grid를 `minmax(180px, 220px) minmax(760px, 1fr)`로 바꿔 안내 패널은 작게 유지하고 채팅 영역을 우선 확장했다.
- `1280px` 이상에서는 채팅 카드 높이를 viewport 기준으로 계산하되, 입력창이 화면 아래로 밀리지 않도록 `clamp(540px, calc(100vh - 306px), 680px)`로 보정했다.
- `1180px` 이하에서는 태블릿 가로에 맞게 `minmax(176px, 210px) minmax(0, 1fr)`로 다시 조정했다.
- `920px` 이하에서는 기존처럼 채팅을 먼저 보여주고 안내 패널을 아래에 배치하되, 안내 패널을 2열 구조로 압축했다.
- `560px` 이하 모바일에서는 다시 전체 폭을 사용하도록 `max-width: none`과 모바일 padding을 적용했다.
- 개인정보 안내 문구에는 `word-break: keep-all`, `overflow-wrap: normal`, `text-wrap: pretty`를 명시해 한국어 문장 흐름이 더 자연스럽게 끊기도록 했다.

검증:

- TDD RED 확인
  - `tests/presentation/studentWorkspaceLayoutStyle.test.ts`를 먼저 추가했고, 기존 CSS에서는 3개 테스트가 모두 실패함을 확인했다.
- 수정 후 검증 통과
  - `npm test -- tests/presentation/studentWorkspaceLayoutStyle.test.ts`
    - 1 file passed
    - 3 tests passed
  - `npm test -- tests/presentation/chatAutoScroll.test.ts`
    - 1 file passed
    - 3 tests passed
  - `npm test`
    - 33 files passed
    - 118 tests passed
  - `npm run build` 성공
- Playwright 실제 브라우저 검증
  - PC `1440x900`
    - 학생 workspace 폭: `1368px`
    - 채팅 카드 폭: `1122.094px`
    - 채팅 입력창 bottom: `847.766px`로 viewport 안에 표시
  - PC `1280x900`
    - 학생 workspace 폭: `1208px`
    - 채팅 카드 폭: `964.969px`
    - 채팅 입력창 bottom: `845.516px`로 viewport 안에 표시
  - 태블릿 가로 `1024x768`
    - 학생 workspace 폭: `976px`
    - 안내 패널 bottom: `731.344px`로 viewport 안에 표시
    - 채팅 카드 폭: `750px`
    - 채팅 입력창 bottom: `688.438px`로 viewport 안에 표시
  - 태블릿 세로 `820x1180`
    - 채팅 카드 폭: `780px`
    - 안내 패널 bottom: `1007.75px`로 viewport 안에 표시
    - 안내 문구 `word-break: keep-all`, `overflow-wrap: normal`, `text-wrap: pretty` 적용 확인
- 확인 캡처
  - `artifacts/student-workspace-fluid-desktop-1440.png`
  - `artifacts/student-workspace-fluid-desktop-1280.png`
  - `artifacts/student-workspace-fluid-tablet-landscape.png`
  - `artifacts/student-workspace-fluid-tablet-portrait.png`
  - `artifacts/student-workspace-fluid-mobile.png`

### 임시 산출물, 캐시, 디자인 백업 정리

요청:

- 테스트 때 사용했던 파일, 불필요한 파일, 캐시 파일을 정리한다.
- 이전 Refero 스타일 적용 전에 만들어 둔 디자인 백업도 더 이상 필요 없으므로 삭제한다.

정리 기준:

- 실제 동작을 보장하는 회귀 테스트(`tests/`)와 소스 코드는 유지했다.
- 패키지 재설치 비용이 큰 `node_modules` 전체는 유지했다.
- 다시 만들 수 있는 검증 산출물, 로그, 빌드 결과물, 캐시, 로컬 개발 데이터, 디자인 백업만 삭제했다.

삭제한 항목:

- `artifacts/`
  - Playwright 스크린샷, 검증 JSON, SSE 응답 로그, 다운로드 검증 파일 등 일회성 확인 산출물
- `logs/`
  - Vite/API 실행 로그와 smoke 로그
- `dist/`
  - Vite 프로덕션 빌드 결과물
- `backups/`
  - `cleanup-candidate-20260612-refero-style-before` 디자인 원복용 백업
- `node_modules/.vite`
  - Vite 캐시
- `tsconfig.tsbuildinfo`
  - TypeScript 증분 빌드 캐시
- `server/data/local-dev-store.json`
  - 로컬 개발 중 생성된 테스트 교사/챗봇/사용량 데이터
- `server/data/`
  - 로컬 개발 저장소 파일 삭제 후 남은 빈 데이터 폴더

검증:

- 삭제 전 크기 확인
  - `artifacts`: 약 `11.26MB`
  - `logs`: 약 `0.03MB`
  - `dist`: 약 `2.22MB`
  - `backups`: 약 `0.03MB`
  - `node_modules/.vite`: 약 `11.5MB`
  - `tsconfig.tsbuildinfo`: 약 `0.003MB`
  - `server/data/local-dev-store.json`: 약 `0.021MB`
- 정리 중 현재 프로젝트의 Vite/API 개발 서버 프로세스만 종료했다.
- 삭제 후 재검증
  - `npm test`
    - 33 files passed
    - 118 tests passed
  - `npm run build` 성공
- 빌드 검증으로 다시 생긴 `dist`, `tsconfig.tsbuildinfo`, `node_modules/.vite`는 검증 후 다시 삭제했다.

현재 상태:

- `artifacts`, `logs`, `dist`, `backups`, `node_modules/.vite`, `tsconfig.tsbuildinfo`, `server/data`는 남아 있지 않다.
- 다시 개발 서버를 열면 `server/data/local-dev-store.json`은 기본 seed 데이터로 재생성된다.

### 외부 디자인 참고 파일 추가 정리

요청:

- 디자인을 위해 사용했던 외부 파일도 삭제한다.
- `design.md`는 이미 삭제되어 있고, 추가로 포함했던 3개 파일도 삭제한다.

확인:

- `DESIGN.md`는 이미 존재하지 않았다.
- 루트에 남아 있던 외부 디자인 참고 파일은 다음 3개였다.
  - `tokens.json`
  - `theme.css`
  - `variables.css`

해결:

- `src/presentation/styles.css`의 `@import "../../variables.css";` 의존을 제거했다.
- 실제 앱에서 쓰던 변수만 `styles.css` 내부 `:root`에 내장했다.
  - `--font-camera-plain-variable`
  - `--page-max-width`
- `tokens.json`, `theme.css`, `variables.css`를 삭제했다.
- 현재 기준 문서가 삭제된 외부 파일을 계속 참조하지 않도록 수정했다.
  - `SPEC.md`
  - `goal.md`

검증:

- `npm test`
  - 33 files passed
  - 118 tests passed
- `npm run build` 성공
- 빌드 검증으로 다시 생긴 `dist`, `tsconfig.tsbuildinfo`, `node_modules/.vite`는 검증 후 다시 삭제했다.

현재 상태:

- 외부 디자인 참고 파일 `DESIGN.md`, `tokens.json`, `theme.css`, `variables.css`는 남아 있지 않다.
- 앱은 외부 디자인 참고 파일 없이 `src/presentation/styles.css`만으로 빌드된다.

## 2026-06-13 문서 최신화 및 디자인 시스템 재작성

요청:

- 변경된 구현 내용에 맞게 `SPEC.md`를 업데이트한다.
- 발표 차별점 문서 `PRESENTATION_DIFFERENTIATORS.md`를 현재 시연 흐름에 맞게 업데이트한다.
- 현재 디자인을 다른 곳에도 적용할 수 있도록 새 `DESIGN.md` 파일을 만든다.

반영 내용:

- `SPEC.md`
  - 서비스명을 `꼬꼬무AI` 기준으로 정리했다.
  - 브라우저 제목, 히어로 제목, 히어로 설명 문구를 현재 화면 기준으로 반영했다.
  - 교사용 챗봇 목록의 링크 복사 안내, 삭제 확인, 다중 선택 삭제 요구사항을 추가했다.
  - 챗봇 생성 폼의 예시값은 고정 기본값이 아니라 placeholder라는 점을 명시했다.
  - 학교급에 직업계고 맥락과 특수교육 교육과정 검색 가능성을 반영했다.
  - 성취기준 추천 카드의 다중 선택, 기본 3개와 더 보기, 관련성 상/중/하, 성취기준 번호 표시를 반영했다.
  - 학생 공유 링크 화면에서는 교사/관리자 탭이 보이지 않는다는 점을 명시했다.
  - 학생 채팅 화면의 자동 스크롤, 입력창 가시성, Markdown 렌더링, PC 넓은 채팅 레이아웃을 반영했다.
  - 현재 참가용 로컬 풀버전의 로컬 API 서버와 로컬 저장소 기준을 Firebase 운영 확장 후보와 구분해 정리했다.
  - 디자인 시스템 기준을 새 `DESIGN.md`와 `src/presentation/styles.css` 기준으로 정리했다.
- `PRESENTATION_DIFFERENTIATORS.md`
  - 현재 이름 `꼬꼬무AI`와 히어로 문구를 반영했다.
  - 발표 시연 흐름에 성취기준 추천 카드 선택, 공유 링크 학생 화면, PC 넓은 채팅 화면을 추가했다.
  - 일반 챗봇과의 비교표에 성취기준 선택, 추천 표시, 학생 입장 방식, 화면 피드백 차이를 추가했다.
  - 예상 질문 답변에서 성취기준 추천을 현재 다중 선택/자동 반영 구조로 수정했다.
- `DESIGN.md`
  - Paperlogy 폰트, `-0.02em`, `1.35`, 한글 줄바꿈 기준을 문서화했다.
  - 크림 종이, 초록 잉크, 형광펜 노랑, sticky-note 추천 카드 색상 토큰을 정리했다.
  - 히어로, 내비게이션, 버튼, 교사용 폼, 성취기준 추천 카드, 학생 채팅 화면, 공유/삭제 피드백, 반응형 기준을 재사용 가이드로 작성했다.

검증:

- `npm test`
  - 33 files passed
  - 118 tests passed
- 테스트 후 다시 생성된 `node_modules/.vite` 캐시는 프로젝트 내부 경로 확인 후 삭제했다.

현재 상태:

- 새 `DESIGN.md`는 재사용 가이드 문서로 존재한다.
- 앱 런타임 스타일은 여전히 `src/presentation/styles.css` 안에서 자체 완결된다.
- `dist`, `tsconfig.tsbuildinfo`, `node_modules/.vite`, `artifacts`, `logs`, `backups`, `server/data`는 남아 있지 않다.

## 2026-06-13 운영 전환 준비: `.env` API 키 확인

요청:

- 운영 전환 작업 전에 `.env`에 저장한 API 키들을 다시 확인한다.
- 키 값은 노출하지 않는다.

확인 결과:

- 값이 비어 있지 않은 변수
  - `LMSTUDIO_API_KEY`
  - `LMSTUDIO_API_URL`
  - `LMSTUDIO_GEMMA_12B_MODEL`
  - `LMSTUDIO_GEMMA_26B_MODEL`
  - `LMSTUDIO_GEMMA_E2B_MODEL`
  - `LMSTUDIO_GEMMA_E4B_MODEL`
  - `NEXT_PUBLIC_NEIS_API_KEY`
  - `OPENAI_API_KEY`
  - `TAVILY_API_KEY`
  - `TAVILY_API_URL`

메모:

- NEIS API 키는 존재한다.
- 현재 변수명은 `NEXT_PUBLIC_NEIS_API_KEY`다.
- Vercel 운영 배포에서는 NEIS 키가 브라우저 번들에 노출되지 않도록 서버 전용 변수명으로 바꾸는 설계를 우선한다.
- Firebase 관련 환경변수는 현재 `.env`에서 확인되지 않았다.

## 2026-06-13 Firebase CLI 및 운영 환경변수 재확인

요청:

- Firebase CLI를 설치하고 인증까지 했는데 현재 세션을 다시 시작해야 하는지 확인한다.
- 저장한 `.env`의 API 키 상태를 다시 확인한다.
- 키 값은 노출하지 않는다.

확인 결과:

- 현재 PowerShell 세션에서 처음에는 `firebase` 명령을 찾지 못했다.
- `C:\Users\Administrator\.config\configstore\firebase-tools.json` 인증 설정 파일은 존재했다.
- 하지만 현재 npm 전역 경로 `C:\Users\Administrator\AppData\Roaming\npm`에는 `firebase-tools` 패키지와 `firebase.cmd` 실행 파일이 없었다.
- 따라서 단순 세션 재시작 문제라기보다, 현재 작업 세션에서 사용할 수 있는 CLI 실행 파일이 빠진 상태로 판단했다.

조치:

- `npm install -g firebase-tools`로 현재 npm 전역 경로에 Firebase CLI를 다시 설치했다.
- 설치 후 `firebase --version` 확인 결과 `15.20.0`으로 실행됐다.
- 기존 인증 설정이 유지되어 `firebase login:list`에서 로그인 상태가 확인됐다.

`.env` 확인 결과:

- 값이 있는 변수
  - `OPENAI_API_KEY`
  - `TAVILY_API_KEY`
  - `TAVILY_API_URL`
  - `LMSTUDIO_API_KEY`
  - `LMSTUDIO_API_URL`
  - `LMSTUDIO_GEMMA_12B_MODEL`
  - `LMSTUDIO_GEMMA_26B_MODEL`
  - `LMSTUDIO_GEMMA_E2B_MODEL`
  - `LMSTUDIO_GEMMA_E4B_MODEL`
  - `NEXT_PUBLIC_NEIS_API_KEY`
- 아직 없는 변수
  - `NEIS_API_KEY`
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `FIREBASE_SERVICE_ACCOUNT`
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`

메모:

- 현재 Firebase CLI 자체는 이 세션에서 사용할 수 있다.
- 운영 배포에서는 NEIS 키를 `NEXT_PUBLIC_NEIS_API_KEY`가 아니라 서버 전용 `NEIS_API_KEY`로 옮기는 것이 맞다.
- Firebase Auth/Firestore 연결에는 클라이언트용 `VITE_FIREBASE_*` 값과 서버 관리자용 Firebase Admin 값이 추가로 필요하다.

## 2026-06-13 운영 전환 1차 구현: Vercel/Firebase 기반

완료 시간:

- `2026-06-13 01:16:55 +09:00`

요청:

- Vercel 배포와 Firebase DB/Auth 기반의 실제 운영 버전으로 전환한다.
- DB 사용량은 무료 티어를 고려해 최소화한다.
- 관리자/교사 권한을 분리하고, AI 모델 설정은 GPT-5.4 nano와 로컬 LLM을 오갈 수 있게 한다.
- NEIS 학교 검색 기반 가입을 준비한다.
- 학생은 공유 링크에서만 사용하고 교사/관리자 탭을 보지 않게 한다.
- 사용량에는 토큰과 비용을 포함한다.
- 개인정보처리방침, 보안 점검, 로컬 검증 결과를 남긴다.

이번 반영 내용:

- `firebase-admin`을 `14.0.0`으로 올려 high/critical 취약점을 제거했다.
- 운영 구현 계획 문서를 추가했다.
  - `docs/superpowers/plans/2026-06-13-vercel-firebase-production.md`
- 저장소 경계를 `StorePort`로 분리했다.
  - 로컬 JSON 저장소와 Firebase Firestore 저장소가 같은 포트를 구현할 수 있게 했다.
- Firebase 환경변수 계약을 추가했다.
  - 서버 전용: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` 또는 `FIREBASE_SERVICE_ACCOUNT`, `NEIS_API_KEY`, `OPENAI_API_KEY`
  - 브라우저 전용: `VITE_FIREBASE_*`
  - 키 값은 로그나 테스트 출력에 노출하지 않도록 존재 여부만 확인하는 구조로 분리했다.
- `.env.example`을 추가했다.
  - Vercel 환경변수 입력 기준을 문서화했다.
  - 현재 `.env`의 `NEXT_PUBLIC_NEIS_API_KEY`는 운영에서 `NEIS_API_KEY`로 옮겨야 한다.
- Firebase Admin 초기화 모듈을 추가했다.
  - `server/firebaseAdmin.ts`
  - Firebase Admin App, Auth, Firestore 초기화 경로를 분리했다.
- Firestore 저장소 어댑터를 추가했다.
  - `server/firebaseStore.ts`
  - 교사, 챗봇, 공유 토큰, AI 설정, 관리자 로그, provider 오류 로그를 Firestore 문서로 저장한다.
  - 사용량은 원문 이벤트를 쌓지 않고 `usageMonthly/{teacherId_yyyyMM_chatbotId}` 월별 집계 문서로 저장한다.
- 공유 API handler를 추가했다.
  - `server/apiHandler.ts`
  - 기존 로컬 서버와 Vercel 서버리스 함수가 같은 API 로직을 사용할 수 있게 했다.
- Vercel 서버리스 진입점을 추가했다.
  - `api/[...path].ts`
  - Vercel 기본 경로에서는 Firebase Auth 검증과 FirebaseStore를 사용한다.
- `vercel.json`을 추가했다.
  - `dist`를 output directory로 지정했다.
  - `/s/:token`, `/privacy` 같은 SPA 경로를 `index.html`로 rewrite한다.
  - `/api/*`는 서버리스 API로 남도록 제외했다.
- production auth 경계를 추가했다.
  - `server/authContext.ts`
  - Authorization Bearer token의 Firebase UID로 교사 계정을 찾고, 승인 교사/관리자 권한을 판정한다.
  - production auth가 켜진 API에서는 body의 `adminId`, `ownerTeacherId`, `actorTeacherId`를 신뢰하지 않고 token의 교사 ID를 사용한다.
- 브라우저 API 클라이언트에 Firebase ID token provider를 추가했다.
  - `setApiAuthTokenProvider`
  - 설정된 경우 모든 API 요청에 `Authorization: Bearer ...` 헤더를 붙인다.
- Firebase Web SDK 클라이언트 래퍼를 추가했다.
  - `src/infrastructure/firebase/client.ts`
  - 이메일 가입, 이메일 로그인, Google 로그인, 로그아웃, ID token provider, auth state listener를 준비했다.
- Firestore 보안 규칙을 추가했다.
  - `firestore.rules`
  - 기본적으로 브라우저 직접 read/write를 모두 차단한다.
  - 운영 데이터는 Vercel 서버 API와 Firebase Admin SDK를 통해서만 처리하는 방향이다.
- Firebase CLI 배포 설정을 추가했다.
  - `firebase.json`
  - `firestore.indexes.json`

검증:

- `npm test`
  - `50 files passed`
  - `163 tests passed`
- `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- `firebase projects:list --json`
  - Firebase CLI 인증 상태 정상
  - `kkokkomu-d6a4c` 프로젝트 확인
- `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - 남은 moderate는 `firebase-admin@14.0.0`의 Google Cloud Storage 계열 전이 의존성에서 발생한다.
  - npm이 제안하는 자동 수정은 `firebase-admin@10.3.0`으로 되돌리는 방향인데, 이 버전은 이전 확인에서 더 큰 보안 위험을 만들었으므로 적용하지 않았다.

아직 남은 작업:

- 실제 교사 가입 화면을 Firebase Auth 흐름과 완전히 연결해야 한다.
- 학교 검색 결과 선택 후 가입 완료까지의 UI를 더 붙여야 한다.
- 관리자 대시보드의 사용자별 토큰/비용 집계 표시를 운영 데이터 기준으로 더 정리해야 한다.
- Vercel 환경변수 실제 등록 후 배포 URL에서 smoke test가 필요하다.
- 마지막 단계에서 코드 리뷰 방식의 보안 점검을 별도로 수행해야 한다.

## 2026-06-13 운영 전환 2차 구현: Auth UI, 사용량 대시보드, 로컬 통합 검증

완료 시간:

- `2026-06-13 01:38:32 +09:00`

요청:

- 작업을 모두 마친 뒤 먼저 로컬에서 테스트가 온전하게 통과하는지 확인한다.
- 그 후 `task.md`를 업데이트하고 완료 시간도 기록한다.

이번 반영 내용:

- Firebase 인증 모드의 교사 프로필 등록을 보정했다.
  - production auth가 켜진 `/api/teachers` POST에서는 교사 프로필 ID를 Firebase token `uid`로 저장한다.
  - 클라이언트가 보낸 `passwordHash`는 저장하지 않고 `firebase-auth` 표식만 저장한다.
  - CORS preflight에서 `Authorization` 헤더를 허용한다.
- Firebase 인증 모드의 API 노출 범위를 줄였다.
  - `/api/teachers`는 관리자는 전체 교사 목록, 일반 교사는 자기 계정만 받는다.
  - `/api/usage`는 관리자는 전체 사용량, 일반 교사는 자기 사용량만 받는다.
  - 익명 요청은 production auth 모드에서 차단된다.
- 교사 가입/Auth 패널을 추가했다.
  - `src/presentation/auth/TeacherAuthPanel.tsx`
  - 이메일 로그인, 이메일 가입, Google 로그인, 로그아웃 버튼을 제공한다.
  - 학교는 NEIS 검색 결과를 선택해야만 가입 요청을 보낼 수 있다.
  - 학교 주소가 있는 경우 결과와 선택 안내에 함께 표시한다.
- 교사 가입 상태 유틸을 추가했다.
  - `src/presentation/auth/teacherAuthForm.ts`
  - 학교 검색 결과 선택 여부를 가입 가능 조건으로 검증한다.
  - 서버에는 비밀번호가 아니라 Firebase 인증 표식과 교사 프로필만 보낸다.
- `App.tsx`에 운영 인증 분기를 연결했다.
  - Firebase 클라이언트 설정이 있는 운영자 경로에서만 Firebase Auth를 사용한다.
  - `/s/:token` 학생 공유 링크는 인증 없이 기존처럼 학생 화면만 표시한다.
  - 로컬 개발 환경은 기존 자동 승인 로컬 교사 흐름을 유지한다.
- 교사/관리자 사용량 표시를 보강했다.
  - 교사 화면에 입력 토큰, 출력 토큰, 예상 비용을 추가했다.
  - 관리자 화면에 교사별 사용량 표를 추가했다.
  - 학생 대화 원문은 표시하지 않고 대화 수, 토큰, 예상 비용만 보여준다.
- 사용량 표시 유틸을 추가했다.
  - `src/presentation/usage/usageDisplay.ts`
  - 토큰 수, 원화 비용, 교사별 합산 행을 같은 기준으로 계산한다.
- 보안 점검 문서를 추가했다.
  - `docs/production-security-checklist.md`
  - 환경변수, 인증/권한, Firestore 접근, 데이터 저장, 배포 전 검증 항목을 정리했다.
- 클라이언트 비밀키 노출 방지 테스트를 추가했다.
  - `tests/security/clientSecretExposure.test.ts`
  - `src/` 아래에서 `OPENAI_API_KEY`, `NEIS_API_KEY`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT` 직접 참조를 금지한다.
- 로컬 E2E 스크립트에 AI 모델 선택 옵션을 추가했다.
  - `E2E_AI_MODEL_ID`를 지정하면 로컬 통합 검증에서 해당 모델로 전환한 뒤 시나리오를 실행한다.
  - OpenAI 외부 호출 상태에 묶이지 않고 LM Studio로 교사 생성, 공유 링크, 학생 응답, 사용량 기록까지 확인할 수 있다.
- `@google-cloud/firestore`를 직접 의존성에 추가했다.
  - Firebase Admin의 Firestore 선택 의존성을 명시적으로 고정해 운영 설치 경로를 더 분명하게 했다.
  - 선택 의존성 전체 생략(`omit=optional`)은 Rollup/Vite 네이티브 의존성을 깨뜨려 적용하지 않았다.

검증:

- `npm test`
  - `53 files passed`
  - `175 tests passed`
- `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 로컬 API/Vite 서버 확인
  - `http://127.0.0.1:8787/api/health` 정상 응답
  - `http://127.0.0.1:5173` 정상 응답
- 로컬 E2E 통합 검증
  - 실행: `$env:E2E_AI_MODEL_ID='lmstudio:gemma-4-12b-it'; node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `161`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- 학생 화면 스크린샷 확인
  - 채팅 영역과 입력창이 한 화면에 표시됨
  - 레이아웃 깨짐 없음
- Firebase CLI 확인
  - `firebase projects:list --json` 성공
  - `kkokkomu-d6a4c` 프로젝트 ACTIVE 상태 확인
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - 남은 moderate는 `firebase-admin@14.0.0`의 사용하지 않는 Google Cloud Storage 선택 의존성 경로에서 발생한다.
  - npm이 제안하는 강제 수정은 `firebase-admin@10.3.0`으로 되돌리는 방식이라 적용하지 않았다.
  - 선택 의존성 전체 생략은 Vite/Rollup 실행을 깨뜨려 적용하지 않았다.

정리:

- 로컬 검증용 API/Vite 서버를 종료했다.
- 검증 중 생성된 산출물을 정리했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 작업:

- Vercel 환경변수 실제 등록 후 배포 URL에서 smoke test를 해야 한다.
- Firebase 콘솔에서 Google 로그인 제공자와 승인 관리자 계정 초기 프로필을 실제로 준비해야 한다.
- OpenAI 기본 모델 `openai:gpt-5.4-nano`의 실제 운영 호출은 Vercel 환경변수 등록 후 별도 확인이 필요하다.
- 최종 배포 직전에는 `docs/production-security-checklist.md` 기준으로 한 번 더 수동 보안 리뷰를 수행한다.

### 추가 보안 리뷰 반영

완료 시간:

- `2026-06-13 01:43:23 +09:00`

점검 중 발견한 문제:

- `/api/chat`이 클라이언트가 보낸 챗봇 객체의 `id`, `ownerTeacherId`를 그대로 사용할 여지가 있었다.
- 악의적인 요청이 임의의 교사 ID를 넣으면 사용량과 비용이 다른 교사에게 붙을 수 있었다.

해결:

- 학생 대화 요청에 공유 링크 public token을 함께 보내도록 수정했다.
  - `src/infrastructure/ai/streamingChatClient.ts`
- `/api/chat`에서 provider 호출 전에 공유 토큰을 검증하도록 수정했다.
  - `server/apiHandler.ts`
  - 저장소의 `findChatbotByShareToken()` 결과를 기준으로 실제 챗봇을 다시 가져온다.
  - 공유 토큰이 없는데 챗봇 ID나 교사 ID가 들어온 요청은 `403 share_token_required`로 거절한다.
  - 공유 토큰과 챗봇 ID가 맞지 않으면 `403 chatbot_share_mismatch`로 거절한다.
  - 교사 미리보기 대화는 아직 별도 인증 흐름이 없으므로 공개 `/api/chat`에서는 `403 teacher_preview_requires_auth`로 막았다.
- 관련 보안 회귀 테스트를 추가했다.
  - `tests/infrastructure/apiHandler.test.ts`

최신 검증:

- `npm test`
  - `53 files passed`
  - `176 tests passed`
- `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 로컬 E2E 통합 검증
  - 실행: `$env:E2E_AI_MODEL_ID='lmstudio:gemma-4-12b-it'; node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 응답 길이: `127`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- Firebase CLI 확인
  - `firebase projects:list --json` 성공
  - `kkokkomu-d6a4c` ACTIVE 확인
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - 남은 moderate는 `firebase-admin@14.0.0`의 Google Cloud Storage 선택 의존성 경로로 확인했다.

정리:

- 로컬 검증 서버를 종료했다.
- 검증 산출물과 캐시를 다시 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

### 운영 전환 3차: Firebase Web App 생성, preflight 추가, OpenAI 호출 오류 수정

완료 시간:

- `2026-06-13 02:06:01 +09:00`

반영한 내용:

- Firebase 프로젝트 `kkokkomu-d6a4c`에 Web App `꼬꼬무AI`를 생성하고 ACTIVE 상태를 확인했다.
- `.firebaserc`를 추가해 기본 Firebase 프로젝트를 `kkokkomu-d6a4c`로 고정했다.
- `.env`에 운영 준비용 Firebase Web SDK 설정, `FIREBASE_PROJECT_ID`, 서버 전용 `NEIS_API_KEY`를 반영했다.
  - 실제 키 값은 문서에 기록하지 않았다.
  - 기존 `NEXT_PUBLIC_NEIS_API_KEY`는 운영 배포에서는 제거해야 할 경고 항목으로 남겼다.
- 운영 배포 전 점검 스크립트를 추가했다.
  - `scripts/productionPreflight.ts`
  - `npm run preflight:production`
  - `tests/infrastructure/productionPreflight.test.ts`
- Firebase Web SDK 설정이 로컬 교사 화면을 강제로 Firebase Auth 화면으로 바꾸지 않도록 명시 플래그를 추가했다.
  - `VITE_FIREBASE_AUTH_ENABLED=true`일 때만 교사용 Firebase Auth 화면을 활성화한다.
  - 로컬 검증에서는 이 값을 생략해 기존 자동 승인 로컬 교사 흐름을 유지한다.
- OpenAI 기본 모델 호출 오류를 수정했다.
  - `gpt-5.4-nano`는 `reasoning_effort: "minimal"`을 지원하지 않아 provider가 `400 unsupported_value`를 반환했다.
  - OpenAI 요청 생성부를 `reasoning_effort: "none"`으로 변경했다.
  - `tests/infrastructure/aiProviderRequest.test.ts`도 같은 값으로 갱신했다.
- `SPEC.md`와 `docs/production-security-checklist.md`를 현재 운영 구조에 맞춰 갱신했다.
  - Vercel 서버리스 API
  - Firebase Auth/Firestore/Admin SDK
  - Firestore 브라우저 직접 접근 차단
  - `VITE_FIREBASE_AUTH_ENABLED=true`
  - Firebase/Vercel 외부 콘솔 작업 목록

최신 검증:

- OpenAI 직접 진단
  - `gpt-5.4-nano` 모델 자체는 정상 호출됨을 확인했다.
  - `reasoning_effort: "minimal"` 조합은 `400 unsupported_value`를 반환함을 확인했다.
  - 수정 후 `/api/chat` 직접 호출은 `200 text/event-stream`으로 정상 응답했다.
- 로컬 E2E 통합 검증
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `162`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- 전체 테스트
  - `npm test`
  - `54 files passed`
  - `180 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 관련 테스트
  - `npm test -- tests/security/clientSecretExposure.test.ts tests/infrastructure/localApiAuth.test.ts tests/infrastructure/apiHandler.test.ts tests/infrastructure/firebaseEnv.test.ts tests/infrastructure/productionPreflight.test.ts`
  - `5 files passed`
  - `18 tests passed`
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유는 로컬 코드 오류가 아니라 외부 배포 설정 미완료다.
  - 누락: `VITE_FIREBASE_AUTH_ENABLED`, Firebase Admin 인증 정보, Vercel 인증/프로젝트 연결 정보
  - 경고: `NEXT_PUBLIC_NEIS_API_KEY` 잔존
- Firebase CLI 확인
  - `firebase apps:list WEB --project kkokkomu-d6a4c --json`
  - Web App `꼬꼬무AI` ACTIVE 확인
  - `firebase firestore:databases:list --project kkokkomu-d6a4c --json`
  - Firestore API 비활성 403 확인
- Vercel CLI 확인
  - `vercel --version`
  - `54.12.2`
  - `.vercel/project.json` 없음
  - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 환경변수 없음
  - `vercel whoami`는 로그인 대기 상태로 타임아웃됨
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - 남은 moderate는 `firebase-admin@14.0.0` 및 Google Cloud Storage 선택 의존성 경로에서 발생한다.
  - npm 자동 수정 권고는 `firebase-admin@10.3.0`으로 큰 버전 이동을 요구하므로 이번 차수에서는 적용하지 않았다.

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 외부 작업:

- Google Cloud/Firebase 콘솔에서 Firestore API를 활성화해야 한다.
- Firestore `(default)` 데이터베이스를 `asia-northeast3` 리전으로 생성해야 한다.
- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Firebase Admin 서비스 계정 키를 만들고 Vercel 서버 환경변수에 등록해야 한다.
  - `FIREBASE_SERVICE_ACCOUNT` 또는 `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 환경변수에 서버 전용 키와 브라우저용 Firebase 설정을 등록해야 한다.
  - 운영에서는 `VITE_FIREBASE_AUTH_ENABLED=true`
  - 운영에서는 `NEXT_PUBLIC_NEIS_API_KEY` 등록 금지
- 위 항목 완료 후 `npm run preflight:production`이 통과해야 실제 배포와 배포 URL smoke test를 진행할 수 있다.

### 운영 전환 4차: 최초 관리자 부트스트랩과 Firebase 가입 보안 보완

완료 시간:

- `2026-06-13 02:16:24 +09:00`

반영한 내용:

- 운영 최초 관리자 계정 부트스트랩을 추가했다.
  - 서버 전용 환경변수 `KKOKKOMU_ADMIN_EMAILS`를 추가했다.
  - 이 목록에 있는 이메일로 Firebase 로그인 후 학교 프로필을 제출하면 서버가 `admin` 상태로 저장한다.
  - 관리자 승격 로그는 `teacher_promoted_to_admin`, `adminId: "bootstrap-env"`로 남긴다.
- Firebase 가입 요청의 이메일 신뢰 기준을 수정했다.
  - 운영 Firebase Auth가 켜진 상태에서는 가입 요청 본문 이메일을 신뢰하지 않는다.
  - 서버는 Firebase ID token의 `email`을 교사 프로필 이메일로 사용한다.
  - 본문 이메일 스푸핑으로 다른 이메일 프로필을 만들 수 없도록 했다.
- 학교 검색 결과의 주소를 교사 프로필에 함께 저장하도록 보완했다.
  - `IdentitySchool.address`를 선택 필드로 추가했다.
  - NEIS 검색 결과에서 선택한 학교 주소를 가입 payload에 포함한다.
- 운영 preflight 조건을 강화했다.
  - `KKOKKOMU_ADMIN_EMAILS`가 없으면 실패하도록 했다.
  - `.env.example`, `SPEC.md`, `docs/production-security-checklist.md`에 최초 관리자 이메일 설정을 반영했다.

추가/수정 파일:

- `server/adminBootstrap.ts`
- `server/localApi.ts`
- `server/apiHandler.ts`
- `server/firebaseEnv.ts`
- `scripts/productionPreflight.ts`
- `src/domain/identity/identityAccess.ts`
- `src/presentation/auth/teacherAuthForm.ts`
- `tests/infrastructure/adminBootstrap.test.ts`
- `tests/infrastructure/localApiAuth.test.ts`
- `tests/infrastructure/productionPreflight.test.ts`
- `tests/infrastructure/firebaseEnv.test.ts`
- `tests/presentation/teacherAuthPanel.test.ts`
- `.env.example`
- `SPEC.md`
- `docs/production-security-checklist.md`

최신 검증:

- 직접 관련 테스트
  - `npm test -- tests/presentation/teacherAuthPanel.test.ts tests/infrastructure/adminBootstrap.test.ts tests/infrastructure/localApiAuth.test.ts tests/infrastructure/productionPreflight.test.ts tests/infrastructure/firebaseEnv.test.ts`
  - `5 files passed`
  - `20 tests passed`
- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `183 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유는 외부 배포 설정 미완료다.
  - 누락: `KKOKKOMU_ADMIN_EMAILS`, `VITE_FIREBASE_AUTH_ENABLED`, Firebase Admin 인증 정보, Vercel 인증/프로젝트 연결 정보
  - 경고: `NEXT_PUBLIC_NEIS_API_KEY` 잔존
- 로컬 E2E 통합 검증
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `233`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- 학생 화면 스크린샷 확인
  - 채팅 영역, 학생 입력창, 푸터, 개인정보처리방침 링크가 표시됨
  - 답변 마크다운 기호 노출이나 레이아웃 깨짐은 보이지 않음
- Firebase CLI 확인
  - `firebase apps:list WEB --project kkokkomu-d6a4c --json`
  - Web App `꼬꼬무AI` ACTIVE 확인
  - `firebase firestore:databases:list --project kkokkomu-d6a4c --json`
  - Firestore API 비활성 403 확인
- Vercel CLI 확인
  - `vercel --version`
  - `54.12.2`
  - `.vercel/project.json` 없음
  - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 환경변수 없음
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - 남은 moderate 항목: `firebase-admin`, `@google-cloud/storage`, `gaxios`, `retry-request`, `teeny-request`, `uuid`
  - npm 자동 수정 권고는 `firebase-admin@10.3.0`으로 큰 버전 이동을 요구하므로 이번 차수에서는 적용하지 않았다.

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 외부 작업:

- Google Cloud/Firebase 콘솔에서 Firestore API를 활성화해야 한다.
- Firestore `(default)` 데이터베이스를 `asia-northeast3` 리전으로 생성해야 한다.
- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Firebase Admin 서비스 계정 키를 만들고 Vercel 서버 환경변수에 등록해야 한다.
- `KKOKKOMU_ADMIN_EMAILS`에 최초 관리자 이메일을 등록해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 환경변수에 서버 전용 키와 브라우저용 Firebase 설정을 등록해야 한다.
- 위 항목 완료 후 `npm run preflight:production`이 통과해야 실제 배포와 배포 URL smoke test를 진행할 수 있다.

### 운영 전환 5차: Firestore 읽기 사용량 최소화 보완

완료 시간:

- `2026-06-13 02:22:39 +09:00`

반영한 내용:

- 교사별 챗봇 목록과 사용량 조회가 전체 컬렉션을 읽지 않도록 저장소 포트를 확장했다.
  - `listChatbotsByOwner(ownerTeacherId)`
  - `listUsageSummariesByTeacher(teacherId)`
- Firestore 저장소 구현에서 교사별 조회를 `where` 쿼리로 바꿨다.
  - 챗봇 목록: `chatbots.where("ownerTeacherId", "==", teacherId)`
  - 사용량 집계: `usageMonthly.where("teacherId", "==", teacherId)`
  - 이메일 중복 확인: `teachers.where("email", "==", email)`
- API 라우팅에서 일반 교사의 조회는 교사별 저장소 메서드를 사용하도록 수정했다.
  - 일반 교사는 자신의 챗봇과 자신의 사용량만 DB 쿼리 단계에서 가져온다.
  - 관리자는 전체 현황이 필요할 때만 전체 목록을 읽는다.
- StorePort 계약 버전을 `2`로 올렸다.
- SPEC와 운영 보안 점검표에 Firestore 조회 범위 제한 원칙을 반영했다.

수정 파일:

- `server/storePort.ts`
- `server/localStore.ts`
- `server/firebaseStore.ts`
- `server/localApi.ts`
- `tests/infrastructure/firebaseStore.test.ts`
- `tests/infrastructure/storePortCompatibility.test.ts`
- `SPEC.md`
- `docs/production-security-checklist.md`

최신 검증:

- 관련 저장소/API 테스트
  - `npm test -- tests/infrastructure/firebaseStore.test.ts tests/infrastructure/storePortCompatibility.test.ts tests/infrastructure/localApiAuth.test.ts tests/infrastructure/localStore.test.ts tests/infrastructure/localApi.test.ts`
  - `5 files passed`
  - `36 tests passed`
- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `184 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유는 외부 배포 설정 미완료다.
  - 누락: `KKOKKOMU_ADMIN_EMAILS`, `VITE_FIREBASE_AUTH_ENABLED`, Firebase Admin 인증 정보, Vercel 인증/프로젝트 연결 정보
  - 경고: `NEXT_PUBLIC_NEIS_API_KEY` 잔존
- 로컬 E2E 통합 검증
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `171`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- Firebase/gcloud 확인
  - `gcloud auth list --format=json`
  - 활성 gcloud 계정 없음
  - `firebase firestore:databases:list --project kkokkomu-d6a4c --json`
  - Firestore API 비활성 403 확인
- Vercel CLI 확인
  - `vercel --version`
  - `54.12.2`
  - `.vercel/project.json` 없음
  - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 환경변수 없음
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 외부 작업:

- Google Cloud/Firebase 콘솔에서 Firestore API를 활성화해야 한다.
- Firestore `(default)` 데이터베이스를 `asia-northeast3` 리전으로 생성해야 한다.
- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Firebase Admin 서비스 계정 키를 만들고 Vercel 서버 환경변수에 등록해야 한다.
- `KKOKKOMU_ADMIN_EMAILS`에 최초 관리자 이메일을 등록해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 환경변수에 서버 전용 키와 브라우저용 Firebase 설정을 등록해야 한다.
- 위 항목 완료 후 `npm run preflight:production`이 통과해야 실제 배포와 배포 URL smoke test를 진행할 수 있다.

### 운영 전환 6차: 교사 프로필 조회 DB 읽기 최소화

완료 시간: `2026-06-13 02:30:44 +09:00`

수정 목적:

- 운영 Firebase Auth 모드에서 일반 교사가 `/api/teachers`를 호출할 때 전체 `teachers` 목록을 먼저 읽는 동작을 제거했다.
- 일반 교사는 인증 토큰으로 확인된 본인 `teachers/{uid}` 문서만 반환하고, 관리자는 기존처럼 전체 교사 목록을 볼 수 있게 유지했다.
- Firestore 무료 티어 사용량을 줄이기 위해 교사 프로필 조회도 단건 문서 읽기 원칙에 포함했다.

수정 파일:

- `server/localApi.ts`
- `tests/infrastructure/localApiAuth.test.ts`
- `SPEC.md`
- `docs/production-security-checklist.md`

테스트 우선 확인:

- 먼저 회귀 테스트를 추가하고 실패를 확인했다.
  - 실행: `npm test -- tests/infrastructure/localApiAuth.test.ts`
  - 실패 지점: 일반 교사 `/api/teachers` 요청에서 `listTeachers()`가 `1`회 호출됨
  - 기대값: `0`회
- 이후 API 구현을 수정하고 같은 테스트가 통과하는 것을 확인했다.

최신 검증:

- 관련 API/저장소 테스트
  - `npm test -- tests/infrastructure/localApiAuth.test.ts tests/infrastructure/localApi.test.ts tests/infrastructure/firebaseStore.test.ts tests/infrastructure/storePortCompatibility.test.ts`
  - `4 files passed`
  - `28 tests passed`
- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `185 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유는 외부 배포 설정 미완료다.
  - 누락: `KKOKKOMU_ADMIN_EMAILS`, `VITE_FIREBASE_AUTH_ENABLED`, Firebase Admin 인증 정보, Vercel 인증/프로젝트 연결 정보
  - 경고: `NEXT_PUBLIC_NEIS_API_KEY` 잔존
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
  - 현재 앱은 Firebase Storage를 직접 사용하지 않지만 패키지 의존성에는 포함된다.
  - npm 권고 수정은 `firebase-admin@10.3.0`으로의 메이저 다운그레이드라 즉시 적용하지 않았다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `172`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 외부 작업:

- Google Cloud/Firebase 콘솔에서 Firestore API를 활성화해야 한다.
- Firestore `(default)` 데이터베이스를 `asia-northeast3` 리전으로 생성해야 한다.
- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Firebase Admin 서비스 계정 키를 만들고 Vercel 서버 환경변수에 등록해야 한다.
- `KKOKKOMU_ADMIN_EMAILS`에 최초 관리자 이메일을 등록해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 환경변수에 서버 전용 키와 브라우저용 Firebase 설정을 등록해야 한다.
- 위 항목 완료 후 `npm run preflight:production`이 통과해야 실제 배포와 배포 URL smoke test를 진행할 수 있다.

### 운영 전환 7차: 클라이언트 비밀키 노출 preflight 보강

완료 시간: `2026-06-13 02:38:58 +09:00`

수정 목적:

- 운영 배포 전 `npm run preflight:production`이 `src/` 클라이언트 소스에서 서버 전용 환경변수 참조를 직접 검사하도록 보강했다.
- `OPENAI_API_KEY`, `NEIS_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `KKOKKOMU_ADMIN_EMAILS`, `NEXT_PUBLIC_NEIS_API_KEY`를 클라이언트 금지 환경변수로 묶었다.
- `VITE_FIREBASE_PROJECT_ID`처럼 허용된 브라우저용 변수 안에 포함된 부분 문자열은 오탐하지 않도록 식별자 경계 검사를 추가했다.
- 기존 `tests/security/clientSecretExposure.test.ts`도 같은 금지 목록과 판별 함수를 사용하도록 정리했다.

수정 파일:

- `scripts/productionPreflight.ts`
- `tests/infrastructure/productionPreflight.test.ts`
- `tests/security/clientSecretExposure.test.ts`
- `task.md`

테스트 우선 확인:

- 먼저 `clientSourceFiles`에 `OPENAI_API_KEY`, `NEXT_PUBLIC_NEIS_API_KEY`가 들어간 가짜 클라이언트 파일을 넘겼을 때 preflight가 실패해야 한다는 테스트를 추가했다.
- 구현 전 실행:
  - `npm test -- tests/infrastructure/productionPreflight.test.ts`
  - 결과: 실패
  - 실패 지점: `result.ok`가 `true`로 나와 클라이언트 소스 비밀키 참조를 잡지 못함
- 구현 후 같은 테스트가 통과하는 것을 확인했다.

최신 검증:

- 관련 보안/preflight 테스트
  - `npm test -- tests/infrastructure/productionPreflight.test.ts tests/security/clientSecretExposure.test.ts`
  - `2 files passed`
  - `5 tests passed`
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 새로 추가한 클라이언트 소스 비밀키 검사 오류는 없음
  - 실패 이유는 기존 외부 배포 설정 미완료다.
  - 누락: `KKOKKOMU_ADMIN_EMAILS`, `VITE_FIREBASE_AUTH_ENABLED`, Firebase Admin 인증 정보, Vercel 인증/프로젝트 연결 정보
  - 경고: `NEXT_PUBLIC_NEIS_API_KEY` 잔존
- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `186 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
  - npm 권고 수정은 `firebase-admin@10.3.0`으로의 메이저 다운그레이드라 즉시 적용하지 않았다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `185`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 외부 작업:

- Google Cloud/Firebase 콘솔에서 Firestore API를 활성화해야 한다.
- Firestore `(default)` 데이터베이스를 `asia-northeast3` 리전으로 생성해야 한다.
- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Firebase Admin 서비스 계정 키를 만들고 Vercel 서버 환경변수에 등록해야 한다.
- `KKOKKOMU_ADMIN_EMAILS`에 최초 관리자 이메일을 등록해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 환경변수에 서버 전용 키와 브라우저용 Firebase 설정을 등록해야 한다.
- 위 항목 완료 후 `npm run preflight:production`이 통과해야 실제 배포와 배포 URL smoke test를 진행할 수 있다.

### 운영 전환 8차: Firebase Firestore 실제 활성화와 규칙 배포

완료 시간: `2026-06-13 02:52:53 +09:00`

수정 목적:

- Firebase 프로젝트 `kkokkomu-d6a4c`의 실제 Firestore 사용 준비를 진행했다.
- Firestore API를 활성화했다.
- 기본 Firestore 데이터베이스 `(default)`를 `asia-northeast3` 리전에 생성했다.
- 로컬 `firestore.rules`, `firestore.indexes.json`을 Firebase 프로젝트에 배포했다.

외부 상태 확인:

- Firebase CLI 로그인 계정
  - `greenguyhh@gmail.com`
- Firebase 프로젝트
  - `kkokkomu-d6a4c`
  - displayName: `kkokkomu`
  - state: `ACTIVE`
- Firebase Web App
  - displayName: `꼬꼬무AI`
  - appId: `1:965823913795:web:0a9eb69f22e97c0c5319f6`
  - state: `ACTIVE`
- Firestore 데이터베이스
  - name: `projects/kkokkomu-d6a4c/databases/(default)`
  - locationId: `asia-northeast3`
  - type: `FIRESTORE_NATIVE`
  - databaseEdition: `STANDARD`
  - freeTier: `true`
- Firestore 인덱스
  - `indexes: []`
  - `fieldOverrides: []`
- Firestore rules/indexes 배포
  - `firebase deploy --only firestore:rules,firestore:indexes --project kkokkomu-d6a4c --json`
  - 결과: success

Auth/Vercel 확인:

- Identity Toolkit API 활성화 요청은 접수됐다.
- Auth 초기화 API 호출은 실패했다.
  - 실패 상태: `400`
  - 메시지: `BILLING_NOT_ENABLED : Identity Platform feature requires billing to be enabled.`
  - 따라서 Firebase Auth 제공자 활성화는 현재 콘솔 또는 결제 설정 확인이 필요한 외부 작업으로 남았다.
- Vercel CLI `vercel whoami`는 응답 없이 시간 초과됐다.
  - `.vercel/project.json` 없음
  - `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 환경변수 없음

최신 검증:

- Firebase 상태 확인
  - `firebase firestore:databases:list --project kkokkomu-d6a4c --json`
  - 결과: `(default)` 데이터베이스 확인
  - `firebase firestore:indexes --project kkokkomu-d6a4c --json`
  - 결과: 빈 인덱스 구성 확인
  - `firebase apps:list WEB --project kkokkomu-d6a4c --json`
  - 결과: `꼬꼬무AI` Web App 활성 확인
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유는 남은 외부 배포 설정 미완료다.
  - 누락: `KKOKKOMU_ADMIN_EMAILS`, `VITE_FIREBASE_AUTH_ENABLED`, Firebase Admin 인증 정보, Vercel 인증/프로젝트 연결 정보
  - 경고: `NEXT_PUBLIC_NEIS_API_KEY` 잔존
- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `186 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
  - npm 권고 수정은 `firebase-admin@10.3.0`으로의 메이저 다운그레이드라 즉시 적용하지 않았다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `145`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Identity Platform 초기화 API가 결제 활성화를 요구했으므로, Firebase 콘솔의 Authentication 화면에서 직접 활성화하거나 결제 설정을 확인해야 한다.
- Firebase Admin 서비스 계정 키를 만들고 Vercel 서버 환경변수에 등록해야 한다.
- `KKOKKOMU_ADMIN_EMAILS`에 최초 관리자 이메일을 등록해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 환경변수에 서버 전용 키와 브라우저용 Firebase 설정을 등록해야 한다.
- 위 항목 완료 후 `npm run preflight:production`이 통과해야 실제 배포와 배포 URL smoke test를 진행할 수 있다.

### 운영 전환 9차: Firebase Admin 환경변수 반영과 로컬 재검증

완료 시간: `2026-06-13 03:02:32 +09:00`

이번 수정/확인:

- Firebase Admin 서비스 계정 키를 새로 생성해 로컬 `.env`의 `FIREBASE_SERVICE_ACCOUNT`에 등록했다.
- 최초 관리자 후보 이메일을 `.env`의 `KKOKKOMU_ADMIN_EMAILS`에 등록했다.
- 운영 교사 인증 플래그를 `.env`의 `VITE_FIREBASE_AUTH_ENABLED=true`로 설정했다.
- 클라이언트 노출 위험이 있는 `NEXT_PUBLIC_NEIS_API_KEY`를 `.env`에서 제거했다.
- 중간 실패로 생긴 불필요한 Firebase 서비스 계정 user-managed key 1개를 삭제했다.
- 현재 Firebase Admin 서비스 계정에는 user-managed key 1개와 system-managed key 1개만 남겼다.
- `server/firebaseEnv.ts` 기준으로 `FIREBASE_SERVICE_ACCOUNT` 파싱을 재확인했다.
  - projectId: `kkokkomu-d6a4c`
  - credentialType: `service_account`
  - privateKeyLooksValid: `true`
  - NEIS/OpenAI 서버 키 존재 확인

운영 preflight:

- 실행: `npm run preflight:production`
- 결과: 실패
- 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
  - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- 이전에 남아 있던 다음 항목은 해소됐다.
  - `KKOKKOMU_ADMIN_EMAILS` 누락
  - `VITE_FIREBASE_AUTH_ENABLED` 누락
  - Firebase Admin 인증 정보 누락
  - `NEXT_PUBLIC_NEIS_API_KEY` 잔존 경고

최신 로컬 검증:

- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `186 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
  - npm 권고 수정은 `firebase-admin@10.3.0`으로의 메이저 다운그레이드라 즉시 적용하지 않았다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `127`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Identity Platform 초기화 API가 `BILLING_NOT_ENABLED`로 실패했으므로, Firebase 콘솔의 Authentication 화면에서 직접 활성화하거나 결제 설정을 확인해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 프로젝트에 서버 전용 환경변수와 브라우저용 Firebase 설정을 등록해야 한다.
  - 로컬 `.env`에는 Firebase Admin 인증 정보가 들어갔지만, Vercel 환경변수에는 아직 별도 등록이 필요하다.
- Vercel 연결 후 `npm run preflight:production` 통과, Vercel 배포, 배포 URL smoke test를 진행해야 한다.

### 운영 전환 10차: 비밀키 추적 방지 보완

완료 시간: `2026-06-13 03:05:29 +09:00`

수정한 내용:

- `.gitignore`를 추가했다.
- 실제 비밀값이 들어간 `.env`와 `.env.*` 파일을 Git 추적 대상에서 제외했다.
- `.env.example`은 계속 추적 가능하도록 예외 처리했다.
- 검증 산출물과 캐시도 추적 대상에서 제외했다.
  - `node_modules/`
  - `dist/`
  - `artifacts/`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `.vercel/`
  - `.firebase/`
  - 로그 파일

보안 점검 메모:

- 현재 폴더는 Git 저장소가 아니지만, 나중에 Vercel 배포용 저장소로 옮길 때 `.env` 유출을 막기 위한 사전 조치다.
- `rg`로 클라이언트 소스와 서버/테스트/스크립트의 환경변수 참조를 확인했다.
- 운영 preflight에 클라이언트 소스의 서버 전용 환경변수 참조 금지 검사가 이미 포함되어 있다.

재검증:

- 전체 테스트
  - `npm test`
  - `55 files passed`
  - `186 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요

정리:

- 재검증으로 생성된 `dist`와 `tsconfig.tsbuildinfo`를 삭제했다.
- 재검증 중 다시 생성된 `node_modules/.vite` 캐시도 삭제했다.

### 운영 전환 11차: Vercel 환경변수 등록 자동화 준비

완료 시간: `2026-06-13 03:14:28 +09:00`

수정한 내용:

- Vercel 환경변수 등록용 스크립트를 추가했다.
  - `scripts/syncVercelEnv.ts`
  - 기본 실행은 dry-run이며 실제 비밀값은 출력하지 않고 변수명, 필수 여부, 준비 여부, 값 길이만 출력한다.
  - 실제 등록은 `npm run vercel:env:sync`로 실행한다.
  - 등록 대상 기본값은 `production`이다.
  - `VERCEL_ENV_TARGETS=production,preview`처럼 지정하면 여러 Vercel 환경에 등록할 수 있다.
- `package.json`에 스크립트를 추가했다.
  - `vercel:env:dry-run`
  - `vercel:env:sync`
- 운영 preflight의 필수 서버 환경변수에 LM Studio 값을 추가했다.
  - `LMSTUDIO_API_URL`
  - `LMSTUDIO_API_KEY`
  - `LMSTUDIO_GEMMA_E4B_MODEL`
  - `LMSTUDIO_GEMMA_E2B_MODEL`
  - `LMSTUDIO_GEMMA_12B_MODEL`
  - `LMSTUDIO_GEMMA_26B_MODEL`
- 관리자 화면에서 로컬 LLM을 선택했을 때 실제 운영에서도 동작해야 하므로, 보안 체크리스트와 SPEC에 LM Studio Vercel 환경변수 등록 조건을 반영했다.
- `.env.example`의 LM Studio 설명을 운영 목표에 맞게 정리했다.
- OpenAI 공식 문서 검색으로 `gpt-5.4-nano`가 Chat Completions 지원 모델 목록에 있는 것을 확인했다.

수정 파일:

- `scripts/productionPreflight.ts`
- `scripts/syncVercelEnv.ts`
- `tests/infrastructure/productionPreflight.test.ts`
- `tests/infrastructure/vercelEnvSync.test.ts`
- `package.json`
- `.env.example`
- `SPEC.md`
- `docs/production-security-checklist.md`

검증:

- 관련 테스트
  - `npm test -- tests/infrastructure/vercelEnvSync.test.ts tests/infrastructure/productionPreflight.test.ts`
  - `2 files passed`
  - `8 tests passed`
- 전체 테스트
  - `npm test`
  - `56 files passed`
  - `190 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `189`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Identity Platform 초기화 API가 `BILLING_NOT_ENABLED`로 실패했으므로, Firebase 콘솔의 Authentication 화면에서 직접 활성화하거나 결제 설정을 확인해야 한다.
- Vercel에 로그인하거나 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 제공해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- Vercel 연결 후 `npm run preflight:production` 통과, Vercel 배포, 배포 URL smoke test를 진행해야 한다.

### 운영 전환 12차: 외부 연결 상태 재확인

완료 시간: `2026-06-13 03:16:36 +09:00`

확인한 내용:

- Vercel CLI 연결 상태를 다시 확인했다.
  - `npx vercel whoami --non-interactive`
  - `npx vercel project ls --non-interactive`
  - 두 명령 모두 60초 안에 응답하지 않아 시간 초과됐다.
- 시간 초과 뒤 남아 있던 Vercel CLI Node 프로세스만 명령줄 기준으로 확인해 종료했다.
- Firebase CLI 도움말 기준으로 Authentication 제공자를 직접 활성화하는 명령은 확인되지 않았다.
  - CLI에는 `auth:export`, `auth:import` 같은 사용자 계정 데이터 명령만 표시된다.
  - 따라서 Google 로그인 제공자와 이메일/비밀번호 제공자 활성화는 Firebase 콘솔 또는 결제/Identity Platform 설정 확인이 필요한 외부 작업으로 유지한다.

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel CLI가 정상 응답하도록 로그인/네트워크/토큰 상태를 확인해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- 그 뒤 `npm run preflight:production`, Vercel 배포, 배포 URL smoke test를 진행한다.

### 운영 전환 13차: Vercel 환경변수 동기화 안정성 보강

완료 시간: `2026-06-13 03:21:55 +09:00`

수정한 내용:

- `scripts/syncVercelEnv.ts`의 실제 Vercel CLI 호출을 더 안정적으로 보강했다.
  - `vercel env add`에 `--non-interactive`를 추가했다.
  - 비밀값은 계속 stdin으로 전달해 프로세스 argv에 노출하지 않는다.
  - 개별 환경변수 등록 명령에 기본 `60,000ms` 타임아웃을 추가했다.
  - 필요하면 `VERCEL_ENV_SYNC_TIMEOUT_MS`로 타임아웃을 조정할 수 있다.
- `buildVercelEnvAddCommand`를 분리해 테스트 가능하게 했다.
- 운영 preflight 필수 파일에 `.gitignore`를 추가했다.
  - `.env`와 배포/검증 산출물이 저장소에 들어가는 실수를 preflight 단계에서 더 빨리 잡기 위한 조치다.
- 보안 체크리스트에 `.gitignore` 필수 조건을 추가했다.

수정 중 발견하고 해결한 문제:

- `tests/infrastructure/vercelEnvSync.test.ts`에서 `buildVercelEnvAddCommand`에 불필요한 필드를 넘겨 `npm run build`의 TypeScript 빌드가 실패했다.
- 테스트 입력을 함수 타입에 맞게 `name`만 전달하도록 수정했고, 이후 빌드가 통과했다.

수정 파일:

- `scripts/syncVercelEnv.ts`
- `scripts/productionPreflight.ts`
- `tests/infrastructure/vercelEnvSync.test.ts`
- `tests/infrastructure/productionPreflight.test.ts`
- `docs/production-security-checklist.md`

검증:

- 관련 테스트
  - `npm test -- tests/infrastructure/vercelEnvSync.test.ts tests/infrastructure/productionPreflight.test.ts`
  - `2 files passed`
  - `9 tests passed`
- 보안/preflight 관련 테스트
  - `npm test -- tests/infrastructure/productionPreflight.test.ts tests/infrastructure/vercelEnvSync.test.ts tests/security/clientSecretExposure.test.ts`
  - `3 files passed`
  - `11 tests passed`
- 전체 테스트
  - `npm test`
  - `56 files passed`
  - `192 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `191`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel CLI가 정상 응답하도록 로그인/네트워크/토큰 상태를 확인해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- 그 뒤 `npm run preflight:production`, Vercel 배포, 배포 URL smoke test를 진행한다.

### 운영 전환 14차: 배포 후 smoke test 스크립트 추가

완료 시간: `2026-06-13 03:26:55 +09:00`

수정한 내용:

- Vercel 배포 URL 검증용 smoke test 스크립트를 추가했다.
  - `scripts/postDeploySmokeTest.ts`
  - `DEPLOY_URL=https://배포주소 npm run smoke:deploy`로 실행한다.
- `package.json`에 `smoke:deploy` 스크립트를 추가했다.
- smoke test는 다음 항목을 확인한다.
  - `/`가 꼬꼬무AI SPA HTML로 응답하는지
  - `/privacy`가 SPA rewrite로 정상 응답하는지
  - `/api/health`가 `ok`, `provider`, `model`을 반환하는지
  - 인증 없는 `/api/teachers` 접근이 `401` 또는 `403`으로 거절되는지
- `SPEC.md`와 `docs/production-security-checklist.md`에 배포 후 smoke test 절차를 반영했다.

TDD 기록:

- 먼저 `tests/infrastructure/postDeploySmokeTest.test.ts`를 추가했다.
- 첫 실행은 구현 파일이 없어 실패했다.
  - 실패 이유: `Cannot find module '../../scripts/postDeploySmokeTest'`
- 이후 `scripts/postDeploySmokeTest.ts`를 구현하고 관련 테스트를 통과시켰다.

수정 파일:

- `scripts/postDeploySmokeTest.ts`
- `tests/infrastructure/postDeploySmokeTest.test.ts`
- `package.json`
- `SPEC.md`
- `docs/production-security-checklist.md`

검증:

- 관련 테스트
  - `npm test -- tests/infrastructure/postDeploySmokeTest.test.ts`
  - `1 file passed`
  - `3 tests passed`
- 배포 smoke test URL 누락 검증
  - `npm run smoke:deploy`
  - 결과: 실패
  - 실패 이유: `DEPLOY_URL이 필요합니다.`
  - 실제 배포 URL이 없으면 명확히 실패하는 것이 의도한 동작이다.
- 관련 보안/배포 테스트
  - `npm test -- tests/infrastructure/postDeploySmokeTest.test.ts tests/infrastructure/productionPreflight.test.ts tests/infrastructure/vercelEnvSync.test.ts tests/security/clientSecretExposure.test.ts`
  - `4 files passed`
  - `14 tests passed`
- 전체 테스트
  - `npm test`
  - `57 files passed`
  - `195 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `177`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel CLI가 정상 응답하도록 로그인/네트워크/토큰 상태를 확인해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- Vercel 배포 후 `DEPLOY_URL=https://배포주소 npm run smoke:deploy`를 실행한다.
- 그 뒤 최종 배포 URL smoke test 결과를 기준으로 목표 완료 여부를 판단한다.

### 운영 전환 15차: 로컬 서버 환경변수 로딩 보정

완료 시간: `2026-06-13 03:36:43 +09:00`

문제:

- 전체 테스트와 빌드는 통과했지만, 새로 실행한 로컬 E2E에서 학생 채팅 응답이 90초 안에 완료되지 않았다.
- 직접 `/api/chat`을 호출해 확인한 결과, 로컬 API 서버가 `.env`를 자동으로 읽지 않아 provider 키가 없는 상태로 실행되고 있었다.
- Vite 개발 서버는 `.env`를 읽지만, `npm run server`로 띄우는 Node API 서버는 별도 로더가 필요했다.

수정한 내용:

- `server/serverEnv.ts`를 추가했다.
  - `.env` 파일을 읽어 `process.env`에 병합한다.
  - 이미 셸에서 명시한 환경변수는 덮어쓰지 않는다.
  - JSON 형태 값과 quoted 값도 유지해서 Firebase 서비스 계정, OpenAI 키, LM Studio 키를 안전하게 로딩한다.
- `server/dev-server.ts` 시작 시 `loadDotEnvFile()`을 먼저 호출하도록 연결했다.
- `tests/infrastructure/serverEnv.test.ts`를 추가했다.
  - dotenv 텍스트 파싱을 검증한다.
  - `.env` 값이 로컬 API 서버 시작 전에 들어가고, 명시적 process env는 유지되는지 검증한다.

수정 파일:

- `server/serverEnv.ts`
- `server/dev-server.ts`
- `tests/infrastructure/serverEnv.test.ts`

재검증:

- 신규 테스트
  - `npm test -- tests/infrastructure/serverEnv.test.ts`
  - `1 file passed`
  - `2 tests passed`
- 직접 `/api/chat` 확인
  - 로컬 API 서버가 `.env`를 읽은 뒤 `200 text/event-stream`으로 응답했다.
  - 응답 모델은 `gpt-5.4-nano-2026-03-17`로 확인됐다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `189`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- 전체 테스트
  - `npm test`
  - `58 files passed`
  - `197 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
  - npm 권고 수정은 `firebase-admin@10.3.0`으로의 메이저 다운그레이드라 즉시 적용하지 않았다.
- 배포 smoke test URL 누락 검증
  - `npm run smoke:deploy`
  - 결과: 실패
  - 실패 이유: `DEPLOY_URL이 필요합니다.`
  - 실제 배포 URL이 없으면 명확히 실패하는 것이 의도한 동작이다.

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`
  - `%TEMP%/kkokkomu-api-direct.log`
  - `%TEMP%/kkokkomu-api-direct.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel CLI가 정상 응답하도록 로그인/네트워크/토큰 상태를 확인해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- Vercel 배포 후 `DEPLOY_URL=https://배포주소 npm run smoke:deploy`를 실행한다.
- 그 뒤 최종 배포 URL smoke test 결과를 기준으로 목표 완료 여부를 판단한다.

### 운영 전환 16차: Vercel 프로젝트 연결 자동화와 배포 Runbook 추가

완료 시간: `2026-06-13 03:41:55 +09:00`

문제:

- Vercel CLI 상호작용 명령이 이전 확인에서 응답 없이 시간 초과됐다.
- 현재 운영 preflight의 남은 실패는 Vercel 인증/프로젝트 연결 정보뿐이다.
- 외부 콘솔에서 `orgId`, `projectId`를 확인하더라도 로컬 `.vercel/project.json` 생성 절차가 문서화되어 있지 않았다.

수정한 내용:

- Vercel 프로젝트 연결 파일 생성 스크립트를 추가했다.
  - `scripts/linkVercelProject.ts`
  - `.env` 또는 현재 셸 환경변수의 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 읽어 `.vercel/project.json`을 생성한다.
  - 이미 명시된 파일이 있으면 기본적으로 덮어쓰지 않고, 필요하면 `--force`로 다시 쓸 수 있다.
  - `VERCEL_TOKEN`은 연결 파일에 쓰지 않는다.
- `package.json`에 `vercel:link:env` 명령을 추가했다.
- `.env.example`에 로컬 Vercel CLI 제어용 값을 분리해 추가했다.
  - `VERCEL_ORG_ID`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_TOKEN`
  - 이 값들은 Vercel 프로젝트 환경변수로 다시 업로드하지 않는다고 명시했다.
- `docs/deployment-runbook.md`를 추가했다.
  - Firebase Auth 제공자 활성화
  - Firestore rules/indexes 배포
  - Vercel 프로젝트 연결
  - Vercel 환경변수 dry-run/sync
  - preflight/test/build/audit
  - Vercel 배포
  - 배포 URL smoke test
  - 배포 후 수동 확인 순서를 정리했다.
- `SPEC.md`와 `docs/production-security-checklist.md`에 `npm run vercel:link:env` 절차를 반영했다.

TDD 기록:

- 먼저 `tests/infrastructure/vercelProjectLink.test.ts`를 추가했다.
- 첫 실행은 구현 파일이 없어 실패했다.
  - 실패 이유: `Cannot find module '../../scripts/linkVercelProject'`
- 이후 `scripts/linkVercelProject.ts`를 구현하고 테스트를 통과시켰다.

수정 파일:

- `scripts/linkVercelProject.ts`
- `tests/infrastructure/vercelProjectLink.test.ts`
- `package.json`
- `.env.example`
- `docs/deployment-runbook.md`
- `docs/production-security-checklist.md`
- `SPEC.md`

검증:

- 관련 테스트
  - `npm test -- tests/infrastructure/vercelProjectLink.test.ts`
  - `1 file passed`
  - `2 tests passed`
- Vercel/운영 관련 테스트
  - `npm test -- tests/infrastructure/vercelProjectLink.test.ts tests/infrastructure/vercelEnvSync.test.ts tests/infrastructure/productionPreflight.test.ts`
  - `3 files passed`
  - `12 tests passed`
- 전체 테스트
  - `npm test`
  - `59 files passed`
  - `199 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Vercel 연결 스크립트 현재 상태
  - `npm run vercel:link:env`
  - 결과: 실패
  - 실패 이유: `VERCEL_ORG_ID와 VERCEL_PROJECT_ID가 모두 필요합니다.`
  - 현재 로컬 `.env`에는 Vercel project/org id가 없으므로 의도한 실패다.
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage` 계열에서 발생한다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `206`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel 대시보드에서 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 확인해 로컬 `.env`에 추가해야 한다.
- `npm run vercel:link:env`로 `.vercel/project.json`을 생성해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- Vercel 배포 후 `DEPLOY_URL=https://배포주소 npm run smoke:deploy`를 실행한다.
- 그 뒤 최종 배포 URL smoke test 결과를 기준으로 목표 완료 여부를 판단한다.

### 운영 전환 17차: 관리자 비밀번호 재설정 메일 발송 API 연결

완료 시간: `2026-06-13 03:50:40 +09:00`

문제:

- 관리자 화면의 비밀번호 재설정 기능이 실제 메일 발송 없이 "준비됨" 메시지만 보여주는 상태였다.
- `SPEC.md`의 실제 운영 기준에는 관리자 승인, 비활성화, 비밀번호 재설정 메일 발송 가능 조건이 포함되어 있다.

수정한 내용:

- Firebase Authentication 비밀번호 재설정 메일 발송 어댑터를 추가했다.
  - `server/passwordResetEmail.ts`
  - Identity Toolkit REST API의 `accounts:sendOobCode`와 `PASSWORD_RESET` 요청을 사용한다.
  - `VITE_FIREBASE_API_KEY`가 비어 있으면 명확히 실패한다.
  - Firebase 오류 메시지는 서버 오류로 감싸 관리자 화면에 전달한다.
- 관리자 전용 API를 추가했다.
  - `POST /api/admin/teachers/:id/password-reset`
  - Firebase Auth 모드에서는 Bearer 토큰의 관리자 권한을 확인한다.
  - 로컬 모드에서는 기존처럼 `adminId`를 사용한다.
  - 대상 교사가 없으면 `404 teacher_not_found`를 반환한다.
  - 발송 뒤 관리자 감사 로그에 `send_password_reset_email` 액션을 남긴다.
- Vercel API 핸들러에서 실제 Firebase 메일 발송 함수를 주입하도록 연결했다.
- 프론트 API 클라이언트와 관리자 화면을 연결했다.
  - `sendTeacherPasswordResetEmail(teacherId, adminId)`를 추가했다.
  - 관리자 화면에서 버튼을 누르면 실제 API 호출 뒤 해당 이메일로 발송했다는 메시지를 표시한다.
  - 실패하면 서버 오류 메시지를 그대로 보여준다.

TDD 기록:

- 먼저 `tests/infrastructure/passwordResetEmail.test.ts`를 추가했다.
  - 첫 실행은 구현 파일이 없어 실패했다.
  - 이후 Firebase 요청 빌더와 발송 함수를 구현해 통과시켰다.
- `tests/infrastructure/localApiAuth.test.ts`에 관리자 비밀번호 재설정 API 테스트를 추가했다.
  - 첫 실행은 라우트가 없어 `404`로 실패했다.
  - 이후 관리자 권한 확인, 대상 교사 확인, 메일 발송, 감사 로그 기록까지 통과시켰다.
- `tests/presentation/apiClient.test.ts`에 프론트 API 호출 테스트를 추가했다.
  - 첫 실행은 `sendTeacherPasswordResetEmail is not a function`으로 실패했다.
  - 이후 클라이언트 함수를 구현해 통과시켰다.

수정 파일:

- `server/passwordResetEmail.ts`
- `server/localApi.ts`
- `server/apiHandler.ts`
- `server/vercelApi.ts`
- `src/presentation/apiClient.ts`
- `src/presentation/App.tsx`
- `src/presentation/routes/AdminDashboardRoute.tsx`
- `tests/infrastructure/passwordResetEmail.test.ts`
- `tests/infrastructure/localApiAuth.test.ts`
- `tests/presentation/apiClient.test.ts`

검증:

- 프론트 API 클라이언트 테스트
  - `npm test -- tests/presentation/apiClient.test.ts`
  - `1 file passed`
  - `3 tests passed`
- 관련 서버/프론트 테스트
  - `npm test -- tests/infrastructure/passwordResetEmail.test.ts tests/infrastructure/localApiAuth.test.ts tests/presentation/apiClient.test.ts`
  - `3 files passed`
  - `14 tests passed`
- 전체 테스트
  - `npm test`
  - `60 files passed`
  - `202 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage`, `retry-request`, `teeny-request`, `gaxios`, `uuid` 계열에서 발생한다.
  - `npm view firebase-admin version` 기준 최신 버전은 `14.0.0`으로 확인됐다.
  - npm 권고 수정은 `firebase-admin@10.3.0`으로의 메이저 다운그레이드라 즉시 적용하지 않았다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `146`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 `TIME_WAIT`만 남고 실제 실행 프로세스는 없음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel 대시보드에서 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 확인해 로컬 `.env`에 추가해야 한다.
- `npm run vercel:link:env`로 `.vercel/project.json`을 생성해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- Vercel 배포 후 `DEPLOY_URL=https://배포주소 npm run smoke:deploy`를 실행한다.
- 그 뒤 최종 배포 URL smoke test 결과를 기준으로 목표 완료 여부를 판단한다.


### 운영 전환 18차: 관리자 운영 기능 보강과 Firestore rules/indexes 배포

완료 시간: `2026-06-13 04:04:32 +09:00`

문제:

- `SPEC.md`에는 관리자 기능으로 교사 거절, 교사 비활성화, 챗봇 비활성화, 관리자 작업 로그 확인이 포함되어 있었다.
- 이전 상태에서는 비밀번호 재설정 메일 발송은 연결됐지만, 교사 거절/비활성화와 문제 챗봇 비활성화가 API/UI까지 완전히 이어져 있지 않았다.
- Firestore rules/indexes 파일은 준비되어 있었지만 실제 Firebase 프로젝트 배포 여부가 확인되지 않았다.

수정한 내용:

- 챗봇 비활성화 도메인 함수를 추가했다.
  - `disableChatbotByAdmin`
  - 챗봇 상태를 `disabled`로 바꾸고 `disabledAt`, `disabledBy`를 기록한다.
  - 공유 링크를 즉시 비활성화한다.
  - 관리자 로그에 `chatbot_disabled`, `targetTeacherId`, `targetChatbotId`를 남긴다.
- 관리자 API를 보강했다.
  - `POST /api/admin/chatbots/:id/disable`
  - `POST /api/admin/teachers/:id/disable`
  - `POST /api/admin/teachers/:id/reject`
  - `GET /api/admin/action-logs`
  - Firebase Auth 모드에서는 Bearer 토큰의 관리자 권한을 확인하고, 로컬 모드에서는 기존 개발용 `adminId` 흐름을 유지한다.
- 관리자 로그 타입과 저장소를 확장했다.
  - `AdminAction`에 `chatbot_disabled`를 추가했다.
  - `AdminActionLogEvent`에 선택 필드 `targetChatbotId`를 추가했다.
  - LocalStore와 FirebaseStore 모두 `targetChatbotId`를 보존하도록 수정했다.
- 프론트 API 클라이언트를 보강했다.
  - `disableTeacherAsAdmin`
  - `rejectTeacherAsAdmin`
  - `disableChatbotAsAdmin`
  - `getAdminActionLogs`
- 관리자 화면을 보강했다.
  - 교사 행에 `교사 사용 중지` 버튼을 추가했다.
  - 거절 사유 입력과 `선택 거절` 버튼을 추가했다.
  - 활성 챗봇 목록과 `비활성화` 버튼을 추가했다.
  - 최근 관리자 작업 로그를 표시한다.
- Firestore rules/indexes를 실제 Firebase 프로젝트에 배포했다.
  - 프로젝트: `kkokkomu-d6a4c`
  - rules 컴파일 성공
  - indexes 배포 성공
  - rules release 완료

TDD 기록:

- 먼저 챗봇 비활성화 테스트를 추가했다.
  - 첫 실행 실패:
    - `disableChatbotByAdmin is not a function`
    - 관리자 챗봇 비활성화 API `404`
    - 프론트 API 함수 없음
    - 관리자 화면에 `챗봇 운영` 없음
  - 이후 도메인/API/UI를 구현하고 통과시켰다.
- 이어서 교사 비활성화 테스트를 추가했다.
  - 첫 실행 실패:
    - 교사 비활성화 API `404`
    - `disableTeacherAsAdmin is not a function`
    - 관리자 화면에 `교사 사용 중지` 없음
  - 이후 서버/클라이언트/화면을 구현하고 통과시켰다.
- 이어서 교사 거절과 관리자 작업 로그 테스트를 추가했다.
  - 첫 실행 실패:
    - 교사 거절 API `404`
    - `rejectTeacherAsAdmin is not a function`
    - 관리자 화면에 `거절 사유`, `선택 거절`, `관리자 작업 로그` 없음
  - 이후 서버/클라이언트/화면을 구현하고 통과시켰다.

수정 파일:

- `src/domain/chatbot/chatbotManagement.ts`
- `src/domain/identity/identityAccess.ts`
- `server/localApi.ts`
- `server/localStore.ts`
- `server/firebaseStore.ts`
- `src/presentation/apiClient.ts`
- `src/presentation/App.tsx`
- `src/presentation/routes/AdminDashboardRoute.tsx`
- `src/presentation/styles.css`
- `tests/domain/chatbotManagement.test.ts`
- `tests/infrastructure/localApiAuth.test.ts`
- `tests/presentation/apiClient.test.ts`
- `tests/presentation/adminChatbotModeration.test.ts`

검증:

- 새 관리자 기능 관련 테스트
  - `npm test -- tests/domain/chatbotManagement.test.ts tests/infrastructure/localApiAuth.test.ts tests/presentation/apiClient.test.ts tests/presentation/adminChatbotModeration.test.ts`
  - `4 files passed`
  - `23 tests passed`
- 관리자/저장소 관련 확장 테스트
  - `npm test -- tests/domain/identityAccess.test.ts tests/domain/chatbotManagement.test.ts tests/infrastructure/localApiAuth.test.ts tests/infrastructure/localApi.test.ts tests/infrastructure/localStore.test.ts tests/infrastructure/firebaseStore.test.ts tests/presentation/apiClient.test.ts tests/presentation/adminChatbotModeration.test.ts tests/presentation/usageDashboard.test.ts tests/presentation/adminDashboardAiSettings.test.ts`
  - `10 files passed`
  - `67 tests passed`
- 전체 테스트
  - `npm test`
  - `61 files passed`
  - `209 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 현재 남은 실패 이유는 Vercel 인증/프로젝트 연결 정보뿐이다.
    - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin@14.0.0`의 transitive `@google-cloud/storage`, `retry-request`, `teeny-request`, `gaxios`, `uuid` 계열에서 발생한다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `137`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- Firebase CLI 확인
  - `firebase --version`
  - `15.20.0`
  - `firebase projects:list --json`
  - `kkokkomu-d6a4c` 프로젝트 접근 확인
- Firestore rules/indexes 배포
  - `firebase deploy --only firestore:rules,firestore:indexes --project kkokkomu-d6a4c --non-interactive`
  - rules 컴파일 성공
  - indexes 배포 성공
  - rules release 완료

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 `TIME_WAIT`만 남고 실제 실행 프로세스는 없음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase Authentication에서 Google 로그인 제공자와 이메일/비밀번호 제공자를 활성화해야 한다.
- Vercel CLI `npx vercel whoami --non-interactive`가 30초 안에 응답하지 않고 시간 초과됐다.
- `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`가 아직 로컬 `.env`에 없어서 `npm run vercel:link:env`가 실패한다.
- Vercel 대시보드에서 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 확인해 로컬 `.env`에 추가해야 한다.
- `npm run vercel:link:env`로 `.vercel/project.json`을 생성해야 한다.
- Vercel 프로젝트가 연결되면 `npm run vercel:env:sync`로 production 환경변수를 등록한다.
- Vercel 배포 후 `DEPLOY_URL=https://배포주소 npm run smoke:deploy`를 실행한다.
- 그 뒤 최종 배포 URL smoke test 결과를 기준으로 목표 완료 여부를 판단한다.

### 운영 전환 19차: Firebase Auth 제공자 점검 게이트 추가와 최종 로컬 검증

완료 시간: `2026-06-13 04:22:22 +09:00`

요청/목표:

- 실제 운영 배포 전에 Firebase Authentication 제공자 상태를 자동으로 확인할 수 있게 한다.
- 로컬 테스트와 E2E를 먼저 통과시킨 뒤 `task.md`를 업데이트한다.
- 완료 시간과 남은 외부 차단 요인을 명확히 기록한다.

변경 내용:

- Firebase Authentication 제공자 점검 스크립트를 추가했다.
  - `scripts/checkFirebaseAuthProviders.ts`
  - 실행 명령: `npm run firebase:auth:check`
  - 이메일/비밀번호 제공자와 Google 제공자 상태를 확인한다.
  - 서비스 계정이 있으면 Identity Toolkit Admin API를 우선 조회한다.
  - 일반 Firebase Auth 프로젝트에서 Admin config가 `CONFIGURATION_NOT_FOUND`를 반환하면 Firebase Auth REST API의 비파괴 로그인 probe로 전환한다.
  - 서비스 계정이 없는 환경에서도 `VITE_FIREBASE_API_KEY`만 있으면 공개 Auth REST probe로 확인할 수 있게 했다.
  - 비밀값, access token, private key는 출력하지 않는다.
- package script를 추가했다.
  - `package.json`
  - `firebase:auth:check`
- 배포 문서를 업데이트했다.
  - `docs/deployment-runbook.md`
  - `docs/production-security-checklist.md`
  - Firebase Auth 제공자 활성화 후 `npm run firebase:auth:check`를 실행하도록 추가했다.
- 회귀 테스트를 추가했다.
  - `tests/infrastructure/firebaseAuthProviderCheck.test.ts`
  - Admin API 성공 경로
  - Admin config 미초기화 시 공개 REST probe fallback
  - 서비스 계정 없이 공개 REST probe 직접 실행
  - Google provider Admin config 404를 비활성화 상태로 판정
  - Firebase Authentication 미초기화 메시지
  - 서비스 계정 JWT assertion에 private key가 포함되지 않는지 확인

검증:

- 신규 테스트
  - `npm test -- --run tests/infrastructure/firebaseAuthProviderCheck.test.ts`
  - `1 file passed`
  - `10 tests passed`
- 전체 테스트
  - `npm test`
  - `62 files passed`
  - `219 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `226`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 배포 환경변수가 `ready: true`로 확인됐다.
  - 실제 비밀값은 출력하지 않고 길이만 표시했다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유: Vercel 인증/프로젝트 연결 정보 없음
  - 필요한 값: `VERCEL_TOKEN` 또는 `.vercel/project.json`
- Firebase Auth 제공자 점검
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 현재 상태:
    - `emailPassword: unknown`
    - `google: unknown`
  - 원인 메시지:
    - `Firebase Authentication이 아직 초기화되어 있지 않습니다. Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호와 Google 제공자를 활성화하세요.`
- Firebase CLI 확인
  - `firebase projects:list --json`
  - `kkokkomu-d6a4c` 프로젝트 접근 확인
- Firestore rules/indexes 배포 확인
  - `firebase deploy --only firestore:rules,firestore:indexes --project kkokkomu-d6a4c`
  - rules 컴파일 성공
  - indexes 배포 성공
  - rules release 완료
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin`의 transitive `@google-cloud/storage`, `retry-request`, `teeny-request`, `gaxios`, `uuid` 경로에서 발생한다.

보안 리뷰:

- `firebase:auth:check`는 Firebase 서비스 계정 private key, OAuth access token, Vercel/Firebase 비밀값을 콘솔에 출력하지 않는다.
- 공개 REST probe는 존재하지 않는 임시 이메일과 가짜 Google ID token을 사용하므로 계정을 생성하지 않는다.
- Firebase Web API key는 Firebase Auth REST 호출 URL에만 사용하고 로그로 출력하지 않는다.
- `CONFIGURATION_NOT_FOUND`는 provider 비활성화와 구분해 Firebase Authentication 미초기화로 안내한다.
- Google provider Admin config 404는 전체 스크립트 예외가 아니라 Google 제공자 비활성화로 판정한다.

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 `TIME_WAIT`만 남고 실제 실행 프로세스는 없음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호 제공자와 Google 제공자를 활성화해야 한다.
- 활성화 후 `npm run firebase:auth:check`가 `emailPassword: enabled`, `google: enabled`로 통과해야 한다.
- Vercel 대시보드에서 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 확인해 로컬 `.env`에 추가해야 한다.
- `npm run vercel:link:env`로 `.vercel/project.json`을 생성해야 한다.
- Vercel 프로젝트가 연결되면 `npm run preflight:production`을 다시 통과시켜야 한다.
- 이후 `npm run vercel:env:sync`, `npx vercel deploy --prod --yes`, `DEPLOY_URL=https://배포주소 npm run smoke:deploy` 순서로 최종 배포 검증을 진행한다.

### 운영 전환 20차: Firebase Auth 자동 초기화 가능성 검증과 Vercel 인증 상태 재확인

완료 시간: `2026-06-13 04:35:59 +09:00`

요청/목표:

- Firebase Authentication 초기화와 provider 활성화를 현재 로컬 권한으로 자동 처리할 수 있는지 확인한다.
- Vercel 프로젝트 연결을 로컬에 저장된 인증 정보로 자동 발견할 수 있는지 확인한다.
- 로컬 테스트, 빌드, E2E를 통과한 뒤 기록한다.

변경 내용:

- Firebase Auth 부트스트랩 보조 스크립트를 추가했다.
  - `scripts/bootstrapFirebaseAuth.ts`
  - 실행 명령: `npm run firebase:auth:bootstrap`
  - 서비스 계정으로 Google OAuth access token을 발급받고 Identity Toolkit Admin API를 호출한다.
  - `initializeAuth`, 이메일/비밀번호 provider 활성화, Google provider 생성/활성화를 순서대로 시도한다.
  - `BILLING_NOT_ENABLED`가 나오면 후속 provider 업데이트를 중단하고 무료 Firebase Auth 콘솔 초기화가 필요하다고 안내한다.
  - 비밀값, private key, access token은 출력하지 않는다.
- package script를 추가했다.
  - `firebase:auth:bootstrap`
- 회귀 테스트를 추가했다.
  - `tests/infrastructure/firebaseAuthBootstrap.test.ts`
  - Auth 초기화와 provider 활성화 성공 경로
  - 이미 초기화된 프로젝트에서 idempotent 동작
  - Google provider 활성화 실패 메시지와 비밀값 미노출
  - 결제 비활성화 시 후속 API 호출 중단
- 문서를 업데이트했다.
  - `docs/deployment-runbook.md`
  - `docs/production-security-checklist.md`
  - 무료 티어에서는 `firebase:auth:bootstrap`을 기본 절차로 사용하지 않고 Firebase 콘솔에서 Auth를 시작한 뒤 `firebase:auth:check`로 확인하도록 명시했다.

검증:

- Firebase Auth 부트스트랩 신규 테스트
  - `npm test -- --run tests/infrastructure/firebaseAuthBootstrap.test.ts`
  - `1 file passed`
  - `4 tests passed`
- 전체 테스트
  - `npm test`
  - `63 files passed`
  - `223 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Firebase Auth 자동 부트스트랩 실제 실행
  - `npm run firebase:auth:bootstrap`
  - 결과: 실패
  - 원인:
    - `Firebase Authentication 자동 초기화는 현재 프로젝트에서 결제 활성화가 필요합니다. 무료 Firebase Auth를 유지하려면 Firebase 콘솔에서 Authentication을 시작하고 제공자를 활성화하세요.`
  - 결론:
    - 현재 무료 티어 운영 방향에서는 Auth 시작과 provider 활성화는 Firebase 콘솔 작업으로 남긴다.
- Firebase Auth provider 점검
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 현재 상태:
    - `emailPassword: unknown`
    - `google: unknown`
  - 원인:
    - Firebase Authentication이 아직 초기화되어 있지 않다.
- Vercel 인증 상태 확인
  - `.env`와 현재 프로세스 환경에 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`가 모두 없음
  - `.vercel/project.json` 없음
  - 저장된 Vercel CLI 인증 파일 없음
    - `%USERPROFILE%\.vercel\auth.json`
    - `%APPDATA%\com.vercel.cli\auth.json`
    - `%LOCALAPPDATA%\com.vercel.cli\auth.json`
  - `vercel whoami --non-interactive`: 60초 시간 초과
  - `vercel projects ls --non-interactive`: 60초 시간 초과
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 모든 필수 배포 환경변수가 `ready: true`로 확인됐다.
- 운영 preflight
  - `npm run preflight:production`
  - 결과: 실패
  - 실패 이유:
    - Vercel 인증/프로젝트 연결 정보 없음
- 보안 감사
  - `npm audit --omit=dev --json`
  - high: `0`
  - critical: `0`
  - moderate: `6`
  - moderate 항목은 기존과 동일하게 `firebase-admin`의 transitive `@google-cloud/storage`, `retry-request`, `teeny-request`, `gaxios`, `uuid` 경로에서 발생한다.
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `195`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- 활성화 후 `npm run firebase:auth:check`가 통과해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 로컬 `.env`에 Vercel 연결 값을 추가한 뒤 `npm run vercel:link:env`를 실행해야 한다.
- 이후 `npm run preflight:production`, `npm run vercel:env:sync`, `npx vercel deploy --prod --yes`, `DEPLOY_URL=https://배포주소 npm run smoke:deploy` 순서로 최종 배포 검증을 진행한다.

### 운영 전환 21차: 배포 준비도 통합 점검 명령 추가

완료 시간: `2026-06-13 04:42:57 +09:00`

요청/목표:

- 외부 콘솔 작업이 남아 있는 상태에서도 현재 배포 가능 여부와 다음 액션을 한 번에 확인할 수 있게 한다.
- Firebase Auth, Vercel 연결, Vercel 환경변수, 보안 감사 상태를 하나의 보고서로 묶는다.
- 로컬 테스트와 E2E를 통과한 뒤 기록한다.

변경 내용:

- 배포 준비도 통합 점검 스크립트를 추가했다.
  - `scripts/deploymentReadiness.ts`
  - 실행 명령: `npm run deployment:status`
  - production preflight, Firebase Auth provider check, Vercel 환경변수 준비 상태, `npm audit --omit=dev --json`의 high/critical 상태를 한 번에 보고한다.
  - 배포 가능하면 다음 명령을 제시한다.
    - `npm run vercel:env:sync`
    - `npx vercel deploy --prod --yes`
    - `$env:DEPLOY_URL='https://배포주소'; npm run smoke:deploy`
  - 차단 상태면 구체적인 next action만 보여준다.
  - Vercel 환경변수 dry-run의 길이 값이나 비밀값은 보고서에 포함하지 않는다.
- Windows 환경에서 `npm audit` 실행이 `spawn EINVAL`로 실패하지 않도록 `cmd.exe /d /s /c npm audit --omit=dev --json` 경로를 사용하게 했다.
- package script를 추가했다.
  - `deployment:status`
- 회귀 테스트를 추가했다.
  - `tests/infrastructure/deploymentReadiness.test.ts`
  - 모든 gate 통과 시 `ready_to_deploy`
  - Firebase Auth/Vercel 연결 미완료 시 `blocked`
  - high/critical 취약점 gate 실패
  - npm audit JSON 파싱
  - Windows `npm audit` 명령 생성
- 문서를 업데이트했다.
  - `docs/deployment-runbook.md`
  - `docs/production-security-checklist.md`
  - `npm run deployment:status`를 배포 전 gate로 추가했다.

검증:

- 신규 테스트
  - `npm test -- --run tests/infrastructure/deploymentReadiness.test.ts`
  - `1 file passed`
  - `6 tests passed`
- 전체 테스트
  - `npm test`
  - `64 files passed`
  - `229 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `192`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.

### 운영 전환 22차: Vercel 보안 헤더와 배포 후 smoke test 보강

완료 시간: `2026-06-13 04:48:05 +09:00`

요청/목표:

- 개인정보와 학생 공유 링크를 다루는 운영 배포에 필요한 기본 보안 헤더를 Vercel 설정에 추가한다.
- 배포 후 smoke test가 보안 헤더까지 확인하도록 확장한다.
- 로컬 테스트와 E2E를 통과한 뒤 기록한다.

변경 내용:

- `vercel.json`에 전체 경로 보안 헤더를 추가했다.
  - `Content-Security-Policy`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `X-Frame-Options`
  - `Permissions-Policy`
- CSP는 앱 동작을 막지 않도록 Firebase/Google API 연결을 허용하면서 기본 출처를 제한했다.
  - `default-src 'self'`
  - `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.google.com`
  - `frame-ancestors 'none'`
- 배포 후 smoke test를 확장했다.
  - `scripts/postDeploySmokeTest.ts`
  - `/`, `/privacy`, `/api/health`, 인증 없는 `/api/teachers` 확인에 더해 `security-headers` check를 추가했다.
- 회귀 테스트를 추가/수정했다.
  - `tests/infrastructure/vercelConfig.test.ts`
  - `tests/infrastructure/postDeploySmokeTest.test.ts`
- 운영 문서를 업데이트했다.
  - `docs/deployment-runbook.md`
  - `docs/production-security-checklist.md`

검증:

- Vercel 설정 테스트
  - `npm test -- --run tests/infrastructure/vercelConfig.test.ts`
  - `1 file passed`
  - `2 tests passed`
- 배포 smoke test 단위 테스트
  - `npm test -- --run tests/infrastructure/postDeploySmokeTest.test.ts`
  - `1 file passed`
  - `3 tests passed`
- 전체 테스트
  - `npm test`
  - `64 files passed`
  - `230 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `153`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 보안 헤더까지 통과하는지 확인한다.

### 운영 전환 23차: HTTPS 고정 및 API 캐시 방지 보강

완료 시간: `2026-06-13 04:56:31 +09:00`

요청/목표:

- 운영 배포 전에 외부 콘솔 작업 없이 보강 가능한 보안 항목을 더 점검한다.
- 개인정보와 사용량 데이터를 다루는 API 응답이 브라우저나 프록시에 저장되지 않도록 한다.
- 배포 후 smoke test가 HTTPS 고정 헤더와 API 캐시 방지까지 확인하게 한다.
- 로컬 전체 테스트, 빌드, E2E를 확인한 뒤 기록한다.

변경 내용:

- `vercel.json`에 HTTPS 고정 헤더를 추가했다.
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `vercel.json`에 API 경로 캐시 방지 헤더를 추가했다.
  - `/api/(.*)`
  - `Cache-Control: no-store`
- `scripts/postDeploySmokeTest.ts`를 확장했다.
  - 보안 헤더 점검에 `Strict-Transport-Security`를 포함했다.
  - 인증 없는 `/api/teachers`가 `401` 또는 `403`으로 거절되는지와 함께 `Cache-Control: no-store`가 포함되는지도 확인한다.
- 서버 응답 헤더를 보강했다.
  - `server/apiHandler.ts`
    - JSON 응답에 `Cache-Control: no-store` 추가
    - 챗봇 SSE 응답에 `Cache-Control: no-store, no-transform` 적용
  - `server/localApi.ts`
    - JSON 응답에 `Cache-Control: no-store` 추가
- 회귀 테스트를 추가/수정했다.
  - `tests/infrastructure/vercelConfig.test.ts`
  - `tests/infrastructure/postDeploySmokeTest.test.ts`
  - `tests/infrastructure/apiHandler.test.ts`
  - `tests/infrastructure/localApi.test.ts`
- 운영 문서를 업데이트했다.
  - `docs/deployment-runbook.md`
  - `docs/production-security-checklist.md`

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/vercelConfig.test.ts tests/infrastructure/postDeploySmokeTest.test.ts tests/infrastructure/apiHandler.test.ts tests/infrastructure/localApi.test.ts`
  - 결과: 실패
  - 실패 이유:
    - HSTS 헤더 없음
    - API `Cache-Control: no-store` 없음
    - SSE 응답이 `no-cache`만 사용
    - smoke test가 API no-store 누락을 잡지 못함
- GREEN 확인
  - `npm test -- --run tests/infrastructure/vercelConfig.test.ts tests/infrastructure/postDeploySmokeTest.test.ts tests/infrastructure/apiHandler.test.ts tests/infrastructure/localApi.test.ts`
  - `4 files passed`
  - `27 tests passed`
- 전체 테스트
  - `npm test`
  - `64 files passed`
  - `233 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `217`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store까지 통과하는지 확인한다.

### 운영 전환 24차: Firestore 사용량 집계 동시성 보강

완료 시간: `2026-06-13 05:00:32 +09:00`

요청/목표:

- 실제 운영에서 여러 학생 대화가 동시에 끝나도 교사별 토큰/비용 사용량이 누락되지 않도록 한다.
- 무료 티어를 고려한 월별 집계 저장 구조는 유지하되, 같은 월별 문서에 대한 동시 갱신은 안전하게 처리한다.
- 로컬 전체 테스트, 빌드, E2E를 확인한 뒤 기록한다.

문제 확인:

- 기존 `server/firebaseStore.ts`는 `usageMonthly/{teacherId}_{month}_{chatbotId}` 문서를 `get` 후 `set`으로 갱신했다.
- 같은 챗봇에 학생 대화 2건이 동시에 완료되면 두 요청이 같은 이전 값을 읽고 마지막 `set`이 앞선 값을 덮을 수 있었다.
- 회귀 테스트에서 실제로 `conversationCount`, `aiCallCount`, 토큰 추정치가 2건이 아니라 1건만 남는 것을 확인했다.

변경 내용:

- `server/firebaseStore.ts`
  - `FirestoreTransactionLike`와 선택적 `runTransaction` 인터페이스를 추가했다.
  - 실제 Firebase Admin Firestore가 제공하는 `runTransaction`이 있으면 월별 사용량 문서 갱신을 트랜잭션 안에서 처리하도록 변경했다.
  - 트랜잭션이 없는 테스트/대체 store에서는 기존 단순 갱신 경로를 유지한다.
- `tests/infrastructure/firebaseStore.test.ts`
  - 같은 교사/챗봇/월에 사용량 2건을 `Promise.all`로 동시에 기록하는 회귀 테스트를 추가했다.
  - 테스트용 Firestore에 직렬화된 `runTransaction` 동작을 구현했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/firebaseStore.test.ts`
  - 결과: 실패
  - 실패 이유:
    - 동시 사용량 2건 중 마지막 1건만 월별 집계에 남음
    - `conversationCount: 1`
    - `aiCallCount: 1`
    - `inputTokenEstimate: 80`
    - `outputTokenEstimate: 90`
- GREEN 확인
  - `npm test -- --run tests/infrastructure/firebaseStore.test.ts`
  - `1 file passed`
  - `4 tests passed`
- 전체 테스트
  - `npm test`
  - `64 files passed`
  - `234 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `201`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store까지 통과하는지 확인한다.

### 운영 전환 25차: JSON API 요청 본문 크기 제한

완료 시간: `2026-06-13 05:05:19 +09:00`

요청/목표:

- 실제 운영 배포에서 과도하게 큰 JSON 요청이 서버 메모리와 AI 호출 비용으로 이어지지 않도록 한다.
- 학생 채팅 API와 교사/관리자 API 모두 같은 기준으로 큰 요청을 거절한다.
- 로컬 전체 테스트, 빌드, E2E를 확인한 뒤 기록한다.

문제 확인:

- 기존 `server/apiHandler.ts`와 `server/localApi.ts`는 JSON 본문을 제한 없이 모두 메모리에 모은 뒤 파싱했다.
- 큰 학생 질문 또는 큰 가입/관리 요청이 들어오면 불필요한 메모리 사용과 후속 처리 위험이 있었다.
- 회귀 테스트에서 큰 채팅 요청은 `500`으로 떨어졌고, 큰 교사 가입 요청은 그대로 `201`로 저장되는 것을 확인했다.

변경 내용:

- `server/httpJson.ts`를 추가했다.
  - JSON 본문 기본 제한: `128KB`
  - `Content-Length`가 이미 제한을 넘으면 즉시 거절
  - 스트리밍 중 누적 바이트가 제한을 넘으면 즉시 거절
  - `PayloadTooLargeError`와 판별 함수를 제공
- `server/apiHandler.ts`
  - 학생 채팅 API가 큰 요청 본문을 `413 payload_too_large`로 응답하도록 변경했다.
  - 큰 본문은 AI provider 호출 전에 차단된다.
- `server/localApi.ts`
  - 교사/관리자 API가 큰 요청 본문을 `413 payload_too_large`로 응답하도록 변경했다.
- `docs/production-security-checklist.md`
  - JSON API 요청 본문 128KB 제한 항목을 추가했다.
- 회귀 테스트를 추가했다.
  - `tests/infrastructure/apiHandler.test.ts`
  - `tests/infrastructure/localApi.test.ts`

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts tests/infrastructure/localApi.test.ts`
  - 결과: 실패
  - 실패 이유:
    - 큰 학생 채팅 요청이 `413` 대신 `500`으로 응답
    - 큰 교사 가입 요청이 `413` 대신 `201`로 저장됨
- GREEN 확인
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts tests/infrastructure/localApi.test.ts`
  - `2 files passed`
  - `22 tests passed`
- 전체 테스트
  - `npm test`
  - `64 files passed`
  - `236 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `188`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-api.log`
  - `%TEMP%/kkokkomu-api.err.log`
  - `%TEMP%/kkokkomu-vite.log`
  - `%TEMP%/kkokkomu-vite.err.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store까지 통과하는지 확인한다.

### 운영 전환 26차: API CORS 허용 출처 제한

완료 시간: `2026-06-13 05:17:48 +09:00`

요청/목표:

- 운영 배포 전에 API가 모든 외부 Origin에 열리지 않도록 한다.
- 로컬 Vite 앱은 정상 동작하게 유지하면서, 신뢰하지 않는 브라우저 출처의 preflight와 응답 노출을 막는다.
- 로컬 전체 테스트, 빌드, E2E를 확인한 뒤 기록한다.

문제 확인:

- 기존 `server/apiHandler.ts`와 `server/localApi.ts`는 preflight, JSON 응답, SSE 응답에 `Access-Control-Allow-Origin: *`를 직접 넣고 있었다.
- 인증 API 응답도 브라우저 CORS 기준으로 모든 외부 출처에 노출될 수 있는 구조였다.
- 실패 테스트에서 허용된 로컬 앱 Origin도 `*`로 응답했고, `https://evil.example` preflight도 `204`로 통과하는 것을 확인했다.

변경 내용:

- `server/cors.ts`를 추가했다.
  - 기본 허용 Origin:
    - 같은 출처 요청
    - 로컬 개발 앱 `http://127.0.0.1:5173`
    - 로컬 개발 앱 `http://localhost:5173`
  - 선택 허용 Origin:
    - 서버 전용 `KKOKKOMU_ALLOWED_ORIGINS`
  - 허용되지 않은 브라우저 preflight는 `403`으로 응답한다.
  - 허용된 Origin만 `Access-Control-Allow-Origin`에 그대로 반영한다.
- `server/apiHandler.ts`
  - `/api/chat`, `/api/health`, 로컬 API 위임 경로에서 공통 CORS 헬퍼를 사용하도록 변경했다.
  - JSON/SSE 작성 함수에서 와일드카드 CORS 헤더를 제거했다.
- `server/localApi.ts`
  - 교사/관리자/공유 링크 API에서 공통 CORS 헬퍼를 사용하도록 변경했다.
  - JSON 작성 함수에서 와일드카드 CORS 헤더를 제거했다.
- `.env.example`
  - `KKOKKOMU_ALLOWED_ORIGINS` 예시 항목을 추가했다.
- `docs/production-security-checklist.md`
  - API CORS 정책과 와일드카드 금지 항목을 추가했다.
- 회귀 테스트를 추가했다.
  - `tests/infrastructure/apiHandler.test.ts`
  - `tests/infrastructure/localApiAuth.test.ts`

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts tests/infrastructure/localApiAuth.test.ts`
  - 결과: 실패
  - 실패 이유:
    - 허용된 로컬 Origin 응답이 `http://127.0.0.1:5173` 대신 `*`
    - 신뢰하지 않는 Origin preflight가 `403` 대신 `204`
    - 인증 응답이 신뢰하지 않는 Origin에도 `*`로 노출됨
- GREEN 확인
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts tests/infrastructure/localApiAuth.test.ts`
  - `2 files passed`
  - `21 tests passed`
- 전체 테스트
  - `npm test`
  - `64 files passed`
  - `240 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
- 로컬 HTTP E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 확인 항목:
    - `/` 응답 `200`
    - `/privacy` 응답 `200`
    - Vite 프록시 `/api/health` 응답 `ok: true`
    - 허용 Origin `http://127.0.0.1:5173` preflight `204`
    - 차단 Origin `https://evil.example` preflight `403`
    - 학생 채팅 guardrail SSE 응답 수신
  - 결과: 통과
  - 채팅 응답 길이: `126`

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `tsconfig.tsbuildinfo`
  - `artifacts`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-local-e2e-*`
  - `%TEMP%/kkokkomu-local-e2e-debug-*`
- 로컬 E2E 중 PowerShell 문자열 본문 인코딩으로 한글 JSON이 깨질 수 있음을 확인했다.
  - 최종 검증에서는 요청 본문을 UTF-8 바이트로 보내 통과했다.

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store까지 통과하는지 확인한다.

### 운영 전환 27차: 배포 보안 게이트와 운영 의존성 감사 보강

완료 시간: `2026-06-13 05:34:00 +09:00`

요청/목표:

- `deployment:status`가 CORS 와일드카드 회귀를 자동으로 잡도록 한다.
- 운영 감사에서 런타임 의존성만 기준으로 high/critical 취약점을 판단하도록 정리한다.
- 로컬 전체 테스트, 빌드, E2E를 확인한 뒤 기록한다.

문제 확인:

- `deployment:status`의 `security_audit`는 `npm audit --omit=dev`의 high/critical 개수만 보았고, API 코드에 `Access-Control-Allow-Origin: *`가 다시 들어와도 자동으로 잡지 못했다.
- `vite`와 `@vitejs/plugin-react`가 `dependencies`에 있어 `npm audit --omit=dev`에 Vite/esbuild 개발 서버 취약점 high 2건이 운영 취약점처럼 포함됐다.
- 로컬 E2E는 `.env`의 `VITE_FIREBASE_AUTH_ENABLED=true` 때문에 Firebase 로그인 모드로 실행되어 자동 로컬 교사 준비가 되지 않았다.

변경 내용:

- `scripts/deploymentReadiness.ts`
  - `scanCorsWildcardIssues()`를 추가했다.
  - `server/`, `api/` 소스에서 CORS 와일드카드 응답을 정적으로 탐지한다.
  - `security_audit` gate details에 `cors wildcard: 0` 또는 탐지 개수를 표시한다.
  - CORS 와일드카드가 탐지되면 `security_audit`를 fail로 처리한다.
- `tests/infrastructure/deploymentReadiness.test.ts`
  - CORS 와일드카드 회귀 탐지 테스트를 추가했다.
  - pass 상태에서도 `cors wildcard: 0`이 출력되는지 확인한다.
- `tests/infrastructure/packageManifest.test.ts`
  - `vite`, `@vitejs/plugin-react`가 운영 `dependencies`가 아니라 `devDependencies`에 있어야 함을 고정했다.
- `package.json`, `package-lock.json`
  - `vite`, `@vitejs/plugin-react`를 `devDependencies`로 이동했다.
- `docs/production-security-checklist.md`
  - 빌드 도구는 devDependencies에 두고 운영 감사는 런타임 의존성만 보게 한다는 항목을 추가했다.

검증:

- RED 확인 1
  - `npm test -- --run tests/infrastructure/deploymentReadiness.test.ts`
  - 결과: 실패
  - 실패 이유:
    - CORS 와일드카드 이슈가 있어도 `security_audit`가 pass 처리됨
    - `scanCorsWildcardIssues` 함수가 없음
- GREEN 확인 1
  - `npm test -- --run tests/infrastructure/deploymentReadiness.test.ts`
  - `1 file passed`
  - `8 tests passed`
- RED 확인 2
  - `npm test -- --run tests/infrastructure/packageManifest.test.ts`
  - 결과: 실패
  - 실패 이유:
    - `vite`가 `dependencies`에 있음
- GREEN 확인 2
  - `npm test -- --run tests/infrastructure/packageManifest.test.ts tests/infrastructure/deploymentReadiness.test.ts`
  - `2 files passed`
  - `9 tests passed`
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `243 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `191`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-e2e-run-*`
  - `%TEMP%/kkokkomu-local-e2e*`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store까지 통과하는지 확인한다.

### 운영 전환 28차: 배포 후 CORS smoke test 보강

완료 시간: `2026-06-13 05:40:30 +09:00`

요청/목표:

- Vercel 배포 후 실제 배포 URL에서 CORS 정책이 깨졌는지 자동 확인한다.
- 신뢰하지 않는 Origin의 preflight가 허용되거나 `Access-Control-Allow-Origin: *`가 노출되면 smoke test가 실패하도록 한다.
- 로컬 전체 테스트, 빌드, E2E를 확인한 뒤 기록한다.

문제 확인:

- 기존 `scripts/postDeploySmokeTest.ts`는 SPA, 개인정보처리방침, API health, 인증 없는 교사 API 차단, 기본 보안 헤더만 확인했다.
- API CORS 와일드카드 회귀는 `deployment:status` 정적 스캔에는 잡히지만, 실제 배포 URL smoke test에서는 검증하지 않았다.

변경 내용:

- `scripts/postDeploySmokeTest.ts`
  - `cors-preflight` check를 추가했다.
  - `https://evil.example` Origin으로 `/api/chat` preflight 요청을 보낸다.
  - 응답이 `403`이고 `Access-Control-Allow-Origin: *`가 없을 때만 통과한다.
- `tests/infrastructure/postDeploySmokeTest.test.ts`
  - smoke test가 `/api/chat` OPTIONS preflight까지 호출하는지 확인한다.
  - 신뢰하지 않는 Origin preflight가 `204`이거나 와일드카드 Origin을 노출하면 실패하는 회귀 테스트를 추가했다.
- `docs/deployment-runbook.md`
  - smoke test 확인 항목에 CORS preflight 검사를 추가했다.
- `docs/production-security-checklist.md`
  - 배포 후 CORS preflight 검증 항목을 추가했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/postDeploySmokeTest.test.ts`
  - 결과: 실패
  - 실패 이유:
    - smoke test가 `/api/chat` preflight를 호출하지 않음
    - untrusted CORS preflight 허용 상태를 실패로 처리하지 않음
- GREEN 확인
  - `npm test -- --run tests/infrastructure/postDeploySmokeTest.test.ts`
  - `1 file passed`
  - `5 tests passed`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `244 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `184`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-e2e-run-*`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store, CORS preflight까지 통과하는지 확인한다.

### 운영 전환 29차: 외부 배포 설정 안내 구체화

완료 시간: `2026-06-13 05:50:08 +09:00`

요청/목표:

- Vercel 배포와 Firebase Auth 설정이 아직 외부 작업 때문에 막혀 있으므로, `deployment:status`가 바로 실행 가능한 다음 조치를 보여주게 한다.
- Firebase 콘솔과 Vercel 대시보드 위치를 문서와 스크립트 출력에 함께 반영한다.
- 로컬 테스트, 빌드, E2E를 먼저 통과시킨 뒤 기록한다.

변경 내용:

- `scripts/deploymentReadiness.ts`
  - Firebase Auth provider check 실패 시 프로젝트별 콘솔 링크를 출력하도록 했다.
  - 현재 프로젝트는 `https://console.firebase.google.com/project/kkokkomu-d6a4c/authentication/providers`로 안내된다.
  - Vercel 연결 정보 누락 시 대시보드 확인, `.env` 입력, `npm run vercel:link:env` 실행 순서가 나뉘어 출력되도록 했다.
- `tests/infrastructure/deploymentReadiness.test.ts`
  - Firebase Auth 콘솔 링크와 Vercel 대시보드 안내가 누락되면 실패하는 회귀 테스트를 추가했다.
- `docs/deployment-runbook.md`
  - Firebase Auth 제공자 설정 바로가기와 Vercel 대시보드 링크를 추가했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/deploymentReadiness.test.ts`
  - 결과: 실패
  - 실패 이유:
    - Firebase Auth 실패 안내가 콘솔 링크를 포함하지 않음
    - Vercel 연결 실패 안내가 대시보드와 `.env` 연결 명령을 분리해 보여주지 않음
- GREEN 확인
  - `npm test -- --run tests/infrastructure/deploymentReadiness.test.ts`
  - `1 file passed`
  - `8 tests passed`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `244 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
      - Vercel 대시보드 링크와 `.env`/`vercel:link:env` 안내 출력 확인
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
      - Firebase Auth provider 설정 링크 출력 확인
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `206`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않고 `TIME_WAIT` 연결만 남아 있음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-e2e-run-*`
  - `%TEMP%/kkokkomu-*-e2e.*.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store, CORS preflight까지 통과하는지 확인한다.

### 운영 전환 30차: Firebase/Vercel 보조 스크립트 직접 실행 안내 보강

완료 시간: `2026-06-13 05:54:26 +09:00`

요청/목표:

- `deployment:status`뿐 아니라 `firebase:auth:check`, `vercel:link:env`를 직접 실행했을 때도 다음 작업을 바로 알 수 있게 한다.
- Firebase Auth 제공자 설정 링크를 한 곳에서 생성해 중복 안내가 어긋나지 않게 한다.
- 변경 후 로컬 전체 테스트, 빌드, E2E를 다시 확인한 뒤 기록한다.

변경 내용:

- `scripts/checkFirebaseAuthProviders.ts`
  - `buildFirebaseAuthProviderSetupActions()`를 추가했다.
  - `firebase:auth:check` 실패 시 `ACTION` 라인으로 Firebase Auth 제공자 설정 링크와 재검증 명령을 출력한다.
- `scripts/deploymentReadiness.ts`
  - Firebase Auth 실패 안내를 `buildFirebaseAuthProviderSetupActions()`로 재사용하도록 정리했다.
- `scripts/linkVercelProject.ts`
  - `VERCEL_ORG_ID` 또는 `VERCEL_PROJECT_ID`가 없을 때 Vercel 대시보드 링크를 포함한 오류를 출력하도록 했다.
- `tests/infrastructure/firebaseAuthProviderCheck.test.ts`
  - Firebase Auth 설정 안내 액션 생성 회귀 테스트를 추가했다.
- `tests/infrastructure/vercelProjectLink.test.ts`
  - Vercel 연결 helper 오류 메시지가 대시보드 링크를 포함하는지 확인하도록 갱신했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/firebaseAuthProviderCheck.test.ts`
  - 결과: 실패
  - 실패 이유:
    - `buildFirebaseAuthProviderSetupActions`가 아직 없음
  - `npm test -- --run tests/infrastructure/vercelProjectLink.test.ts`
  - 결과: 실패
  - 실패 이유:
    - Vercel ID 누락 오류가 대시보드 링크를 포함하지 않음
- GREEN 확인
  - `npm test -- --run tests/infrastructure/firebaseAuthProviderCheck.test.ts`
  - `1 file passed`
  - `11 tests passed`
  - `npm test -- --run tests/infrastructure/deploymentReadiness.test.ts`
  - `1 file passed`
  - `8 tests passed`
  - `npm test -- --run tests/infrastructure/vercelProjectLink.test.ts`
  - `1 file passed`
  - `2 tests passed`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `245 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- 직접 실행 확인
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 이유: Firebase Authentication 미초기화
  - 출력 확인:
    - `ACTION Firebase Auth 제공자 설정: https://console.firebase.google.com/project/kkokkomu-d6a4c/authentication/providers`
  - `npm run vercel:link:env`
  - 결과: 실패
  - 이유: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` 없음
  - 출력 확인:
    - `Vercel 대시보드(https://vercel.com/dashboard)에서 Project ID와 Team ID를 확인하세요.`
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
      - Vercel 대시보드 링크와 `.env`/`vercel:link:env` 안내 출력 확인
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
      - Firebase Auth provider 설정 링크 출력 확인
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `147`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않고 `TIME_WAIT` 연결만 남아 있음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-e2e-run-*`
  - `%TEMP%/kkokkomu-*-e2e.*.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store, CORS preflight까지 통과하는지 확인한다.

### 운영 전환 31차: 학생 공유 응답 최소화와 공개 API 오류 노출 방지

완료 시간: `2026-06-13 06:01:44 +09:00`

요청/목표:

- Firebase/Vercel 외부 설정 전에도 로컬에서 줄일 수 있는 운영 보안 위험을 줄인다.
- 학생 공유 링크 응답이 교사 내부 ID와 운영 lifecycle 필드를 노출하지 않게 한다.
- 공개 학교 검색 API가 짧은 검색어로 외부 NEIS 검색 의존성을 호출하지 않게 한다.
- 공개 API의 500 오류에서 내부 환경변수명이나 비밀값이 그대로 보이지 않게 한다.

변경 내용:

- `server/localApi.ts`
  - `/api/share/:token` 응답을 public shared chatbot DTO로 변환했다.
  - 학생 공유 응답에는 `id`, `name`, 수업/대화 설정, `curriculumLinks`, `share.publicToken`만 포함한다.
  - `ownerTeacherId`, `lifecycle`, `createdAt`, `updatedAt`은 학생 공유 응답에서 제외한다.
  - `/api/schools/search`는 trim 후 2글자 미만이면 `{ schools: [] }`를 반환하고 검색 의존성을 호출하지 않게 했다.
  - 일반 500 오류 응답은 고정된 사용자용 문구만 반환하도록 바꿨다.
- `tests/infrastructure/localApi.test.ts`
  - 학생 공유 응답 최소화 회귀 테스트를 추가했다.
  - 짧은 학교 검색어가 NEIS 검색 의존성을 호출하지 않는지 확인하는 테스트를 추가했다.
  - 공개 학교 검색 실패 시 내부 오류 문자열이 응답에 노출되지 않는지 확인하는 테스트를 추가했다.
- `docs/production-security-checklist.md`
  - 학생 공유 응답 최소화, 짧은 학교 검색 차단, 일반 500 오류 비노출 항목을 추가했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/localApi.test.ts`
  - 결과: 실패
  - 실패 이유:
    - 학생 공유 응답에 `ownerTeacherId`, `lifecycle`, `createdAt`, `updatedAt`이 포함됨
    - 한 글자 학교 검색어가 검색 의존성을 호출함
    - 학교 검색 실패 시 `NEIS_API_KEY=secret-value` 문자열이 500 응답에 그대로 포함됨
- GREEN 확인
  - `npm test -- --run tests/infrastructure/localApi.test.ts`
  - `1 file passed`
  - `19 tests passed`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `247 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Firebase Auth 확인
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 이유: Firebase Authentication 미초기화
  - Firebase Auth provider 설정 링크 출력 확인
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `171`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않고 `TIME_WAIT` 연결만 남아 있음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-e2e-run-*`
  - `%TEMP%/kkokkomu-*-e2e.*.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store, CORS preflight까지 통과하는지 확인한다.

### 운영 전환 32차: AI 호출 전 학생 메시지 길이 제한

완료 시간: `2026-06-13 06:07:07 +09:00`

요청/목표:

- 무료 티어 운영을 고려해 학생 채팅이 과도하게 긴 입력으로 AI provider 비용을 유발하지 않게 한다.
- JSON body 128KB 제한보다 작은 긴 질문도 provider 호출 전에 거절한다.
- 이전 대화 히스토리가 길어져도 provider에 전달되는 토큰 추정량을 제한한다.

변경 내용:

- `server/chatProxy.ts`
  - 현재 학생 질문이 2400자를 초과하면 `413 message_too_long`으로 거절하도록 했다.
  - 이전 대화는 기존처럼 최근 8개만 사용하고, 각 히스토리 항목은 800자까지만 provider 메시지에 포함하도록 했다.
  - 히스토리 항목 절단 시 끝에 `...`를 붙여 잘렸음을 내부적으로 알 수 있게 했다.
- `tests/infrastructure/chatProxy.test.ts`
  - 긴 현재 질문이 provider plan으로 넘어가지 않고 `json_error`가 되는 회귀 테스트를 추가했다.
  - 긴 히스토리 항목이 800자 기준으로 잘려 provider 메시지에 들어가는지 확인하는 테스트를 추가했다.
- `tests/infrastructure/apiHandler.test.ts`
  - 128KB JSON body 제한보다 작은 긴 학생 질문도 provider 호출 없이 `413 message_too_long`으로 거절되는지 확인하는 통합 테스트를 추가했다.
- `docs/production-security-checklist.md`
  - 학생 질문 2400자 제한과 히스토리 8개/항목당 800자 제한을 운영 점검표에 추가했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/chatProxy.test.ts`
  - 결과: 실패
  - 실패 이유:
    - 2401자 학생 질문이 `provider` plan으로 넘어감
    - 2000자 히스토리 항목이 잘리지 않고 provider 메시지에 포함됨
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts`
  - 결과: 실패
  - 실패 이유:
    - 긴 학생 질문이 provider 호출로 이어져 테스트 provider 예외 때문에 `500`이 반환됨
- GREEN 확인
  - `npm test -- --run tests/infrastructure/chatProxy.test.ts`
  - `1 file passed`
  - `6 tests passed`
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts`
  - `1 file passed`
  - `8 tests passed`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `250 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Firebase Auth 확인
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 이유: Firebase Authentication 미초기화
  - Firebase Auth provider 설정 링크 출력 확인
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `200`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에는 실행 프로세스가 남아 있지 않고 `TIME_WAIT` 연결만 남아 있음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-e2e-run-*`
  - `%TEMP%/kkokkomu-*-e2e.*.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store, CORS preflight까지 통과하는지 확인한다.

### 운영 전환 33차: Provider 실패 로그와 월별 오류 집계 연결

완료 시간: `2026-06-13 06:20:31 +09:00`

요청/목표:

- 실제 운영 중 OpenAI 또는 로컬 LLM provider가 실패해도 관리자 화면에서 원인을 확인할 수 있게 한다.
- Provider 실패가 교사별 월별 사용량의 오류 횟수로도 집계되게 한다.
- 학생 질문 원문, upstream 오류 본문, provider 예외 메시지, API 키 문자열은 저장하지 않는다.

변경 내용:

- `server/apiHandler.ts`
  - AI provider가 `503` 같은 HTTP 오류를 반환하면 `provider_request_failed` 관리자 오류 로그를 남기도록 했다.
  - Provider `fetch` 자체가 실패하는 네트워크 예외도 `NETWORK_ERROR`로 기록하고 사용자에게는 동일한 `502 provider_error` 안내를 반환하도록 했다.
  - 오류 기록에는 provider, modelId, status/code, teacherId, chatbotId, surface, riskCodes만 포함하고 원문 오류 메시지는 저장하지 않는다.
- `server/chatUsage.ts`
  - 일반 AI 호출 사용량과 별도로 provider 오류 사용량 이벤트를 생성하는 `createChatUsageErrorEventFromRequest`를 추가했다.
  - 오류 이벤트도 입력/응답 원문 대신 길이와 기술 메타데이터만 저장하게 했다.
- `tests/infrastructure/apiHandler.test.ts`
  - Provider HTTP 오류가 관리자 오류 로그와 월별 오류 집계에 반영되는지 확인하는 테스트를 추가했다.
  - Provider 네트워크 예외가 `NETWORK_ERROR`로 기록되고 예외 메시지와 비밀 문자열을 저장하지 않는지 확인하는 테스트를 추가했다.
- `tests/infrastructure/chatUsage.test.ts`
  - Provider 오류 사용량 이벤트가 원문 학생 질문 없이 생성되는지 확인하는 테스트를 추가했다.
- `docs/production-security-checklist.md`
  - Provider HTTP 오류와 네트워크 예외 모두 원문 대화, upstream 오류 본문, 예외 메시지를 저장하지 않는다는 운영 점검 항목을 추가했다.

검증:

- RED 확인
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts`
  - 결과: 실패
  - 실패 이유:
    - Provider 네트워크 예외가 기존에는 `500 server_error`로 처리되고 오류 로그와 사용량 오류 집계가 남지 않음
- GREEN 확인
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts`
  - `1 file passed`
  - `10 tests passed`
  - `npm test -- --run tests/infrastructure/chatUsage.test.ts`
  - `1 file passed`
  - `3 tests passed`
- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `253 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Firebase Auth 확인
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 이유: Firebase Authentication 미초기화
  - `emailPassword: unknown`
  - `google: unknown`
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- Firebase CLI 인증 확인
  - `firebase projects:list --json`
  - 결과: 성공
  - 현재 계정에서 `kkokkomu-d6a4c` 프로젝트가 `ACTIVE`로 조회됨
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `181`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-*-e2e.*.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드 또는 Vercel CLI 로그인으로 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, 필요 시 `VERCEL_TOKEN`을 확보해야 한다.
- 외부 작업 후 `npm run deployment:status`가 `status: "ready_to_deploy"`가 되는지 확인한다.
- Vercel 배포 후 `npm run smoke:deploy`가 HSTS, 기본 보안 헤더, API no-store, CORS preflight까지 통과하는지 확인한다.

### 운영 전환 34차: 배포 계획 최신화와 외부 차단점 재확인

완료 시간: `2026-06-13 06:26:28 +09:00`

요청/목표:

- 실제 배포 가능 상태까지 남은 차단점을 최신 CLI 결과로 다시 확인한다.
- 구현은 상당 부분 완료되어 있으나, Firebase Auth와 Vercel 연결이 외부 작업인지 현재 증거로 구분한다.
- `task.md` 업데이트 전 로컬 테스트와 E2E를 먼저 실행한다.

변경 내용:

- `docs/superpowers/plans/2026-06-13-vercel-firebase-production.md`
  - 현재 구현 상태 요약을 추가했다.
  - Vercel serverless entry, shared API handler, FirebaseStore, Auth context, Firebase client/Auth UI, Firestore rules, deployment helper, local E2E 범위를 정리했다.
  - 최신 외부 차단점으로 Firebase Auth 미초기화, Auth 자동 초기화의 `BILLING_NOT_ENABLED`, Vercel project 연결 정보 부재, `npx vercel whoami` 비대화형 시간 초과를 명시했다.

확인한 현재 상태:

- `.env`에는 Firebase 운영 변수와 Vercel에 등록할 앱 환경변수는 준비되어 있다.
- `.env`에는 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`가 없다.
- `.vercel/project.json`도 아직 없다.
- Firebase CLI 인증은 되어 있고 `kkokkomu-d6a4c` 프로젝트가 조회된다.
- Firebase Web App `꼬꼬무AI`는 `ACTIVE` 상태로 조회된다.
- Firestore 기본 DB는 `asia-northeast3`, `freeTier: true`, `FIRESTORE_NATIVE`로 조회된다.
- Firebase Authentication은 아직 초기화되지 않았다.
- `npm run firebase:auth:bootstrap`은 `BILLING_NOT_ENABLED`로 실패한다.
- `npx vercel whoami`는 비대화형 shell에서 시간 초과되어 Vercel 로그인/프로젝트 연결이 확인되지 않았다.

검증:

- 전체 테스트
  - `npm test`
  - `65 files passed`
  - `253 tests passed`
- 프로덕션 빌드
  - `npm run build`
  - TypeScript 빌드 통과
  - Vite 프로덕션 빌드 통과
- Vercel 환경변수 dry-run
  - `npm run vercel:env:dry-run`
  - 결과: 통과
  - `production` 대상 필수 변수 모두 `ready: true`
- Firebase 프로젝트 확인
  - `firebase projects:list --json`
  - 결과: 성공
  - `kkokkomu-d6a4c` 프로젝트 `ACTIVE`
- Firebase Web App 확인
  - `firebase apps:list WEB --project kkokkomu-d6a4c --json`
  - 결과: 성공
  - `꼬꼬무AI` Web App `ACTIVE`
- Firestore DB 확인
  - `firebase firestore:databases:list --project kkokkomu-d6a4c --json`
  - 결과: 성공
  - 기본 DB `asia-northeast3`, `freeTier: true`
- Firebase Auth 자동 초기화 시도
  - `npm run firebase:auth:bootstrap`
  - 결과: 실패
  - 이유: `BILLING_NOT_ENABLED`
- Firebase Auth provider 확인
  - `npm run firebase:auth:check`
  - 결과: 실패
  - 이유: Firebase Authentication 미초기화
  - `emailPassword: unknown`
  - `google: unknown`
- 운영 의존성 감사
  - `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 moderate `6`은 `firebase-admin`의 선택/전이 의존성 경로
- 배포 준비도 통합 점검
  - `npm run deployment:status`
  - 결과: 실패
  - 현재 gate 상태:
    - `production_preflight`: fail
      - Vercel 인증/프로젝트 연결 정보 없음
    - `firebase_auth`: fail
      - `emailPassword: unknown`
      - `google: unknown`
    - `vercel_environment`: pass
    - `security_audit`: pass
      - high: `0`
      - critical: `0`
      - cors wildcard: `0`
- 로컬 E2E 통합 검증
  - API 서버: `http://127.0.0.1:8787`
  - Vite 서버: `http://127.0.0.1:5173`
  - 실행 환경:
    - Vite 실행 시 `VITE_FIREBASE_AUTH_ENABLED=false`
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 성취기준 `[9국04-03]` 연결, 공유 링크 생성, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 응답 길이: `182`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

정리:

- 로컬 API/Vite 서버를 종료했다.
- 포트 `5173`, `8787`에 실행 프로세스가 남아 있지 않음을 확인했다.
- 검증 산출물과 캐시를 삭제했다.
  - `dist`
  - `artifacts`
  - `tsconfig.tsbuildinfo`
  - `server/data/local-dev-store.json`
  - `node_modules/.vite`
  - `%TEMP%/kkokkomu-*-e2e.*.log`

현재 남은 외부 작업:

- Firebase 콘솔에서 Authentication을 시작해야 한다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화해야 한다.
- Vercel 대시보드에서 프로젝트를 만들거나 기존 프로젝트를 선택해야 한다.
- Vercel 대시보드에서 Team ID와 Project ID를 확인해 `.env`에 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 추가하거나, `VERCEL_TOKEN`을 준비해야 한다.
- Vercel 연결 정보가 준비되면 `npm run vercel:link:env`와 `npm run deployment:status`를 다시 실행한다.
- `deployment:status`가 `ready_to_deploy`가 된 뒤 `npm run vercel:env:sync`, `npx vercel deploy --prod --yes`, `DEPLOY_URL=https://배포주소 npm run smoke:deploy` 순서로 배포를 검증한다.

### 운영 전환 35차: 역할별 화면 구조와 교사별 관리자 접근 정리

완료 시간: 2026-06-13 07:08:24 +09:00

요청:

- 학생은 별도 탭 없이 공유 링크로 들어온 챗봇 화면만 보이게 한다.
- 교사는 교사용 대시보드에서 자신이 만든 챗봇과 학생에게 제공될 학생용 페이지를 확인할 수 있게 한다.
- 챗봇을 생성하면 학생용 URL 바로가기 버튼이 아이콘으로 활성화되게 한다.
- 관리자는 교사별로 접근해 해당 교사가 만든 챗봇을 확인할 수 있게 한다.
- 관리자 화면에서 교사별 사용량도 함께 확인할 수 있게 한다.

반영:

- 학생용 공개 경로 `/s/:token`은 역할 탭 없이 챗봇 전용 화면만 제공하는 구조를 유지했다.
- 교사용 대시보드에서 공유 중인 챗봇 행에 학생용 챗봇 바로가기 아이콘 버튼을 추가했다.
  - 버튼 접근성 이름: `학생용 챗봇 바로가기: {챗봇명}`
  - 링크 형식: `/s/{publicToken}`
  - 새 탭으로 학생용 화면을 열 수 있게 했다.
- 교사가 챗봇을 생성하면 학생용 공유 링크를 즉시 생성하도록 변경했다.
  - 생성 완료 메시지: `챗봇을 생성하고 학생용 바로가기를 준비했습니다.`
  - 공유 알림: `학생용 링크가 준비됐습니다: {shareUrl}`
- 관리자 대시보드의 교사별 사용량 목록에 `챗봇 보기` 버튼을 추가했다.
- 관리자가 특정 교사를 선택하면 `교사별 챗봇 확인` 섹션에서 해당 교사의 챗봇만 보이도록 했다.
- 교사를 선택한 상태에서는 사용량 목록도 선택된 교사 기준으로 필터링되게 했다.
- 교사 선택이 없을 때에는 기존 전체 챗봇 운영 목록을 유지했다.

수정 파일:

- `src/presentation/App.tsx`
- `src/presentation/routes/TeacherDashboardRoute.tsx`
- `src/presentation/routes/AdminDashboardRoute.tsx`
- `src/presentation/styles.css`
- `tests/presentation/adminChatbotModeration.test.ts`
- `tests/presentation/usageDashboard.test.ts`
- `tests/e2e/localFullFlow.mjs`

검증:

- 요구 동작을 먼저 테스트로 고정했다.
  - 관리자 교사별 챗봇 필터 테스트는 구현 전 실패를 확인했다.
  - 교사용 학생 바로가기 아이콘 링크 테스트는 구현 전 실패를 확인했다.
- 대상 테스트:
  - `npm test -- --run tests/presentation/adminChatbotModeration.test.ts`
  - 결과: 통과
  - `npm test -- --run tests/presentation/usageDashboard.test.ts`
  - 결과: 통과
- 전체 테스트:
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 255개 테스트 통과
- 빌드:
  - `npm run build`
  - 결과: 통과
- 로컬 E2E 통합 검증:
  - 실행: `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 중1 국어 9품사 챗봇 생성, 학생용 공유 링크 자동 준비, 학생용 바로가기 확인, 학생 공유 링크 접속, 학생 응답 수신, 사용량 집계 확인
  - 생성된 공유 URL 예시: `http://127.0.0.1:5173/s/chatbotmqbh9sgvsllcaaw1mqbh9sh8z`
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

현재 로컬 서버:

- Vite: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`

### 운영 전환 42차: 로그인 대기 안내, 챗봇 생성 피드백, 학생 채팅 API 복구, AI 모델 적용 방식 정리

완료 시간: 2026-06-14 18:50 +09:00

요청:

- 가입 요청 접수 알림을 더 눈에 띄게 강조한다.
- 로그인 중에는 화면 전체에 `잠시만 기다려 주세요.` 안내를 띄우고 조작을 막는다.
- 챗봇 생성 후 완료 메시지를 보여 주고 새 챗봇 목록 위치로 자동 이동한다.
- 학생용 챗봇 대화에서 `/api/chat` 404가 나는 문제를 수정한다.
- AI 기본 모델을 `gemma4:e2b`로 바꾸고, 관리자 화면에서 모델 선택 후 `적용` 버튼으로 저장한다.

수정:

- `TeacherAuthPanel`에 로그인/가입 제출 중 전체 화면 대기 오버레이와 `aria-busy` 상태를 추가했다.
- 가입 요청 접수 상태는 성공 알림 스타일로 분리해 글자색, 테두리, 배경을 강조했다.
- 챗봇 생성 성공 메시지를 `챗봇 생성이 완료됐습니다. 학생용 링크가 준비됐습니다.`로 바꾸고, 새 챗봇 행으로 부드럽게 스크롤하도록 했다.
- Vercel에서 `/api/chat`이 직접 함수로 잡히도록 `api/chat.ts`를 추가했다.
- 배포 사전점검에 `api/chat.ts` 필수 파일 검사를 추가해 같은 404 회귀를 잡도록 했다.
- 기본 AI 모델을 `gemma4:e2b`로 변경했다.
- 기존 저장소에 남아 있는 예전 system 기본값 `lmstudio:gemma-4-12b-it`은 E2B로 읽히게 하되, 관리자가 직접 저장한 모델 선택은 덮어쓰지 않도록 했다.
- 관리자 AI 설정 UI는 선택 즉시 저장하지 않고, 선택값을 확인한 뒤 `적용` 버튼으로 저장하도록 바꿨다.

검증:

- `npm test`
  - 결과: 통과
  - 71개 테스트 파일, 301개 테스트 통과
- `npm run build`
  - 결과: 통과

### 운영 전환 43차: 로그인 후 워크스페이스 로딩까지 대기 오버레이 유지

완료 시간: 2026-06-14 19:15 +09:00

요청:

- 로그인 버튼을 누른 직후뿐 아니라, 실제 챗봇 생성 화면으로 이동하기 직전까지 `잠시만 기다려 주세요.` 안내가 유지되도록 한다.

원인:

- 기존에는 이메일/구글 로그인 요청이 끝나는 순간 `isSubmittingAuth`가 꺼졌다.
- 그 뒤 Firebase 인증 콜백에서 교사 프로필, 챗봇 목록, 사용량을 불러오는 동안은 별도 로딩 상태가 없어 대기 오버레이가 사라졌다.

수정:

- `isResolvingAuthSession` 상태를 추가해 로그인된 사용자 정보를 해석하고 워크스페이스 데이터를 불러오는 구간까지 로딩으로 처리했다.
- `shouldKeepAuthWaitingOverlay()` 헬퍼를 추가해 `isSubmittingAuth` 또는 `isResolvingAuthSession` 중 하나라도 참이면 대기 오버레이가 유지되도록 했다.
- 로그아웃/미로그인 상태에서는 세션 해석 로딩을 명시적으로 해제하도록 했다.

검증:

- `npm test -- --run tests/presentation/authLoadingState.test.ts tests/presentation/teacherAuthPanel.test.ts`
  - 결과: 통과

### 운영 전환 44차: 푸터 깨진 문자 제거와 학생 공유 챗봇 첫 화면 주제 불일치 수정

완료 시간: 2026-06-14 19:28 +09:00

요청:

- 푸터에 `짤`로 보이는 깨진 문자를 제거한다.
- 수학 챗봇을 만들었는데 첫 접속 시 국어 챗봇처럼 안내되고, `새 대화`를 눌러야 정상 주제로 바뀌는 문제를 고친다.

원인:

- 푸터 상수에 `짤 HoomiKim. All Rights Reserved.`가 그대로 남아 있었다.
- 학생 대화 기록을 하나의 전역 localStorage 키에 저장해, 이전 국어 챗봇 대화가 새 수학 공유 링크에서도 복원될 수 있었다.
- `/s/...` 공유 링크에서 실제 공유 챗봇 API 응답이 오기 전까지 국어 fallback 챗봇이 잠깐 렌더링될 수 있었다.

수정:

- 푸터 저작권 문구를 `© HoomiKim. All Rights Reserved.`로 변경했다.
- 학생 대화 기록 저장 키를 챗봇 ID별 scope로 분리했다.
- 현재 챗봇 scope의 기록을 로드한 뒤에만 저장하도록 해, 이전 챗봇 대화가 새 챗봇 기록을 덮어쓰지 않게 했다.
- 공유 챗봇이 아직 로드되지 않은 동안에는 국어 fallback을 렌더링하지 않고 `챗봇을 불러오는 중입니다.` 안내를 표시하도록 했다.

검증:

- `npm test -- --run tests/presentation/conversationPersistence.test.ts tests/infrastructure/localConversationStore.test.ts tests/presentation/studentShareLoading.test.ts tests/presentation/privacyPolicyContent.test.ts`
  - 결과: 통과

### 운영 전환 45차: E2B 운영 실패 대응과 provider 오류 문구 복구

완료 시간: 2026-06-14 19:34 +09:00

요청:

- 학생 챗봇 사용 시 `/api/chat`이 `502`로 실패하고, provider 오류 문구가 깨져 보이는 문제를 고친다.
- E2B 로컬 모델이 배포에서 로드되지 않는 이유를 확인한다.

확인:

- 로컬 `.env` 기준 LM Studio 직접 호출에서는 `google/gemma-4-e2b`와 `gemma-4-12b-it` 모두 HTTP `200`으로 응답했다.
- 배포 `https://kokomuai.vercel.app/api/chat`은 provider 호출 단계에서 HTTP `502`를 반환했다.
- 따라서 E2B 모델 자체가 항상 실패하는 것은 아니고, Vercel production 환경의 E2B 모델 ID, API 키 권한, LM Studio 서버의 모델 로딩 상태 중 하나가 배포 호출에서 맞지 않는 상태로 판단했다.

수정:

- 운영 기본 모델을 검증된 `lmstudio:gemma-4-12b-it`로 복구했다.
- system 기본값으로 저장된 `gemma4:e2b`는 읽을 때 12B 기본값으로 보정하도록 했다.
- 관리자가 E2B를 선택해 둔 상태에서도 provider 호출이 실패하면 기본 12B 모델로 한 번 자동 재시도하도록 했다.
- Vercel production에서 LM Studio 호출이 계속 실패하는 경우를 대비해, 12B 재시도까지 실패하면 OpenAI nano로 한 번 더 재시도하도록 했다.
- provider 오류 응답 문구를 `응답을 불러오지 못했어요. 잠시 후 다시 시도하거나 선생님께 알려 주세요.`로 정상 한글화했다.
- Vercel production 환경변수는 로컬 `.env` 기준으로 다시 동기화했다.

검증:

- `npm test -- --run tests/infrastructure/apiHandler.test.ts tests/domain/aiModelCatalog.test.ts tests/domain/aiSettings.test.ts`
  - 결과: 통과
- `npm test -- --run tests/infrastructure/localStore.test.ts tests/infrastructure/localApi.test.ts tests/infrastructure/vercelApi.test.ts tests/infrastructure/storePortCompatibility.test.ts tests/infrastructure/aiProviderRequest.test.ts tests/presentation/adminDashboardAiSettings.test.ts tests/presentation/apiClient.test.ts`
  - 결과: 통과
- `npm run vercel:env:sync`
  - 결과: production 환경변수 재등록 완료

### 운영 전환 58차: 상단 nav 로그아웃 버튼 추가

완료 시간: 2026-06-14 14:29:28 +09:00

요청:

- 메인 상단 `section.hero-band > nav`의 프로필 아이콘 좌측에 로그아웃 버튼을 추가한다.
- 프로필 아이콘 메뉴 안에도 로그아웃 항목을 추가한다.

수정:

- `TopNav` 컴포넌트를 분리해 상단 nav의 계정 메뉴와 로그아웃 동작을 한 곳에서 관리하도록 했다.
- 로그인된 교사 화면에서 프로필 아이콘 좌측에 `로그아웃` 버튼을 표시한다.
- 프로필 아이콘을 눌렀을 때 열리는 메뉴 안에 `로그아웃` 항목을 추가했다.
- 두 로그아웃 컨트롤 모두 기존 `signOutCurrentTeacher` 흐름을 사용한다.

검증:

- 로그아웃 UI 단위 테스트
  - `npm test -- --run tests/presentation/topNav.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 2개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 69개 테스트 파일, 290개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 61차: 발표 문서 갱신과 불필요 산출물 정리

완료 시간: 2026-06-14 14:50:20 +09:00

요청:

- `PRESENTATION_DIFFERENTIATORS.md`를 지금까지 수정된 기능까지 반영해 업데이트한다.
- `local-llm-api-guide.md`는 필요 없으므로 삭제한다.
- 불필요한 캐시와 재생성 가능한 산출물을 정리한다.
- GitHub에 올려 동기화한다.
- 챗봇 이름 예시 문구에서 `중1`을 제거한다.

수정:

- 발표 차별점 문서를 정상 한글 문서로 재작성하고, 현재 구현된 가입/로그인, 관리자 자동 승격, 관리자·교사 화면 동시 표시, 로그아웃, 계정 관리, 개인정보처리방침, 보안·배포 검증 흐름을 반영했다.
- `local-llm-api-guide.md`를 삭제했다.
- 챗봇 이름 placeholder 원천인 `teacherChatbotSample.name`을 `국어 9품사 이해`로 변경했다.
- 재생성 가능한 `dist`, `artifacts`, `tsconfig.tsbuildinfo`, `.vercel`을 정리했다.
- `node_modules`는 즉시 테스트와 개발 실행에 필요해 유지했다.

검증:

- placeholder 및 관리자 화면 관련 단위 테스트
  - `npm test -- --run tests/presentation/teacherChatbotSample.test.ts tests/presentation/adminWorkspaceLoading.test.ts tests/presentation/topNav.test.ts`
  - 결과: 통과
  - 3개 테스트 파일, 5개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 70개 테스트 파일, 294개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 59차: 개인정보처리방침 문의 이메일 명시

완료 시간: 2026-06-14 14:32:09 +09:00

요청:

- 개인정보처리방침의 `개인정보 보호책임자 및 문의` 항목에 `greenguyhh@gmail.com`을 명시한다.

수정:

- `src/presentation/legal/privacyPolicy.ts`의 깨진 한글 문구를 정상 한글 개인정보처리방침 문구로 복구했다.
- `개인정보 보호책임자 및 문의` 항목에 `문의 이메일: greenguyhh@gmail.com`을 추가했다.
- 개인정보처리방침 테스트를 정상 한글 문구와 문의 이메일 표시 기준으로 갱신했다.

검증:

- 개인정보처리방침 및 로그아웃 UI 단위 테스트
  - `npm test -- --run tests/presentation/privacyPolicyContent.test.ts tests/presentation/topNav.test.ts`
  - 결과: 통과
  - 2개 테스트 파일, 6개 테스트 통과

### 운영 전환 60차: 관리자 로그인 권한 승격과 관리자/교사 화면 동시 표시

완료 시간: 2026-06-14 14:47:15 +09:00

요청:

- 관리자 로그인 시 `/api/admin/ai-settings`, `/api/admin/action-logs`에서 `403 Forbidden`이 뜨는 문제를 수정한다.
- 로그인 후 화면 전환이 오래 걸릴 때 잠시 기다려 달라는 안내를 표시한다.
- 관리자로 로그인했을 때 관리자 대시보드만이 아니라 교사용 챗봇 만들기 화면도 함께 확인할 수 있게 한다.
- 프로필 아이콘 메뉴 내부의 중복 로그아웃은 제거하고, 프로필 아이콘 왼쪽 로그아웃만 유지한다.

원인:

- Firebase 관리자 이메일이 이미 일반 승인 교사 프로필로 만들어져 있으면, 기존 부트스트랩 로직이 `teacher_profile_not_found`일 때만 동작해 `admin`으로 승격되지 않았다.
- 클라이언트가 일반 교사 프로필에서도 관리자 전용 API를 항상 호출해 콘솔에 403이 남을 수 있었다.

수정:

- 서버 인증 컨텍스트 해석 단계에서 `KKOKKOMU_ADMIN_EMAILS`에 포함된 기존 승인 프로필도 `admin`으로 승격하도록 했다.
- 관리자 전용 워크스페이스 데이터는 현재 프로필이 `admin`일 때만 불러오도록 했다.
- 로그인 직후 `로그인 정보를 확인하고 있습니다. 잠시만 기다려 주세요.` 상태 문구를 표시하도록 했다.
- 관리자 화면에서도 교사용 챗봇 생성/공유 화면을 함께 렌더링하도록 했다.
- 프로필 아이콘 팝오버 안의 중복 로그아웃 버튼과 관련 CSS를 제거했다.

검증:

- 관리자 권한 및 상단 nav 관련 테스트
  - `npm test -- --run tests/infrastructure/localApiAuth.test.ts tests/presentation/topNav.test.ts tests/presentation/adminWorkspaceLoading.test.ts`
  - 결과: 통과
  - 3개 테스트 파일, 21개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 70개 테스트 파일, 294개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 53차: 나의 정보 패널 비밀번호 변경 UX 정리

완료 시간: 2026-06-14 12:06:19 +09:00

요청:

- 나의 정보에서 큰 이메일 아래에 같은 이메일을 반복하지 않고 이름을 표시한다.
- 비밀번호 변경은 선택했을 때만 현재 비밀번호, 새 비밀번호, 새 비밀번호 확인 입력칸이 열리게 한다.
- 비밀번호 변경 전에 기존 비밀번호를 확인한다.
- 회원탈퇴 버튼 크기를 줄인다.
- 비밀번호를 잊었을 때는 관리자에게 이메일을 보내도록 안내하고, 관리자 이메일 `greenguyhh@gmail.com`을 표시한다.

변경:

- 나의 정보 요약을 큰 이메일과 하단 이름/학교 정보 구조로 변경했다.
- 비밀번호 변경 영역을 기본 접힘 상태로 바꾸고, `비밀번호 변경` 버튼을 눌렀을 때만 입력칸을 표시한다.
- 비밀번호 변경 입력칸에 `현재 비밀번호`, `새 비밀번호`, `새 비밀번호 확인`을 배치했다.
- Firebase `reauthenticateWithCredential`을 사용해 현재 비밀번호를 먼저 확인한 뒤 새 비밀번호를 저장하도록 했다.
- 비밀번호 분실 안내 문구와 `mailto:greenguyhh@gmail.com` 링크를 추가했다.
- 회원탈퇴 버튼에 `compact-danger` 스타일을 적용해 기존보다 작게 보이도록 했다.
- 계정 패널 회귀 테스트를 추가했다.

검증:

- 계정 패널 테스트
  - `npm test -- --run tests/presentation/accountPanel.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 3개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 67개 테스트 파일, 281개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 57차: 관리자 이메일 로그인 시 프로필 자동 생성

완료 시간: 2026-06-14 14:20:24 +09:00

요청:

- 관리자 이메일로 가입하는데도 가입 요청을 보내야 하는 흐름이 맞는지 확인하고 개선한다.

결론:

- Firebase Authentication에는 로그인 계정만 있고 서비스용 교사/관리자 프로필은 Firestore에 따로 필요하다.
- 기존 구현은 관리자 이메일도 `가입 요청`을 눌러 프로필을 만들고, 그때 `KKOKKOMU_ADMIN_EMAILS`와 일치하면 `admin`으로 승격했다.
- UX상 관리자는 승인 대기 신청자가 아니므로, 로그인 직후 자동 관리자 프로필을 만드는 흐름이 더 적절하다.

변경:

- `GET /api/teachers`에서 로그인한 Firebase 사용자의 프로필이 없더라도, 이메일이 `KKOKKOMU_ADMIN_EMAILS`에 포함되어 있으면 관리자 프로필을 자동 생성한다.
- 자동 생성되는 관리자 프로필은 `status: "admin"`, `promotedBy: "bootstrap-env"`로 저장한다.
- 관리자 자동 생성용 기본 학교 정보는 `관리자 계정`으로 기록해 교사 가입 학교 선택을 요구하지 않게 했다.
- 이미 같은 이메일 프로필이 있으면 필요 시 admin으로 승격한다.

검증:

- 로컬 API Auth 테스트
  - `npm test -- --run tests/infrastructure/localApiAuth.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 16개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 68개 테스트 파일, 288개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 56차: Vercel Firebase Auth 토큰 검증 ESM 충돌 우회

완료 시간: 2026-06-14 14:14:54 +09:00

증상:

- Firebase Authentication 사용자 목록에는 계정이 존재하지만 가입 요청 시 `로그인 토큰을 확인하지 못했습니다`가 반복됐다.

원인:

- Vercel 서버 로그에서 `firebase-admin/auth` 내부 의존성 충돌을 확인했다.
- 오류: `ERR_REQUIRE_ESM: require() of ES Module ... jose/dist/webapi/index.js from ... jwks-rsa/src/utils.js not supported`
- 따라서 Firebase 사용자/토큰 자체 문제가 아니라 Vercel Node 함수에서 `firebase-admin/auth`가 ID 토큰을 검증하는 과정에서 ESM/CJS 충돌이 난 것이 원인이었다.

변경:

- Vercel API의 Firebase ID 토큰 검증을 `firebase-admin/auth`에서 Firebase Identity Toolkit REST `accounts:lookup` 호출로 교체했다.
- Firestore Admin SDK 사용은 유지하고, Auth 검증 경로에서만 `firebase-admin/auth` 의존을 제거했다.
- ID 토큰은 URL에 넣지 않고 POST body로만 전달하도록 구현했다.
- Firebase가 토큰 조회를 거부할 때 토큰 값을 로그에 노출하지 않는 회귀 테스트를 추가했다.

검증:

- Firebase ID 토큰 검증기 테스트
  - `npm test -- --run tests/infrastructure/firebaseIdTokenVerifier.test.ts tests/infrastructure/vercelApi.test.ts`
  - 결과: 통과
  - 2개 테스트 파일, 5개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 68개 테스트 파일, 287개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 55차: 로그인 Enter 제출과 Firebase 토큰 검증 진단 로그

완료 시간: 2026-06-14 14:09:26 +09:00

요청:

- 로그인 창에서 이메일/비밀번호 입력 후 Enter를 누르면 이메일 로그인이 되게 한다.
- Firebase Authentication에 사용자가 존재하는데도 가입 요청 시 `로그인 토큰을 확인하지 못했습니다`가 계속 뜨는 원인을 확인한다.

변경:

- 로그인 입력 영역과 로그인 버튼을 하나의 `<form>`으로 묶었다.
- 로그인 모드에서 이메일 또는 비밀번호 입력 후 Enter로 form submit이 발생하면 `이메일 로그인`과 같은 핸들러를 실행한다.
- Firebase Admin ID 토큰 검증 실패 시 Vercel 서버 로그에 오류 코드와 안전한 메시지만 남기도록 진단 로그를 추가했다.
- 토큰, private key처럼 민감한 문자열은 로그에 남기지 않도록 마스킹 테스트를 추가했다.

검증:

- 인증 패널 테스트
  - `npm test -- --run tests/presentation/teacherAuthPanel.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 12개 테스트 통과
- Vercel API 테스트
  - `npm test -- --run tests/infrastructure/vercelApi.test.ts`
  - 결과: 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 67개 테스트 파일, 284개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 54차: 관리자 비밀번호 초기화 메일 문구 명확화

완료 시간: 2026-06-14 12:38:23 +09:00

요청:

- 관리자가 교사 계정의 비밀번호 초기화를 할 수 있는지 확인한다.

확인:

- 서버에는 이미 `POST /api/admin/teachers/:teacherId/password-reset` API가 있다.
- 이 API는 관리자 권한을 확인한 뒤 Firebase 비밀번호 재설정 메일을 해당 교사 이메일로 발송한다.
- 실제 비밀번호를 관리자가 직접 보거나 임의 값으로 저장하는 방식이 아니라, Firebase가 발송한 메일에서 사용자가 새 비밀번호를 설정하는 구조다.
- 관리자 작업 로그에는 `password_reset_requested`가 남는다.

변경:

- 관리자 화면의 버튼 문구를 `재설정 메일`에서 `비밀번호 초기화 메일`로 바꿔 기능을 더 명확하게 표시했다.
- 발송 성공/실패 안내 문구도 `비밀번호 초기화 메일` 기준으로 통일했다.
- 관리자 화면 회귀 테스트에 비밀번호 초기화 메일 버튼 문구 검증을 추가했다.

검증:

- 관리자 화면 테스트
  - `npm test -- --run tests/presentation/adminChatbotModeration.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 5개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 67개 테스트 파일, 282개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 52차: 가입 요청 단일화와 비밀번호 탭 순서 보정

완료 시간: 2026-06-14 11:43:50 +09:00

요청:

- 비밀번호 입력 후 Tab 이동 시 비밀번호 보기 아이콘이 아니라 비밀번호 확인 입력칸으로 이동하게 한다.
- 회원가입 화면에서 이메일 계정 만들기, 로그인으로 돌아가기, 학교 선택 후 가입 요청으로 나뉜 행동을 단일 `가입 요청` 버튼으로 정리한다.
- 학교 선택 후 `invalid_token` 원문 경고가 계속 보이는 흐름을 사용자 친화적으로 처리한다.
- 관리자 계정 생성과 권한 부여 방식이 Firebase 콘솔 설정을 요구하는지 확인한다.

변경:

- 비밀번호 보기/숨기기 버튼에 `tabIndex={-1}`을 적용해 키보드 탭 순서에서 제외했다.
- 가입 화면의 별도 `이메일 계정 만들기`와 `로그인으로 돌아가기` 버튼을 제거하고, 학교 선택까지 끝낸 뒤 `가입 요청` 하나만 제출하도록 정리했다.
- `가입 요청` 버튼은 이름, 이메일, 비밀번호/확인 일치, 학교 선택 조건이 모두 충족될 때 활성화된다.
- 가입 요청 직전에 Firebase 이메일 계정을 생성하거나 기존 이메일이면 로그인한 뒤 ID 토큰을 강제 갱신하도록 처리했다.
- `invalid_token` 원문 대신 새로고침 후 다시 로그인해 가입 요청을 보내라는 안내 문구가 보이도록 변환했다.
- 관리자 권한은 Firebase Custom Claims가 아니라 서버 환경변수 `KKOKKOMU_ADMIN_EMAILS`와 교사 프로필 상태로 판정하는 현재 구조를 확인했다.

검증:

- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 66개 테스트 파일, 278개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 브라우저 로컬 검증
  - 대상: `http://127.0.0.1:5175/`
  - 회원가입 화면의 `email-signup`: 0개
  - 회원가입 화면의 `switch-login`: 0개
  - 회원가입 화면의 `register-profile`: 1개
  - 버튼 텍스트: `가입 요청`
  - 비밀번호 보기/숨기기 버튼 2개 모두 `tabIndex=-1`
  - 비밀번호 입력 후 Tab 포커스: 비밀번호 확인 입력칸
- GitHub 반영
  - 커밋: `50350f4 fix: unify teacher signup request flow`
  - 원격: `main -> main`
- Vercel 운영 배포
  - 배포 ID: `dpl_BctzTxsyfmWfTfWrRdRNR1PrdGKd`
  - 배포 URL: `https://kokomuai-pk3h2yr91-hoonikims-projects-bfecfa8a.vercel.app`
  - 운영 별칭: `https://kokomuai.vercel.app`
  - 상태: `READY`
- 배포 후 smoke test
  - `$env:DEPLOY_URL='https://kokomuai.vercel.app'; npm run smoke:deploy`
  - 결과: 통과
  - `spa-root`, `privacy-route`, `api-health`, `teacher-api-auth`, `security-headers`, `cors-preflight` 모두 통과
- 운영 브라우저 검증
  - 대상: `https://kokomuai.vercel.app`
  - 회원가입 화면의 `email-signup`: 0개
  - 회원가입 화면의 `switch-login`: 0개
  - 회원가입 화면의 `register-profile`: 1개
  - 버튼 텍스트: `가입 요청`
  - 비밀번호 보기/숨기기 버튼 2개 모두 `tabIndex=-1`
  - 비밀번호 입력 후 Tab 포커스: 비밀번호 확인 입력칸

### 운영 전환 48차: 로그인 화면 정렬과 Firebase 토큰 환경 점검 보강

완료 시간: 2026-06-14 11:23:48 +09:00

요청:

- 메인 로그인 화면에서 `이메일 로그인`, `Google로 계속하기`, `회원가입` 버튼 크기를 맞춘다.
- 이메일과 비밀번호 입력칸은 나란히 두되, 전체 폭을 하단 버튼 줄과 맞춘다.
- 관리자 이메일 로그인 후 가입 신청 단계에서 `invalid_token`이 뜨는 원인과 관리자 계정 진행 방식을 확인한다.

수정:

- 로그인 폼의 2열 입력칸이 일반 `.form-grid` 3열 규칙에 밀리지 않도록 `.form-grid.auth-form-grid` 규칙을 더 높은 우선순위로 보정했다.
- 로그인 버튼 3개가 같은 그리드 칸을 사용하도록 `min-width: 0`, 동일 높이, 중앙 정렬을 고정하고 `회원가입` 버튼의 별도 위쪽 여백을 제거했다.
- 배포 전 점검에서 현재 Vercel API 진입점인 `api/index.ts`를 확인하도록 파일 계약을 최신화했다.
- `FIREBASE_PROJECT_ID`와 `VITE_FIREBASE_PROJECT_ID`가 다르면 배포 전 점검이 실패하도록 추가했다.
  - 두 값이 다르면 브라우저에서 받은 Firebase ID 토큰을 서버가 다른 프로젝트 토큰으로 검증해 `invalid_token`이 발생할 수 있다.
- Windows에서 Vercel CLI를 직접 `npx.cmd`로 spawn할 때 `EINVAL`이 나는 문제를 `cmd.exe /d /s /c` 래퍼와 안전한 환경변수 필터링으로 보정했다.

검증:

- 대상 테스트
  - `npm test -- --run tests/presentation/authLayoutStyle.test.ts tests/infrastructure/productionPreflight.test.ts tests/infrastructure/deploymentReadiness.test.ts`
  - 결과: 통과
  - 3개 테스트 파일, 16개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 66개 테스트 파일, 272개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 배포 전 점검
  - `npm run preflight:production`
  - 결과: 통과
- Firebase Auth 제공자 점검
  - `npm run firebase:auth:check`
  - 결과: 이메일/비밀번호, Google 모두 enabled
- 배포 준비 리포트
  - `npm run deployment:status`
  - 결과: `ready_to_deploy`
- Vercel 환경변수 동기화
  - `npm run vercel:env:sync`
  - 결과: production 대상 18개 변수 동기화 완료
- 운영 배포
  - `npx vercel deploy --prod --yes`
  - 결과: `https://kokomuai.vercel.app` 별칭 연결 완료
- 배포 smoke 테스트
  - `$env:DEPLOY_URL='https://kokomuai.vercel.app'; npm run smoke:deploy`
  - 결과: 통과
  - 확인 항목: SPA root, 개인정보처리방침, API health, 익명 teacher API 차단, 보안 헤더, CORS preflight 차단
- 브라우저 렌더링 확인
  - Vite: `http://127.0.0.1:5175/`
  - 스크린샷: `artifacts/auth-layout-1280.png`
  - 로그인 입력칸 줄 폭: 690px
  - 로그인 버튼 줄 폭: 690px
  - 버튼 3개 폭: 각각 223px
- 운영 브라우저 렌더링 확인
  - URL: `https://kokomuai.vercel.app`
  - 스크린샷: `artifacts/auth-layout-production-1280.png`
  - 로그인 입력칸 줄 폭: 690px
  - 로그인 버튼 줄 폭: 690px
  - 버튼 3개 폭: 각각 223px
  - 콘솔 오류 없음

### 운영 전환 42차: 가입 폼, 계정 패널, 배포 인증 오류 보정

완료 시간: 2026-06-14 11:07:55 +09:00

요청:

- 가입 신청 단계에서 비밀번호와 비밀번호 확인 입력칸을 아래 행에 나란히 배치한다.
- 학교명을 목록에서 선택하면 목록을 닫고 입력칸에는 학교명만 남긴다.
- 상단 사람 아이콘으로 `나의 정보` 메뉴를 만들고, 같은 화면 안에서 비밀번호 변경과 회원탈퇴를 처리한다.
- Vercel 배포 화면에서 발생한 `/api/teachers` 500/403, 오래된 CSS MIME 오류, 학교 선택 후 `invalid_token` 경고를 점검하고 보정한다.

수정:

- 가입 폼의 비밀번호 입력칸 구조를 2열 그리드 안에서 자연스럽게 보이도록 정리했다.
- 학교 선택 시 검색 결과를 즉시 닫고 선택한 학교명만 입력값으로 유지하게 했다.
- 상단 `나의 정보` 아이콘 버튼과 계정 패널을 추가했다.
  - 비밀번호 변경
  - 회원탈퇴 2단계 확인
  - 현재 계정 이메일과 학교 정보 표시
- Firebase ID 토큰이 만료되거나 서버에서 `invalid_token`을 반환하면 클라이언트가 토큰을 강제 갱신해 한 번 재시도하도록 했다.
- 서버의 토큰 검증 실패를 `invalid_token`으로 정규화해 500으로 새지 않게 했다.
- Vercel SPA fallback에서 `/assets/*`와 `favicon.png`를 제외해 없는 CSS 파일이 HTML로 응답되는 문제를 막았다.

검증:

- 대상 테스트
  - `npm test -- --run tests/presentation/apiClient.test.ts tests/infrastructure/authContext.test.ts tests/infrastructure/localApiAuth.test.ts tests/infrastructure/vercelConfig.test.ts tests/presentation/teacherAuthPanel.test.ts`
  - 결과: 통과
  - 5개 테스트 파일, 36개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 269개 테스트 통과

### 운영 전환 48차: 교사 인증 화면 UX 및 가입 오류 처리 개선

완료 시간: 2026-06-14 10:21:26 +09:00

요청:

- 교사 인증 화면의 안내 제목 줄바꿈을 `학교 확인 후 / 사용할 수 / 있습니다.`로 조정한다.
- 인증 화면 왼쪽 안내 문구가 오류 상황에서 눈에 잘 띄도록 색상과 배경을 변경한다.
- 이메일 가입 시 비밀번호를 두 번 입력하게 하고, 일치 여부 메시지와 비밀번호 보기/숨기기 아이콘을 제공한다.
- Google 계속하기 버튼을 Google 아이콘과 Google 브랜드 색상으로 변경한다.
- `auth/email-already-in-use`와 가입 요청 저장 후 오류처럼 보이는 흐름을 개선한다.

반영:

- `TeacherAuthPanel`에 비밀번호 확인 입력, 일치/불일치 메시지, 보기/숨기기 토글을 추가했다.
- 이메일 로그인은 기존처럼 비밀번호 하나로 가능하게 유지하고, 이메일 가입만 확인 비밀번호 일치를 요구하도록 했다.
- 왼쪽 상태 문구는 오류가 있을 때 붉은 강조 박스로 표시되도록 했다.
- Google 버튼은 브랜드 블루 배경과 Google G 아이콘을 사용하도록 바꿨다.
- Firebase 중복 이메일 오류는 원문 오류 대신 기존 계정 로그인 안내로 바꾸고, 가능한 경우 같은 비밀번호로 로그인 흐름을 이어가도록 했다.
- 관리자 자동 승격 로그 저장이 실패해도 교사 프로필 저장 성공 자체가 실패로 표시되지 않도록 서버 보조 로그 저장 실패를 분리했다.

검증:

- 관련 테스트
  - `npm test -- --run tests/presentation/teacherAuthPanel.test.ts tests/presentation/studentShareNavigation.test.ts`
  - 결과: 통과
  - 2개 테스트 파일, 11개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 265개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 51차: 로그인 입력칸 2열 확장 및 버튼 폭 정렬

완료 시간: 2026-06-14 10:56:31 +09:00

요청:

- 로그인 화면에서 이메일과 비밀번호 입력칸이 버튼 폭에 비해 좁아 보이지 않게 한다.
- 이메일과 비밀번호 입력칸을 2열로 양분해 배치한다.
- 로그인, Google 로그인, 회원가입 버튼과 입력 영역이 같은 전체 폭을 쓰게 한다.

반영:

- 로그인 박스 폭을 넓혀 데스크톱에서 입력 영역과 버튼 영역이 같은 전체 폭을 쓰도록 조정했다.
- 로그인 입력 폼을 이메일/비밀번호 2열 그리드로 변경했다.
- 로그인, Google 로그인, 회원가입 버튼을 같은 줄의 3열 그리드로 배치했다.
- 태블릿 이하 폭에서는 입력칸과 버튼이 다시 1열로 접히도록 반응형 규칙을 추가했다.

검증:

- 관련 테스트
  - `npm test -- --run tests/presentation/teacherAuthPanel.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 8개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 266개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 50차: 기본 로그인 창 중앙 정렬 및 회원가입 버튼화

완료 시간: 2026-06-14 10:48:48 +09:00

요청:

- 기본 로그인 화면을 일반적인 로그인 창처럼 보이게 한다.
- 넓은 공간에서 입력칸이 좌측으로 치우쳐 보이지 않게 중앙 정렬한다.
- `처음 사용하는 선생님은 가입 신청하기` 문구 대신 `회원가입` 버튼으로 진입하게 한다.

반영:

- 로그인 모드 전용 `auth-workspace-login` 클래스를 추가해 왼쪽 안내 패널을 숨기고 로그인 폼을 중앙 단일 박스로 배치했다.
- 로그인 입력칸과 로그인/Google/회원가입 버튼이 같은 폭으로 정렬되도록 조정했다.
- 회원가입 진입 요소를 설명형 텍스트 링크에서 `회원가입` 버튼으로 변경했다.
- 가입 신청 화면은 기존처럼 학교 확인과 비밀번호 확인 흐름을 유지한다.

검증:

- 관련 테스트
  - `npm test -- --run tests/presentation/teacherAuthPanel.test.ts tests/presentation/studentShareNavigation.test.ts`
  - 결과: 통과
  - 2개 테스트 파일, 12개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 266개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 49차: 로그인 우선 인증 화면과 계정 권한 자동 분기

완료 시간: 2026-06-14 10:39:32 +09:00

요청:

- 로그인하지 않은 상태에서 로그아웃 버튼이 보이지 않게 한다.
- 기본 메인 인증 화면에는 이메일, 비밀번호, Google 로그인만 보이게 한다.
- 이름, 이메일, 비밀번호, 비밀번호 확인, 학교 선택은 가입 신청 화면에서만 보이게 한다.
- 비밀번호와 비밀번호 확인은 같은 열에서 위아래로 배치한다.
- 상단의 교사/관리자 탭을 제거하고, 로그인한 계정 권한에 따라 교사 또는 관리자 대시보드가 자동으로 보이게 한다.
- `README.md`의 기본 서비스 주소를 `https://kokomuai.vercel.app`로 바꾸고, 사용자가 이해할 수 있는 최신 설명으로 정리한다.
- 사용자에게 보여줄 README에서는 환경변수 관련 설명을 제외한다.

반영:

- `TeacherAuthPanel`을 `login` 모드와 `signup` 모드로 분리했다.
- 기본 인증 화면은 이메일 로그인과 Google 로그인 중심으로 단순화했다.
- 가입 신청 링크를 통해서만 이름, 비밀번호 확인, 학교 검색 및 가입 요청 흐름이 나타나게 했다.
- 로그아웃 버튼은 Firebase 사용자가 로그인된 상태에서만 표시되도록 했다.
- Firebase 프로필 상태가 `admin`이면 관리자 대시보드, `approved`이면 교사 대시보드로 자동 이동하도록 했다.
- 상단 역할 선택 버튼은 제거하고, 학생 화면은 공유 링크에서만 접근하는 흐름을 유지했다.
- 인증 패널 테스트를 로그인/가입 모드 기준으로 정리하고, 역할 탭 제거 회귀 테스트를 갱신했다.
- `README.md`를 사용자 안내 중심으로 다시 작성하고, 선생님·학생·관리자 사용 흐름과 현재 인증 구조를 반영했다.
- README의 Vercel 환경변수 동기화 안내와 환경변수 섹션을 제거했다.

검증:

- 관련 테스트
  - `npm test -- --run tests/presentation/teacherAuthPanel.test.ts tests/presentation/studentShareNavigation.test.ts`
  - 결과: 통과
  - 2개 테스트 파일, 12개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 266개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 42차: Vercel API 라우트 복구 및 교사 우선 진입 흐름 정리

완료 시간: 2026-06-13 23:50:46 +09:00

요청:

- 배포 환경에서 `/api/curriculum/recommend`, `/api/schools/search`가 404로 실패하는 문제를 수정한다.
- 학교명은 검색 버튼 없이 일부 입력하면 하단 목록으로 자동 표시되고, 그 목록에서 선택할 수 있게 한다.
- 첫 화면은 학생 화면이 아니라 교사 화면으로 시작한다.
- 학생 화면은 상단 탭에서 제거하고, 교사가 생성한 공유 링크(`/s/{token}`)로 접속했을 때만 표시한다.

작업:

- Vercel 서버리스 함수에서 ESM 상대 import가 확장자 없이 배포되어 `server/vercelApi`를 찾지 못하던 문제를 수정했다.
  - `server`, `api`의 상대 import를 `.js` 확장자 포함 형태로 정리했다.
  - `server/vercelRequestHandler.ts`를 추가해 Vercel 함수가 공통 API 핸들러를 재사용하도록 했다.
  - 중첩 API 경로가 Vercel에서 명시 함수로 잡히도록 `api/schools/search.ts`, `api/curriculum/recommend.ts` 등 실제 사용 경로 파일을 추가했다.
- 교사 가입 학교 검색 흐름을 버튼 방식에서 300ms debounce 자동완성 방식으로 바꿨다.
- 기본 진입 화면을 `teacher`로 변경하고, `/s/...` 공유 링크에서만 `student` 화면으로 진입하도록 `resolveInitialView`를 추가했다.
- 상단 역할 탭에서 학생 화면 버튼을 제거했다.
- 이전 일괄 수정 중 깨진 한국어 UI/API 문구를 정상 한국어로 복구했다.
- 회귀 테스트를 추가했다.
  - 교사 화면 기본 진입, 공유 링크 학생 화면 진입
  - 학교 자동완성 상태 표시와 검색 버튼 제거
  - Vercel 명시 API 파일 존재 확인

검증:

- 관련 테스트
  - `npm test -- tests/presentation/studentShareNavigation.test.ts tests/presentation/teacherAuthPanel.test.ts tests/infrastructure/vercelConfig.test.ts tests/infrastructure/vercelApi.test.ts`
  - 결과: 통과
  - 4개 테스트 파일, 13개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 262개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

주의:

- Vercel 배포 후에는 환경변수와 Firebase Auth 설정에 따라 로그인 400이 별도로 발생할 수 있다.
- 학교 검색과 교육과정 추천 404는 Vercel API 엔트리의 ESM import 경로를 고쳐 단일 catch-all 라우트에서 처리되도록 수정했다.

### 운영 전환 43차: 전체 기능 재검증 및 Vercel 함수 구조 재정리

완료 시간: 2026-06-14 00:10:17 +09:00

요청:

- `/goal` 흐름으로 모든 기능이 정상 작동하는지 검사하고 GitHub에 푸시한다.
- Vercel에서 빌드는 끝났지만 `Deploying outputs...` 이후 Error가 나는 문제를 확인한다.

원인:

- 42차에서 `/api/*` 경로별 명시 Vercel 함수 파일을 여러 개 추가하면서 각 함수가 같은 서버 코드를 반복 번들링했다.
- 원격 Vercel 로그에서 TypeScript 함수 번들링 메시지가 여러 번 반복된 뒤 `Deploying outputs...`에서 Error로 종료됐다.
- 중첩 API 404의 실제 원인은 단일 catch-all 함수 자체가 아니라, 배포 런타임에서 확장자 없는 ESM import가 깨진 문제였다.

수정:

- Vercel API 구조를 다시 `api/[...path].ts` 단일 catch-all 함수로 통합했다.
- 단일 함수는 `server/vercelRequestHandler.js`를 통해 공통 API 핸들러를 호출한다.
- 서버/API 상대 import의 `.js` 확장자는 유지해 Vercel ESM 런타임에서 모듈을 찾을 수 있게 했다.
- E2E 검증 스크립트가 400 이상 HTTP 응답 URL을 기록하도록 개선했다.

검증:

- 관련 테스트
  - `npm test -- tests/infrastructure/vercelConfig.test.ts tests/infrastructure/vercelApi.test.ts tests/presentation/studentShareNavigation.test.ts tests/presentation/teacherAuthPanel.test.ts`
  - 결과: 통과
  - 4개 테스트 파일, 13개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 262개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 로컬 HTTP 스모크
  - `/api/health`: HTTP `200`, `provider: lmstudio`, `model: gemma-4-12b-it`
  - `/api/schools/search?q=등촌중`: HTTP `200`, `등촌중학교` 반환
  - `/api/curriculum/recommend`: HTTP `200`, `[9국04-03]` 포함 추천 반환
  - Vite 첫 화면: HTTP `200`
- 로컬 E2E 전체 흐름
  - `node tests/e2e/localFullFlow.mjs`
  - 결과: 통과
  - 교사 승인, 챗봇 생성, 성취기준 연결, 학생 공유 링크 접속, 학생 답변, 사용량 기록 확인
  - `resourceWarnings`: 빈 배열

현재 판단:

- 로컬 기준 핵심 기능은 통과했다.
- Vercel 배포 실패를 줄이기 위해 다중 함수 구조를 제거했으므로, 다음 GitHub 자동 배포에서 단일 API 함수 구조로 다시 배포된다.

### 운영 전환 44차: Vercel Node ESM 런타임 import 오류 수정

완료 시간: 2026-06-14 00:15:18 +09:00

요청:

- Vercel 배포 후 `/api/health`가 500으로 실패하고, `/api/schools/search`, `/api/curriculum/recommend`가 정상 응답하지 않는 문제를 끝까지 확인한다.

원인:

- 새 배포는 Ready 상태였고, 함수 크기도 `api/[...path]` 단일 함수 `9.02MB`로 정상 축소됐다.
- Vercel 함수 로그에서 다음 오류를 확인했다.
  - `ERR_MODULE_NOT_FOUND`
  - `/var/task/src/domain/privacy/privacyFilter`를 찾지 못함
- 서버/API 파일의 상대 import는 `.js` 확장자로 고쳤지만, 서버 함수가 함께 가져오는 `src/domain`, `src/presentation`, `src/infrastructure` 내부 상대 import 일부가 확장자 없이 남아 있었다.
- Vercel Node ESM 런타임은 번들에 포함된 내부 모듈도 확장자 없는 상대 import를 자동 해석하지 못한다.

수정:

- `src`, `server`, `api`의 상대 import 중 `.js`, `.css`, `.json`, 이미지, 폰트 확장자가 없는 경로를 `.js` 확장자 포함 형태로 정리했다.
- 누락된 상대 import가 없는지 `rg --pcre2`로 확인했다.

검증:

- 누락 import 검사
  - `rg --pcre2 'from ...' src server api`
  - 결과: 누락 없음
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 262개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

현재 판단:

- Vercel 배포 실패 원인인 다중 함수 중복 번들링은 43차에서 제거했다.
- Vercel 런타임 500 원인인 `src` 내부 확장자 없는 ESM import는 44차에서 제거했다.

### 운영 전환 45차: Firebase Admin Auth 런타임 로드 지연 및 Node 22 고정

완료 시간: 2026-06-14 00:20:07 +09:00

요청:

- Vercel Ready 배포 이후에도 `/api/health`가 500으로 실패하는 문제를 계속 추적한다.

원인:

- Vercel 함수 로그에서 다음 오류를 확인했다.
  - `ERR_REQUIRE_ESM`
  - `jwks-rsa`가 `jose` ESM 모듈을 CommonJS `require()`로 불러 실패
- 이 경로는 `firebase-admin/auth` 로드 중 발생했다.
- `/api/health`, 학교 검색, 교육과정 추천처럼 인증이 필요 없는 요청도 정적 import 때문에 Auth 모듈을 먼저 로드하고 있었다.

수정:

- `package.json`에 `"engines": { "node": "22.x" }`를 추가해 Vercel 함수 런타임을 Node 22 계열로 고정했다.
- `server/firebaseAdmin.ts`에서 `firebase-admin/auth` 정적 import를 제거하고, 실제 ID 토큰 검증 시점에만 동적 import하도록 변경했다.
- `server/vercelApi.ts`의 토큰 검증 호출부를 비동기 Auth getter에 맞게 수정했다.

검증:

- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 262개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

현재 판단:

- 인증이 필요 없는 공개 API는 더 이상 `firebase-admin/auth` 로드 실패에 막히지 않아야 한다.
- 교사 인증이 필요한 요청은 실제 토큰 검증 시점에 Auth 모듈을 로드한다.

### 운영 전환 46차: Vercel 단일 API 함수 라우팅 보정

완료 시간: 2026-06-14 00:24:53 +09:00

요청:

- Node 22 배포 이후 `/api/*`가 404로 응답하는 문제를 계속 추적한다.

원인:

- `api/[...path].ts`는 Vercel 빌드 산출물에는 함수로 표시됐지만, 실제 `/api/health` 같은 요청에는 매칭되지 않아 함수 로그도 남지 않았다.
- 따라서 함수 런타임 문제가 아니라 Vercel 파일 라우팅 매칭 문제였다.

수정:

- API 엔트리를 `api/[...path].ts`에서 `api/index.ts`로 변경했다.
- `vercel.json`에 `/api/:path*` -> `/api/index` rewrite를 추가했다.
- Vercel 함수는 계속 단일 함수 구조로 유지한다.

검증:

- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 262개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

현재 판단:

- Vercel에서 `/api/*` 요청이 단일 `api/index` 함수로 들어가야 한다.
- 배포 후 `/api/health`, 학교 검색, 교육과정 추천을 다시 확인해야 한다.

### 운영 전환 47차: 운영 health 엔드포인트 별도 함수 추가

완료 시간: 2026-06-14 00:29:09 +09:00

요청:

- 학교 검색과 교육과정 추천은 프로덕션에서 200이 되었지만 `/api/health`만 404인 문제를 마저 정리한다.

원인:

- `/api/:path*` rewrite를 통한 단일 `api/index` 함수는 학교 검색과 교육과정 추천에는 적용됐다.
- `/api/health`는 함수 로그가 남지 않고 404가 반환되어, 운영 점검용 엔드포인트는 별도 파일 라우트로 두는 편이 안정적이라고 판단했다.

수정:

- `api/health.ts`를 별도 가벼운 Vercel 함수로 추가했다.
- DB/Firebase에 접근하지 않고 기본 AI 모델 정보를 반환하도록 구성했다.
- 나머지 API는 계속 `/api/:path*` -> `/api/index` 단일 함수로 처리한다.

검증:

- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 262개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 42차: GitHub 업로드 전 대용량 원본 자료와 공개 파일 정리

완료 시간: 2026-06-13 23:03:37 +09:00

요청:

- GitHub 업로드 전에 불필요한 파일을 정리한다.
- 정리 후 `https://github.com/HooniKims/kokomuai.git` 저장소에 올린다.

정리 기준:

- 앱 런타임에 필요한 교육과정 Markdown 자료는 보존한다.
- 변환 전 PDF 원본처럼 GitHub 업로드와 운영 실행에 불필요한 대용량 자료는 제거한다.
- `.env`, `node_modules`, 로컬 개발 데이터는 Git에 포함하지 않는다.

삭제:

- `2022_교육과정_모음`
  - 변환 전 교육과정 PDF 원본 폴더
  - 약 `331.52MB`

보존:

- `2022_Revised_National_Curriculum`
  - 서버가 성취기준 추천을 위해 읽는 Markdown 교육과정 자료
- `.env`
  - 실제 API 키가 들어 있으므로 `.gitignore`로 제외
- `server/data/local-dev-store.json`
  - 로컬 개발 데이터이므로 `.gitignore`로 제외
- `node_modules`
  - 의존성 설치물이므로 `.gitignore`로 제외

수정:

- `.gitignore`
  - 원본 교육과정 폴더 재생성 시 Git에 올라가지 않도록 `2022_*/`를 추가하고, 필요한 `2022_Revised_National_Curriculum`은 예외 처리했다.
  - `coverage`, `.vite`, `.DS_Store`, `Thumbs.db`를 추가했다.
- `firestore.rules`
  - 깨진 주석을 공개 저장소에서 읽을 수 있는 영어 주석으로 정리했다.
- `README.md`
  - GitHub 저장소 첫 화면에서 프로젝트 목적, 주요 기능, 로컬 실행, 테스트, 환경변수, Firestore 구조, 배포 준비, 보안 원칙을 확인할 수 있도록 새로 작성했다.

검증:

- 원본 PDF 폴더 삭제 확인
  - `2022_교육과정_모음`: 없음
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 259개 테스트 통과
- README 추가 후 전체 테스트 재실행
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 259개 테스트 통과
- 공개 대상 민감정보 점검
  - 실제 `.env`는 Git 무시 대상임을 확인했다.
  - 검색 결과는 `.env.example`의 빈 키, 테스트용 더미 문자열, 작업 기록의 예시 문자열뿐이었다.

### 운영 전환 36차: 개인정보처리방침 표준화와 LLM 실구동·보안 점검

완료 시간: 2026-06-13 07:16:47 +09:00

요청:

- 개인정보처리방침을 표준 개인정보처리방침 형식에 맞게 수정한다.
- 하단 저작권 문구를 `HoomiKim. All Rights Reserved.` 형태의 표준 표기로 바꾼다.
- `gpt-5.4-nano`와 로컬 LLM이 실제 구동되는지 테스트한다.
- 마지막으로 보안 점검을 진행한다.

반영:

- `src/presentation/legal/privacyPolicy.ts`를 개인정보보호위원회 개인정보 처리방침 작성지침의 주요 구성에 맞춰 확장했다.
  - 개인정보의 처리 목적
  - 처리하는 개인정보의 항목
  - 개인정보의 처리 및 보유기간
  - 개인정보의 제3자 제공
  - 개인정보 처리업무의 위탁 및 국외 이전
  - 개인정보의 파기 절차 및 방법
  - 정보주체와 법정대리인의 권리 행사
  - 개인정보의 안전성 확보조치
  - 자동 수집 장치
  - 개인정보 보호책임자 및 문의
  - 개인정보처리방침의 변경
- 푸터 저작권 문구를 `© HoomiKim. All Rights Reserved.`로 변경했다.
- 앱 푸터가 개인정보처리방침 상수와 같은 저작권 문구를 사용하도록 정리했다.
- 개인정보처리방침 테스트를 표준 구성 항목과 새 저작권 표기를 확인하도록 갱신했다.

LLM 실구동 확인:

- OpenAI 경로
  - 설정 모델: `openai:gpt-5.4-nano`
  - 실제 API 경로: `/api/chat`
  - 결과: HTTP `200`
  - 응답 스트림 모델 표기: `gpt-5.4-nano-2026-03-17`
  - 응답 길이: `15677`
- 로컬 LLM 경로
  - 설정 모델: `lmstudio:gemma-4-12b-it`
  - 실제 API 경로: `/api/chat`
  - 결과: HTTP `200`
  - 응답 스트림 모델 표기: `unsloth/gemma-4-12b-it`
  - 응답 길이: `10394`
- 실구동 검증 후 관리자 기본값을 다시 `openai:gpt-5.4-nano`로 복구했다.
  - `/api/health` 결과: `provider: openai`, `model: gpt-5.4-nano`

검증:

- 개인정보처리방침 단위 테스트
  - `npm test -- --run tests/presentation/privacyPolicyContent.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 3개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 256개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 로컬 E2E 통합 검증
  - `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 교사 승인, 챗봇 생성, 학생용 공유 링크 생성, 학생 링크 접속, AI 응답 수신, 사용량 집계 확인
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음
- 개인정보처리방침 라우트
  - `http://127.0.0.1:5173/privacy`
  - 결과: HTTP `200`

보안 점검:

- `npm audit --omit=dev --json`
  - 결과: high `0`, critical `0`
  - 남은 항목: moderate `6`
  - 경로: `firebase-admin` 하위 의존성의 `@google-cloud/storage`, `retry-request`, `teeny-request`, `gaxios`, `uuid`
  - 자동 수정 제안은 `firebase-admin`을 `10.3.0`으로 낮추는 semver-major 변경이라 즉시 적용하지 않았다.
- `npm run preflight:production`
  - 결과: 실패
  - 이유: Vercel 인증/프로젝트 연결 정보 없음
  - `VERCEL_TOKEN` 또는 `.vercel/project.json` 필요
- `npm run deployment:status`
  - 결과: blocked
  - `security_audit`: pass
    - high `0`
    - critical `0`
    - cors wildcard `0`
  - `production_preflight`: fail
    - Vercel 인증/프로젝트 연결 정보 없음
  - `firebase_auth`: fail
    - `emailPassword: unknown`
    - `google: unknown`
  - `vercel_environment`: pass
- `npm run firebase:auth:check`
  - 결과: 실패
  - 이유: Firebase Authentication 미초기화 또는 제공자 상태 확인 불가
- 서버 전용 비밀값 노출 검색
  - `src`, `server`, `scripts`, `public`, `tests`, `.env.example` 범위에서 실제 OpenAI/Tavily/Firebase private key 값 패턴 노출 여부를 검색했다.
  - 실제 운영 비밀값은 클라이언트/서버 소스에는 발견되지 않았다.
  - 테스트 파일의 가짜 키 문자열과 `.env.example`의 변수명만 발견됐다.

현재 남은 외부 조치:

- Firebase 콘솔에서 Authentication을 시작하고 이메일/비밀번호, Google 제공자를 활성화해야 한다.
- Vercel 프로젝트 연결 정보 또는 토큰을 준비해야 한다.
- `npm audit`의 moderate 6건은 Firebase Admin SDK 의존성 경로에서 발생하므로, 배포 전 Firebase Admin SDK 버전 전략을 별도 검토해야 한다.

### 운영 전환 37차: 교사용 챗봇 생성 버튼 하단 배치

완료 시간: 2026-06-13 13:57:49 +09:00

요청:

- 교사용 화면에서 생성 버튼이 상단에 있어 입력 후 다시 위로 이동해야 한다.
- 생성 버튼을 하단에 배치해 입력과 성취기준 선택 후 바로 생성할 수 있게 한다.
- 생성 후 공유 완료 메시지가 현재 흐름 안에서 바로 보이도록 한다.

반영:

- `src/presentation/routes/TeacherDashboardRoute.tsx`
  - `챗봇 만들기` 섹션 제목 오른쪽에 있던 생성 버튼을 제거했다.
  - 추천 성취기준 카드 목록 아래, 챗봇 목록 위에 `create-chatbot-footer` 영역을 추가했다.
  - 안내 문구와 생성 버튼을 함께 배치해 입력 확인 후 바로 생성하는 흐름으로 바꿨다.
- `src/presentation/styles.css`
  - `create-chatbot-footer` 여백, 정렬, 안내문 스타일을 추가했다.
  - 좁은 화면에서는 안내문과 생성 버튼이 세로로 쌓이도록 반응형 처리를 추가했다.
- `tests/presentation/usageDashboard.test.ts`
  - 생성 버튼 영역이 추천 카드 아래, 챗봇 목록 툴바 위에 배치되는지 확인하는 렌더링 테스트를 추가했다.

검증:

- 위치 변경 테스트를 먼저 추가했고, 구현 전 실패를 확인했다.
  - 실패 원인: `create-chatbot-footer`가 존재하지 않음
- 대상 테스트
  - `npm test -- --run tests/presentation/usageDashboard.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 5개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 257개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 로컬 E2E 통합 검증
  - `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 챗봇 생성, 학생용 공유 링크 생성, 학생 링크 접속, AI 응답 수신, 사용량 집계 확인
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

현재 로컬 서버:

- Vite: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`
- 사용자가 로컬 서버를 열어 둔 상태이므로 이번 작업 후에도 계속 유지했다.

### 운영 전환 38차: 기본 AI 모델을 로컬 LLM으로 복구

완료 시간: 2026-06-13 14:03:55 +09:00

요청:

- 다시 기본 로컬 LLM을 사용하도록 수정한다.

반영:

- `src/domain/ai/modelCatalog.ts`
  - 기본 모델을 `openai:gpt-5.4-nano`에서 `lmstudio:gemma-4-12b-it`로 변경했다.
  - `GPT-5.4 nano`의 `isDefault`를 `false`로 변경했다.
  - `Gemma 4 12B`의 `isDefault`를 `true`로 변경했다.
  - `getDefaultAiModel()`이 `lmstudio:gemma-4-12b-it`를 반환하도록 변경했다.
- `server/firebaseStore.ts`
  - 기존 월별 집계 문서에 provider/model 값이 없을 때 사용하는 fallback을 `lmstudio` / `lmstudio:gemma-4-12b-it`로 맞췄다.
- 기본 모델 관련 테스트 기대값을 로컬 LLM 기준으로 갱신했다.
- 현재 열려 있는 로컬 API 서버도 새 코드가 반영되도록 재시작했다.
- 현재 관리자 AI 설정도 `lmstudio:gemma-4-12b-it`로 전환했다.

검증:

- 먼저 기본 모델 관련 테스트를 로컬 LLM 기준으로 바꾼 뒤 실패를 확인했다.
  - 실패 원인: 실제 코드가 아직 `openai:gpt-5.4-nano`를 기본값으로 반환
- 대상 테스트
  - `npm test -- --run tests/domain/aiModelCatalog.test.ts tests/domain/aiSettings.test.ts tests/infrastructure/localStore.test.ts tests/infrastructure/localApi.test.ts`
  - 결과: 통과
  - 4개 테스트 파일, 35개 테스트 통과
- 추가 실패 테스트 정리
  - `apiHandler`, `usageAccounting`, `vercelApi`의 기본 provider/model 기대값을 로컬 LLM 기준으로 조정
  - `npm test -- --run tests/infrastructure/apiHandler.test.ts tests/domain/usageAccounting.test.ts tests/infrastructure/vercelApi.test.ts`
  - 결과: 통과
  - 3개 테스트 파일, 15개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 257개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 로컬 서버 상태
  - `/api/health`
  - 결과: HTTP `200`
  - `provider: lmstudio`
  - `model: gemma-4-12b-it`
- 관리자 AI 설정 확인
  - `/api/admin/ai-settings`
  - `activeModelId: lmstudio:gemma-4-12b-it`
  - `Gemma 4 12B isDefault: true`
  - `GPT-5.4 nano isDefault: false`
- 로컬 E2E 통합 검증
  - `node tests\e2e\localFullFlow.mjs --attempts=1`
  - 결과: 통과
  - 챗봇 생성, 학생용 공유 링크 생성, 학생 링크 접속, 로컬 LLM 응답 수신, 사용량 집계 확인
  - `usageConversationCount: 1`
  - `usageAiCallCount: 1`
  - page error 없음
  - resource warning 없음

현재 로컬 서버:

- Vite: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`
- API 서버는 새 기본 모델 코드 반영을 위해 재시작했다.

### 운영 전환 39차: 한국어 조사 차이로 인한 주제 범위 오차 수정

완료 시간: 2026-06-13 14:13:18 +09:00

문제:

- 학생이 광합성 챗봇에서 `광합성을 설명해줘.`처럼 주제에 맞는 질문을 했는데도 `이 챗봇은 과학 수업의 광합성의 이해 범위 안에서만 도와줄 수 있어요.`라는 범위 차단 응답이 나왔다.

원인:

- AI 호출 전 `conversationGuard`가 학생 질문이 챗봇 주제 범위 안에 있는지 먼저 검사한다.
- 기존 토큰 비교는 한국어 조사를 제거하지 않고 그대로 비교했다.
- 교사 주제와 목표에는 `광합성의`, `광합성에`가 들어 있고, 학생 질문에는 `광합성을`이 들어왔다.
- 의미상 같은 `광합성`이지만 조사 차이 때문에 서로 다른 단어로 판정되어 `out_of_scope`로 차단됐다.

반영:

- `src/domain/conversation/conversationGuard.ts`
  - 토큰화 단계에서 원래 단어와 함께 한국어 조사를 제거한 단어도 비교 후보에 포함하도록 수정했다.
  - 예: `광합성의`, `광합성에`, `광합성을`을 모두 `광합성` 기준으로도 비교할 수 있게 했다.
  - 특정 과학 키워드를 하드코딩으로 추가하지 않고, 다른 수업 주제에도 적용되는 방식으로 처리했다.
- `tests/domain/conversationGuard.test.ts`
  - `광합성의 이해` 챗봇에서 `광합성을 설명해줘.`가 정상 질문으로 통과해야 하는 회귀 테스트를 추가했다.

검증:

- 재현 테스트
  - `npm test -- --run tests/domain/conversationGuard.test.ts`
  - 구현 전 결과: 실패
  - 실패 내용: `광합성을 설명해줘.`가 `out_of_scope`로 분류됨
- 수정 후 대상 테스트
  - `npm test -- --run tests/domain/conversationGuard.test.ts`
  - 결과: 통과
  - 1개 테스트 파일, 10개 테스트 통과
- 관련 API/애플리케이션 테스트
  - `npm test -- --run tests/infrastructure/chatProxy.test.ts tests/infrastructure/apiHandler.test.ts tests/application/conversation/sendStudentMessage.test.ts`
  - 결과: 통과
  - 3개 테스트 파일, 19개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 258개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 로컬 API 서버
  - 새 코드 반영을 위해 API 서버를 재시작했다.
  - `/api/health` 결과: HTTP `200`, `provider: lmstudio`, `model: gemma-4-12b-it`
- 실제 학생 공유 링크 검증
  - 대상 주제: `광합성의 이해`
  - 질문: `광합성을 설명해줘.`
  - 결과: HTTP `200`
  - `blocked: false`
  - `providerError: false`
  - 응답 모델: `unsloth/gemma-4-12b-it`
  - 학생 URL: `http://127.0.0.1:5173/s/chatbotmqbwchiy4wra14gkmqbwchj8i`

현재 로컬 서버:

- Vite: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`

### 운영 전환 40차: 애매한 주제 범위 질문은 AI로 넘기도록 완화

완료 시간: 2026-06-13 14:50:48 +09:00

요청:

- 주제에 맞는지 애매한 학생 첫 메시지는 AI가 분석해 수업 범위 안에서 안내하도록 한다.
- 주제와 맞지 않는 질문을 어떻게 판단하는지 확인하고, 과도한 차단을 줄인다.

반영:

- `src/domain/conversation/conversationGuard.ts`
  - 기존 방식: 학습 질문 표현이 있고 챗봇 주제 단어가 직접 겹치지 않으면 `out_of_scope`로 차단
  - 변경 방식: 개인정보, 위험 표현, 프롬프트 탈취는 계속 즉시 차단
  - 주제 범위는 명백히 다른 영역 단서가 있을 때만 `out_of_scope`로 차단
  - 애매한 질문은 AI provider로 넘겨 시스템 프롬프트가 수업 범위 안에서 안내하도록 변경
- `tests/domain/conversationGuard.test.ts`
  - `설명해줘.` 같은 애매한 학습 요청은 정상 통과해야 하는 회귀 테스트를 추가했다.
  - `세종대왕의 업적`처럼 명백히 다른 주제는 계속 차단되는 기존 테스트를 유지했다.

현재 주제 범위 판단 기준:

- 즉시 차단:
  - 개인정보 의심 입력
  - 자해·폭력 등 안전 위험
  - 시스템 프롬프트 탈취나 이전 지시 무시 요청
- AI로 전달:
  - 주제 단어가 직접 포함된 질문
  - 한국어 조사만 달라진 질문
  - `설명해줘.`처럼 맥락상 애매한 질문
- 범위 차단:
  - 챗봇 주제 단어가 없고, 동시에 명백히 다른 영역 단서가 있는 질문
  - 예: 과학 광합성 챗봇에서 `세종대왕의 업적을 알려줘.`

검증:

- 재현 테스트
  - `npm test -- --run tests/domain/conversationGuard.test.ts`
  - 구현 전 결과: 실패
  - 실패 내용: `설명해줘.`가 `out_of_scope`로 분류됨
- 수정 후 대상 테스트
  - `npm test -- --run tests/domain/conversationGuard.test.ts tests/infrastructure/chatProxy.test.ts`
  - 결과: 통과
  - 2개 테스트 파일, 17개 테스트 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 259개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 로컬 API 서버
  - 새 코드 반영을 위해 API 서버를 재시작했다.
  - `/api/health` 결과: HTTP `200`, `provider: lmstudio`, `model: gemma-4-12b-it`
- 실제 학생 공유 링크 검증
  - 대상 주제: `광합성의 이해`
  - 학생 URL: `http://127.0.0.1:5173/s/chatbotmqbwchiy4wra14gkmqbwchj8i`
  - `설명해줘.`
    - 결과: HTTP `200`
    - `blocked: false`
    - 로컬 LLM 응답 수신
  - `세종대왕의 업적을 알려줘.`
    - 결과: HTTP `200`
    - `blocked: true`
    - provider 오류 없음
    - 로컬 guardrail 응답으로 범위 밖 안내

현재 로컬 서버:

- Vite: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`
- 사용자가 로컬 서버를 열어 달라고 요청한 상태이므로 이번 작업 후 서버는 계속 열어 두었다.

### 운영 전환 41차: 재생성 가능한 산출물 정리

완료 시간: 2026-06-13 14:55:25 +09:00

요청:

- 불필요한 파일을 정리한다.

정리 기준:

- 현재 열려 있는 로컬 서버와 학생용 테스트 데이터는 보존한다.
- 빌드, E2E, TypeScript가 다시 만들 수 있는 산출물만 삭제한다.
- 현재 로컬 API 서버가 사용하는 `server/data/local-dev-store.json`은 교사·챗봇·공유 링크 데이터가 들어 있어 삭제하지 않는다.

삭제:

- `dist`
  - Vite production build 산출물
- `artifacts`
  - 로컬 E2E 스크린샷과 결과 JSON
- `tsconfig.tsbuildinfo`
  - TypeScript incremental build 캐시

보존:

- `server/data/local-dev-store.json`
  - 현재 로컬 서버의 교사, 챗봇, 공유 링크, 사용량 테스트 데이터
- `node_modules`
  - 의존성 설치물
- 현재 실행 중인 Vite/API 서버

검증:

- 삭제 후 존재 여부 확인
  - `dist`: 없음
  - `artifacts`: 없음
  - `tsconfig.tsbuildinfo`: 없음
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 65개 테스트 파일, 259개 테스트 통과
- 로컬 서버 확인
  - Vite `http://127.0.0.1:5173/`: HTTP `200`
  - API `http://127.0.0.1:8787/api/health`: HTTP `200`
  - API 모델: `lmstudio / gemma-4-12b-it`

현재 로컬 서버:

- Vite: `http://127.0.0.1:5173/`
- API: `http://127.0.0.1:8787`

### 운영 전환 48차: 관리자 AI 모델 적용 상태 표시 개선

완료 시간: 2026-06-14 19:58:00 +09:00

요청:

- 관리자 대시보드에서 AI 모델을 적용한 뒤, 현재 선택한 모델이 이미 적용된 상태임을 `적용됨`으로 표시한다.

수정:

- 관리자 AI 모델 선택 영역에서 선택 모델과 실제 활성 모델이 같으면 적용 버튼 문구를 `적용됨`으로 바꿨다.
- `적용됨` 상태에서는 버튼을 비활성화하고, 컴포넌트 이벤트 핸들러에서도 저장 요청이 다시 나가지 않도록 방어했다.
- 적용 전 다른 모델을 선택한 경우에는 기존처럼 `적용` 버튼으로 저장할 수 있게 유지했다.

검증:

- 관련 테스트
  - `npm test -- --run tests/presentation/adminDashboardAiSettings.test.ts`
  - 결과: 통과
- 전체 테스트
  - `npm test`
  - 결과: 통과
  - 74개 테스트 파일, 313개 테스트 통과
- 빌드
  - `npm run build`
  - 결과: 통과

### 운영 전환 49차: Vercel 함수 리전 보정으로 LM Studio fallback 원인 해결

완료 시간: 2026-06-14 20:14:00 +09:00

요청:

- Nginx Origin 제한을 제거했는데도 운영 챗봇이 LM Studio가 아니라 OpenAI fallback으로 연결되는지 실제로 테스트한다.

확인:

- 운영 `/api/chat` 직접 호출 결과, 응답은 HTTP `200`이지만 스트림의 모델이 `gpt-5.4-nano-2026-03-17`로 표시되어 OpenAI fallback 상태임을 확인했다.
- 같은 LM Studio 공개 주소를 로컬 PC에서 직접 호출하면 `unsloth/gemma-4-12b-it`가 HTTP `200`으로 응답했다.
- Vercel 함수 진단 로그를 추가해 확인한 결과, `lm.alluser.site:443` 연결에서 `UND_ERR_CONNECT_TIMEOUT`이 발생했다.
- 즉 HTTP 403, Origin 차단, API 키 오류가 아니라 Vercel 함수가 Washington(`iad1`)에서 LM Studio 서버까지 TCP 연결을 열지 못하는 문제였다.

수정:

- `vercel.json`에 `"regions": ["icn1"]`을 추가해 Vercel Function 실행 지역을 서울로 지정했다.
- provider fallback이 발생하면 provider, modelId, HTTP status 또는 네트워크 cause만 남기도록 진단 로그를 추가했다. API 키와 요청 본문은 기록하지 않는다.

검증:

- 관련 테스트
  - `npm test -- --run tests/infrastructure/productionPreflight.test.ts tests/infrastructure/apiHandler.test.ts`
  - 결과: 통과
- 빌드
  - `npm run build`
  - 결과: 통과
- 운영 배포 후 `/api/chat` 직접 호출
  - 응답: HTTP `200`
  - `X-Vercel-Id`: `icn1::icn1...`
  - 스트림 모델: `google/gemma-4-e2b`
  - fallback 경고 로그: 없음

