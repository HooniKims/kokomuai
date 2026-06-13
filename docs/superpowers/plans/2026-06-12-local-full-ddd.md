# Local Full DDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current local MVP demo into a maintainable DDD-first local full app that supports teacher/admin/student flows and Gemma-based local LLM testing.

**Architecture:** Keep domain rules in `src/domain/*`, use application services in `src/application/*`, expose local persistence through `server/*`, and let React call APIs through a thin `src/presentation/apiClient.ts`. Student conversations remain browser-local; teacher/admin/chatbot/share/usage metadata persists in local JSON.

**Tech Stack:** React, Vite, TypeScript, Vitest, Node local API server, LM Studio OpenAI-compatible streaming API.

---

### Task 1: Local Development Tracker

**Files:**
- Modify: `spec_check.json`

- [x] **Step 1: Replace MVP status table with DDD local full tracker**

Write `spec_check.json` with `tracking_mode`, `ddd_contexts`, and `milestones`.

- [x] **Step 2: Verify JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('spec_check.json','utf8')); console.log('json ok')"`

Expected: `json ok`

### Task 2: Identity and Access Domain

**Files:**
- Create: `src/domain/identity/identityAccess.ts`
- Create: `tests/domain/identityAccess.test.ts`
- Modify: `src/domain/teacher/teacherAccount.ts` only if compatibility exports are needed.

- [x] **Step 1: Write failing tests**

Tests must cover local teacher registration, approval, rejection, disabling, admin promotion, and password reset action creation without exposing passwords.

- [x] **Step 2: Run the focused test**

Run: `npm test -- tests/domain/identityAccess.test.ts`

Expected: fail because `src/domain/identity/identityAccess.ts` does not exist.

- [x] **Step 3: Implement the identity domain**

Create pure functions only. No server, React, localStorage, fetch, or filesystem calls in this file.

- [x] **Step 4: Run focused and full tests**

Run: `npm test -- tests/domain/identityAccess.test.ts`

Expected: pass.

Run: `npm test`

Expected: all tests pass.

### Task 3: Chatbot Authoring Domain

**Files:**
- Modify: `src/domain/chatbot/chatbotManagement.ts`
- Modify: `tests/domain/chatbotManagement.test.ts`

- [x] **Step 1: Write failing tests for full authoring rules**

Tests must cover validation for required fields, overly broad topic detection, update rules, deletion rules, share expiration, share disabling, and owner-only operations.

- [x] **Step 2: Run the focused test**

Run: `npm test -- tests/domain/chatbotManagement.test.ts`

Expected: fail for missing update/delete/share-disable rules.

- [x] **Step 3: Implement domain functions**

Add functions such as `validateChatbotDraft`, `updateChatbot`, `deleteChatbot`, `disableShareLink`, and `assertCanManageChatbot`.

- [x] **Step 4: Run focused and full tests**

Run: `npm test -- tests/domain/chatbotManagement.test.ts`

Expected: pass.

Run: `npm test`

Expected: all tests pass.

### Task 4: Conversation Policy Domain

**Files:**
- Create: `src/domain/conversation/conversationGuard.ts`
- Create: `tests/domain/conversationGuard.test.ts`
- Modify: `src/domain/chatPolicy/buildStudentSystemPrompt.ts`

- [x] **Step 1: Write failing tests**

Tests must classify `answer_request`, `out_of_scope`, `prompt_injection`, `unsafe`, `privacy_risk`, and `normal`.

- [x] **Step 2: Run focused test**

Run: `npm test -- tests/domain/conversationGuard.test.ts`

Expected: fail because guard file does not exist.

- [x] **Step 3: Implement guard**

The guard returns policy decisions. It must not call the AI provider.

- [x] **Step 4: Run focused and full tests**

Run: `npm test -- tests/domain/conversationGuard.test.ts tests/domain/chatPolicy.test.ts`

Expected: pass.

Run: `npm test`

Expected: all tests pass.

### Task 4.5: Student Message Application Use Case

**Files:**
- Create: `src/application/conversation/sendStudentMessage.ts`
- Create: `tests/application/conversation/sendStudentMessage.test.ts`

- [x] **Step 1: Write failing tests**

Tests cover privacy guard before provider call, normal provider call with policy prompt and recent history, usage event creation without raw text, and provider error event creation without raw text.

- [x] **Step 2: Run focused test**

Run: `npm test -- tests/application/conversation/sendStudentMessage.test.ts`

Expected: fail because application use case file does not exist.

- [x] **Step 3: Implement use case with dependency-injected provider**

The use case accepts an `AiChatProvider`, classifies the student message, builds provider messages, and returns `guardrail`, `ai_response`, or `provider_error`.

- [x] **Step 4: Run focused and full tests**

Run: `npm test -- tests/application/conversation/sendStudentMessage.test.ts`

Expected: pass.

Run: `npm test`

Expected: all tests pass.

### Task 5: Usage Domain

**Files:**
- Create: `src/domain/usage/usageAccounting.ts`
- Create: `tests/domain/usageAccounting.test.ts`

- [x] **Step 1: Write failing tests**

Tests must record chat calls by `student_share` and `teacher_preview`, estimate tokens without storing student message text, and aggregate by teacher and chatbot.

- [x] **Step 2: Run focused test**

Run: `npm test -- tests/domain/usageAccounting.test.ts`

Expected: fail because usage domain does not exist.

- [x] **Step 3: Implement pure usage accounting**

Use metadata and token counts only. Do not store student prompt or assistant response text.

- [x] **Step 4: Run focused and full tests**

Run: `npm test -- tests/domain/usageAccounting.test.ts`

Expected: pass.

Run: `npm test`

Expected: all tests pass.

### Task 6: Local Store and API

**Files:**
- Create: `server/localStore.ts`
- Create: `server/localApi.ts`
- Modify: `server/dev-server.ts`
- Create: `tests/infrastructure/localStore.test.ts`
- Create: `tests/infrastructure/localApi.test.ts`

- [x] **Step 1: Write failing local store tests**

Tests must verify seed data creation, teacher persistence, chatbot persistence, share token lookup, usage append, and error log redaction.

- [x] **Step 2: Run focused test**

Run: `npm test -- tests/infrastructure/localStore.test.ts`

Expected: fail because `server/localStore.ts` does not exist.

- [x] **Step 3: Implement local store**

Use JSON under `server/data/local-dev-store.json`. Keep writes atomic with temp file then rename.

- [x] **Step 4: Add first local API routes**

Add `/api/teachers`, `/api/admin/teachers/:id/approve`, `/api/chatbots`, `/api/chatbots/:id/share`, `/api/share/:token`, `/api/usage`, and `/api/admin/provider-errors`.

Authoring API status: create/list/update/delete/share/resolve routes exist. UI still needs an explicit edit surface.

- [x] **Step 5: Run tests and smoke API**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: build succeeds.

Actual:
- `npm test` passed, 14 test files / 53 tests.
- `npm run build` passed.
- Local HTTP smoke passed through `/api/health`, teacher registration, admin approval, chatbot creation, share enable, share token resolution, `/api/usage`, and `/api/admin/provider-errors`.
- Review fixes added `server/chatProxy.ts`, local JSON read-time log normalization, admin actor validation, teacher status validation for share enable, 127.0.0.1 server binding, and summaries-only `/api/usage`.
- Follow-up local API routes added for `GET /api/chatbots`, `PATCH /api/chatbots/:id`, and `DELETE /api/chatbots/:id`.

### Task 7: Presentation Split and API Client

**Files:**
- Create: `src/presentation/apiClient.ts`
- Create: `src/presentation/components/*`
- Create: `src/presentation/routes/*`
- Modify: `src/presentation/App.tsx`
- Modify: `src/presentation/styles.css`

- [x] **Step 1: Add API client**

Create fetch wrappers for teacher, admin, chatbot, share, usage, and chat APIs.

- [x] **Step 2: Split routes**

Move student, teacher, and admin screens out of `App.tsx`.

- [x] **Step 3: Wire first local full flows**

Teacher creates/updates/deletes chatbots through server APIs. Student loads `/s/:token`. Admin actions call server APIs.

Current:
- `src/presentation/apiClient.ts` wraps teacher, admin approval, chatbot list/create/update/delete/share, share token lookup, usage summaries, and provider errors.
- `src/presentation/App.tsx` initializes a local approved teacher through API, loads teacher chatbots through API, creates/shares/deletes chatbots through API, resolves `/s/:token`, reads usage summaries, and reads curriculum recommendations through API.
- `src/presentation/routes/StudentChatRoute.tsx`, `TeacherDashboardRoute.tsx`, and `AdminDashboardRoute.tsx` hold the screen UI.

Remaining:
- Add explicit UI affordance for chatbot update/edit.
- Add Playwright screenshots after route split.

- [x] **Step 4: Verify UI**

Run: `npm run build`

Expected: build succeeds.

Run Playwright smoke script to capture teacher/admin/student screenshots.

Actual:
- TypeScript build passes after route split.
- Playwright student/teacher/admin screenshots pass with no console errors.

### Task 8: Curriculum Index

**Files:**
- Create: `server/curriculumIndex.ts`
- Modify: `src/domain/curriculum/curriculumRecommendation.ts`
- Create: `tests/infrastructure/curriculumIndex.test.ts`

- [x] **Step 1: Write failing tests**

Tests must build chunks from a small markdown fixture and search by topic terms.

- [x] **Step 2: Implement indexer**

Parse headings, subject/source title, achievement-like lines, and surrounding excerpt.

- [x] **Step 3: Connect API**

Expose `/api/curriculum/recommend?topic=&schoolLevel=&gradeBand=`.

Actual:
- `server/curriculumRepository.ts` lazy-loads Markdown files from `2022_Revised_National_Curriculum/documents`.
- `server/localApi.ts` exposes `/api/curriculum/recommend` with `schoolLevel` and `gradeBand` filters.
- `src/presentation/apiClient.ts` and `App.tsx` use the API for teacher dashboard recommendations.

- [x] **Step 4: Verify**

Run: `npm test -- tests/infrastructure/curriculumIndex.test.ts tests/domain/curriculumRecommendation.test.ts`

Expected: pass.

Actual:
- Focused curriculum/local API/client tests pass.
- Full `npm test` passes, 16 test files / 59 tests.
- `npm run build` passes.
- Playwright teacher recommendation smoke passes with no console errors.

### Task 9: Full Local Verification

**Files:**
- Create: `tests/e2e/localFullFlow.mjs`
- Output: `artifacts/local-full-*.png`
- Output: `artifacts/local-full-result.json`

- [x] **Step 1: Start servers**

Run local API and Vite servers.

- [ ] **Step 2: Execute E2E flow**

Flow: teacher signup -> admin approval -> teacher login -> chatbot create -> share on -> student open share link -> ask Gemma question -> download evidence -> admin usage check.

- [ ] **Step 3: Verify outputs**

Expected: screenshots exist, JSON result says no page errors, no UI error text, assistant response length greater than 20, usage count increments.

Current:
- Local API is running on `http://127.0.0.1:8787`.
- Vite is running on `http://127.0.0.1:5173`.
- Playwright student/teacher/admin screenshots exist in `artifacts/local-final-*.png`.
- `artifacts/local-final-ui-smoke.json` reports no page or console errors.
- `artifacts/local-gemma-chat-result.json` confirms `/api/chat` HTTP 200 with `unsloth/gemma-4-12b-it` streaming response.

Remaining:
- Automate the full button-level flow including create -> share -> `/s/:token` -> student chat -> PDF/TXT download -> usage increment.
