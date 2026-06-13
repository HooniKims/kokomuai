import type http from "node:http";
import { createVercelApiHandler } from "./vercelApi.js";

let handlerPromise: Promise<http.RequestListener> | undefined;

export async function handleVercelRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  const apiHandler = await getHandler();
  return apiHandler(request, response);
}

function getHandler(): Promise<http.RequestListener> {
  handlerPromise ??= createVercelApiHandler();
  return handlerPromise;
}
