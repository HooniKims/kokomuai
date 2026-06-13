# 꼬꼬무AI Vercel/Firebase 배포 Runbook

이 문서는 로컬 검증이 끝난 뒤 Vercel과 Firebase로 실제 운영 배포를 진행할 때 사용하는 순서입니다.

## 1. Firebase 콘솔 작업

Firebase CLI로 Firestore rules와 indexes는 배포할 수 있지만, Authentication 제공자 활성화는 콘솔에서 확인합니다.

1. Firebase 콘솔에서 `kkokkomu-d6a4c` 프로젝트를 연다.
   - 바로가기: https://console.firebase.google.com/project/kkokkomu-d6a4c/authentication/providers
2. Authentication을 시작한다.
3. 로그인 제공자에서 다음 항목을 활성화한다.
   - 이메일/비밀번호
   - Google
4. Firestore Database가 `asia-northeast3` 리전에 생성되어 있는지 확인한다.
5. Firestore rules와 indexes를 배포한다.

```powershell
firebase deploy --only firestore:rules,firestore:indexes --project kkokkomu-d6a4c
```

Authentication 제공자를 활성화한 뒤에는 로컬에서 실제 설정 상태를 확인합니다. 이 명령은 가능한 경우 서비스 계정으로 Identity Toolkit Admin API를 조회하고, 일반 Firebase Auth 프로젝트에서 Admin 설정이 아직 노출되지 않으면 Firebase Auth REST API의 비파괴 로그인 probe로 전환합니다. 비밀값은 출력하지 않습니다.

```powershell
npm run firebase:auth:check
```

통과 기준:

- 이메일/비밀번호 제공자가 `enabled`
- Google 제공자가 `enabled`

참고: `npm run firebase:auth:bootstrap`은 Identity Platform Admin API로 Auth 초기화와 provider 활성화를 시도하는 보조 명령입니다. 현재 무료 Firebase Auth 운영을 유지하려면 이 명령을 기본 절차로 사용하지 않습니다. 이 API 경로는 프로젝트 결제 활성화가 필요할 수 있으므로, 무료 티어에서는 Firebase 콘솔에서 Authentication을 시작한 뒤 `npm run firebase:auth:check`로 상태만 확인합니다.

## 2. Vercel 프로젝트 연결

Vercel CLI가 상호작용 모드에서 멈추면, Vercel 대시보드에서 프로젝트를 만들거나 기존 프로젝트의 project/org id를 확인한 뒤 `.env`에 넣고 로컬 연결 파일을 만들 수 있습니다.

- 대시보드: https://vercel.com/dashboard

`.env`에 로컬 제어용 값만 추가합니다. 이 값들은 `npm run vercel:env:sync`로 Vercel에 업로드하지 않습니다.

```dotenv
VERCEL_ORG_ID=
VERCEL_PROJECT_ID=
VERCEL_TOKEN=
```

연결 파일 생성:

```powershell
npm run vercel:link:env
```

이미 `.vercel/project.json`이 있고 다시 쓰려면 다음 명령을 사용합니다.

```powershell
npm run vercel:link:env -- --force
```

`.vercel/` 폴더는 `.gitignore`에 포함되어 있으므로 저장소에 올리지 않습니다.

## 3. Vercel 환경변수 등록

먼저 등록 대상과 값 존재 여부만 확인합니다. 실제 비밀값은 출력하지 않고 길이만 보여줍니다.

```powershell
npm run vercel:env:dry-run
```

모든 필수 변수가 `ready: true`이면 Vercel production 환경에 등록합니다.

```powershell
npm run vercel:env:sync
```

preview 환경도 함께 등록하려면 다음처럼 실행합니다.

```powershell
$env:VERCEL_ENV_TARGETS='production,preview'
npm run vercel:env:sync
```

## 4. 배포 전 로컬 게이트

Vercel 프로젝트 연결과 환경변수 준비가 끝난 뒤 아래 명령을 실행합니다.

```powershell
npm run preflight:production
npm run deployment:status
npm run firebase:auth:check
npm test
npm run build
npm audit --omit=dev --json
```

기준:

- `preflight:production` 통과
- `deployment:status`에서 `status: "ready_to_deploy"` 확인
- `firebase:auth:check` 통과
- 전체 테스트 통과
- 빌드 통과
- `npm audit --omit=dev --json`에서 high와 critical이 0
- moderate는 Firebase Admin 전이 의존성 경로만 남는지 확인

## 5. Vercel 배포

```powershell
npx vercel deploy --prod --yes
```

명령이 출력한 production URL을 `DEPLOY_URL`에 넣어 smoke test를 실행합니다.

```powershell
$env:DEPLOY_URL='https://배포주소'
npm run smoke:deploy
```

smoke test는 다음을 확인합니다.

- `/`가 꼬꼬무AI SPA HTML로 응답한다.
- `/privacy`가 SPA rewrite로 응답한다.
- `/api/health`가 `ok`, `provider`, `model`을 반환한다.
- 인증 없는 `/api/teachers` 접근이 `401` 또는 `403`으로 거절된다.
- 인증 없는 `/api/teachers` 응답에 `Cache-Control: no-store`가 포함된다.
- 신뢰하지 않는 Origin의 `/api/chat` preflight가 `403`으로 거절되고 `Access-Control-Allow-Origin: *`를 노출하지 않는다.
- 기본 보안 헤더가 응답에 포함된다.
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `X-Frame-Options`
  - `Permissions-Policy`

## 6. 배포 후 수동 확인

1. 관리자 이메일로 로그인한다.
2. NEIS 학교 검색 결과를 선택해 관리자 프로필을 제출한다.
3. 새 교사 계정을 가입시킨다.
4. 관리자 화면에서 교사를 승인한다.
5. 교사 화면에서 챗봇을 만들고 공유 링크를 켠다.
6. 공유 링크를 새 브라우저 세션에서 열어 학생 화면만 보이는지 확인한다.
7. 학생 질문 후 사용량 집계가 교사/관리자 화면에 반영되는지 확인한다.
8. 개인정보가 포함된 질문이 AI로 전송되지 않고 차단되는지 확인한다.

## 7. 실패 시 확인 순서

- `preflight:production`이 Vercel 연결 정보로 실패하면 `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `.vercel/project.json` 중 하나를 확인한다.
- `vercel:env:sync`가 멈추면 `VERCEL_TOKEN`과 Vercel CLI 로그인 상태를 확인한다.
- `/api/health`가 실패하면 Vercel 서버 환경변수의 `OPENAI_API_KEY`, Firebase Admin 인증 정보, LM Studio 설정을 확인한다.
- 교사 로그인이 안 되면 Firebase Authentication 제공자 활성화 여부와 `VITE_FIREBASE_AUTH_ENABLED=true`를 확인한다.
- Firestore 권한 오류가 나오면 서버 API가 Firebase Admin SDK를 사용하는지, 클라이언트에서 직접 운영 컬렉션을 읽고 있지 않은지 확인한다.
