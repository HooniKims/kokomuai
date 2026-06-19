import { describe, expect, it } from "vitest";
import type { CurriculumRecommendationView } from "../../src/presentation/apiClient";
import {
  applyChatbotFormAutoDraft,
  buildLearningGoalSuggestions,
  buildPersonaSuggestions,
  buildTopicSuggestions,
} from "../../src/presentation/chatbotFormSuggestions";

describe("chatbot form suggestions", () => {
  it("builds editable learning goal examples from the current form and curriculum", () => {
    const suggestions = buildLearningGoalSuggestions(
      {
        schoolLevel: "middle",
        gradeBand: "1",
        subject: "국어",
        topic: "품사의 종류와 특성",
      },
      [recommendation("학생이 문장 속 품사의 역할을 구분하고 예를 들어 설명한다.")],
    );

    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]).toMatchObject({
      label: "핵심 개념 설명",
      value: "품사의 종류와 특성의 핵심 개념을 학생이 자기 말로 설명하도록 돕는다.",
    });
    expect(suggestions.map((item) => item.value).join(" ")).toContain(
      "성취기준에 맞춰 학생이 근거를 들어 답하도록 돕는다.",
    );
  });

  it("builds persona examples that can be inserted as complete prompt text", () => {
    const suggestions = buildPersonaSuggestions({
      schoolLevel: "elementary",
      subject: "수학",
    });

    expect(suggestions.map((item) => item.label)).toEqual([
      "친절한 코치",
      "질문형 튜터",
      "오개념 점검",
      "초등 눈높이",
      "핵심 정리",
    ]);
    expect(suggestions[0].value).toContain("답을 바로 말하지 않고");
    expect(suggestions[3].value).toContain("초등학생 눈높이");
    expect(suggestions[4].value).toContain("수학");
  });

  it("does not build topic suggestions from curriculum recommendations", () => {
    const suggestions = buildTopicSuggestions(
      {
        name: "",
        subject: "국어",
        schoolLevel: "middle",
        gradeBand: "1",
      },
      [
        recommendation("[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.", "문법"),
        recommendation("[9국01-02] 대화 상황에 맞게 듣고 말한다.", "듣기·말하기"),
      ],
    );

    expect(suggestions).toEqual([]);
  });

  it("starts topic suggestions from the chatbot name instead of only curriculum recommendations", () => {
    const suggestions = buildTopicSuggestions(
      {
        name: "빛의 굴절 도우미",
        subject: "과학",
        schoolLevel: "middle",
        gradeBand: "1",
      },
      [recommendation("[9과04-01] 빛의 반사와 굴절을 이해한다.", "파동")],
    );

    expect(suggestions[0]).toMatchObject({
      label: "챗봇명 기반",
      value: "과학 빛의 굴절 이해",
    });
    expect(suggestions.map((item) => item.value)).not.toContain("과학 파동: 빛의 반사와 굴절 이해");
  });

  it("auto-drafts editable topic, learning goal, and persona from chatbot name and subject", () => {
    const current = {
      name: "",
      schoolLevel: "middle" as const,
      topic: "",
      learningGoal: "",
      subject: "",
      gradeBand: "",
      persona: "",
      hintStrength: "medium" as const,
      questionLevel: "medium" as const,
    };

    expect(
      applyChatbotFormAutoDraft(current, {
        ...current,
        name: "일차방정식 튜터",
        subject: "수학",
      }),
    ).toMatchObject({
      topic: "수학 일차방정식 이해",
      learningGoal: "수학 일차방정식 이해의 핵심 개념을 학생이 자기 말로 설명하도록 돕는다.",
      persona: "정답을 먼저 설명하지 않고 학생의 생각을 확인하는 질문형 튜터",
    });
  });

  it("keeps manually edited auto-draft fields when chatbot name changes", () => {
    const current = {
      name: "일차방정식 튜터",
      schoolLevel: "middle" as const,
      topic: "내가 직접 정한 주제",
      learningGoal: "직접 쓴 대화 목표",
      subject: "수학",
      gradeBand: "",
      persona: "직접 쓴 페르소나",
      hintStrength: "medium" as const,
      questionLevel: "medium" as const,
    };

    expect(
      applyChatbotFormAutoDraft(current, {
        ...current,
        name: "연립방정식 튜터",
      }),
    ).toMatchObject({
      topic: "내가 직접 정한 주제",
      learningGoal: "직접 쓴 대화 목표",
      persona: "직접 쓴 페르소나",
    });
  });
});

function recommendation(achievement: string, area = "문법"): CurriculumRecommendationView {
  return {
    chunkId: "chunk-1",
    label: "추천",
    reason: "수업 주제와 직접 이어집니다.",
    chunk: {
      id: "chunk-1",
      sourceTitle: "교육과정",
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "국어",
      area,
      achievement,
      excerpt: achievement,
    },
  };
}
