import type http from "node:http";
import { createVercelApiHandler } from "../server/vercelApi";

let handlerPromise: Promise<http.RequestListener> | undefined;

export default async function handler(request: http.IncomingMessage, response: http.ServerResponse) {
  const apiHandler = await getHandler();
  return apiHandler(request, response);
}

function getHandler(): Promise<http.RequestListener> {
  handlerPromise ??= createVercelApiHandler();
  return handlerPromise;
}
