# 꼬꼬무AI

**꼬꼬무AI**는 선생님이 수업 주제에 맞는 질문형 AI 챗봇을 만들고, 학생이 공유 링크로 접속해 대화하며 스스로 개념을 탐색할 수 있도록 돕는 교육용 웹 서비스입니다.

서비스 주소: https://kokomuai.vercel.app

학생은 회원가입 없이 선생님이 전달한 링크로만 참여합니다. 선생님과 관리자는 계정으로 로그인하며, 로그인한 계정의 권한에 따라 교사용 대시보드 또는 관리자 대시보드가 자동으로 열립니다.

## 주요 기능

- 선생님은 수업 주제, 학교급, 학년군, 과목, 학습 목표를 입력해 학생용 챗봇을 만들 수 있습니다.
- 챗봇 생성 과정에서 관련 성취기준을 추천받고 선택할 수 있습니다.
- 생성된 챗봇은 학생용 공유 링크로 배포할 수 있습니다.
- 학생은 링크로 접속해 질문하고, 대화 내용을 PDF 또는 TXT로 내려받을 수 있습니다.
- 관리자는 교사 가입 요청을 승인하거나 비활성화할 수 있습니다.
- 관리자는 교사별 챗봇, 사용량, 토큰 사용량, 예상 비용을 확인할 수 있습니다.
- AI 모델은 기본 로컬 LLM 설정을 사용하며, 운영 설정에 따라 OpenAI 또는 LM Studio 호환 로컬 LLM을 선택할 수 있습니다.

## 사용 흐름

### 선생님

1. https://kokomuai.vercel.app 에 접속합니다.
2. 기존 계정이 있으면 이메일과 비밀번호로 로그인하거나 Google로 계속하기를 사용합니다.
3. 처음 사용하는 경우 `가입 신청하기`를 눌러 이름, 이메일, 비밀번호, 학교를 입력합니다.
4. 학교는 직접 입력하는 방식이 아니라 학교명 일부를 입력한 뒤 나타나는 목록에서 선택합니다.
5. 가입 신청 후 관리자의 승인을 기다립니다.
6. 승인되면 로그인 후 교사용 대시보드에서 챗봇을 만들고 학생용 링크를 공유합니다.

### 학생

1. 선생님이 전달한 공유 링크로 접속합니다.
2. 별도 회원가입이나 로그인이 필요하지 않습니다.
3. 챗봇과 대화하며 주제와 관련된 질문을 이어갈 수 있습니다.
4. 필요한 경우 대화 내용을 PDF 또는 TXT로 저장할 수 있습니다.

### 관리자

1. 관리자 계정으로 로그인합니다.
2. 별도의 관리자 탭을 누르지 않아도 관리자 권한 계정이면 관리자 대시보드가 자동으로 열립니다.
3. 교사 가입 요청을 확인하고 승인 또는 비활성화할 수 있습니다.
4. 교사별 챗봇과 사용량, 토큰 사용량, 예상 비용을 확인할 수 있습니다.
5. AI 모델 설정과 운영 로그를 확인할 수 있습니다.

## 개인정보와 안전

- 학생은 회원가입하지 않습니다.
- 학생에게 이름, 학번, 이메일, 전화번호, 주소 등 개인정보 입력을 요구하지 않습니다.
- 학생 대화 원문은 관리자 화면에 장기 보관하거나 표시하지 않는 구조를 기본으로 합니다.
- 교사와 관리자 인증은 Firebase Authentication을 사용합니다.
- 운영 데이터는 Vercel API를 거쳐 Firestore에 저장됩니다.
- Firebase Admin 인증 정보와 AI API 키는 서버 환경변수로만 사용하며 브라우저에 노출하지 않습니다.

## 운영 데이터 구조

주요 Firestore 컬렉션은 다음과 같습니다.

```text
teachers/{uid}
chatbots/{chatbotId}
shareTokens/{publicToken}
usageMonthly/{teacherId_yyyy-MM_chatbotId}
settings/ai
adminLogs/{eventId}
providerErrors/{eventId}
```

학생별 계정, 학생별 사용량, 학생 대화 원문 저장은 기본 운영 범위에 포함하지 않습니다.

## 로컬 실행

의존성을 설치합니다.

```powershell
npm install
```

프론트엔드와 로컬 API 서버를 함께 실행합니다.

```powershell
npm run dev:full
```

로컬 주소는 다음과 같습니다.

- 앱: `http://127.0.0.1:5173/`
- 로컬 API: `http://127.0.0.1:8787`

## 테스트와 빌드

전체 테스트를 실행합니다.

```powershell
npm test
```

프로덕션 빌드를 확인합니다.

```powershell
npm run build
```

## 배포 전 확인

Vercel과 Firebase 운영 설정을 확인합니다.

```powershell
npm run preflight:production
npm run deployment:status
npm run firebase:auth:check
```

Vercel 환경변수 동기화는 먼저 dry-run으로 확인합니다.

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

## 환경변수

`.env.example`을 참고해 로컬 `.env`를 구성합니다.

- `.env`는 Git에 올리지 않습니다.
- OpenAI, NEIS, Firebase Admin 값은 서버 환경변수로만 사용합니다.
- 브라우저에는 `VITE_FIREBASE_*`처럼 공개 가능한 Firebase Web SDK 설정만 노출합니다.
- Vercel 배포 환경에서는 프로젝트 Settings의 Environment Variables에 동일한 값을 등록합니다.

## 저작권

Copyright (c) HoomiKim. All Rights Reserved.
