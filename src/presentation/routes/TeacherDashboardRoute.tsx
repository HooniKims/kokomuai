import { Calendar, Check, CheckCircle2, Copy, Eraser, ExternalLink } from "lucide-react";
import type { ManagedChatbot } from "../../domain/chatbot/chatbotManagement.js";
import type { ChatbotPolicyInput } from "../../domain/chatbot/types.js";
import type { CurriculumRecommendationView } from "../apiClient.js";
import { formatSchoolLevelLabel } from "../schoolLevelLabel.js";
import { teacherChatbotSample } from "../teacherChatbotSample.js";
import { formatRecommendationRelevance } from "../curriculumRecommendationAccuracy.js";
import { formatCurriculumSelectionStatus, getVisibleCurriculumRecommendations } from "../curriculumSelection.js";
import { formatShareNotice } from "../shareNotice.js";
import { getChatbotDeletionPrompt } from "../chatbotDeletionPrompt.js";
import { formatKrwCost, formatTokenCount } from "../usage/usageDisplay.js";

export interface TeacherDashboardRouteProps {
  workspaceStatus: string;
  chatbots: ManagedChatbot[];
  usageConversationCount: number;
  usageAiCallCount: number;
  usageInputTokenCount: number;
  usageOutputTokenCount: number;
  usageEstimatedCostKrw: number;
  activeTeacherId: string;
  chatbotForm: {
    name: string;
    schoolLevel: ChatbotPolicyInput["schoolLevel"];
    topic: string;
    learningGoal: string;
    subject: string;
    gradeBand: string;
    persona: string;
    hintStrength: ChatbotPolicyInput["hintStrength"];
  };
  setChatbotForm: (form: TeacherDashboardRouteProps["chatbotForm"]) => void;
  curriculumRecommendations: CurriculumRecommendationView[];
  selectedCurriculumChunkIds: string[];
  toggleCurriculumChunkSelection: (chunkId: string) => void;
  selectedChatbotIds: string[];
  toggleChatbotSelection: (chatbotId: string) => void;
  toggleAllChatbotSelection: () => void;
  showAllCurriculumRecommendations: boolean;
  setShowAllCurriculumRecommendations: (showAll: boolean) => void;
  createLocalChatbot: () => Promise<void>;
  enableLocalShare: (chatbotId: string) => Promise<void>;
  requestLocalChatbotDeletion: (chatbotId: string) => void;
  cancelLocalChatbotDeletion: () => void;
  deleteLocalChatbot: (chatbotId: string) => Promise<void>;
  pendingDeleteChatbotId: string;
  requestSelectedLocalChatbotsDeletion: () => void;
  deleteSelectedLocalChatbots: () => Promise<void>;
  pendingSelectedDelete: boolean;
  copyShareLink: (chatbot: ManagedChatbot) => Promise<void>;
  shareNotice: string;
  shareNoticeChatbotId: string;
}

export function TeacherDashboardRoute({
  workspaceStatus,
  chatbots,
  usageConversationCount,
  usageAiCallCount,
  usageInputTokenCount,
  usageOutputTokenCount,
  usageEstimatedCostKrw,
  activeTeacherId,
  chatbotForm,
  setChatbotForm,
  curriculumRecommendations,
  selectedCurriculumChunkIds,
  toggleCurriculumChunkSelection,
  selectedChatbotIds,
  toggleChatbotSelection,
  toggleAllChatbotSelection,
  showAllCurriculumRecommendations,
  setShowAllCurriculumRecommendations,
  createLocalChatbot,
  enableLocalShare,
  requestLocalChatbotDeletion,
  cancelLocalChatbotDeletion,
  deleteLocalChatbot,
  pendingDeleteChatbotId,
  requestSelectedLocalChatbotsDeletion,
  deleteSelectedLocalChatbots,
  pendingSelectedDelete,
  copyShareLink,
  shareNotice,
  shareNoticeChatbotId
}: TeacherDashboardRouteProps) {
  const visibleShareNotice = shareNotice ? formatShareNotice(shareNotice) : null;
  const everyChatbotSelected = chatbots.length > 0 && chatbots.every((chatbot) => selectedChatbotIds.includes(chatbot.id));

  return (
    <section className="workspace dashboard-grid">
      <aside className="info-panel">
        <div className="panel-section">
          <span className="soft-label">교사 대시보드</span>
          <h2>내 챗봇과 사용량</h2>
          <p>{workspaceStatus}</p>
        </div>
        <div className="metric-stack">
          <span>챗봇 {chatbots.filter((chatbot) => chatbot.lifecycle.status === "active").length}개</span>
          <span>이번 달 대화 {usageConversationCount}회</span>
          <span>AI 호출 {usageAiCallCount}회</span>
          <span>입력 토큰 {formatTokenCount(usageInputTokenCount)}</span>
          <span>출력 토큰 {formatTokenCount(usageOutputTokenCount)}</span>
          <span>예상 비용 {formatKrwCost(usageEstimatedCostKrw)}</span>
        </div>
      </aside>

      <section className="dashboard-panel">
        <div className="section-heading">
          <div>
            <span className="soft-label">챗봇 만들기</span>
            <h2>수업 주제를 넣으면 관련 교육과정을 추천합니다.</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>
            챗봇 이름
            <input value={chatbotForm.name} placeholder={teacherChatbotSample.name} onChange={(event) => setChatbotForm({ ...chatbotForm, name: event.target.value })} />
          </label>
          <label>
            학교급
            <select
              value={chatbotForm.schoolLevel}
              onChange={(event) => setChatbotForm({ ...chatbotForm, schoolLevel: event.target.value as ChatbotPolicyInput["schoolLevel"] })}
            >
              <option value="elementary">초등학교</option>
              <option value="middle">중학교</option>
              <option value="high">고등학교</option>
              <option value="vocational_high">직업계고</option>
            </select>
          </label>
          <label>
            학년군
            <input value={chatbotForm.gradeBand} placeholder={teacherChatbotSample.gradeBand} onChange={(event) => setChatbotForm({ ...chatbotForm, gradeBand: event.target.value })} />
          </label>
          <label>
            과목
            <input value={chatbotForm.subject} placeholder={teacherChatbotSample.subject} onChange={(event) => setChatbotForm({ ...chatbotForm, subject: event.target.value })} />
          </label>
          <label>
            힌트 강도
            <select
              value={chatbotForm.hintStrength}
              onChange={(event) => setChatbotForm({ ...chatbotForm, hintStrength: event.target.value as ChatbotPolicyInput["hintStrength"] })}
            >
              <option value="low">낮음</option>
              <option value="medium">보통</option>
              <option value="high">높음</option>
            </select>
          </label>
          <label className="wide">
            수업 주제
            <input value={chatbotForm.topic} placeholder={teacherChatbotSample.topic} onChange={(event) => setChatbotForm({ ...chatbotForm, topic: event.target.value })} />
          </label>
          <label className="wide">
            대화 목표
            <textarea
              value={chatbotForm.learningGoal}
              placeholder={teacherChatbotSample.learningGoal}
              onChange={(event) => setChatbotForm({ ...chatbotForm, learningGoal: event.target.value })}
              rows={3}
            />
          </label>
          <label className="wide">
            페르소나
            <input
              value={chatbotForm.persona}
              placeholder={teacherChatbotSample.persona}
              onChange={(event) => setChatbotForm({ ...chatbotForm, persona: event.target.value })}
            />
          </label>
        </div>

        <div className="recommendation-guide">
          <p>관련된 성취기준이 있으면 하나 이상 선택해 주세요. 선택하지 않으면 가장 관련성이 높은 성취기준 1개가 자동으로 반영됩니다.</p>
          {curriculumRecommendations.length > 3 ? (
            <button className="pill outline" type="button" onClick={() => setShowAllCurriculumRecommendations(!showAllCurriculumRecommendations)}>
              {showAllCurriculumRecommendations ? "접기" : `더 보기 ${curriculumRecommendations.length - 3}개`}
            </button>
          ) : null}
        </div>

        <div className="recommendation-strip">
          {getVisibleCurriculumRecommendations(curriculumRecommendations, showAllCurriculumRecommendations).map((item) => {
            const isSelected = selectedCurriculumChunkIds.includes(item.chunkId);
            return (
            <button
              aria-pressed={isSelected}
              className={`recommendation-item ${isSelected ? "selected" : ""}`}
              key={item.chunkId}
              onClick={() => toggleCurriculumChunkSelection(item.chunkId)}
              type="button"
            >
              <div className="recommendation-meta">
                <span>{[achievementCodeLabel(item.chunk.achievement) ?? item.label, formatRecommendationRelevance(item.score)].filter(Boolean).join(" · ")}</span>
                <em className="selection-status">{formatCurriculumSelectionStatus(isSelected)}</em>
              </div>
              <strong>{recommendationTitle(item.chunk.subject, item.chunk.area)}</strong>
              <p>{item.chunk.achievement}</p>
              <small>{item.reason}</small>
            </button>
          );
          })}
        </div>

        <div className="create-chatbot-footer">
          <p>입력 내용과 성취기준 선택을 확인한 뒤 학생용 챗봇을 생성합니다.</p>
          <button className="pill dark" onClick={() => void createLocalChatbot()} type="button" disabled={!activeTeacherId}>
            <Check size={16} /> 생성
          </button>
        </div>

        <div className="chatbot-list-toolbar">
          <label className="check-line">
            <input type="checkbox" checked={everyChatbotSelected} onChange={() => toggleAllChatbotSelection()} disabled={chatbots.length === 0} />
            <span>전체 선택</span>
          </label>
          <button className="pill outline" onClick={requestSelectedLocalChatbotsDeletion} type="button" disabled={selectedChatbotIds.length === 0}>
            <Eraser size={16} /> 선택 삭제 {selectedChatbotIds.length > 0 ? `${selectedChatbotIds.length}개` : ""}
          </button>
        </div>
        {pendingSelectedDelete ? (
          <DeletionPrompt
            message={`선택한 챗봇 ${selectedChatbotIds.length}개와 공유 링크를 삭제할까요?`}
            onCancel={cancelLocalChatbotDeletion}
            onConfirm={() => void deleteSelectedLocalChatbots()}
          />
        ) : null}
        {visibleShareNotice && !shareNoticeChatbotId ? <ShareNotice notice={visibleShareNotice} /> : null}

        <div className="chatbot-list">
          {chatbots.map((chatbot) => (
            <div className="chatbot-list-item" key={chatbot.id}>
              <article className="chatbot-row">
                <label className="check-line chatbot-check">
                  <input
                    type="checkbox"
                    checked={selectedChatbotIds.includes(chatbot.id)}
                    onChange={() => toggleChatbotSelection(chatbot.id)}
                    aria-label={`${chatbot.name} 선택`}
                  />
                  <div>
                    <strong>{chatbot.name}</strong>
                    <p>{chatbot.topic}</p>
                    <small>
                      {formatSchoolLevelLabel(chatbot.schoolLevel)} · {chatbot.gradeBand} · 최근 수정 {new Date(chatbot.updatedAt).toLocaleDateString("ko-KR")}
                    </small>
                  </div>
                </label>
                <div className="row-actions">
                  {chatbot.share.enabled ? (
                    <>
                      <a
                        aria-label={`학생용 챗봇 바로가기: ${chatbot.name}`}
                        className="pill outline icon-pill"
                        href={`/s/${chatbot.share.publicToken}`}
                        rel="noreferrer"
                        target="_blank"
                        title="학생용 챗봇 바로가기"
                      >
                        <ExternalLink size={16} />
                      </a>
                      <button className="pill outline" onClick={() => void copyShareLink(chatbot)} type="button">
                        <Copy size={16} /> 링크 복사
                      </button>
                    </>
                  ) : (
                    <button className="pill outline" onClick={() => void enableLocalShare(chatbot.id)} type="button">
                      <Calendar size={16} /> 공유 켜기
                    </button>
                  )}
                  <button className="pill outline" onClick={() => requestLocalChatbotDeletion(chatbot.id)} type="button">
                    <Eraser size={16} /> 삭제
                  </button>
                </div>
              </article>
              {pendingDeleteChatbotId === chatbot.id ? (
                <DeletionPrompt
                  message={getChatbotDeletionPrompt(chatbot.name)}
                  onCancel={cancelLocalChatbotDeletion}
                  onConfirm={() => void deleteLocalChatbot(chatbot.id)}
                />
              ) : null}
              {visibleShareNotice && shareNoticeChatbotId === chatbot.id ? <ShareNotice notice={visibleShareNotice} /> : null}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function DeletionPrompt({ message, onCancel, onConfirm }: { message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="delete-confirmation" role="alert">
      <p>
        {message} <span>삭제하면 목록에서 사라집니다.</span>
      </p>
      <div className="row-actions">
        <button className="pill outline" type="button" onClick={onCancel}>
          취소
        </button>
        <button className="pill danger" type="button" onClick={onConfirm}>
          <Eraser size={16} /> 삭제
        </button>
      </div>
    </div>
  );
}

function ShareNotice({ notice }: { notice: ReturnType<typeof formatShareNotice> }) {
  return (
    <div className={`admin-log share-notice ${notice.tone}`} role="status" aria-live="polite">
      <div className="share-notice-title">
        <CheckCircle2 size={18} aria-hidden="true" />
        <strong>{notice.title}</strong>
      </div>
      <p>{notice.detail}</p>
      {notice.url ? <code>{notice.url}</code> : null}
    </div>
  );
}

function achievementCodeLabel(achievement: string): string | null {
  const match = /^\[([^\]]+)\]/.exec(achievement.trim());
  return match ? `성취기준 ${match[0]}` : null;
}

function recommendationTitle(subject: string, area: string): string {
  return [subject.trim(), area.trim()].filter(Boolean).join(" · ");
}
