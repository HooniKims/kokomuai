import { useEffect, useRef } from "react";
import { Download, Eraser, Pause, RotateCcw, Send } from "lucide-react";
import type { ChatbotPolicyInput } from "../../domain/chatbot/types";
import type { UiChatMessage } from "../../infrastructure/ai/streamingChatClient";
import { renderChatMessageMarkdown } from "../chatMessageMarkdown";
import { formatSchoolLevelLabel } from "../schoolLevelLabel";
import { createStudentOpeningMessage } from "../studentOpeningMessage";

type ScrollableMessageList = {
  scrollHeight: number;
  scrollTop: number;
};

type LatestMessageAnchor = {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
};

export interface StudentChatRouteProps {
  chatbot: ChatbotPolicyInput;
  messages: UiChatMessage[];
  isStreaming: boolean;
  error: string;
  input: string;
  setInput: (value: string) => void;
  sendMessage: () => Promise<void>;
  stopStreaming: () => void;
  resetConversation: () => void;
  downloadPdf: () => Promise<void>;
  downloadTxt: () => void;
}

export function scrollMessageListToBottom(container: ScrollableMessageList | null): void {
  if (!container) return;

  container.scrollTop = container.scrollHeight;
}

export function scrollChatViewToBottom(container: ScrollableMessageList | null, latestMessage: LatestMessageAnchor | null): void {
  scrollMessageListToBottom(container);
  void latestMessage;
}

export function StudentChatRoute({
  chatbot,
  messages,
  isStreaming,
  error,
  input,
  setInput,
  sendMessage,
  stopStreaming,
  resetConversation,
  downloadPdf,
  downloadTxt
}: StudentChatRouteProps) {
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const latestMessageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      scrollChatViewToBottom(messageListRef.current, latestMessageRef.current);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, isStreaming]);

  return (
    <section className="workspace student-workspace">
      <aside className="info-panel">
        <div className="panel-section">
          <span className="soft-label">오늘의 수업 범위</span>
          <h2>{chatbot.topic}</h2>
          <p>{formatSchoolLevelLabel(chatbot.schoolLevel)} · {chatbot.gradeBand} · {chatbot.subject}</p>
        </div>
        <div className="notice">
          <strong>개인정보 안내</strong>
          <p>여기는 이름이나 학번을 쓰지 않고 사용하는 곳이에요. 질문할 때도 내 이름, 친구 이름, 전화번호, 집 주소는 쓰지 않아요.</p>
        </div>
        <div className="button-stack">
          <button className="pill outline" onClick={resetConversation} type="button">
            <RotateCcw size={16} /> 새 대화
          </button>
          <button className="pill outline" onClick={() => void downloadPdf()} type="button" disabled={messages.length === 0}>
            <Download size={16} /> PDF 받기
          </button>
          <button className="pill outline" onClick={downloadTxt} type="button" disabled={messages.length === 0}>
            <Download size={16} /> TXT 받기
          </button>
          <button className="pill outline" onClick={resetConversation} type="button" disabled={messages.length === 0}>
            <Eraser size={16} /> 기록 삭제
          </button>
        </div>
      </aside>

      <section className="chat-card" aria-label="학생 채팅">
        <div className="message-list" ref={messageListRef}>
          {messages.length === 0 ? (
            <article className="message assistant opening-message">
              <span>챗봇</span>
              <p dangerouslySetInnerHTML={{ __html: renderChatMessageMarkdown(createStudentOpeningMessage(chatbot)) }} />
            </article>
          ) : (
            messages.map((message, index) => (
              <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "user" ? "학생" : "챗봇"}</span>
                <p dangerouslySetInnerHTML={{ __html: renderChatMessageMarkdown(message.content || (isStreaming ? "생각을 이어 보고 있어요." : "")) }} />
              </article>
            ))
          )}
          <div ref={latestMessageRef} aria-hidden="true" />
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="chat-input-row">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="이 주제에 대해 궁금한 점을 적어 주세요."
            rows={2}
          />
          {isStreaming ? (
            <button className="round-send" onClick={stopStreaming} type="button" aria-label="응답 중지">
              <Pause size={18} />
            </button>
          ) : (
            <button className="round-send" onClick={() => void sendMessage()} type="button" aria-label="질문 보내기">
              <Send size={18} />
            </button>
          )}
        </div>
      </section>
    </section>
  );
}
