# Upstage Curriculum Reranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder real curriculum recommendation candidates with Upstage Solar Pro 2 while preserving the current internal ranking as the unconditional fallback.

**Architecture:** Keep lexical retrieval and curriculum filtering unchanged. Add one server-side adapter that sends only retrieved candidates to Upstage, parses a strict JSON ID list, removes unknown IDs, appends omitted candidates in internal order, and returns the original list for every unavailable or invalid API outcome.

**Tech Stack:** TypeScript 5.9, Node 22+, Vitest, ky, Zod, Upstage OpenAI-compatible chat completions API

---

### Task 1: Lock the reranking contract with failing tests

**Files:**
- Create: `tests/infrastructure/curriculumReranker.test.ts`
- Create: `server/curriculumReranker.ts`

- [ ] Write tests using a local HTTP test server for successful reordering, unknown-ID removal, non-2xx fallback, invalid-payload fallback, timeout fallback, and missing-key fallback.
- [ ] Run `npx vitest run tests/infrastructure/curriculumReranker.test.ts` and confirm failure because the adapter does not exist.
- [ ] Add readonly input/result types and a `rerankCurriculumCandidates()` export returning the ordered candidate list.
- [ ] Parse the Upstage response with Zod and merge only IDs found in the supplied candidate map.
- [ ] Configure ky with no retry and a bounded timeout; handle expected HTTP/network/timeout failures by returning the original list.
- [ ] Re-run the focused test and confirm all cases pass.

### Task 2: Connect reranking to the recommendation endpoint

**Files:**
- Modify: `server/localApi.ts`
- Modify: `tests/infrastructure/localApi.test.ts`

- [ ] Add a failing endpoint test whose internal first result is wrong and whose fake Upstage response promotes the correct candidate.
- [ ] Add a failing endpoint test proving an unavailable Upstage endpoint returns the original internal order with HTTP 200.
- [ ] Run the focused endpoint tests and confirm they fail before route integration.
- [ ] In `/api/curriculum/recommend`, retain the filtered internal candidate list, call the adapter with query and filter context, and map the first eight results through the existing response mapper.
- [ ] Extend the local API test helper with server environment input and re-run focused tests.

### Task 3: Configure the server-only Upstage variables

**Files:**
- Modify: `.env.example`
- Modify: `.env` (ignored local configuration)
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Add ky and Zod using the existing npm package manager.
- [ ] Document `UPSTAGE_API_URL`, `UPSTAGE_API_KEY`, `UPSTAGE_MODEL=solar-pro2`, and `UPSTAGE_TIMEOUT_MS=3000` in `.env.example`.
- [ ] Change only the ignored local `UPSTAGE_MODEL` value to `solar-pro2`; preserve every secret value.

### Task 4: Verify the complete behavior

**Files:**
- Verify all modified files.

- [ ] Run focused reranker and endpoint tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the local full stack and call `/api/curriculum/recommend` with a known hard case; observe the Upstage-corrected top result.
- [ ] Start or configure a no-key/bad-endpoint instance and observe the same endpoint returning the internal result with HTTP 200.
- [ ] Use Computer Use in Chrome to enter a chatbot name, subject, school level, grade, topic, and learning goal and observe the curriculum recommendation cards.
