import type http from "node:http";
import { handleVercelRequest } from "../../../../server/vercelRequestHandler.js";

export default async function handler(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  return handleVercelRequest(request, response);
}
