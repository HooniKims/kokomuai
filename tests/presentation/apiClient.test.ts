import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveTeacher,
  createChatbot,
  enableShareLink,
  getAiSettings,
  getSharedChatbot,
  getCurriculumRecommendations,
  getAdminActionLogs,
  listChatbots,
  listTeachers,
  registerTeacher,
  searchSchools,
  disableTeacherAsAdmin,
  rejectTeacherAsAdmin,
  sendTeacherPasswordResetEmail,
  setApiAuthTokenProvider,
  disableChatbotAsAdmin,
  updateAiSettings
} from "../../src/presentation/apiClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setApiAuthTokenProvider(null);
  vi.restoreAllMocks();
});

function mockJsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("apiClient", () => {
  it("uses local API routes for teacher and chatbot workflows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/teachers" && init?.method === undefined) return mockJsonResponse({ teachers: [{ id: "local-admin" }] });
      if (url === "/api/teachers" && init?.method === "POST") return mockJsonResponse({ teacher: { id: "teacher-1" } }, { status: 201 });
      if (url === "/api/admin/teachers/teacher-1/approve") return mockJsonResponse({ teacher: { id: "teacher-1", status: "approved" } });
      if (url === "/api/admin/teachers/teacher-1/password-reset") {
        return mockJsonResponse({ action: { type: "send_password_reset_email", email: "teacher@example.com" } });
      }
      if (url === "/api/admin/teachers/teacher-1/disable") {
        return mockJsonResponse({ teacher: { id: "teacher-1", status: "disabled" } });
      }
      if (url === "/api/admin/teachers/teacher-1/reject") {
        return mockJsonResponse({ teacher: { id: "teacher-1", status: "rejected", rejectionReason: "학교 정보 확인 필요" } });
      }
      if (url === "/api/admin/action-logs") {
        return mockJsonResponse({ logs: [{ id: "admin-log-1", action: "teacher_rejected", targetTeacherId: "teacher-1" }] });
      }
      if (url === "/api/admin/chatbots/chatbot-2/disable") {
        return mockJsonResponse({ chatbot: { id: "chatbot-2", lifecycle: { status: "disabled" }, share: { enabled: false } } });
      }
      if (url === "/api/chatbots?ownerTeacherId=teacher-1") return mockJsonResponse({ chatbots: [{ id: "chatbot-1" }] });
      if (url === "/api/chatbots" && init?.method === "POST") return mockJsonResponse({ chatbot: { id: "chatbot-2" } }, { status: 201 });
      if (url === "/api/chatbots/chatbot-2/share") return mockJsonResponse({ chatbot: { id: "chatbot-2", share: { enabled: true } } });
      if (url === "/api/share/public-token") return mockJsonResponse({ chatbot: { id: "chatbot-2" } });
      if (url === "/api/curriculum/recommend?topic=water+state&schoolLevel=elementary&gradeBand=5-6&subject=science") {
        return mockJsonResponse({ recommendations: [{ chunkId: "science-water" }] });
      }
      if (url === "/api/schools/search?q=%EC%83%88%EB%B9%9B%EC%A4%91") {
        return mockJsonResponse({ schools: [{ schoolName: "새빛중학교", standardSchoolCode: "1234567" }] });
      }
      if (url === "/api/admin/ai-settings" && init?.method === undefined) {
        return mockJsonResponse({
          settings: { activeModelId: "openai:gpt-5.4-nano" },
          models: [{ id: "openai:gpt-5.4-nano" }]
        });
      }
      if (url === "/api/admin/ai-settings" && init?.method === "PATCH") {
        return mockJsonResponse({
          settings: { activeModelId: "lmstudio:gemma-4-12b-it" },
          models: [{ id: "lmstudio:gemma-4-12b-it" }]
        });
      }
      return mockJsonResponse({ error: "not_found" }, { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(listTeachers()).resolves.toEqual([{ id: "local-admin" }]);
    await expect(
      registerTeacher({
        realName: "Teacher",
        email: "teacher@example.com",
        passwordHash: "hash",
        school: {
          schoolName: "Local School",
          schoolKind: "elementary",
          officeCode: "LOCAL",
          standardSchoolCode: "LOCAL",
          region: "local"
        }
      })
    ).resolves.toEqual({ id: "teacher-1" });
    await expect(approveTeacher("teacher-1", "local-admin")).resolves.toMatchObject({ id: "teacher-1", status: "approved" });
    await expect(listChatbots("teacher-1")).resolves.toEqual([{ id: "chatbot-1" }]);
    await expect(
      createChatbot({
        ownerTeacherId: "teacher-1",
        name: "Science Bot",
        schoolLevel: "elementary",
        gradeBand: "5-6",
        subject: "science",
        topic: "water state change",
        learningGoal: "Guide students.",
        hintStrength: "medium",
        persona: "teacher"
      })
    ).resolves.toEqual({ id: "chatbot-2" });
    await expect(enableShareLink("chatbot-2", "teacher-1")).resolves.toMatchObject({ id: "chatbot-2", share: { enabled: true } });
    await expect(getSharedChatbot("public-token")).resolves.toEqual({ id: "chatbot-2" });
    await expect(getCurriculumRecommendations("water state", { schoolLevel: "elementary", gradeBand: "5-6", subject: "science" })).resolves.toEqual([
      { chunkId: "science-water" }
    ]);
    await expect(searchSchools("새빛중")).resolves.toEqual([{ schoolName: "새빛중학교", standardSchoolCode: "1234567" }]);
    await expect(getAiSettings()).resolves.toMatchObject({ settings: { activeModelId: "openai:gpt-5.4-nano" } });
    await expect(updateAiSettings("local-admin", "lmstudio:gemma-4-12b-it")).resolves.toMatchObject({
      settings: { activeModelId: "lmstudio:gemma-4-12b-it" }
    });
    await expect(sendTeacherPasswordResetEmail("teacher-1", "local-admin")).resolves.toEqual({
      type: "send_password_reset_email",
      email: "teacher@example.com"
    });
    await expect(disableTeacherAsAdmin("teacher-1", "local-admin")).resolves.toEqual({
      id: "teacher-1",
      status: "disabled"
    });
    await expect(rejectTeacherAsAdmin("teacher-1", "local-admin", "학교 정보 확인 필요")).resolves.toEqual({
      id: "teacher-1",
      status: "rejected",
      rejectionReason: "학교 정보 확인 필요"
    });
    await expect(getAdminActionLogs()).resolves.toEqual([{ id: "admin-log-1", action: "teacher_rejected", targetTeacherId: "teacher-1" }]);
    await expect(disableChatbotAsAdmin("chatbot-2", "local-admin")).resolves.toEqual({
      id: "chatbot-2",
      lifecycle: { status: "disabled" },
      share: { enabled: false }
    });
  });

  it("throws the server message for failed local API calls", async () => {
    globalThis.fetch = vi.fn(async () => mockJsonResponse({ message: "권한이 없습니다." }, { status: 403 })) as typeof fetch;

    await expect(listChatbots("teacher-1")).rejects.toThrow("권한이 없습니다.");
  });

  it("adds a Firebase ID token to API requests when a token provider is configured", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({ teachers: [] }));
    globalThis.fetch = fetchMock as typeof fetch;
    setApiAuthTokenProvider(async () => "firebase-id-token");

    await listTeachers();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teachers",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer firebase-id-token"
        })
      })
    );
  });
});
