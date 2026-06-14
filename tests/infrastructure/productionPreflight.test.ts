import { describe, expect, it } from "vitest";
import { evaluateProductionPreflight, parseEnvText } from "../../scripts/productionPreflight";

describe("production preflight", () => {
  it("passes when required Vercel/Firebase environment contracts are present", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"secret"}
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=kkokkomu-d6a4c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=kkokkomu-d6a4c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
VERCEL_TOKEN=token
VERCEL_ORG_ID=org
VERCEL_PROJECT_ID=project
`);

    expect(evaluateProductionPreflight({ env, files: existingFiles() })).toEqual({
      ok: true,
      errors: [],
      warnings: []
    });
  });

  it("fails when Firebase Admin credentials, Vercel auth, or config files are missing", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_API_KEY=client
`);

    const result = evaluateProductionPreflight({
      env,
      files: {
        "vercel.json": true,
        "firebase.json": false,
        "firestore.rules": true,
        "api/index.ts": true,
        "api/chat.ts": true,
        ".firebaserc": true,
        ".gitignore": true
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Firebase Admin 인증 정보가 없습니다. FIREBASE_SERVICE_ACCOUNT 또는 FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY를 설정해야 합니다.");
    expect(result.errors).toContain("Vercel 인증/프로젝트 연결 정보가 없습니다. VERCEL_TOKEN 또는 .vercel/project.json이 필요합니다.");
    expect(result.errors).toContain("필수 파일이 없습니다: firebase.json");
    expect(result.errors).toContain("필수 환경변수가 없습니다: KKOKKOMU_ADMIN_EMAILS");
    expect(result.errors).toContain("필수 환경변수가 없습니다: VITE_FIREBASE_AUTH_DOMAIN");
  });

  it("requires the direct Vercel chat API function so /api/chat does not 404", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"secret"}
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=kkokkomu-d6a4c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=kkokkomu-d6a4c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
VERCEL_TOKEN=token
`);

    const result = evaluateProductionPreflight({
      env,
      files: {
        ...existingFiles(),
        "api/chat.ts": false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("필수 파일이 없습니다: api/chat.ts");
  });

  it("accepts the current Vercel repo link file as deployment connection evidence", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"secret"}
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=kkokkomu-d6a4c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=kkokkomu-d6a4c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
`);

    const result = evaluateProductionPreflight({
      env,
      files: {
        ...existingFiles(),
        ".vercel/repo.json": true
      }
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("warns when legacy public NEIS keys remain in the local environment", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
NEXT_PUBLIC_NEIS_API_KEY=legacy
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
FIREBASE_CLIENT_EMAIL=firebase@example.com
FIREBASE_PRIVATE_KEY=secret
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=kkokkomu-d6a4c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=kkokkomu-d6a4c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
VERCEL_TOKEN=token
`);

    const result = evaluateProductionPreflight({ env, files: existingFiles() });

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("NEXT_PUBLIC_NEIS_API_KEY가 남아 있습니다. 운영 배포에는 서버 전용 NEIS_API_KEY만 등록하세요.");
  });

  it("fails when client and server Firebase project ids differ", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=server-project
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"secret"}
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=client-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=client-project
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=client-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
VERCEL_TOKEN=token
`);

    const result = evaluateProductionPreflight({ env, files: existingFiles() });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Firebase client/server project ids must match: FIREBASE_PROJECT_ID=server-project, VITE_FIREBASE_PROJECT_ID=client-project",
    );
  });

  it("fails when the secret-protecting gitignore file is missing", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"secret"}
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=kkokkomu-d6a4c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=kkokkomu-d6a4c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
VERCEL_TOKEN=token
`);

    const result = evaluateProductionPreflight({
      env,
      files: {
        ...existingFiles(),
        ".gitignore": false
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("필수 파일이 없습니다: .gitignore");
  });

  it("fails when client source files reference server-only environment names", () => {
    const env = parseEnvText(`
OPENAI_API_KEY=openai
NEIS_API_KEY=neis
FIREBASE_PROJECT_ID=kkokkomu-d6a4c
FIREBASE_SERVICE_ACCOUNT={"client_email":"firebase@example.com","private_key":"secret"}
KKOKKOMU_ADMIN_EMAILS=admin@example.com
LMSTUDIO_API_URL=https://lm.example.test
LMSTUDIO_API_KEY=lm-key
LMSTUDIO_GEMMA_E4B_MODEL=google/gemma-4-e4b
LMSTUDIO_GEMMA_E2B_MODEL=google/gemma-4-e2b
LMSTUDIO_GEMMA_12B_MODEL=gemma-4-12b-it
LMSTUDIO_GEMMA_26B_MODEL=gemma-4-26b-a4b-it
VITE_FIREBASE_API_KEY=client
VITE_FIREBASE_AUTH_ENABLED=true
VITE_FIREBASE_AUTH_DOMAIN=kkokkomu-d6a4c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kkokkomu-d6a4c
VITE_FIREBASE_APP_ID=app
VITE_FIREBASE_STORAGE_BUCKET=kkokkomu-d6a4c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=965823913795
VERCEL_TOKEN=token
`);

    const result = evaluateProductionPreflight({
      env,
      files: existingFiles(),
      clientSourceFiles: {
        "src/leaky.ts": 'const key = import.meta.env.OPENAI_API_KEY ?? process.env.NEXT_PUBLIC_NEIS_API_KEY;'
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("클라이언트 소스에서 서버 전용 환경변수를 참조합니다: src/leaky.ts: OPENAI_API_KEY");
    expect(result.errors).toContain("클라이언트 소스에서 서버 전용 환경변수를 참조합니다: src/leaky.ts: NEXT_PUBLIC_NEIS_API_KEY");
  });
});

function existingFiles() {
  return {
    "vercel.json": true,
    "firebase.json": true,
    "firestore.rules": true,
    "api/index.ts": true,
    "api/chat.ts": true,
    ".firebaserc": true,
    ".gitignore": true
  };
}
