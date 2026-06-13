import { describe, expect, it } from "vitest";
import { buildCurriculumIndex } from "../../server/curriculumIndex";

const scienceMarkdown = `---
korean_title: "과학과"
source_file: "[별책9] 과학과 교육과정.pdf"
---

# Book 09. Science Curriculum

## Page Text

### Page 19

나. 성취기준
[초등학교 5~6학년]
(3) 전기와 자기
[6과13-01] 전지, 전구, 전선을 연결하여 전구에 불이 켜지는 조건을
탐구할 수 있다.
[6과13-02] 전자석을 만들어 영구 자석과 전자석을 비교할 수 있다.
`;

const mathematicsMarkdown = `---
korean_title: "수학과"
source_file: "[별책8] 수학과 교육과정.pdf"
---

# Book 08. Mathematics Curriculum

## Page Text

### Page 17

나. 성취기준
[초등학교 5~6학년]
(1) 수와 연산
[6수01-01] 분수의 나눗셈 원리를 이해하고 계산할 수 있다.
`;

const koreanMarkdown = `---
korean_title: "국어과"
source_file: "[별책5] 국어과 교육과정.pdf"
---

# Book 05. Korean Language Curriculum

### Page 58

(4) 문법
[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.
`;

const mixedKoreanMarkdown = `---
korean_title: "국어과"
source_file: "book_05_korean_language_curriculum.md"
---

# Book 05. Korean Language Curriculum

### Page 48

[중학교 1∼3학년]
(4) 문법
[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.

### Page 143

선택 중심 교육과정 - 일반 선택 과목 -
나. 성취기준
[12문학01-01] 문학이 인간과 세계에 대한 이해를 돕고, 삶의 의미를 깨닫게 하며, 정서적⋅미적으로 삶을 고양함을 이해한다.
`;

const professionalMarkdown = `---
korean_title: "전기·전자 전문 교과"
source_file: "[별책34] 전기·전자 전문 교과 교육과정.pdf"
category: professional_subject
---

# Book 34. Electrical and Electronic Professional Curriculum

### Page 806

[전문 공통 과목]
(1) 성공적인 직업 생활
[성직 01-01] 일과 직업의 의미를 알고, 일과 직업이 자신의 삶에서 어떠한 가치를 가지고 있는지를 설명할 수 있다.
`;

describe("curriculumIndex", () => {
  it("builds searchable recommendation candidates from markdown achievement standards", () => {
    const index = buildCurriculumIndex([
      { markdown: scienceMarkdown },
      { markdown: mathematicsMarkdown }
    ]);

    expect(index.chunks).toHaveLength(3);
    expect(index.chunks[0]).toMatchObject({
      sourceTitle: "[별책9] 과학과 교육과정.pdf",
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "과학",
      area: "전기와 자기",
      achievement: "[6과13-01] 전지, 전구, 전선을 연결하여 전구에 불이 켜지는 조건을 탐구할 수 있다.",
      excerpt: "전지, 전구, 전선을 연결하여 전구에 불이 켜지는 조건을 탐구할 수 있다.",
      sectionPath: "Book 09. Science Curriculum > Page Text > Page 19 > 초등학교 5~6학년 > 전기와 자기"
    });

    const results = index.search("전구가 켜지는 조건 전기 회로");

    expect(results[0]).toMatchObject({
      sourceTitle: "[별책9] 과학과 교육과정.pdf",
      schoolLevel: "elementary",
      gradeBand: "5-6",
      subject: "과학",
      area: "전기와 자기",
      achievement: "[6과13-01] 전지, 전구, 전선을 연결하여 전구에 불이 켜지는 조건을 탐구할 수 있다.",
      excerpt: "전지, 전구, 전선을 연결하여 전구에 불이 켜지는 조건을 탐구할 수 있다.",
      sectionPath: "Book 09. Science Curriculum > Page Text > Page 19 > 초등학교 5~6학년 > 전기와 자기"
    });
    expect(results.map((result) => result.subject)).toEqual(["과학"]);
  });

  it("infers middle school grade bands from achievement codes when headings are missing", () => {
    const index = buildCurriculumIndex([{ markdown: koreanMarkdown }]);

    expect(index.chunks).toEqual([
      expect.objectContaining({
        schoolLevel: "middle",
        gradeBand: "1-3",
        subject: "국어",
        area: "문법",
        achievement: "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다."
      })
    ]);
    expect(index.search("중1 국어 9품사에 대한 이해")[0]).toMatchObject({
      schoolLevel: "middle",
      gradeBand: "1-3",
      subject: "국어",
      area: "문법"
    });
  });

  it("ranks the middle school Korean parts-of-speech standard above broad understanding standards", () => {
    const index = buildCurriculumIndex([{ markdown: mixedKoreanMarkdown }]);

    expect(index.chunks.find((chunk) => chunk.achievement.startsWith("[12문학01-01]"))).toMatchObject({
      schoolLevel: "high",
      gradeBand: "all"
    });
    expect(index.search("중1 국어 9품사에 대한 이해")[0]).toMatchObject({
      achievement: "[9국04-03] 품사의 종류와 특성을 이해하고 국어 자료를 분석한다.",
      schoolLevel: "middle",
      gradeBand: "1-3",
      subject: "국어",
      area: "문법"
    });
  });

  it("classifies professional subject curriculum as vocational high school", () => {
    const index = buildCurriculumIndex([{ markdown: professionalMarkdown }]);

    expect(index.chunks).toEqual([
      expect.objectContaining({
        schoolLevel: "vocational_high",
        gradeBand: "all",
        subject: "전기·전자 전문 교과",
        area: "성공적인 직업 생활",
        achievement: "[성직 01-01] 일과 직업의 의미를 알고, 일과 직업이 자신의 삶에서 어떠한 가치를 가지고 있는지를 설명할 수 있다."
      })
    ]);
  });
});
