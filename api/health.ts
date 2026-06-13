import type http from "node:http";
import { getDefaultAiModel } from "../src/domain/ai/modelCatalog.js";

export default function handler(
  _request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  const activeModel = getDefaultAiModel();
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(
    JSON.stringify({
      ok: true,
      provider: activeModel.provider,
      model: activeModel.apiModel
    })
  );
}
