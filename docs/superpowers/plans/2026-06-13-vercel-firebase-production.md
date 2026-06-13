# Vercel Firebase Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 꼬꼬무AI from a local demonstration app into a Vercel-deployable service backed by Firebase Auth and Firestore, while preserving low database usage and student privacy.

**Architecture:** Keep the existing domain rules and local JSON store for development, then add production adapters around the same API handler shape. Vercel serverless routes verify Firebase ID tokens, read/write compact Firestore documents, and aggregate usage monthly instead of storing raw student conversations.

**Tech Stack:** React 19, Vite, TypeScript, Vercel serverless functions, Firebase client SDK, Firebase Admin SDK, Firestore, OpenAI/LM Studio-compatible chat APIs, Vitest.

---

## Current Status As Of 2026-06-13

The implementation work for the local/Vercel/Firebase production path is mostly in place and verified locally:

- Vercel serverless entry exists at `api/[...path].ts` and delegates to the shared API handler.
- `server/apiHandler.ts` is used by both the local dev server and Vercel path.
- `server/firebaseStore.ts` implements the storage boundary with compact Firestore documents and monthly usage aggregates.
- `server/authContext.ts` enforces Firebase-token-based teacher/admin access in production mode.
- Firebase Web SDK configuration and teacher Auth UI are present under `src/infrastructure/firebase` and `src/presentation/auth`.
- `firestore.rules` denies direct client access by default so production writes remain server-mediated.
- Deployment helper scripts now check production preflight, Firebase Auth providers, Vercel environment readiness, security audit high/critical counts, and CORS wildcard regressions.
- Local E2E covers admin approval, teacher chatbot creation, share-link student access, student AI response, and usage aggregation.

Current external blockers:

- Firebase CLI authentication works and project `kkokkomu-d6a4c` is visible, but Firebase Authentication is not initialized.
- `npm run firebase:auth:bootstrap` is blocked by `BILLING_NOT_ENABLED`, so the free-tier path still requires starting Firebase Authentication and enabling email/password plus Google providers in the Firebase console.
- Vercel environment variables are ready in `.env`, but Vercel project connection is not ready because `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` or `.vercel/project.json` is missing.
- `npx vercel whoami` did not complete non-interactively in the local shell, so Vercel login/project linking still needs a browser or dashboard step.

---

## File Structure

- `server/storePort.ts`: shared storage contract used by local and Firebase adapters.
- `server/localStore.ts`: implements `StorePort` for local development.
- `server/firebaseAdmin.ts`: initializes Firebase Admin from Vercel environment variables.
- `server/firebaseStore.ts`: implements `StorePort` with Firestore documents and monthly aggregate writes.
- `server/authContext.ts`: verifies Firebase ID tokens and resolves role/status.
- `server/apiHandler.ts`: framework-neutral API handler used by local server and Vercel.
- `api/[...path].ts`: Vercel entry point that delegates to `server/apiHandler.ts`.
- `src/infrastructure/firebase/client.ts`: Firebase web SDK initialization.
- `src/presentation/auth/*`: teacher sign-up/login UI and school selection helpers.
- `firestore.rules`: minimum Firestore rules for direct client access; production writes remain server-mediated.
- `vercel.json`: route/build configuration for Vercel.
- `tests/infrastructure/*firebase*.test.ts`: Firebase adapter behavior with fakes.
- `tests/presentation/*auth*.test.ts`: sign-up/login UI behavior.
- `SPEC.md`, `DESIGN.md`, `TAsk.md`: deployment, security, and operational notes.

---

### Task 1: Dependency And Audit Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Update: `TAsk.md`

- [x] **Step 1: Upgrade Firebase Admin to supported current major**

Run:

```powershell
npm install firebase-admin@14.0.0
```

Expected: `firebase-admin@14.0.0` installed and no high/critical vulnerabilities introduced.

- [ ] **Step 2: Run production audit**

Run:

```powershell
npm audit --omit=dev --json
```

Expected: high and critical counts are zero. Moderate Firebase Admin transitive advisories are documented if npm's suggested fix downgrades to a worse vulnerable version.

- [ ] **Step 3: Verify existing app after dependency change**

Run:

```powershell
npm test
npm run build
```

Expected: all tests and build pass.

---

### Task 2: Storage Contract Before Firebase

**Files:**
- Create: `server/storePort.ts`
- Modify: `server/localStore.ts`
- Modify: `server/localApi.ts`
- Test: `tests/infrastructure/storePortCompatibility.test.ts`

- [ ] **Step 1: Write compatibility test**

The test must call a helper with `createLocalStore(tempPath)` and assert the store supports teacher, chatbot, AI settings, usage, admin logs, provider logs, and share lookup through a single `StorePort` type.

Run:

```powershell
npm test -- tests/infrastructure/storePortCompatibility.test.ts
```

Expected before implementation: TypeScript or test failure because `StorePort` does not exist.

- [ ] **Step 2: Add `StorePort`**

Define `StorePort` with the existing local store methods. Import this type in `localApi.ts` instead of importing the local implementation type directly.

- [ ] **Step 3: Re-run compatibility test**

Run:

```powershell
npm test -- tests/infrastructure/storePortCompatibility.test.ts
```

Expected: pass.

---

### Task 3: Firebase Environment Contract

**Files:**
- Create: `server/firebaseEnv.ts`
- Create: `tests/infrastructure/firebaseEnv.test.ts`
- Update: `.env.example`
- Update: `SPEC.md`

- [ ] **Step 1: Write failing env tests**

Test required server variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT
NEIS_API_KEY
OPENAI_API_KEY
```

Test optional client variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
```

Run:

```powershell
npm test -- tests/infrastructure/firebaseEnv.test.ts
```

Expected before implementation: failure because `server/firebaseEnv.ts` does not exist.

- [ ] **Step 2: Implement env parsing without leaking values**

Expose only normalized presence/config objects. Do not log secret values.

- [ ] **Step 3: Re-run env tests**

Run:

```powershell
npm test -- tests/infrastructure/firebaseEnv.test.ts
```

Expected: pass.

---

### Task 4: Firestore Adapter With Low DB Usage

**Files:**
- Create: `server/firebaseStore.ts`
- Create: `tests/infrastructure/firebaseStore.test.ts`
- Update: `SPEC.md`

- [ ] **Step 1: Write failing adapter tests using a fake Firestore**

Required behaviors:

```text
teachers/{uid}
chatbots/{chatbotId}
shareTokens/{token}
settings/ai
usageMonthly/{teacherId_yyyyMM}
providerErrors/{eventId}
adminLogs/{eventId}
```

Usage writes must update monthly aggregate documents instead of appending raw per-message events.

- [ ] **Step 2: Implement Firebase store adapter**

Implement the same `StorePort` methods as local store. Student chat text must not be stored.

- [ ] **Step 3: Re-run adapter tests**

Run:

```powershell
npm test -- tests/infrastructure/firebaseStore.test.ts
```

Expected: pass.

---

### Task 5: Firebase Auth And Role Enforcement

**Files:**
- Create: `server/authContext.ts`
- Create: `tests/infrastructure/authContext.test.ts`
- Modify: `server/localApi.ts` or split to `server/apiHandler.ts`

- [ ] **Step 1: Write failing auth tests**

Required behaviors:

```text
student share route works without login
teacher mutation requires approved or admin teacher
admin route requires admin status
pending teacher cannot create chatbot
disabled teacher cannot create chatbot
```

- [ ] **Step 2: Implement server-side auth context**

Verify Firebase ID token in production. Keep local dev fallback only for local server mode.

- [ ] **Step 3: Re-run auth tests**

Run:

```powershell
npm test -- tests/infrastructure/authContext.test.ts tests/infrastructure/localApi.test.ts
```

Expected: pass.

---

### Task 6: Vercel API Entry Point

**Files:**
- Create: `api/[...path].ts`
- Create: `server/apiHandler.ts`
- Create: `tests/infrastructure/vercelApiHandler.test.ts`
- Create: `vercel.json`

- [ ] **Step 1: Write failing request adapter tests**

Test that `/api/teachers`, `/api/share/:token`, `/api/admin/ai-settings`, `/api/chat`, and `/api/schools/search` are routed through one handler without CORS leaking secrets.

- [ ] **Step 2: Extract local API handler into shared handler**

Preserve the local development server by wiring it to the same shared handler.

- [ ] **Step 3: Add Vercel entry point**

The Vercel function must choose Firebase store in production and local store only in local development.

---

### Task 7: Teacher Sign-Up UI

**Files:**
- Create: `src/infrastructure/firebase/client.ts`
- Create: `src/presentation/auth/TeacherAuthPanel.tsx`
- Create: `src/presentation/auth/schoolSelection.ts`
- Modify: `src/presentation/App.tsx`
- Test: `tests/presentation/teacherAuthPanel.test.ts`

- [ ] **Step 1: Write failing UI tests**

Required behaviors:

```text
teacher can search school by NEIS result
teacher cannot submit with manually typed unselected school
teacher can choose email/password or Google sign-up
pending teacher sees approval waiting state
student share link hides teacher/admin tabs
```

- [ ] **Step 2: Implement Firebase client wrapper**

Keep Firebase config in `VITE_FIREBASE_*`. Do not import server secrets into browser code.

- [ ] **Step 3: Implement UI**

Use existing design system and Korean wording from `DESIGN.md`.

---

### Task 8: Usage Dashboard And Cost Display

**Files:**
- Modify: `src/presentation/routes/TeacherDashboardRoute.tsx`
- Modify: `src/presentation/routes/AdminDashboardRoute.tsx`
- Modify: `src/domain/usage/usageAccounting.ts`
- Test: `tests/presentation/usageDashboard.test.ts`

- [ ] **Step 1: Write failing dashboard tests**

Required display:

```text
teacher sees chatbot/month calls, tokens, estimated KRW cost
admin sees user-level totals
local LLM shows token count and zero cost
OpenAI shows tokens and estimated cost
```

- [ ] **Step 2: Implement UI and data mapping**

Use existing aggregate usage summaries. Do not show student message text.

---

### Task 9: Privacy, Rules, And Security Review

**Files:**
- Create: `firestore.rules`
- Create: `docs/production-security-checklist.md`
- Update: `src/presentation/legal/privacyPolicy.ts`
- Update: `TAsk.md`

- [ ] **Step 1: Write static security checks**

Use `rg` checks to ensure no server-only secret is referenced from `src/`.

- [ ] **Step 2: Add Firestore rules**

Allow direct client reads only where intentionally safe. Server-mediated writes remain preferred.

- [ ] **Step 3: Run final verification**

Run:

```powershell
npm test
npm run build
npm audit --omit=dev --json
firebase projects:list --json
```

Expected: tests/build pass, high/critical vulnerabilities are zero, Firebase CLI authenticated, remaining risks documented.
