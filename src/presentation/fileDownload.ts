/**
 * Single place that turns a Blob into a saved file.
 *
 * The object url must outlive the click. Revoking it on the next line — which
 * both call sites used to do — cancels the download in Safari and Firefox,
 * because those browsers are still reading from the url when the handler
 * returns. So the release is deferred instead.
 */

export interface DownloadAnchor {
  href: string;
  download: string;
  click(): void;
  remove(): void;
}

export interface FileDownloadHost {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  /**
   * Creates the anchor AND puts it in the document. Firefox ignores clicks on
   * an anchor that was never attached.
   */
  createAttachedAnchor(): DownloadAnchor;
  defer(task: () => void): void;
}

/** Long enough for a slow browser to start reading, short enough to not leak. */
export const OBJECT_URL_RELEASE_DELAY_MS = 60_000;

export function downloadFileBlob(
  filename: string,
  blob: Blob,
  host: FileDownloadHost = browserFileDownloadHost(),
): void {
  const objectUrl = host.createObjectUrl(blob);
  const anchor = host.createAttachedAnchor();
  anchor.href = objectUrl;
  anchor.download = filename;

  try {
    anchor.click();
  } finally {
    anchor.remove();
    host.defer(() => host.revokeObjectUrl(objectUrl));
  }
}

function browserFileDownloadHost(): FileDownloadHost {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    createAttachedAnchor: () => {
      const anchor = document.createElement("a");
      document.body.appendChild(anchor);
      return anchor;
    },
    defer: (task) => {
      window.setTimeout(task, OBJECT_URL_RELEASE_DELAY_MS);
    },
  };
}
