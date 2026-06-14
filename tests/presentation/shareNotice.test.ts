import { describe, expect, it } from "vitest";
import { formatShareNotice, shouldShowShareNotice } from "../../src/presentation/shareNotice";

describe("shareNotice", () => {
  it("highlights a newly created chatbot and share link", () => {
    expect(formatShareNotice("챗봇 생성이 완료됐습니다. 학생용 링크가 준비됐습니다: http://localhost:5173/s/token")).toEqual({
      title: "챗봇 생성 완료",
      detail: "챗봇 생성이 완료됐습니다. 학생용 링크가 준비됐습니다.",
      url: "http://localhost:5173/s/token",
      tone: "success"
    });
  });

  it("highlights a copied share link as a completed copy action", () => {
    expect(formatShareNotice("공유 링크를 복사했습니다: http://localhost:5173/s/token")).toEqual({
      title: "복사 완료",
      detail: "공유 링크를 복사했습니다.",
      url: "http://localhost:5173/s/token",
      tone: "success"
    });
  });

  it("highlights a newly enabled share link as ready", () => {
    expect(formatShareNotice("공유 링크가 준비됐습니다: http://localhost:5173/s/token")).toEqual({
      title: "공유 준비 완료",
      detail: "공유 링크가 준비됐습니다.",
      url: "http://localhost:5173/s/token",
      tone: "ready"
    });
  });

  it("keeps plain notices visible without inventing a link", () => {
    expect(formatShareNotice("챗봇을 삭제했습니다.")).toEqual({
      title: "알림",
      detail: "챗봇을 삭제했습니다.",
      url: "",
      tone: "default"
    });
  });

  it("hides transient share notices after the display window", () => {
    expect(shouldShowShareNotice(1000, 3500, 3000)).toBe(true);
    expect(shouldShowShareNotice(1000, 4500, 3000)).toBe(false);
  });
});
