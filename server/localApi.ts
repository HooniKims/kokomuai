import type http from "node:http";
import { listAvailableAiModels } from "../src/domain/ai/modelCatalog.js";
import { updateAiSettingsModel } from "../src/domain/ai/aiSettings.js";
import {
  createChatbot,
  deleteChatbot,
  disableChatbotByAdmin,
  enableShareLink,
  isShareLinkAccessible,
  type ManagedChatbot,
  updateChatbot,
  type CreateChatbotInput,
} from "../src/domain/chatbot/chatbotManagement.js";
import type {
  CurriculumIndex,
  CurriculumRecommendationCandidate,
} from "./curriculumIndex.js";
import {
  approveTeacher,
  canUseTeacherFeatures,
  createPasswordResetAction,
  disableTeacher,
  rejectTeacher,
  registerLocalTeacher,
  type IdentityTeacherAccount,
  type RegisterLocalTeacherInput,
} from "../src/domain/identity/identityAccess.js";
import type { NeisSchool } from "./neisSchoolSearch.js";
import type { StorePort } from "./storePort.js";
import {
  requireAdminAuth,
  requireTeacherFeatureAuth,
  resolveRequestAuthContext,
  type VerifyIdToken,
} from "./authContext.js";
import {
  isBootstrapAdminEmail,
  promoteBootstrapAdminProfile,
} from "./adminBootstrap.js";
import { isPayloadTooLargeError, readJson } from "./httpJson.js";
import { applyCorsHeaders, writeCorsPreflight } from "./cors.js";

export type SchoolSearchDependency = (query: string) => Promise<NeisSchool[]>;
type EnvironmentSource = Record<string, string | undefined>;

export interface LocalApiDependencies {
  store: StorePort;
  curriculumIndex?: CurriculumIndex;
  schoolSearch?: SchoolSearchDependency;
  env?: EnvironmentSource;
  auth?: {
    requireFirebaseAuth: boolean;
    verifyIdToken: VerifyIdToken;
  };
  passwordResetEmail?: (email: string) => Promise<void>;
}

export function createLocalApiHandler(
  dependencies: LocalApiDependencies,
): http.RequestListener {
  return async (request, response) => {
    applyCorsHeaders(request, response, dependencies.env);

    if (request.method === "OPTIONS") {
      writeCorsPreflight(request, response, dependencies.env);
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    try {
      if (request.method === "GET" && url.pathname === "/api/teachers") {
        if (dependencies.auth?.requireFirebaseAuth) {
          const context = await resolveTeacherListAuthContextFromRequest(
            request,
            dependencies,
          );
          const visibleTeachers =
            context.teacher.status === "admin"
              ? await dependencies.store.listTeachers()
              : [context.teacher];
          sendJson(response, 200, { teachers: visibleTeachers });
          return;
        }

        const teachers = await dependencies.store.listTeachers();
        sendJson(response, 200, { teachers });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/schools/search") {
        const query = (url.searchParams.get("q") ?? "").trim();
        if (query.length < 2) {
          sendJson(response, 200, { schools: [] });
          return;
        }
        const schools = dependencies.schoolSearch
          ? await dependencies.schoolSearch(query)
          : [];
        sendJson(response, 200, { schools });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/admin/ai-settings"
      ) {
        if (dependencies.auth?.requireFirebaseAuth) {
          await requireAdminFromRequest(request, dependencies);
        }
        sendJson(response, 200, {
          settings: await dependencies.store.getAiSettings(),
          models: listAvailableAiModels(),
        });
        return;
      }

      if (
        request.method === "PATCH" &&
        url.pathname === "/api/admin/ai-settings"
      ) {
        const body = await readJson<{ adminId?: string; modelId?: string }>(
          request,
        );
        const admin = dependencies.auth?.requireFirebaseAuth
          ? await requireAdminFromRequest(request, dependencies)
          : body.adminId
            ? await dependencies.store.getTeacher(body.adminId)
            : undefined;
        if (!admin || admin.status !== "admin") {
          sendJson(response, 403, { error: "admin_not_allowed" });
          return;
        }

        try {
          const next = updateAiSettingsModel(
            await dependencies.store.getAiSettings(),
            {
              modelId: body.modelId ?? "",
              adminId: admin.id,
              now: new Date().toISOString(),
            },
          );
          await dependencies.store.saveAiSettings(next);
          sendJson(response, 200, {
            settings: next,
            models: listAvailableAiModels(),
          });
        } catch (error) {
          sendJson(response, 400, {
            error: "invalid_ai_model",
            message:
              error instanceof Error ? error.message : "Invalid AI model",
          });
        }
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/account/withdraw") {
        const context = await resolveRequiredAuthContextFromRequest(
          request,
          dependencies,
        );
        const result = await dependencies.store.updateTeacherWithAdminAction(
          context.teacher.id,
          (teacher) =>
            disableTeacher(teacher, {
              adminId: teacher.id,
              now: new Date().toISOString(),
              logId: createId("admin-log"),
            }),
        );
        if (!result) {
          sendJson(response, 404, { error: "teacher_not_found" });
          return;
        }

        sendJson(response, 200, { teacher: result.teacher });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/teachers") {
        const body = await readJson<RegisterLocalTeacherInput>(request);
        const verified = dependencies.auth?.requireFirebaseAuth
          ? await requireVerifiedFirebaseTokenFromRequest(request, dependencies)
          : undefined;
        const now = new Date().toISOString();
        const teacher = registerLocalTeacher(
          {
            ...body,
            email: verified?.email ?? body.email,
            passwordHash: verified ? "firebase-auth" : body.passwordHash,
          },
          {
            id: verified?.uid ?? createId("teacher"),
            now,
          },
        );
        const shouldBootstrapAdmin = Boolean(
          verified && isBootstrapAdminEmail(verified.email, dependencies.env),
        );
        const profileToSave: {
          teacher: IdentityTeacherAccount;
          event?: ReturnType<typeof promoteBootstrapAdminProfile>["event"];
        } = shouldBootstrapAdmin
          ? promoteBootstrapAdminProfile(teacher, {
              now,
              logId: createId("admin-log"),
            })
          : { teacher };
        const result = await dependencies.store.saveTeacherIfEmailAbsent(
          profileToSave.teacher,
        );
        if (result.created && profileToSave.event) {
          try {
            await dependencies.store.appendAdminActionLog(profileToSave.event);
          } catch (error) {
            console.warn(
              "admin action log write failed after teacher profile creation",
              error,
            );
          }
        }
        if (
          !result.created &&
          shouldBootstrapAdmin &&
          result.teacher.status !== "admin"
        ) {
          const promoted =
            await dependencies.store.updateTeacherWithAdminAction(
              result.teacher.id,
              (existing) =>
                existing.status === "admin"
                  ? { teacher: existing }
                  : promoteBootstrapAdminProfile(existing, {
                      now,
                      logId: createId("admin-log"),
                    }),
            );
          sendJson(response, 200, {
            teacher: promoted?.teacher ?? result.teacher,
          });
          return;
        }

        sendJson(response, result.created ? 201 : 200, {
          teacher: result.teacher,
        });
        return;
      }

      const approveMatch = /^\/api\/admin\/teachers\/([^/]+)\/approve$/.exec(
        url.pathname,
      );
      if (request.method === "POST" && approveMatch) {
        const body = await readJson<{ adminId?: string }>(request);
        const admin = dependencies.auth?.requireFirebaseAuth
          ? await requireAdminFromRequest(request, dependencies)
          : body.adminId
            ? await dependencies.store.getTeacher(body.adminId)
            : undefined;
        if (!admin || admin.status !== "admin") {
          sendJson(response, 403, { error: "admin_not_allowed" });
          return;
        }

        const result = await dependencies.store.updateTeacherWithAdminAction(
          approveMatch[1],
          (teacher) => {
            if (teacher.status === "approved") {
              return { teacher };
            }

            return approveTeacher(teacher, {
              adminId: admin.id,
              now: new Date().toISOString(),
              logId: createId("admin-log"),
            });
          },
        );
        if (!result) {
          sendJson(response, 404, { error: "teacher_not_found" });
          return;
        }

        sendJson(response, 200, result);
        return;
      }

      const rejectTeacherMatch =
        /^\/api\/admin\/teachers\/([^/]+)\/reject$/.exec(url.pathname);
      if (request.method === "POST" && rejectTeacherMatch) {
        const body = await readJson<{ adminId?: string; reason?: string }>(
          request,
        );
        const admin = dependencies.auth?.requireFirebaseAuth
          ? await requireAdminFromRequest(request, dependencies)
          : body.adminId
            ? await dependencies.store.getTeacher(body.adminId)
            : undefined;
        if (!admin || admin.status !== "admin") {
          sendJson(response, 403, { error: "admin_not_allowed" });
          return;
        }

        const result = await dependencies.store.updateTeacherWithAdminAction(
          rejectTeacherMatch[1],
          (teacher) => {
            if (teacher.status === "rejected") {
              return { teacher };
            }

            return rejectTeacher(teacher, {
              adminId: admin.id,
              now: new Date().toISOString(),
              logId: createId("admin-log"),
              reason: body.reason ?? "학교 정보 확인 필요",
            });
          },
        );
        if (!result) {
          sendJson(response, 404, { error: "teacher_not_found" });
          return;
        }

        sendJson(response, 200, result);
        return;
      }

      const disableTeacherMatch =
        /^\/api\/admin\/teachers\/([^/]+)\/disable$/.exec(url.pathname);
      if (request.method === "POST" && disableTeacherMatch) {
        const body = await readJson<{ adminId?: string }>(request);
        const admin = dependencies.auth?.requireFirebaseAuth
          ? await requireAdminFromRequest(request, dependencies)
          : body.adminId
            ? await dependencies.store.getTeacher(body.adminId)
            : undefined;
        if (!admin || admin.status !== "admin") {
          sendJson(response, 403, { error: "admin_not_allowed" });
          return;
        }

        const result = await dependencies.store.updateTeacherWithAdminAction(
          disableTeacherMatch[1],
          (teacher) => {
            if (teacher.status === "disabled") {
              return { teacher };
            }

            return disableTeacher(teacher, {
              adminId: admin.id,
              now: new Date().toISOString(),
              logId: createId("admin-log"),
            });
          },
        );
        if (!result) {
          sendJson(response, 404, { error: "teacher_not_found" });
          return;
        }

        sendJson(response, 200, result);
        return;
      }

      const disableChatbotMatch =
        /^\/api\/admin\/chatbots\/([^/]+)\/disable$/.exec(url.pathname);
      if (request.method === "POST" && disableChatbotMatch) {
        const body = await readJson<{ adminId?: string }>(request);
        const admin = dependencies.auth?.requireFirebaseAuth
          ? await requireAdminFromRequest(request, dependencies)
          : body.adminId
            ? await dependencies.store.getTeacher(body.adminId)
            : undefined;
        if (!admin || admin.status !== "admin") {
          sendJson(response, 403, { error: "admin_not_allowed" });
          return;
        }

        const chatbot = await dependencies.store.getChatbot(
          disableChatbotMatch[1],
        );
        if (!chatbot || chatbot.lifecycle.status === "deleted") {
          sendJson(response, 404, { error: "chatbot_not_found" });
          return;
        }

        const result = disableChatbotByAdmin(chatbot, {
          adminId: admin.id,
          now: new Date().toISOString(),
          logId: createId("admin-log"),
        });
        await dependencies.store.saveChatbot(result.chatbot);
        await dependencies.store.appendAdminActionLog(result.event);
        sendJson(response, 200, { chatbot: result.chatbot });
        return;
      }

      const passwordResetMatch =
        /^\/api\/admin\/teachers\/([^/]+)\/password-reset$/.exec(url.pathname);
      if (request.method === "POST" && passwordResetMatch) {
        const body = await readJson<{ adminId?: string }>(request);
        const admin = dependencies.auth?.requireFirebaseAuth
          ? await requireAdminFromRequest(request, dependencies)
          : body.adminId
            ? await dependencies.store.getTeacher(body.adminId)
            : undefined;
        if (!admin || admin.status !== "admin") {
          sendJson(response, 403, { error: "admin_not_allowed" });
          return;
        }

        const teacher = await dependencies.store.getTeacher(
          passwordResetMatch[1],
        );
        if (!teacher) {
          sendJson(response, 404, { error: "teacher_not_found" });
          return;
        }

        await dependencies.passwordResetEmail?.(teacher.email);
        const result = createPasswordResetAction({
          teacherId: teacher.id,
          email: teacher.email,
          adminId: admin.id,
          now: new Date().toISOString(),
          actionId: createId("password-reset"),
          logId: createId("admin-log"),
        });
        await dependencies.store.appendAdminActionLog(result.event);
        sendJson(response, 200, { action: result.action });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/chatbots") {
        const body = await readJson<CreateChatbotInput>(request);
        const owner = dependencies.auth?.requireFirebaseAuth
          ? await requireTeacherFromRequest(request, dependencies)
          : await dependencies.store.getTeacher(body.ownerTeacherId);
        if (!owner || !canUseTeacherFeatures(owner)) {
          sendJson(response, 403, { error: "teacher_not_approved" });
          return;
        }

        const chatbot = createChatbot(
          {
            ...body,
            ownerTeacherId: owner.id,
          },
          {
            id: createId("chatbot"),
            now: new Date().toISOString(),
          },
        );
        await dependencies.store.saveChatbot(chatbot);
        sendJson(response, 201, { chatbot });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/chatbots") {
        const authTeacher = dependencies.auth?.requireFirebaseAuth
          ? await requireTeacherFromRequest(request, dependencies)
          : undefined;
        const ownerTeacherId =
          authTeacher && authTeacher.status !== "admin"
            ? authTeacher.id
            : url.searchParams.get("ownerTeacherId");
        const source = ownerTeacherId
          ? await dependencies.store.listChatbotsByOwner(ownerTeacherId)
          : await dependencies.store.listChatbots();
        const chatbots = source.filter(
          (chatbot) => chatbot.lifecycle.status !== "deleted",
        );
        sendJson(response, 200, {
          chatbots,
        });
        return;
      }

      const chatbotMatch = /^\/api\/chatbots\/([^/]+)$/.exec(url.pathname);
      if (
        (request.method === "PATCH" || request.method === "DELETE") &&
        chatbotMatch
      ) {
        const body = await readJson<{
          actorTeacherId: string;
          patch?: Partial<Omit<CreateChatbotInput, "ownerTeacherId">>;
        }>(request);
        const actor = dependencies.auth?.requireFirebaseAuth
          ? await requireTeacherFromRequest(request, dependencies)
          : await dependencies.store.getTeacher(body.actorTeacherId);
        if (!actor || !canUseTeacherFeatures(actor)) {
          sendJson(response, 403, { error: "teacher_not_approved" });
          return;
        }

        const chatbot = await dependencies.store.getChatbot(chatbotMatch[1]);
        if (!chatbot) {
          sendJson(response, 404, { error: "chatbot_not_found" });
          return;
        }

        try {
          const next =
            request.method === "PATCH"
              ? updateChatbot(chatbot, body.patch ?? {}, {
                  actorTeacherId: actor.id,
                  now: new Date().toISOString(),
                })
              : deleteChatbot(chatbot, {
                  actorTeacherId: actor.id,
                  now: new Date().toISOString(),
                });
          await dependencies.store.saveChatbot(next);
          sendJson(response, 200, { chatbot: next });
        } catch (error) {
          sendJson(response, 403, {
            error: "chatbot_forbidden",
            message:
              error instanceof Error ? error.message : "Cannot manage chatbot",
          });
        }
        return;
      }

      const shareMatch = /^\/api\/chatbots\/([^/]+)\/share$/.exec(url.pathname);
      if (request.method === "POST" && shareMatch) {
        const body = await readJson<{
          actorTeacherId: string;
          token?: string;
          expiresAt?: string | null;
        }>(request);
        const actor = dependencies.auth?.requireFirebaseAuth
          ? await requireTeacherFromRequest(request, dependencies)
          : await dependencies.store.getTeacher(body.actorTeacherId);
        if (!actor || !canUseTeacherFeatures(actor)) {
          sendJson(response, 403, { error: "teacher_not_approved" });
          return;
        }

        const chatbot = await dependencies.store.getChatbot(shareMatch[1]);
        if (!chatbot) {
          sendJson(response, 404, { error: "chatbot_not_found" });
          return;
        }

        const shared = enableShareLink(chatbot, {
          actorTeacherId: actor.id,
          token: body.token ?? createOpaqueToken(chatbot.id),
          expiresAt: body.expiresAt ?? null,
        });
        await dependencies.store.saveChatbot(shared);
        sendJson(response, 200, { chatbot: shared });
        return;
      }

      const shareTokenMatch = /^\/api\/share\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && shareTokenMatch) {
        const chatbot = await dependencies.store.findChatbotByShareToken(
          shareTokenMatch[1],
        );
        if (
          !chatbot ||
          !isShareLinkAccessible(
            chatbot,
            url.searchParams.get("now") ?? new Date().toISOString(),
          )
        ) {
          sendJson(response, 404, { error: "share_not_found" });
          return;
        }

        sendJson(response, 200, { chatbot: toPublicSharedChatbot(chatbot) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/usage") {
        if (dependencies.auth?.requireFirebaseAuth) {
          const context = await resolveRequiredAuthContextFromRequest(
            request,
            dependencies,
          );
          const summaries =
            context.teacher.status === "admin"
              ? await dependencies.store.listUsageSummaries()
              : await dependencies.store.listUsageSummariesByTeacher(
                  context.teacher.id,
                );
          const visibleSummaries =
            context.teacher.status === "admin"
              ? summaries
              : summaries.filter(
                  (summary) => summary.teacherId === context.teacher.id,
                );
          sendJson(response, 200, { summaries: visibleSummaries });
          return;
        }

        const summaries = await dependencies.store.listUsageSummaries();
        sendJson(response, 200, { summaries });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/admin/provider-errors"
      ) {
        if (dependencies.auth?.requireFirebaseAuth) {
          await requireAdminFromRequest(request, dependencies);
        }
        sendJson(response, 200, {
          logs: await dependencies.store.listProviderErrorLogs(),
        });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/admin/action-logs"
      ) {
        if (dependencies.auth?.requireFirebaseAuth) {
          await requireAdminFromRequest(request, dependencies);
        }
        sendJson(response, 200, {
          logs: await dependencies.store.listAdminActionLogs(),
        });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/curriculum/recommend"
      ) {
        const topic = url.searchParams.get("topic") ?? "";
        const schoolLevel = url.searchParams.get("schoolLevel");
        const gradeBand = url.searchParams.get("gradeBand");
        const subject = url.searchParams.get("subject");
        const recommendations = dependencies.curriculumIndex
          ? dependencies.curriculumIndex
              .search(topic)
              .filter((candidate) =>
                matchesCurriculumFilters(candidate, {
                  schoolLevel,
                  gradeBand,
                  subject,
                }),
              )
              .slice(0, 8)
              .map(toCurriculumApiItem)
          : [];
        sendJson(response, 200, { recommendations });
        return;
      }
    } catch (error) {
      if (isPayloadTooLargeError(error)) {
        sendJson(response, 413, {
          error: "payload_too_large",
          message:
            "요청 내용이 너무 큽니다. 입력 내용을 줄여 다시 시도해 주세요.",
        });
        return;
      }

      if (isAuthorizationError(error)) {
        sendJson(response, 403, { error: error.message });
        return;
      }

      sendJson(response, 500, {
        error: "local_api_error",
        message:
          "요청을 처리하는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  };
}

function toCurriculumApiItem(candidate: CurriculumRecommendationCandidate) {
  const recommendationScope = candidate.area.trim() || candidate.subject;

  return {
    chunkId: candidate.chunkId,
    label:
      candidate.score >= 5
        ? "추천"
        : candidate.score >= 2
          ? "관련 있음"
          : "검토 필요",
    reason: `${recommendationScope} 영역에서 수업 주제와 연결되는 성취기준입니다.`,
    matchedTerms: candidate.matchedTerms,
    score: candidate.score,
    chunk: {
      id: candidate.id,
      sourceTitle: candidate.sourceTitle,
      schoolLevel: candidate.schoolLevel,
      gradeBand: candidate.gradeBand,
      subject: candidate.subject,
      area: candidate.area,
      achievement: candidate.achievement,
      excerpt: candidate.excerpt,
      sectionPath: candidate.sectionPath,
    },
  };
}

function toPublicSharedChatbot(chatbot: ManagedChatbot) {
  return {
    id: chatbot.id,
    name: chatbot.name,
    schoolLevel: chatbot.schoolLevel,
    gradeBand: chatbot.gradeBand,
    subject: chatbot.subject,
    topic: chatbot.topic,
    learningGoal: chatbot.learningGoal,
    hintStrength: chatbot.hintStrength,
    persona: chatbot.persona,
    curriculumLinks: chatbot.curriculumLinks,
    share: {
      enabled: true,
      publicToken: chatbot.share.publicToken,
      expiresAt: chatbot.share.expiresAt,
    },
  };
}

function matchesCurriculumFilters(
  candidate: CurriculumRecommendationCandidate,
  filters: {
    schoolLevel: string | null;
    gradeBand: string | null;
    subject: string | null;
  },
): boolean {
  if (filters.schoolLevel && candidate.schoolLevel !== filters.schoolLevel) {
    return false;
  }

  if (
    filters.gradeBand &&
    !matchesGradeBand(candidate.gradeBand, filters.gradeBand)
  ) {
    return false;
  }

  if (
    filters.subject &&
    normalizeSubject(candidate.subject) !== normalizeSubject(filters.subject)
  ) {
    return false;
  }

  return true;
}

function normalizeSubject(subject: string): string {
  return subject.replace(/\s+/g, "").toLowerCase();
}

function matchesGradeBand(
  candidateGradeBand: string,
  requestedGradeBand: string,
): boolean {
  if (candidateGradeBand === "all") return true;
  if (candidateGradeBand === requestedGradeBand) return true;

  const range = /^(\d+)-(\d+)$/.exec(candidateGradeBand);
  const requested = Number(requestedGradeBand);
  if (!range || Number.isNaN(requested)) return false;

  const start = Number(range[1]);
  const end = Number(range[2]);
  return requested >= start && requested <= end;
}

async function requireTeacherFromRequest(
  request: http.IncomingMessage,
  dependencies: LocalApiDependencies,
): Promise<IdentityTeacherAccount> {
  if (!dependencies.auth) throw new Error("auth_required");
  const context = await resolveRequiredAuthContextFromRequest(
    request,
    dependencies,
  );
  return requireTeacherFeatureAuth(context);
}

async function resolveTeacherListAuthContextFromRequest(
  request: http.IncomingMessage,
  dependencies: LocalApiDependencies,
) {
  try {
    return await resolveRequiredAuthContextFromRequest(request, dependencies);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "teacher_profile_not_found"
    ) {
      throw error;
    }

    const verified = await requireVerifiedFirebaseTokenFromRequest(
      request,
      dependencies,
    );
    if (!isBootstrapAdminEmail(verified.email, dependencies.env)) {
      throw error;
    }

    const teacher = await ensureBootstrapAdminProfile(verified, dependencies);
    return {
      kind: "teacher" as const,
      uid: teacher.id,
      teacher,
    };
  }
}

async function ensureBootstrapAdminProfile(
  verified: { uid: string; email?: string },
  dependencies: LocalApiDependencies,
): Promise<IdentityTeacherAccount> {
  const now = new Date().toISOString();
  const teacher = registerLocalTeacher(
    {
      realName: verified.email ?? "관리자",
      email: verified.email ?? "",
      passwordHash: "firebase-auth",
      school: {
        schoolName: "관리자 계정",
        schoolKind: "관리자",
        officeCode: "ADMIN",
        standardSchoolCode: "ADMIN",
        region: "운영",
      },
    },
    { id: verified.uid, now },
  );
  const profile = promoteBootstrapAdminProfile(teacher, {
    now,
    logId: createId("admin-log"),
  });
  const result = await dependencies.store.saveTeacherIfEmailAbsent(profile.teacher);

  if (result.created) {
    try {
      await dependencies.store.appendAdminActionLog(profile.event);
    } catch (error) {
      console.warn(
        "admin action log write failed after bootstrap admin profile creation",
        error,
      );
    }
    return result.teacher;
  }

  if (result.teacher.status === "admin") return result.teacher;

  const promoted = await dependencies.store.updateTeacherWithAdminAction(
    result.teacher.id,
    (existing) =>
      existing.status === "admin"
        ? { teacher: existing }
        : promoteBootstrapAdminProfile(existing, {
            now,
            logId: createId("admin-log"),
          }),
  );
  return promoted?.teacher ?? result.teacher;
}

async function resolveRequiredAuthContextFromRequest(
  request: http.IncomingMessage,
  dependencies: LocalApiDependencies,
) {
  if (!dependencies.auth) throw new Error("auth_required");
  const context = await resolveRequestAuthContext({
    authorizationHeader: getAuthorizationHeader(request),
    store: dependencies.store,
    verifyIdToken: dependencies.auth.verifyIdToken,
  });
  if (context.kind !== "teacher") throw new Error("auth_required");
  return context;
}

async function requireVerifiedFirebaseTokenFromRequest(
  request: http.IncomingMessage,
  dependencies: LocalApiDependencies,
) {
  if (!dependencies.auth) throw new Error("auth_required");
  const token = parseBearerToken(getAuthorizationHeader(request));
  if (!token) throw new Error("auth_required");

  try {
    return await dependencies.auth.verifyIdToken(token);
  } catch {
    throw new Error("invalid_token");
  }
}

async function requireAdminFromRequest(
  request: http.IncomingMessage,
  dependencies: LocalApiDependencies,
): Promise<IdentityTeacherAccount> {
  if (!dependencies.auth) throw new Error("auth_required");
  const context = await resolveRequiredAuthContextFromRequest(
    request,
    dependencies,
  );
  return requireAdminAuth(context);
}

function getAuthorizationHeader(
  request: http.IncomingMessage,
): string | undefined {
  const value = request.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

function parseBearerToken(value: string | undefined): string {
  if (!value) return "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() ?? "";
}

function isAuthorizationError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    [
      "auth_required",
      "teacher_not_approved",
      "admin_not_allowed",
      "teacher_profile_not_found",
      "invalid_token",
    ].includes(error.message)
  );
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  payload: unknown,
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createOpaqueToken(seed: string): string {
  return `${seed.replace(/[^a-z0-9]/gi, "")}${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    .padEnd(24, "x")
    .slice(0, 32);
}
