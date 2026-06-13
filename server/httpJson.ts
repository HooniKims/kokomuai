import type http from "node:http";

export const JSON_BODY_MAX_BYTES = 128 * 1024;

export class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`JSON body exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

export async function readJson<T>(request: http.IncomingMessage, maxBytes = JSON_BODY_MAX_BYTES): Promise<T> {
  const declaredLength = readContentLength(request.headers["content-length"]);
  if (declaredLength !== undefined && declaredLength > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

export function isPayloadTooLargeError(error: unknown): error is PayloadTooLargeError {
  return error instanceof PayloadTooLargeError;
}

function readContentLength(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
