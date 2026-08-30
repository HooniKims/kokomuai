# 교사 가입 알림 메일 (Signup Notice Email)

날짜: 2026-08-30 · 상태: 승인됨

## 목적

교사가 꼬꼬무AI에 가입하면 운영자(greenguyhh@gmail.com)에게 알림 메일을 보내,
관리자 승인 대기 중인 계정을 바로 알 수 있게 한다. 올패스리딩의
`teacher-signup-notice` 구현과 같은 Resend 기반이지만, 꼬꼬무AI는 가입이 서버
(`POST /api/teachers`)에서 처리되므로 별도 공개 엔드포인트 없이 서버 핸들러
내부에서 발송한다.

## 동작

- 발송 시점: `POST /api/teachers`에서 새 프로필이 실제로 생성될 때만
  (`saveTeacherIfEmailAbsent`가 `created: true`). 재로그인·기존 계정·운영자
  부트스트랩 관리자 계정 생성은 발송하지 않는다.
- 발송 수단: Resend API (`https://api.resend.com/emails`), 발신
  `꼬꼬무AI <onboarding@resend.dev>` (Resend 공용 발신자 — 계정 소유자 메일로만
  배달됨), 수신 `KKOKKOMU_SIGNUP_NOTICE_EMAIL` 환경변수 (기본
  `greenguyhh@gmail.com`), 타임아웃 8초.
- 메일 내용: 이름 + 이메일 + 학교명 + 관리자 페이지 링크
  (`https://kokomuai.vercel.app/admin`). 필드는 개행 제거·120자 절단으로 정리.
- 실패 정책: 메일 발송 실패·키 미설정은 가입을 막지 않는다. `console.warn`만
  남기고 가입 응답은 정상 반환. `RESEND_API_KEY`가 없으면 조용히 스킵
  (로컬 개발 기본 동작).

## 구성

- `server/signupNoticeEmail.ts` (신규): `buildSignupNoticeEmailRequest` /
  `sendSignupNoticeEmail` — `passwordResetEmail.ts`와 같은 request-builder +
  sender 패턴, `fetchImpl` 주입으로 테스트.
- `server/localApi.ts`: `LocalApiDependencies.signupNoticeEmail?` 의존성 추가,
  `POST /api/teachers`에서 신규 생성 시 try/catch로 호출.
- `server/apiHandler.ts`: 의존성 통과.
- `server/vercelApi.ts`: 기본 와이어링 — `RESEND_API_KEY` 있으면 발송 함수 구성,
  없으면 `undefined`.
- `.env.example`: `RESEND_API_KEY`, `KKOKKOMU_SIGNUP_NOTICE_EMAIL` 항목 추가.
- Vercel: 올패스리딩 프로젝트의 `RESEND_API_KEY` 값을 kokomuai production
  환경변수로 복사.

## 테스트

- `tests/infrastructure/signupNoticeEmail.test.ts`: 요청 생성(수신자·제목·본문·
  필드 정리), 발송 성공/실패.
- `tests/infrastructure/localApi.test.ts`: 신규 가입 시 1회 호출, 기존 계정
  재요청 시 미호출, 발송 실패에도 201 정상 응답.
