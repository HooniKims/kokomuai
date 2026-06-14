import { Ban, Bot, KeyRound, Search, ShieldCheck, Trophy, Users } from "lucide-react";
import type { AiSettingsPayload } from "../apiClient.js";
import type { ManagedChatbot } from "../../domain/chatbot/chatbotManagement.js";
import type { AdminActionLogEvent, IdentityTeacherAccount } from "../../domain/identity/identityAccess.js";
import type { MonthlyUsageSummary } from "../../domain/usage/usageAccounting.js";
import { formatKrwCost, formatTokenCount, summarizeUsageByTeacher } from "../usage/usageDisplay.js";

export type AdminOperationView = "teacher" | "chatbot" | "usage";
export type AdminTeacherCategory = "all" | "active" | "pending" | "restricted";

export interface AdminDashboardRouteProps {
  teachers: IdentityTeacherAccount[];
  selectedTeacherIds: string[];
  setSelectedTeacherIds: (ids: string[] | ((current: string[]) => string[])) => void;
  approveSelectedTeachers: () => Promise<void>;
  rejectSelectedTeachers?: () => Promise<void>;
  rejectionReason?: string;
  setRejectionReason?: (reason: string) => void;
  createResetMailAction: (teacher: IdentityTeacherAccount) => void | Promise<void>;
  disableTeacherAsAdmin?: (teacher: IdentityTeacherAccount) => void | Promise<void>;
  resetLog: string;
  aiSettings?: AiSettingsPayload | null;
  selectedAiModelId?: string;
  setSelectedAiModelId?: (modelId: string) => void;
  updateAiModel?: (modelId: string) => void | Promise<void>;
  usageSummaries?: MonthlyUsageSummary[];
  chatbots?: ManagedChatbot[];
  disableChatbotAsAdmin?: (chatbotId: string) => void | Promise<void>;
  adminActionLogs?: AdminActionLogEvent[];
  selectedReviewTeacherId?: string;
  setSelectedReviewTeacherId?: (teacherId: string) => void;
  adminOperationView?: AdminOperationView;
  setAdminOperationView?: (view: AdminOperationView) => void;
  adminOperationSearch?: string;
  setAdminOperationSearch?: (query: string) => void;
  adminTeacherCategory?: AdminTeacherCategory;
  setAdminTeacherCategory?: (category: AdminTeacherCategory) => void;
}

export function AdminDashboardRoute({
  teachers,
  selectedTeacherIds,
  setSelectedTeacherIds,
  approveSelectedTeachers,
  rejectSelectedTeachers,
  rejectionReason = "",
  setRejectionReason,
  createResetMailAction,
  disableTeacherAsAdmin,
  resetLog,
  aiSettings,
  selectedAiModelId,
  setSelectedAiModelId,
  updateAiModel,
  usageSummaries = [],
  chatbots = [],
  disableChatbotAsAdmin,
  adminActionLogs = [],
  selectedReviewTeacherId = "",
  setSelectedReviewTeacherId,
  adminOperationView = "teacher",
  setAdminOperationView,
  adminOperationSearch = "",
  setAdminOperationSearch,
  adminTeacherCategory = "all",
  setAdminTeacherCategory,
}: AdminDashboardRouteProps) {
  const reviewTeacherId = selectedReviewTeacherId || "";
  const selectedModelId = selectedAiModelId || aiSettings?.settings.activeModelId || "";
  const isSelectedModelApplied = Boolean(selectedModelId && selectedModelId === aiSettings?.settings.activeModelId);
  const teacherNamesById = new Map(teachers.map((teacher) => [teacher.id, teacher.realName || teacher.email]));
  const teachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const chatbotsByTeacherId = groupChatbotsByTeacher(chatbots);
  const searchQuery = normalizeSearch(adminOperationSearch);
  const scopedTeachers = reviewTeacherId ? teachers.filter((teacher) => teacher.id === reviewTeacherId) : teachers;
  const filteredTeachers = scopedTeachers.filter((teacher) => {
    if (!matchesTeacherCategory(teacher, adminTeacherCategory)) return false;
    return matchesTeacherSearch(teacher, chatbotsByTeacherId.get(teacher.id) ?? [], searchQuery);
  });
  const filteredTeacherIds = new Set(filteredTeachers.map((teacher) => teacher.id));
  const filteredChatbots = chatbots.filter((chatbot) => {
    const owner = teachersById.get(chatbot.ownerTeacherId);
    if (reviewTeacherId && chatbot.ownerTeacherId !== reviewTeacherId) return false;
    if (owner && !filteredTeacherIds.has(owner.id)) return false;
    if (!owner && adminTeacherCategory !== "all") return false;
    if (!searchQuery) return true;
    return matchesChatbotSearch(chatbot, owner, searchQuery);
  });
  const usageRows = summarizeUsageByTeacher(filteredTeachers, usageSummaries).sort((left, right) => {
    if (right.conversationCount !== left.conversationCount) return right.conversationCount - left.conversationCount;
    if (right.totalTokenEstimate !== left.totalTokenEstimate) return right.totalTokenEstimate - left.totalTokenEstimate;
    if (right.estimatedCostKrw !== left.estimatedCostKrw) return right.estimatedCostKrw - left.estimatedCostKrw;
    return left.teacherName.localeCompare(right.teacherName, "ko-KR");
  });

  return (
    <section className="workspace dashboard-grid">
      <aside className="info-panel">
        <div className="panel-section">
          <span className="soft-label">관리자</span>
          <h2>승인과 계정 지원</h2>
          <p>학생 개인정보와 학생 대화 원문은 관리자 화면에 표시하지 않습니다.</p>
        </div>
        <div className="metric-stack">
          <span>승인 대기 {teachers.filter((teacher) => teacher.status === "pending").length}명</span>
          <span>전체 교사 {teachers.length}명</span>
          <span>학생 대화 원문 0건</span>
        </div>
      </aside>
      <section className="dashboard-panel">
        {aiSettings ? (
          <div className="admin-ai-settings">
            <div>
              <span className="soft-label">AI 모델</span>
              <h2>기본 응답 모델을 선택합니다.</h2>
              <p>OpenAI는 비용을 함께 집계하고, 로컬 LLM은 토큰 사용량만 집계합니다.</p>
            </div>
            <label>
              <span>사용 모델</span>
              <select value={selectedModelId} onChange={(event) => setSelectedAiModelId?.(event.target.value)}>
                {aiSettings.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} · {model.description}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="pill dark"
              onClick={() => {
                if (!selectedModelId || isSelectedModelApplied) return;
                void updateAiModel?.(selectedModelId);
              }}
              type="button"
              disabled={!selectedModelId || isSelectedModelApplied}
            >
              {isSelectedModelApplied ? "적용됨" : "적용"}
            </button>
          </div>
        ) : null}
        <div className="section-heading">
          <div>
            <span className="soft-label">승인 대기자</span>
            <h2>선택한 교사를 일괄 승인합니다.</h2>
          </div>
          <button className="pill dark" onClick={() => void approveSelectedTeachers()} type="button" disabled={selectedTeacherIds.length === 0}>
            <ShieldCheck size={16} /> 선택 승인
          </button>
        </div>
        <div className="admin-action-strip">
          <label>
            <span>거절 사유</span>
            <input value={rejectionReason} onChange={(event) => setRejectionReason?.(event.target.value)} placeholder="학교 정보 확인 필요" />
          </label>
          <button className="pill danger" onClick={() => void rejectSelectedTeachers?.()} type="button" disabled={selectedTeacherIds.length === 0}>
            <Ban size={16} /> 선택 거절
          </button>
        </div>
        <div className="teacher-list">
          {teachers.map((teacher) => (
            <article className="teacher-row" key={teacher.id}>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={selectedTeacherIds.includes(teacher.id)}
                  onChange={(event) =>
                    setSelectedTeacherIds((current) =>
                      event.target.checked ? [...current, teacher.id] : current.filter((id) => id !== teacher.id)
                    )
                  }
                />
                <span>
                  {teacher.realName} · {teacher.school.schoolName}
                </span>
              </label>
              <span className="status-pill">{teacher.status}</span>
              <button
                className="pill outline"
                onClick={() => {
                  setSelectedReviewTeacherId?.(teacher.id);
                  setAdminOperationView?.("teacher");
                }}
                type="button"
              >
                챗봇 보기
              </button>
              <button className="pill outline" onClick={() => createResetMailAction(teacher)} type="button">
                <KeyRound size={16} /> 비밀번호 초기화 메일
              </button>
              <button
                className="pill danger"
                onClick={() => void disableTeacherAsAdmin?.(teacher)}
                type="button"
                disabled={teacher.status === "disabled" || teacher.status === "admin"}
              >
                <Ban size={16} /> 교사 사용 중지
              </button>
            </article>
          ))}
        </div>
        {resetLog ? <p className="admin-log">{resetLog}</p> : null}

        <section className="usage-panel admin-operations-panel" aria-label="관리자 운영 확인">
          <div className="admin-operation-toolbar">
            <div>
              <span className="soft-label">운영 확인</span>
              <h2>교사와 챗봇 운영 상태를 확인합니다.</h2>
            </div>
            <div className="admin-operation-tabs" role="tablist" aria-label="관리자 운영 보기">
              <button
                aria-pressed={adminOperationView === "teacher"}
                className={`pill ${adminOperationView === "teacher" ? "dark" : "outline"}`}
                data-action="admin-view-teacher"
                onClick={() => setAdminOperationView?.("teacher")}
                type="button"
              >
                <Users size={16} /> 교사별 접근
              </button>
              <button
                aria-pressed={adminOperationView === "chatbot"}
                className={`pill ${adminOperationView === "chatbot" ? "dark" : "outline"}`}
                data-action="admin-view-chatbot"
                onClick={() => setAdminOperationView?.("chatbot")}
                type="button"
              >
                <Bot size={16} /> 전체 챗봇 운영
              </button>
              <button
                aria-pressed={adminOperationView === "usage"}
                className={`pill ${adminOperationView === "usage" ? "dark" : "outline"}`}
                data-action="admin-view-usage"
                onClick={() => setAdminOperationView?.("usage")}
                type="button"
              >
                <Trophy size={16} /> 사용량 순위
              </button>
            </div>
          </div>

          <div className="admin-filter-row">
            <label className="admin-search-field">
              <span>검색</span>
              <div>
                <Search size={16} aria-hidden="true" />
                <input
                  data-action="admin-operation-search"
                  value={adminOperationSearch}
                  onChange={(event) => setAdminOperationSearch?.(event.target.value)}
                  placeholder="교사명, 이메일, 학교, 챗봇명 검색"
                />
              </div>
            </label>
            <label>
              <span>사람별 분류</span>
              <select
                data-action="admin-teacher-category"
                value={adminTeacherCategory}
                onChange={(event) => setAdminTeacherCategory?.(event.target.value as AdminTeacherCategory)}
              >
                <option value="all">전체 교사</option>
                <option value="active">승인·관리자</option>
                <option value="pending">승인 대기</option>
                <option value="restricted">제한됨</option>
              </select>
            </label>
          </div>

          {adminOperationView === "teacher"
            ? TeacherOperationView({
                chatbotsByTeacherId,
                disableChatbotAsAdmin,
                filteredTeachers,
                reviewTeacherId,
                searchQuery,
                setSelectedReviewTeacherId,
                usageSummaries,
              })
            : null}

          {adminOperationView === "chatbot"
            ? ChatbotOperationView({
                chatbots: filteredChatbots,
                disableChatbotAsAdmin,
                teacherNamesById,
              })
            : null}

          {adminOperationView === "usage" ? UsageRankingView({ rows: usageRows }) : null}
        </section>

        {adminActionLogs.length > 0 ? (
          <section className="usage-panel" aria-label="관리자 작업 로그">
            <div className="section-heading compact">
              <div>
                <span className="soft-label">기록</span>
                <h2>관리자 작업 로그</h2>
              </div>
            </div>
            <div className="usage-row-list">
              {adminActionLogs.slice(0, 8).map((log) => (
                <article className="usage-row" key={log.id}>
                  <div>
                    <strong>{log.action}</strong>
                    <p>
                      {log.targetTeacherId}
                      {log.targetChatbotId ? ` · ${log.targetChatbotId}` : ""} · {new Date(log.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <span>{log.adminId}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}

function TeacherOperationView({
  filteredTeachers,
  chatbotsByTeacherId,
  usageSummaries,
  searchQuery,
  reviewTeacherId,
  setSelectedReviewTeacherId,
  disableChatbotAsAdmin,
}: {
  filteredTeachers: IdentityTeacherAccount[];
  chatbotsByTeacherId: Map<string, ManagedChatbot[]>;
  usageSummaries: MonthlyUsageSummary[];
  searchQuery: string;
  reviewTeacherId: string;
  setSelectedReviewTeacherId?: (teacherId: string) => void;
  disableChatbotAsAdmin?: (chatbotId: string) => void | Promise<void>;
}) {
  const usageByTeacher = new Map(summarizeUsageByTeacher(filteredTeachers, usageSummaries).map((row) => [row.teacherId, row]));

  return (
    <div className="admin-operation-body">
      <div className="section-heading compact">
        <div>
          <span className="soft-label">교사별 접근</span>
          <h2>교사별 챗봇 확인</h2>
          <p>{reviewTeacherId ? "선택한 교사가 만든 챗봇과 교사별 사용량입니다." : "사람별로 챗봇, 상태, 교사별 사용량을 확인할 수 있습니다."}</p>
        </div>
        {reviewTeacherId ? (
          <button className="pill outline" type="button" onClick={() => setSelectedReviewTeacherId?.("")}>
            전체 보기
          </button>
        ) : null}
      </div>
      {filteredTeachers.length > 0 ? (
        <div className="admin-teacher-card-list">
          {filteredTeachers.map((teacher) => {
            const ownedChatbots = chatbotsByTeacherId.get(teacher.id) ?? [];
            const visibleOwnedChatbots = getVisibleTeacherChatbots(teacher, ownedChatbots, searchQuery);
            const usage = usageByTeacher.get(teacher.id);
            return (
              <article className="admin-teacher-card" key={teacher.id}>
                <div className="admin-teacher-card-header">
                  <div>
                    <strong>{teacher.realName || teacher.email}</strong>
                    <p>
                      {teacher.email} · {teacher.school.schoolName}
                    </p>
                  </div>
                  <span className="status-pill">{teacher.status}</span>
                </div>
                <div className="admin-teacher-metrics">
                  <span>챗봇 {ownedChatbots.length}개</span>
                  <span>대화 {usage?.conversationCount ?? 0}회</span>
                  <span>{formatTokenCount(usage?.totalTokenEstimate ?? 0)} 토큰</span>
                  <span>예상 비용 {formatKrwCost(usage?.estimatedCostKrw ?? 0)}</span>
                </div>
                <div className="admin-owned-chatbot-list">
                  {visibleOwnedChatbots.length > 0 ? (
                    visibleOwnedChatbots.map((chatbot) => (
                      <div className="admin-owned-chatbot" key={chatbot.id}>
                        <span>
                          {chatbot.name} · {chatbot.subject} · {chatbot.lifecycle.status}
                        </span>
                        <button
                          className="pill danger"
                          onClick={() => void disableChatbotAsAdmin?.(chatbot.id)}
                          type="button"
                          disabled={chatbot.lifecycle.status !== "active"}
                        >
                          <Ban size={16} /> 비활성화
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="admin-empty-text">조건에 맞는 챗봇이 없습니다.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="admin-log">조건에 맞는 교사가 없습니다.</p>
      )}
    </div>
  );
}

function ChatbotOperationView({
  chatbots,
  teacherNamesById,
  disableChatbotAsAdmin,
}: {
  chatbots: ManagedChatbot[];
  teacherNamesById: Map<string, string>;
  disableChatbotAsAdmin?: (chatbotId: string) => void | Promise<void>;
}) {
  return (
    <div className="admin-operation-body">
      <div className="section-heading compact">
        <div>
          <span className="soft-label">운영</span>
          <h2>전체 챗봇 운영</h2>
          <p>검색 조건에 맞는 챗봇을 한 번에 확인하고 비활성화할 수 있습니다.</p>
        </div>
      </div>
      {chatbots.length > 0 ? (
        <div className="usage-row-list">
          {chatbots.map((chatbot) => (
            <article className="usage-row" key={chatbot.id}>
              <div>
                <strong>{chatbot.name}</strong>
                <p>
                  {teacherNamesById.get(chatbot.ownerTeacherId) ?? chatbot.ownerTeacherId} · {chatbot.subject} · {chatbot.lifecycle.status}
                </p>
              </div>
              <button
                className="pill danger"
                onClick={() => void disableChatbotAsAdmin?.(chatbot.id)}
                type="button"
                disabled={chatbot.lifecycle.status !== "active"}
              >
                <Ban size={16} /> 비활성화
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-log">조건에 맞는 챗봇이 없습니다.</p>
      )}
    </div>
  );
}

function UsageRankingView({ rows }: { rows: ReturnType<typeof summarizeUsageByTeacher> }) {
  return (
    <div className="admin-operation-body">
      <div className="section-heading compact">
        <div>
          <span className="soft-label">사용량</span>
          <h2>사용량 순위</h2>
          <p>대화 수, 토큰 수, 예상 비용 순서로 정렬합니다.</p>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="usage-row-list">
          {rows.map((row, index) => (
            <article className="usage-row usage-rank-row" key={row.teacherId}>
              <strong className="usage-rank">{`${index + 1}위`}</strong>
              <div>
                <strong>{row.teacherName}</strong>
                <p>
                  {row.schoolName} · {row.status}
                </p>
              </div>
              <span>{row.conversationCount}회</span>
              <span>{formatTokenCount(row.totalTokenEstimate)} 토큰</span>
              <span>예상 비용 {formatKrwCost(row.estimatedCostKrw)}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-log">조건에 맞는 사용량이 없습니다.</p>
      )}
    </div>
  );
}

function groupChatbotsByTeacher(chatbots: ManagedChatbot[]): Map<string, ManagedChatbot[]> {
  const map = new Map<string, ManagedChatbot[]>();
  for (const chatbot of chatbots) {
    const current = map.get(chatbot.ownerTeacherId) ?? [];
    current.push(chatbot);
    map.set(chatbot.ownerTeacherId, current);
  }
  return map;
}

function matchesTeacherCategory(teacher: IdentityTeacherAccount, category: AdminTeacherCategory): boolean {
  if (category === "all") return true;
  if (category === "active") return teacher.status === "approved" || teacher.status === "admin";
  if (category === "pending") return teacher.status === "pending";
  return teacher.status === "disabled" || teacher.status === "rejected";
}

function matchesTeacherSearch(teacher: IdentityTeacherAccount, ownedChatbots: ManagedChatbot[], query: string): boolean {
  if (!query) return true;
  if (textIncludes(query, teacher.realName, teacher.email, teacher.school.schoolName, teacher.school.region, teacher.status)) return true;
  return ownedChatbots.some((chatbot) => matchesChatbotSearch(chatbot, teacher, query));
}

function matchesChatbotSearch(chatbot: ManagedChatbot, owner: IdentityTeacherAccount | undefined, query: string): boolean {
  if (!query) return true;
  return textIncludes(
    query,
    chatbot.name,
    chatbot.subject,
    chatbot.topic,
    chatbot.learningGoal,
    chatbot.lifecycle.status,
    owner?.realName,
    owner?.email,
    owner?.school.schoolName,
  );
}

function getVisibleTeacherChatbots(teacher: IdentityTeacherAccount, chatbots: ManagedChatbot[], query: string): ManagedChatbot[] {
  if (!query || textIncludes(query, teacher.realName, teacher.email, teacher.school.schoolName, teacher.status)) return chatbots;
  return chatbots.filter((chatbot) => matchesChatbotSearch(chatbot, teacher, query));
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function textIncludes(query: string, ...values: Array<string | undefined>): boolean {
  return values.some((value) => value?.toLowerCase().includes(query));
}
