import { describe, expect, it } from "vitest";
import { createFirebaseStore, type FirestoreDocumentLike, type FirestoreLike } from "../../server/firebaseStore";
import { createChatbot, enableShareLink } from "../../src/domain/chatbot/chatbotManagement";
import { approveTeacher, registerLocalTeacher } from "../../src/domain/identity/identityAccess";
import { createUsageEvent } from "../../src/domain/usage/usageAccounting";

class FakeFirestoreDocument {
  constructor(
    private readonly path: string,
    private readonly data: Map<string, unknown>,
    private readonly writes: string[]
  ) {}

  async get() {
    const value = this.data.get(this.path);
    return {
      exists: value !== undefined,
      data: () => clone(value),
      id: this.path.split("/").at(-1) ?? this.path
    };
  }

  async set(value: unknown, options?: { merge?: boolean }) {
    this.writes.push(this.path);
    const current = this.data.get(this.path);
    this.data.set(this.path, options?.merge && isRecord(current) && isRecord(value) ? { ...current, ...value } : clone(value));
  }

  async delete() {
    this.writes.push(this.path);
    this.data.delete(this.path);
  }
}

class FakeFirestoreCollection {
  constructor(
    private readonly path: string,
    private readonly data: Map<string, unknown>,
    private readonly queries: string[] = [],
    private readonly filters: Array<{ fieldPath: string; value: unknown }> = []
  ) {}

  where(fieldPath: string, opStr: "==", value: unknown) {
    if (opStr !== "==") throw new Error(`Unsupported fake Firestore op: ${opStr}`);
    this.queries.push(`${this.path}:${fieldPath}==${String(value)}`);
    return new FakeFirestoreCollection(this.path, this.data, this.queries, [...this.filters, { fieldPath, value }]);
  }

  async get() {
    const prefix = `${this.path}/`;
    const docs = Array.from(this.data.entries())
      .filter(([path]) => path.startsWith(prefix) && path.slice(prefix.length).split("/").length === 1)
      .filter(([, value]) => this.filters.every((filter) => getFieldValue(value, filter.fieldPath) === filter.value))
      .map(([path, value]) => ({
        id: path.slice(prefix.length),
        data: () => clone(value)
      }));
    return { docs };
  }
}

class FakeFirestore implements FirestoreLike {
  readonly data = new Map<string, unknown>();
  readonly writes: string[] = [];
  readonly queries: string[] = [];
  private transactionQueue = Promise.resolve();

  doc(path: string) {
    return new FakeFirestoreDocument(path, this.data, this.writes);
  }

  collection(path: string) {
    return new FakeFirestoreCollection(path, this.data, this.queries);
  }

  runTransaction<T>(updateFunction: (transaction: FakeFirestoreTransaction) => Promise<T>): Promise<T> {
    const run = this.transactionQueue.then(() => updateFunction(new FakeFirestoreTransaction()));
    this.transactionQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

class FakeFirestoreTransaction {
  get(document: FirestoreDocumentLike) {
    return document.get();
  }

  set(document: FirestoreDocumentLike, value: unknown, options?: { merge?: boolean }) {
    return document.set(value, options);
  }
}

const selectedSchool = {
  schoolName: "새빛중학교",
  schoolKind: "중학교",
  officeCode: "B10",
  standardSchoolCode: "1234567",
  region: "서울"
};

describe("firebaseStore", () => {
  it("writes teachers and chatbots to compact Firestore documents with share token lookup", async () => {
    const firestore = new FakeFirestore();
    const store = createFirebaseStore(firestore);
    const teacher = approveTeacher(
      registerLocalTeacher(
        {
          realName: "김하늘",
          email: "teacher@example.com",
          passwordHash: "firebase-auth",
          school: selectedSchool
        },
        { id: "teacher-1", now: "2026-06-13T01:00:00.000Z" }
      ),
      { adminId: "admin-1", now: "2026-06-13T01:01:00.000Z", logId: "admin-log-1" }
    ).teacher;
    const chatbot = enableShareLink(
      createChatbot(
        {
          ownerTeacherId: teacher.id,
          name: "중학교 국어 품사",
          schoolLevel: "middle",
          gradeBand: "1",
          subject: "국어",
          topic: "품사의 종류와 특성",
          learningGoal: "품사의 역할을 문장 속에서 구분한다.",
          hintStrength: "medium",
          persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
        },
        { id: "chatbot-1", now: "2026-06-13T01:02:00.000Z" }
      ),
      { actorTeacherId: teacher.id, token: "share-token-1234567890", expiresAt: null }
    );

    await store.saveTeacher(teacher);
    await store.saveChatbot(chatbot);

    expect(await store.getTeacher("teacher-1")).toMatchObject({ id: "teacher-1", status: "approved" });
    expect(await store.getChatbot("chatbot-1")).toMatchObject({ id: "chatbot-1", ownerTeacherId: "teacher-1" });
    expect(await store.findChatbotByShareToken("share-token-1234567890")).toMatchObject({ id: "chatbot-1" });
    expect(firestore.writes).toEqual(["teachers/teacher-1", "chatbots/chatbot-1", "shareTokens/share-token-1234567890"]);
  });

  it("aggregates usage by month instead of writing raw usage event documents", async () => {
    const firestore = new FakeFirestore();
    const store = createFirebaseStore(firestore);
    const usage = createUsageEvent({
      id: "usage-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-13T01:03:00.000Z",
      surface: "student_share",
      inputText: "관형사와 부사의 차이가 궁금해",
      outputText: "두 말이 꾸미는 대상이 어떻게 다른지 문장에서 찾아볼까요?",
      modelId: "openai:gpt-5.4-nano",
      inputTokens: 100,
      outputTokens: 120
    });

    await store.appendUsageEvent(usage);

    expect(firestore.writes).toEqual(["usageMonthly/teacher-1_2026-06_chatbot-1"]);
    expect(Array.from(firestore.data.keys())).not.toContain("usageEvents/usage-1");
    expect(await store.listUsageEvents()).toEqual([expect.objectContaining({ id: "aggregate-teacher-1_2026-06_chatbot-1" })]);
    expect(await store.listUsageSummaries()).toEqual([
      expect.objectContaining({
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        month: "2026-06",
        conversationCount: 1,
        aiCallCount: 1,
        inputTokenEstimate: 100,
        outputTokenEstimate: 120
      })
    ]);
    expect(JSON.stringify(Array.from(firestore.data.values()))).not.toContain("관형사와 부사의 차이가 궁금해");
  });

  it("does not lose monthly usage counts when two student chats finish at the same time", async () => {
    const firestore = new FakeFirestore();
    const store = createFirebaseStore(firestore);
    const firstUsage = createUsageEvent({
      id: "usage-1",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-1",
      occurredAt: "2026-06-13T01:03:00.000Z",
      surface: "student_share",
      inputText: "관형사와 부사의 차이가 궁금해",
      outputText: "꾸미는 대상이 어떻게 다른지 문장에서 찾아볼까요?",
      modelId: "openai:gpt-5.4-nano",
      inputTokens: 100,
      outputTokens: 120
    });
    const secondUsage = createUsageEvent({
      id: "usage-2",
      teacherId: "teacher-1",
      chatbotId: "chatbot-1",
      conversationId: "conversation-2",
      occurredAt: "2026-06-13T01:04:00.000Z",
      surface: "student_share",
      inputText: "품사는 왜 나누나요?",
      outputText: "단어가 문장에서 하는 일을 생각해 볼까요?",
      modelId: "openai:gpt-5.4-nano",
      inputTokens: 80,
      outputTokens: 90
    });

    await Promise.all([store.appendUsageEvent(firstUsage), store.appendUsageEvent(secondUsage)]);

    await expect(store.listUsageSummariesByTeacher("teacher-1")).resolves.toEqual([
      expect.objectContaining({
        teacherId: "teacher-1",
        chatbotId: "chatbot-1",
        conversationCount: 2,
        aiCallCount: 2,
        inputTokenEstimate: 180,
        outputTokenEstimate: 210
      })
    ]);
  });

  it("queries teacher-owned chatbots and usage summaries without reading every document", async () => {
    const firestore = new FakeFirestore();
    const store = createFirebaseStore(firestore);
    const teacherOne = createApprovedTeacher("teacher-1", "teacher@example.com");
    const teacherTwo = createApprovedTeacher("teacher-2", "other@example.com");
    const chatbotOne = createOwnedChatbot("chatbot-1", teacherOne.id);
    const chatbotTwo = createOwnedChatbot("chatbot-2", teacherTwo.id);

    await store.saveTeacher(teacherOne);
    await store.saveTeacher(teacherTwo);
    await store.saveChatbot(chatbotOne);
    await store.saveChatbot(chatbotTwo);
    await store.appendUsageEvent(
      createUsageEvent({
        id: "usage-1",
        teacherId: teacherOne.id,
        chatbotId: chatbotOne.id,
        conversationId: "conversation-1",
        occurredAt: "2026-06-13T01:03:00.000Z",
        surface: "student_share",
        inputText: "품사가 궁금해",
        outputText: "문장에서 단어의 역할을 같이 살펴볼까요?",
        modelId: "openai:gpt-5.4-nano",
        inputTokens: 20,
        outputTokens: 30
      })
    );
    await store.appendUsageEvent(
      createUsageEvent({
        id: "usage-2",
        teacherId: teacherTwo.id,
        chatbotId: chatbotTwo.id,
        conversationId: "conversation-2",
        occurredAt: "2026-06-13T01:04:00.000Z",
        surface: "student_share",
        inputText: "일차방정식이 궁금해",
        outputText: "등식의 성질부터 떠올려 볼까요?",
        modelId: "openai:gpt-5.4-nano",
        inputTokens: 20,
        outputTokens: 30
      })
    );

    await expect(store.saveTeacherIfEmailAbsent(createApprovedTeacher("teacher-3", "teacher@example.com"))).resolves.toMatchObject({
      teacher: expect.objectContaining({ id: teacherOne.id }),
      created: false
    });
    await expect(store.listChatbotsByOwner(teacherOne.id)).resolves.toEqual([expect.objectContaining({ id: chatbotOne.id })]);
    await expect(store.listUsageSummariesByTeacher(teacherOne.id)).resolves.toEqual([expect.objectContaining({ teacherId: teacherOne.id })]);
    expect(firestore.queries).toEqual(
      expect.arrayContaining([
        "teachers:email==teacher@example.com",
        "chatbots:ownerTeacherId==teacher-1",
        "usageMonthly:teacherId==teacher-1"
      ])
    );
  });
});

function createApprovedTeacher(id: string, email: string) {
  return approveTeacher(
    registerLocalTeacher(
      {
        realName: "김하늘",
        email,
        passwordHash: "firebase-auth",
        school: selectedSchool
      },
      { id, now: "2026-06-13T01:00:00.000Z" }
    ),
    { adminId: "admin-1", now: "2026-06-13T01:01:00.000Z", logId: `admin-log-${id}` }
  ).teacher;
}

function createOwnedChatbot(id: string, ownerTeacherId: string) {
  return createChatbot(
    {
      ownerTeacherId,
      name: "중학교 국어 품사",
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "국어",
      topic: "품사의 종류와 특성",
      learningGoal: "품사의 역할을 문장 속에서 구분한다.",
      hintStrength: "medium",
      persona: "답을 바로 주지 않고 질문으로 돕는 국어 선생님"
    },
    { id, now: "2026-06-13T01:02:00.000Z" }
  );
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFieldValue(value: unknown, fieldPath: string): unknown {
  if (!isRecord(value)) return undefined;
  return fieldPath.split(".").reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);
}
