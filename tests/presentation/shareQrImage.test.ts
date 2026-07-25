import { describe, expect, it } from "vitest";
import { buildShareQrFileName } from "../../src/presentation/shareQrImage";

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
