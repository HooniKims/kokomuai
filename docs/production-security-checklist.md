# 꼬꼬무AI 운영 보안 점검표

이 문서는 Vercel과 Firebase로 배포할 때 반드시 확인해야 할 항목을 정리한 운영용 점검표입니다.

## 환경변수

- `OPENAI_API_KEY`, `NEIS_API_KEY`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_SERVICE_ACCOUNT`는 Vercel 서버 환경변수에만 둡니다.
- 최초 관리자 이메일은 서버 전용 `KKOKKOMU_ADMIN_EMAILS`에 쉼표로 구분해 등록합니다.
- `KKOKKOMU_ADMIN_EMAILS`에 등록된 이메일로 Firebase 로그인 후 학교 프로필을 제출하면 관리자 프로필로 저장됩니다.
- API는 기본적으로 같은 출처와 로컬 개발 앱만 CORS로 허용합니다. 별도 프론트 도메인이 필요할 때만 서버 전용 `KKOKKOMU_ALLOWED_ORIGINS`에 쉼표로 구분해 등록합니다.
- 브라우저에 공개되는 값은 `VITE_FIREBASE_*` 형식의 Firebase 클라이언트 설정만 사용합니다.
- 운영 배포에서 교사 Firebase Auth 화면을 켜려면 `VITE_FIREBASE_AUTH_ENABLED=true`를 등록합니다.
- 관리자 화면에서 로컬 LLM을 선택할 수 있어야 하므로 `LMSTUDIO_API_URL`, `LMSTUDIO_API_KEY`, `LMSTUDIO_GEMMA_E4B_MODEL`, `LMSTUDIO_GEMMA_E2B_MODEL`, `LMSTUDIO_GEMMA_12B_MODEL`, `LMSTUDIO_GEMMA_26B_MODEL`도 Vercel 서버 환경변수에 등록합니다.
- 로컬 `.env`에는 Firebase Web SDK 설정이 있어도 `VITE_FIREBASE_AUTH_ENABLED`를 생략해 로컬 자동 교사 검증 흐름을 유지할 수 있습니다.
- `.env` 파일은 로컬 개발용으로만 사용하고 저장소나 배포 산출물에 포함하지 않습니다.
- `.gitignore`에는 `.env`, `.env.*`, `.vercel/`, `.firebase/`, 검증 산출물과 로그 제외 규칙이 있어야 합니다.
- Firebase Admin private key는 줄바꿈이 깨지지 않도록 `\n` 형태 또는 서비스 계정 JSON 한 덩어리로 등록합니다.
- Vercel에 등록할 값은 먼저 `npm run vercel:env:dry-run`으로 변수명과 값 길이만 확인합니다.
- Vercel CLI 상호작용 로그인이 멈추면 `VERCEL_ORG_ID`와 `VERCEL_PROJECT_ID`를 로컬 `.env`에 넣고 `npm run vercel:link:env`로 `.vercel/project.json`을 생성합니다.
- Vercel 프로젝트가 연결된 뒤에는 `npm run vercel:env:sync`로 `.env`의 운영 변수를 `production` 환경에 등록합니다. 여러 환경에 등록하려면 `VERCEL_ENV_TARGETS=production,preview`처럼 지정합니다.
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`는 CLI 제어용 값이며, Vercel 프로젝트 환경변수로 다시 등록하지 않습니다.
- `vite`, `@vitejs/plugin-react` 같은 빌드 도구는 `devDependencies`에 두어 `npm audit --omit=dev` 운영 감사에 런타임 의존성만 반영되게 합니다.

## 인증과 권한

- 교사는 Firebase Auth로 로그인한 뒤 NEIS 학교 검색 결과를 선택해 가입 요청을 보냅니다.
- 교사 프로필 ID는 Firebase 토큰의 `uid`와 같아야 합니다.
- 승인 전 교사는 챗봇 생성, 공유 링크 생성, 사용량 조회 기능을 사용할 수 없습니다.
- 관리자 기능은 `status: "admin"`인 계정만 사용할 수 있습니다.
- 최초 관리자 자동 승격은 Firebase 토큰의 이메일을 기준으로만 판단하며, 가입 요청 본문 이메일은 신뢰하지 않습니다.
- 학생은 `/s/:token` 공유 링크로만 참여하며 교사와 관리자 탭을 보지 않습니다.

## 데이터 저장

- 학생 대화 원문은 관리자 화면에 표시하지 않습니다.
- Firestore에는 원문 대화 로그 대신 월별 집계 사용량을 저장합니다.
- 사용량 집계에는 대화 수, AI 호출 수, 입력/출력 토큰 추정치, 예상 비용만 포함합니다.
- JSON API 요청 본문은 128KB를 넘으면 `413 payload_too_large`로 거절해 과도한 메모리 사용과 불필요한 AI 호출을 막습니다.
- 학생의 현재 질문은 2400자를 넘으면 `413 message_too_long`으로 거절해 무료 티어 AI 호출 비용을 보호합니다.
- AI provider로 전달하는 이전 대화는 최근 8개만 사용하고, 각 히스토리 항목은 800자까지만 전달합니다.
- AI provider가 HTTP 오류를 반환하거나 네트워크 예외가 발생하면 원문 대화, upstream 오류 본문, 예외 메시지는 저장하지 않고, provider/status/code 중심의 관리자 오류 로그와 월별 오류 집계만 저장합니다.
- API 응답에는 `Access-Control-Allow-Origin: *`를 사용하지 않고, 허용된 Origin만 그대로 반영합니다.
- 공유 링크는 토큰 조회용 문서로 분리해 학생 입장 시 전체 챗봇 목록을 읽지 않도록 합니다.
- 학생 공유 링크 응답에는 대화에 필요한 챗봇 설정과 공유 토큰만 포함하고, `ownerTeacherId`, `lifecycle`, `createdAt`, `updatedAt` 같은 운영 필드는 포함하지 않습니다.
- 일반 교사의 프로필 조회는 `teachers/{uid}` 단건 문서로 처리합니다.
- 일반 교사의 챗봇 목록과 사용량 조회는 `ownerTeacherId`, `teacherId` 기준 Firestore 쿼리로 제한합니다. 전체 컬렉션 조회는 관리자 전체 현황에서만 허용합니다.
- 학교 검색은 서버에서 2글자 이상일 때만 NEIS 검색 의존성을 호출해 불필요한 외부 API 호출을 줄입니다.
- 일반 500 오류 응답에는 내부 환경변수명, API 키, 외부 API 오류 문자열을 직접 노출하지 않습니다.

## Firebase

- `firestore.rules`는 직접 클라이언트 접근을 기본 차단합니다.
- 서버 API만 Firebase Admin SDK로 Firestore를 읽고 씁니다.
- Firebase 프로젝트는 배포 전 `firebase projects:list` 또는 Firebase 콘솔에서 대상 프로젝트가 맞는지 확인합니다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화한 뒤 `npm run firebase:auth:check`로 실제 상태를 확인합니다.

## 배포 전 검증

- `npm run preflight:production`이 통과해야 합니다.
- `npm run deployment:status`가 production preflight, Firebase Auth, Vercel 환경변수, security audit gate를 한 번에 점검해야 합니다.
- `npm run firebase:auth:check`가 이메일/비밀번호와 Google 제공자를 모두 `enabled`로 표시해야 합니다.
- `npm run vercel:env:dry-run`이 모든 필수 변수를 `ready: true`로 표시해야 합니다.
- `npm test`가 통과해야 합니다.
- `npm run build`가 통과해야 합니다.
- `npm audit --omit=dev --json` 결과에서 high, critical 취약점이 없어야 합니다.
- moderate 취약점이 Firebase Admin의 사용하지 않는 선택 의존성 경로에서만 발생하는 경우, 다운그레이드나 무리한 `omit=optional` 설정으로 빌드를 깨뜨리지 말고 영향 범위를 기록합니다.
- 로컬 서버에서 교사 가입, 관리자 승인, 챗봇 생성, 공유 링크 학생 접속, 사용량 집계가 이어지는지 확인합니다.
- Vercel 배포 후에는 `DEPLOY_URL=https://배포주소 npm run smoke:deploy`로 실제 배포 URL을 점검합니다.
  - `/`와 `/privacy`가 꼬꼬무AI SPA로 응답해야 합니다.
  - `/api/health`가 `ok`, `provider`, `model`을 반환해야 합니다.
  - `/api/teachers`는 인증 없는 접근을 `401` 또는 `403`으로 거절해야 합니다.
  - `/api/teachers` 응답에는 `Cache-Control: no-store`가 포함되어야 합니다.
  - 신뢰하지 않는 Origin의 `/api/chat` preflight는 `403`으로 거절되고 `Access-Control-Allow-Origin: *`를 노출하지 않아야 합니다.
  - `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`가 응답에 포함되어야 합니다.

## 외부 콘솔 작업

- Firebase 프로젝트에 Web App이 생성되어 있어야 합니다.
- Firestore API가 활성화되어 있어야 합니다.
- Firestore 기본 데이터베이스는 한국 사용 환경 기준 `asia-northeast3` 같은 가까운 리전에 생성합니다.
- Firebase Authentication에서 이메일/비밀번호와 Google 제공자를 활성화합니다.
- 무료 Firebase Auth 운영을 유지할 경우, Identity Platform API 기반 `npm run firebase:auth:bootstrap`은 기본 절차로 사용하지 않습니다. 해당 API 초기화 경로는 결제 활성화가 필요할 수 있으므로 콘솔에서 Auth를 시작하고 `npm run firebase:auth:check`로 확인합니다.
- Vercel CLI 또는 Vercel 대시보드에서 프로젝트를 연결하고 환경변수를 등록합니다.
- 대시보드에서 org/project id를 확인한 경우 `npm run vercel:link:env`로 로컬 연결 파일을 만들 수 있습니다.
- Vercel 환경변수에는 `NEXT_PUBLIC_NEIS_API_KEY`를 등록하지 않습니다. NEIS 키는 서버 전용 `NEIS_API_KEY`만 사용합니다.
