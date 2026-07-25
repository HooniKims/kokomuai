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

/**
 * Only has to outlast the browser queueing the download, which is immediate —
 * the requirement is "not synchronously", not "a long time". Kept generous
 * enough for a slow disk without pinning a large blob in memory for a minute.
 */
const OBJECT_URL_RELEASE_DELAY_MS = 10_000;

export function downloadFileBlob(
  filename: string,
  blob: Blob,
  host: FileDownloadHost = browserFileDownloadHost(),
): void {
  // Anchor first: if creating it throws, there is no url to leak yet.
  const anchor = host.createAttachedAnchor();
  const objectUrl = host.createObjectUrl(blob);

  try {
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    // Schedule the release before detaching, so a throwing remove() cannot
    // strand the url.
    host.defer(() => host.revokeObjectUrl(objectUrl));
    anchor.remove();
  }
}

/**
 * Untested by construction: vitest runs in `node`, so nothing here can be
 * covered. Both browser-specific details live in this function — the
 * appendChild that Firefox needs, and the timer that keeps the url alive —
 * so treat changes to it as unguarded.
 */
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
