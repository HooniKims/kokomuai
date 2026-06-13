import { Ban, KeyRound, ShieldCheck } from "lucide-react";
import type { AiSettingsPayload } from "../apiClient.js";
import type { ManagedChatbot } from "../../domain/chatbot/chatbotManagement.js";
import type { AdminActionLogEvent, IdentityTeacherAccount } from "../../domain/identity/identityAccess.js";
import type { MonthlyUsageSummary } from "../../domain/usage/usageAccounting.js";
import { formatKrwCost, formatTokenCount, summarizeUsageByTeacher } from "../usage/usageDisplay.js";

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
  updateAiModel?: (modelId: string) => void | Promise<void>;
  usageSummaries?: MonthlyUsageSummary[];
  chatbots?: ManagedChatbot[];
  disableChatbotAsAdmin?: (chatbotId: string) => void | Promise<void>;
  adminActionLogs?: AdminActionLogEvent[];
  selectedReviewTeacherId?: string;
  setSelectedReviewTeacherId?: (teacherId: string) => void;
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
  updateAiModel,
  usageSummaries = [],
  chatbots = [],
  disableChatbotAsAdmin,
  adminActionLogs = [],
  selectedReviewTeacherId = "",
  setSelectedReviewTeacherId
}: AdminDashboardRouteProps) {
  const reviewTeacherId = selectedReviewTeacherId || "";
  const reviewTeacher = teachers.find((teacher) => teacher.id === reviewTeacherId);
  const visibleChatbots = reviewTeacherId ? chatbots.filter((chatbot) => chatbot.ownerTeacherId === reviewTeacherId) : chatbots;
  const usageRows = summarizeUsageByTeacher(
    reviewTeacherId ? teachers.filter((teacher) => teacher.id === reviewTeacherId) : teachers,
    reviewTeacherId ? usageSummaries.filter((summary) => summary.teacherId === reviewTeacherId) : usageSummaries
  );
  const teacherNamesById = new Map(teachers.map((teacher) => [teacher.id, teacher.realName || teacher.email]));

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
              <select value={aiSettings.settings.activeModelId} onChange={(event) => void updateAiModel?.(event.target.value)}>
                {aiSettings.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName} · {model.description}
                  </option>
                ))}
              </select>
            </label>
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
              <button className="pill outline" onClick={() => setSelectedReviewTeacherId?.(teacher.id)} type="button">
                챗봇 보기
              </button>
              <button className="pill outline" onClick={() => createResetMailAction(teacher)} type="button">
                <KeyRound size={16} /> 재설정 메일
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
        <section className="usage-panel" aria-label="교사별 챗봇 확인">
          <div className="section-heading compact">
            <div>
              <span className="soft-label">교사별 접근</span>
              <h2>교사별 챗봇 확인</h2>
              <p>{reviewTeacher ? `${reviewTeacher.realName || reviewTeacher.email} 교사가 만든 챗봇입니다.` : "교사를 선택하면 해당 교사가 만든 챗봇만 확인할 수 있습니다."}</p>
            </div>
            {reviewTeacherId ? (
              <button className="pill outline" type="button" onClick={() => setSelectedReviewTeacherId?.("")}>
                전체 보기
              </button>
            ) : null}
          </div>
          {visibleChatbots.length > 0 ? (
            <div className="usage-row-list">
              {visibleChatbots.map((chatbot) => (
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
            <p className="admin-log">선택한 교사가 만든 챗봇이 아직 없습니다.</p>
          )}
        </section>
        {!reviewTeacherId && chatbots.length > 0 ? (
          <section className="usage-panel" aria-label="챗봇 운영">
            <div className="section-heading compact">
              <div>
                <span className="soft-label">운영</span>
                <h2>전체 챗봇 운영</h2>
              </div>
            </div>
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
          </section>
        ) : null}
        {usageRows.length > 0 ? (
          <section className="usage-panel" aria-label="교사별 사용량">
            <div className="section-heading compact">
              <div>
                <span className="soft-label">사용량</span>
                <h2>교사별 사용량</h2>
              </div>
            </div>
            <div className="usage-row-list">
              {usageRows.map((row) => (
                <article className="usage-row" key={row.teacherId}>
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
          </section>
        ) : null}
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
