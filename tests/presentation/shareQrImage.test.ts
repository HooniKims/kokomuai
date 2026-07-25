import { describe, expect, it } from "vitest";
import { buildShareQrFileName, layoutQrCardName } from "../../src/presentation/shareQrImage";

describe("buildShareQrFileName", () => {
  it("turns a Korean chatbot name into a hyphenated png file name", () => {
    expect(buildShareQrFileName("분수의 덧셈 도우미")).toBe("분수의-덧셈-도우미-QR.png");
  });

  it("drops characters that file systems reject", () => {
    expect(buildShareQrFileName('과학/실험: 빛?')).toBe("과학실험-빛-QR.png");
  });

  it("collapses repeated whitespace into a single hyphen", () => {
    expect(buildShareQrFileName("빛의   굴절")).toBe("빛의-굴절-QR.png");
  });

  it("trims leading and trailing hyphens and dots", () => {
    expect(buildShareQrFileName("...이름...")).toBe("이름-QR.png");
  });

  it("falls back to a generic name when nothing usable remains", () => {
    expect(buildShareQrFileName("")).toBe("chatbot-QR.png");
    expect(buildShareQrFileName("   ")).toBe("chatbot-QR.png");
    expect(buildShareQrFileName('///???"')).toBe("chatbot-QR.png");
  });

  it("caps the name at fifty characters", () => {
    expect(buildShareQrFileName("가".repeat(60))).toBe(`${"가".repeat(50)}-QR.png`);
  });

  it("does not leave a dangling hyphen after capping", () => {
    expect(buildShareQrFileName(`${"가".repeat(49)} 도우미`)).toBe(`${"가".repeat(49)}-QR.png`);
  });
});

describe("layoutQrCardName", () => {
  const measureTenPixelsPerCharacter = (text: string) => [...text].length * 10;

  it("keeps a short name on one line", () => {
    expect(layoutQrCardName("분수 도우미", measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "분수 도우미",
    ]);
  });

  it("wraps at word boundaries when a name is too wide", () => {
    expect(layoutQrCardName("분수의 덧셈 도우미", measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "분수의 덧셈",
      "도우미",
    ]);
  });

  it("breaks a single long word across lines", () => {
    expect(layoutQrCardName("가".repeat(15), measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "가".repeat(10),
      "가".repeat(5),
    ]);
  });

  it("ellipsizes the last line when the name needs more than the allowed lines", () => {
    expect(layoutQrCardName("가".repeat(25), measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "가".repeat(10),
      `${"가".repeat(9)}…`,
    ]);
  });

  it("returns no lines for an empty or blank name", () => {
    expect(layoutQrCardName("", measureTenPixelsPerCharacter, 100, 2)).toEqual([]);
    expect(layoutQrCardName("   ", measureTenPixelsPerCharacter, 100, 2)).toEqual([]);
  });

  it("collapses repeated whitespace before measuring", () => {
    expect(layoutQrCardName("  분수   도우미  ", measureTenPixelsPerCharacter, 100, 2)).toEqual([
      "분수 도우미",
    ]);
  });
});
