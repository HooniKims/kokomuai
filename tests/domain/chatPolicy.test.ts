import { describe, expect, it } from "vitest";
import { buildStudentSystemPrompt } from "../../src/domain/chatPolicy/buildStudentSystemPrompt";

describe("buildStudentSystemPrompt", () => {
  it("contains the core product rules for guided questioning", () => {
    const prompt = buildStudentSystemPrompt({
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "과학",
      topic: "전기 회로에서 전구가 켜지는 조건",
      learningGoal: "학생이 닫힌 회로의 조건을 스스로 설명하도록 돕는다.",
      hintStrength: "medium",
      persona: "친절한 과학 선생님"
    });

    expect(prompt).toContain("정답을 바로 말하지 마세요");
    expect(prompt).toContain("한 번에 하나의 질문");
    expect(prompt).toContain("편안한 존댓말");
    expect(prompt).toContain("전기 회로에서 전구가 켜지는 조건");
    expect(prompt).toContain("학생이 닫힌 회로의 조건을 스스로 설명하도록 돕는다");
  });

  it("changes hint policy by hint strength", () => {
    const high = buildStudentSystemPrompt({
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "수학",
      topic: "일차방정식",
      learningGoal: "학생이 등식의 성질을 활용해 한 단계씩 풀이하도록 돕는다.",
      hintStrength: "high",
      persona: ""
    });

    expect(high).toContain("짧은 부분 설명");
    expect(high).toContain("최종 답은 말하지 마세요");
  });

  it("includes selected curriculum standards when a chatbot has curriculum links", () => {
    const prompt = buildStudentSystemPrompt({
      schoolLevel: "middle",
      gradeBand: "1",
      subject: "국어",
      topic: "중학교 국어 품사의 종류와 특성",
      learningGoal: "학생이 품사의 역할을 예문 속에서 구분하도록 돕는다.",
      hintStrength: "medium",
      persona: "질문으로 이끄는 국어 선생님",
      curriculumLinks: [
        {
          chunkId: "korean-grammar",
          sourceTitle: "국어",
          subject: "국어",
          area: "문법",
          achievement: "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다."
        }
      ]
    });

    expect(prompt).toContain("연결된 성취기준");
    expect(prompt).toContain("[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.");
  });
});
