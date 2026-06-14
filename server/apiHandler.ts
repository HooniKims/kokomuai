import type http from "node:http";
import { getDefaultAiModel, resolveAiModel, type AiModelOption } from "../src/domain/ai/modelCatalog.js";
import { isShareLinkAccessible } from "../src/domain/chatbot/chatbotManagement.js";
import { parseOpenAIStreamLine } from "../src/infrastructure/ai/lmStudioClient.js";
import {
  createAiProviderRequest,
  type ProviderEnvironment,
} from "./aiProviderRequest.js";
import { createChatResponsePlan, type ChatRequest } from "./chatProxy.js";
import {
  createChatUsageErrorEventFromRequest,
  createChatUsageEventFromRequest,
} from "./chatUsage.js";
import type { CurriculumIndex } from "./curriculumIndex.js";
import {
  createLocalApiHandler,
  type SchoolSearchDependency,
} from "./localApi.js";
import type { StorePort } from "./storePort.js";
import type { VerifyIdToken } from "./authContext.js";
import { isPayloadTooLargeError, readJson } from "./httpJson.js";
import { applyCorsHeaders, writeCorsPreflight } from "./cors.js";

type EnvironmentSource = ProviderEnvironment &
  Record<string, string | undefined>;

export interface ApiHandlerDependencies {
  store: StorePort;
  curriculumIndex?: CurriculumIndex;
  schoolSearch?: SchoolSearchDependency;
  env?: EnvironmentSource;
  fetchImpl?: typeof fetch;
  auth?: {
    requireFirebaseAuth: boolean;
    verifyIdToken: VerifyIdToken;
  };
  passwordResetEmail?: (email: string) => Promise<void>;
}

export function createApiHandler(
  dependencies: ApiHandlerDependencies,
): http.RequestListener {
  const localApiHandler = createLocalApiHandler({
    store: dependencies.store,
    curriculumIndex: dependencies.curriculumIndex,
    schoolSearch: dependencies.schoolSearch,
    env: dependencies.env,
    auth: dependencies.auth,
    passwordResetEmail: dependencies.passwordResetEmail,
  });

  return async (request, response) => {
    applyCorsHeaders(request, response, dependencies.env);

    if (request.method === "OPTIONS") {
      writeCorsPreflight(request, response, dependencies.env);
      return;
    }

    if (request.method === "GET" && request.url === "/api/health") {
      const aiSettings = await dependencies.store.getAiSettings();
      const activeModel = resolveAiModel(aiSettings.activeModelId);
      sendJson(response, 200, {
        ok: true,
        provider: activeModel.provider,
        model: activeModel.apiModel,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/chat") {
      try {
        const body = await readJson<ChatRequest>(request);
        await proxyStreamToProvider(body, response, dependencies);
      } catch (error) {
        if (isPayloadTooLargeError(error)) {
          sendJson(response, 413, {
            error: "payload_too_large",
            message:
              "요청 내용이 너무 큽니다. 질문과 이전 대화 내용을 줄여 다시 시도해 주세요.",
          });
          return;
        }

        sendJson(response, 500, {
          error: "server_error",
          message:
            "응답을 준비하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
        });
      }
      return;
    }

    await localApiHandler(request, response);
  };
}

async function proxyStreamToProvider(
  requestBody: ChatRequest,
  response: http.ServerResponse,
  dependencies: ApiHandlerDependencies,
) {
  const resolved = await resolveAuthoritativeChatRequest(
    requestBody,
    dependencies,
  );
  if (resolved.kind === "json_error") {
    sendJson(response, resolved.status, resolved.payload);
    return;
  }

  const authoritativeRequestBody = resolved.requestBody;
  const prepared = createChatResponsePlan(authoritativeRequestBody);
  if (prepared.kind === "json_error") {
    sendJson(response, prepared.status, prepared.payload);
    return;
  }

  if (prepared.kind === "guardrail") {
    writeSseHeaders(response);
    writeSseDelta(response, prepared.assistantMessage);
    response.write("data: [DONE]\n\n");
    response.end();
    return;
  }

  const aiSettings = await dependencies.store.getAiSettings();
  let activeModel = resolveAiModel(aiSettings.activeModelId);
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  let upstream: Response;
  try {
    upstream = await requestProvider(activeModel, prepared.messages, dependencies, fetchImpl);
  } catch {
    const fallback = await tryDefaultModelFallback(activeModel, prepared.messages, dependencies, fetchImpl);
    if (fallback) {
      activeModel = fallback.model;
      upstream = fallback.response;
    } else {
    await recordProviderFailure(authoritativeRequestBody, dependencies, {
      provider: activeModel.provider,
      modelId: activeModel.id,
      code: "NETWORK_ERROR",
      riskCodes: prepared.guardDecision.riskCodes,
    });
    sendJson(response, 502, {
      error: "provider_error",
      message:
        "응답을 불러오지 못했어요. 잠시 후 다시 시도하거나 선생님께 알려 주세요.",
    });
    return;
    }
  }

  if (!upstream.ok || !upstream.body) {
    const fallback = await tryDefaultModelFallback(activeModel, prepared.messages, dependencies, fetchImpl);
    if (fallback) {
      activeModel = fallback.model;
      upstream = fallback.response;
    } else {
    await recordProviderFailure(authoritativeRequestBody, dependencies, {
      provider: activeModel.provider,
      modelId: activeModel.id,
      status: upstream.status,
      code: `HTTP_${upstream.status}`,
      riskCodes: prepared.guardDecision.riskCodes,
    });
    sendJson(response, 502, {
      error: "provider_error",
      message:
        "응답을 불러오지 못했어요. 잠시 후 다시 시도하거나 선생님께 알려 주세요.",
    });
    return;
    }
  }

  writeSseHeaders(response);

  const upstreamBody = upstream.body;
  if (!upstreamBody) {
    sendJson(response, 502, {
      error: "provider_error",
      message:
        "응답을 불러오지 못했어요. 잠시 후 다시 시도하거나 선생님께 알려 주세요.",
    });
    return;
  }

  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let assistantText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    response.write(Buffer.from(value));
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const token = parseSseTokenSafely(line);
      if (!token || token === "[DONE]") continue;
      assistantText += token;
    }
  }

  const usageEvent = createChatUsageEventFromRequest(authoritativeRequestBody, {
    id: createId("usage"),
    occurredAt: new Date().toISOString(),
    assistantText,
    riskCodes: prepared.guardDecision.riskCodes,
    modelId: activeModel.id,
  });
  if (usageEvent) {
    await dependencies.store.appendUsageEvent(usageEvent);
  }
  response.end();
}

async function requestProvider(
  model: AiModelOption,
  messages: Parameters<typeof createAiProviderRequest>[1],
  dependencies: ApiHandlerDependencies,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const providerRequest = createAiProviderRequest(
    model,
    messages,
    dependencies.env ?? process.env,
  );
  return fetchImpl(providerRequest.url, {
    method: "POST",
    headers: providerRequest.headers,
    body: providerRequest.body,
  });
}

async function tryDefaultModelFallback(
  currentModel: AiModelOption,
  messages: Parameters<typeof createAiProviderRequest>[1],
  dependencies: ApiHandlerDependencies,
  fetchImpl: typeof fetch,
): Promise<{ model: AiModelOption; response: Response } | null> {
  const fallbackModel = getDefaultAiModel();
  if (fallbackModel.id === currentModel.id) return null;

  try {
    const response = await requestProvider(fallbackModel, messages, dependencies, fetchImpl);
    if (!response.ok || !response.body) return null;
    return { model: fallbackModel, response };
  } catch {
    return null;
  }
}

async function recordProviderFailure(
  requestBody: ChatRequest,
  dependencies: ApiHandlerDependencies,
  input: {
    provider: string;
    modelId: string;
    status?: number;
    code: string;
    riskCodes: string[];
  },
) {
  const chatbotIdentity = requestBody.chatbot as ChatRequest["chatbot"] & {
    id?: string;
    ownerTeacherId?: string;
  };
  const occurredAt = new Date().toISOString();

  await dependencies.store.appendProviderErrorLog({
    id: createId("provider-error"),
    occurredAt,
    provider: input.provider,
    message: "provider_request_failed",
    status: input.status,
    code: input.code,
    teacherId: chatbotIdentity.ownerTeacherId,
    chatbotId: chatbotIdentity.id,
    surface: requestBody.surface ?? "student_share",
    riskCodes: input.riskCodes,
  });

  const usageError = createChatUsageErrorEventFromRequest(requestBody, {
    id: createId("usage-error"),
    occurredAt,
    assistantText: "",
    riskCodes: input.riskCodes,
    modelId: input.modelId,
    errorCode: input.code,
    technical: {
      provider: input.provider,
      status: input.status,
      code: input.code,
    },
  });
  if (usageError) {
    await dependencies.store.appendUsageEvent(usageError);
  }
}

async function resolveAuthoritativeChatRequest(
  requestBody: ChatRequest,
  dependencies: ApiHandlerDependencies,
): Promise<
  | {
      kind: "ok";
      requestBody: ChatRequest;
    }
  | {
      kind: "json_error";
      status: number;
      payload: {
        error: string;
        message: string;
      };
    }
> {
  if (requestBody.surface && requestBody.surface !== "student_share") {
    return {
      kind: "json_error",
      status: 403,
      payload: {
        error: "teacher_preview_requires_auth",
        message:
          "교사 미리보기 대화는 교사 인증이 연결된 화면에서만 사용할 수 있습니다.",
      },
    };
  }

  const shareToken = requestBody.shareToken?.trim();
  const hasClientIdentity = Boolean(
    requestBody.chatbot.id || requestBody.chatbot.ownerTeacherId,
  );
  if (!shareToken) {
    if (!hasClientIdentity) {
      return {
        kind: "ok",
        requestBody,
      };
    }

    return {
      kind: "json_error",
      status: 403,
      payload: {
        error: "share_token_required",
        message:
          "공유 링크로 확인된 챗봇에서만 학생 대화를 시작할 수 있습니다.",
      },
    };
  }

  const storedChatbot =
    await dependencies.store.findChatbotByShareToken(shareToken);
  if (
    !storedChatbot ||
    !isShareLinkAccessible(storedChatbot, new Date().toISOString())
  ) {
    return {
      kind: "json_error",
      status: 404,
      payload: {
        error: "share_not_found",
        message: "공유 링크를 확인할 수 없습니다.",
      },
    };
  }

  if (requestBody.chatbot.id && requestBody.chatbot.id !== storedChatbot.id) {
    return {
      kind: "json_error",
      status: 403,
      payload: {
        error: "chatbot_share_mismatch",
        message: "공유 링크와 챗봇 정보가 일치하지 않습니다.",
      },
    };
  }

  return {
    kind: "ok",
    requestBody: {
      ...requestBody,
      surface: "student_share",
      chatbot: storedChatbot,
    },
  };
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  payload: unknown,
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function writeSseHeaders(response: http.ServerResponse) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
  });
}

function writeSseDelta(response: http.ServerResponse, content: string) {
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
  );
}

function parseSseTokenSafely(line: string): string | null {
  try {
    return parseOpenAIStreamLine(line);
  } catch {
    return null;
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
