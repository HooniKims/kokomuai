import { describe, expect, it, vi } from "vitest";
import {
  downloadFileBlob,
  type FileDownloadHost,
} from "../../src/presentation/fileDownload";

describe("downloadFileBlob", () => {
  it("hands the browser the file name and the object url", () => {
    const { host, anchor } = makeHost();

    downloadFileBlob("분수의-덧셈-도우미-QR.png", new Blob(["png"]), host);

    expect(anchor.download).toBe("분수의-덧셈-도우미-QR.png");
    expect(anchor.href).toBe("blob:fake-url-1");
    expect(anchor.click).toHaveBeenCalledOnce();
  });

  it("detaches the anchor once the click has been dispatched", () => {
    const { host, anchor } = makeHost();

    downloadFileBlob("student-chat.txt", new Blob(["hi"]), host);

    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it("keeps the object url alive past the click instead of revoking inline", () => {
    const { host, revokeObjectUrl } = makeHost();

    downloadFileBlob("student-chat.pdf", new Blob(["pdf"]), host);

    // Revoking while the download is still starting cancels it in Safari and
    // Firefox, so nothing may be revoked during this call.
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it("revokes the object url once the deferred release runs", () => {
    const { host, revokeObjectUrl, runDeferred } = makeHost();

    downloadFileBlob("student-chat.pdf", new Blob(["pdf"]), host);
    runDeferred();

    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:fake-url-1");
  });

  it("still detaches and schedules the release when the click throws", () => {
    const { host, anchor, revokeObjectUrl, runDeferred } = makeHost();
    anchor.click.mockImplementation(() => {
      throw new Error("click failed");
    });

    expect(() =>
      downloadFileBlob("student-chat.txt", new Blob(["hi"]), host),
    ).toThrow("click failed");

    expect(anchor.remove).toHaveBeenCalledOnce();
    runDeferred();
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:fake-url-1");
  });
});

function makeHost() {
  const anchor = {
    href: "",
    download: "",
    click: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
  };
  const revokeObjectUrl = vi.fn();
  const deferred: Array<() => void> = [];
  let createdUrlCount = 0;

  const host: FileDownloadHost = {
    createObjectUrl: () => {
      createdUrlCount += 1;
      return `blob:fake-url-${createdUrlCount}`;
    },
    revokeObjectUrl,
    createAttachedAnchor: () => anchor,
    defer: (task) => deferred.push(task),
  };

  return {
    host,
    anchor,
    revokeObjectUrl,
    runDeferred: () => deferred.forEach((task) => task()),
  };
}
