import { describe, expect, it } from "vitest";
import type { CurriculumRecommendationView } from "../../src/presentation/apiClient";
import {
  buildLearningGoalSuggestions,
  buildPersonaSuggestions,
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
});

function recommendation(achievement: string): CurriculumRecommendationView {
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
      area: "문법",
      achievement,
      excerpt: achievement,
    },
  };
}
