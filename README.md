# 꼬꼬무AI

`꼬꼬무AI`는 선생님이 수업 주제별 질문형 AI 챗봇을 만들고, 학생이 공유 링크로 접속해 대화할 수 있는 교육용 웹앱입니다.

학생은 별도 가입 없이 공유 링크로만 참여합니다. 교사와 관리자는 Firebase Authentication으로 로그인하고, 운영 데이터는 Vercel API가 Firebase Admin SDK를 통해 Firestore에 저장합니다.

## 주요 기능

- 교사용 챗봇 생성, 수정, 삭제, 공유 링크 관리
- 2022 개정 교육과정 기반 성취기준 추천
- 학생용 공유 링크 화면
- 학생 대화 로컬 저장과 PDF/TXT 다운로드
- 개인정보 의심 입력 차단
- 교사별 사용량, 토큰, 예상 비용 집계
- 관리자 승인, 교사 관리, AI 모델 설정
- OpenAI 및 LM Studio 호환 로컬 LLM 선택 구조

## 기술 스택

- React
- Vite
- TypeScript
- Firebase Authentication
- Firestore
- Firebase Admin SDK
- Vercel Serverless Functions
- Vitest

## 로컬 실행

의존성을 설치합니다.

```powershell
npm install
```

프런트엔드와 로컬 API 서버를 함께 실행합니다.

```powershell
npm run dev:full
```

기본 주소는 다음과 같습니다.

- 앱: `http://127.0.0.1:5173/`
- 로컬 API: `http://127.0.0.1:8787`

프런트엔드와 API를 따로 실행할 수도 있습니다.

```powershell
npm run dev
npm run server
```

## 테스트

전체 테스트를 실행합니다.

```powershell
npm test
```

프로덕션 빌드를 확인합니다.

```powershell
npm run build
```

## 환경 변수

`.env.example`을 참고해 로컬 `.env`를 구성합니다.

중요한 원칙은 다음과 같습니다.

- `.env`는 Git에 올리지 않습니다.
- OpenAI, NEIS, Firebase Admin 키는 서버 환경변수로만 사용합니다.
- 브라우저에는 `VITE_FIREBASE_*`처럼 공개 가능한 Firebase Web SDK 설정만 노출합니다.
- 학생 브라우저에는 AI API 키나 Firebase Admin 인증 정보를 절대 노출하지 않습니다.

## 운영 구조

운영 환경은 다음 흐름을 기준으로 합니다.

1. 교사가 이메일/비밀번호 또는 Google 계정으로 가입합니다.
2. 학교는 NEIS 학교 검색 결과에서만 선택합니다.
3. 교사 계정은 `pending` 상태로 생성됩니다.
4. 관리자가 교사를 승인하면 챗봇 생성이 가능해집니다.
5. 학생은 공유 링크 `/s/:token`으로만 접속합니다.
6. 학생 대화 원문은 서버에 장기 저장하지 않고, 브라우저 로컬 저장소에만 보관합니다.
7. 사용량은 월별 집계 문서로만 저장합니다.

Firestore 직접 클라이언트 접근은 기본 차단합니다. 운영 데이터는 Vercel API가 Firebase Admin SDK로 읽고 씁니다.

## Firestore 데이터 구조

주요 컬렉션은 다음과 같습니다.

```text
teachers/{uid}
chatbots/{chatbotId}
shareTokens/{publicToken}
usageMonthly/{teacherId_yyyy-MM_chatbotId}
settings/ai
adminLogs/{eventId}
providerErrors/{eventId}
```

학생별 계정, 학생별 사용량, 학생 대화 원문 저장은 기본 범위에 포함하지 않습니다.

## 배포 준비

Firebase와 Vercel 운영 준비 상태를 확인합니다.

```powershell
npm run preflight:production
npm run deployment:status
npm run firebase:auth:check
```

Vercel 환경변수 등록 전 dry-run을 실행합니다.

```powershell
npm run vercel:env:dry-run
```

실제 반영은 다음 명령으로 진행합니다.

```powershell
npm run vercel:env:sync
```

Firestore rules와 indexes는 Firebase CLI로 배포합니다.

```powershell
firebase deploy --only firestore:rules,firestore:indexes --project kkokkomu-d6a4c
```

## 보안 원칙

- 학생은 가입하지 않습니다.
- 학생 개인정보 입력을 요구하지 않습니다.
- 학생 대화 원문을 관리자 화면에 표시하지 않습니다.
- API 키와 Firebase Admin 인증 정보는 서버 환경에만 둡니다.
- Firestore rules는 기본적으로 직접 읽기/쓰기를 차단합니다.
- 교사 기능은 승인된 교사 또는 관리자만 사용할 수 있습니다.
- 관리자 기능은 관리자 계정만 사용할 수 있습니다.

## 라이선스와 저작권

Copyright (c) HoomiKim. All Rights Reserved.

