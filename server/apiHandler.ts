import type http from "node:http";
import { getDefaultAiModel, resolveAiModel, type AiModelOption, type AiTokenUsage } from "../src/domain/ai/modelCatalog.js";
import { isShareLinkAccessible } from "../src/domain/chatbot/chatbotManagement.js";
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

type ProviderStreamUsage = Pick<AiTokenUsage, "inputTokens" | "outputTokens" | "cachedInputTokens">;

interface ParsedProviderStreamLine {
  done: boolean;
  token: string | null;
  usage?: ProviderStreamUsage;
}

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
  } catch (error) {
    logProviderFailureForDiagnostics(activeModel, {
      code: "NETWORK_ERROR",
      error,
    });
    const fallback = await tryProviderFallback(activeModel, prepared.messages, dependencies, fetchImpl);
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
    logProviderFailureForDiagnostics(activeModel, {
      code: `HTTP_${upstream.status}`,
      status: upstream.status,
    });
    const fallback = await tryProviderFallback(activeModel, prepared.messages, dependencies, fetchImpl);
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
  const thinkingFilter = createThinkingTraceFilter();
  let buffer = "";
  let assistantText = "";
  let providerUsage: ProviderStreamUsage | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const streamLine = parseSseLineSafely(line);
      if (!streamLine) continue;
      if (streamLine.usage) providerUsage = streamLine.usage;
      if (streamLine.done || !streamLine.token) continue;
      const token = streamLine.token;
      const visibleToken = thinkingFilter.push(token);
      if (!visibleToken) continue;
      writeSseDelta(response, visibleToken);
      assistantText += visibleToken;
    }
  }
  const trailingToken = thinkingFilter.flush();
  if (trailingToken) {
    writeSseDelta(response, trailingToken);
    assistantText += trailingToken;
  }
  if (!assistantText.trim()) {
    assistantText = createEmptyVisibleReply(authoritativeRequestBody);
    writeSseDelta(response, assistantText);
  }
  response.write("data: [DONE]\n\n");

  const usageEvent = createChatUsageEventFromRequest(authoritativeRequestBody, {
    id: createId("usage"),
    occurredAt: new Date().toISOString(),
    assistantText,
    riskCodes: prepared.guardDecision.riskCodes,
    modelId: activeModel.id,
    inputTokens: providerUsage?.inputTokens,
    outputTokens: providerUsage?.outputTokens,
    cachedInputTokens: providerUsage?.cachedInputTokens,
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

async function tryProviderFallback(
  currentModel: AiModelOption,
  messages: Parameters<typeof createAiProviderRequest>[1],
  dependencies: ApiHandlerDependencies,
  fetchImpl: typeof fetch,
): Promise<{ model: AiModelOption; response: Response } | null> {
  const fallbackModels = [
    getDefaultAiModel(),
    resolveAiModel("openai:gpt-5.4-nano"),
  ].filter((model, index, models) =>
    model.id !== currentModel.id &&
    models.findIndex((candidate) => candidate.id === model.id) === index
  );

  for (const fallbackModel of fallbackModels) {
    try {
      const response = await requestProvider(fallbackModel, messages, dependencies, fetchImpl);
      if (!response.ok || !response.body) {
        logProviderFailureForDiagnostics(fallbackModel, {
          code: `HTTP_${response.status}`,
          status: response.status,
        });
        continue;
      }
      return { model: fallbackModel, response };
    } catch (error) {
      logProviderFailureForDiagnostics(fallbackModel, {
        code: "NETWORK_ERROR",
        error,
      });
      continue;
    }
  }

  return null;
}

function logProviderFailureForDiagnostics(
  model: AiModelOption,
  input: {
    code: string;
    status?: number;
    error?: unknown;
  },
) {
  const errorName =
    input.error instanceof Error ? input.error.name : typeof input.error;
  const errorMessage = input.error instanceof Error ? input.error.message : undefined;
  const errorCause =
    input.error instanceof Error
      ? (input.error as Error & {
          cause?: { code?: string; name?: string; message?: string };
        }).cause
      : undefined;
  console.warn("[provider-fallback]", {
    provider: model.provider,
    modelId: model.id,
    apiModel: model.apiModel,
    code: input.code,
    status: input.status,
    errorName,
    errorMessage,
    causeCode: errorCause?.code,
    causeName: errorCause?.name,
    causeMessage: errorCause?.message,
  });
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

function createEmptyVisibleReply(requestBody: ChatRequest): string {
  const topic = requestBody.chatbot.topic.trim() || "오늘 주제";
  return `좋아요. ${topic}에 대해 이어서 생각해 봅시다. 지금 설명에서 어떤 점이 궁금한가요?`;
}

function createThinkingTraceFilter() {
  let carry = "";
  let hidden = false;
  let probingInitialText = true;
  let initialBuffer = "";
  const holdbackCharacters = 32;
  const initialProbeCharacters = 16;
  const maxReasoningPreambleCharacters = 4000;
  const startTagPattern = /<\s*(think|thinking|reasoning)\b[^>]*>/i;
  const endTagPattern = /<\s*\/\s*(think|thinking|reasoning)\s*>/i;
  const channelMarkerPattern = /<channel\|>/i;
  const reasoningPreamblePattern =
    /(학생은[\s\S]{0,160}(답변|용어|어렵|느꼈|의미)|학생이[\s\S]{0,160}대답|\*?\s*학생\s*반응|\*?\s*현재\s*(상태|상황|목표)|\*?\s*목표\s*:|\*?\s*다음\s*(단계|사고\s*단계|행동\s*계획)|질문\s*(방향|생성)|힌트\s*강도|수업\s*목표|\*\*계획:\*\*|계획\s*:)/;
  const finalAnswerStartPattern = /(아이고,|네,\s*그럼|좋아요[.!。]?|와!\s*맞아요|맞아요[.!。]?|다시\s+아주\s+쉽게|그러면\s+이제)/;

  function push(token: string): string {
    if (probingInitialText) {
      initialBuffer += token;
      const channel = findTag(initialBuffer, channelMarkerPattern);
      if (channel) {
        probingInitialText = false;
        carry += initialBuffer.slice(channel.index + channel.text.length);
        initialBuffer = "";
        return drainCarry();
      }

      if (reasoningPreamblePattern.test(initialBuffer)) {
        const finalAnswerStart = findTag(initialBuffer, finalAnswerStartPattern);
        if (finalAnswerStart) {
          probingInitialText = false;
          carry += initialBuffer.slice(finalAnswerStart.index);
          initialBuffer = "";
          return drainCarry();
        }
        if (initialBuffer.length > maxReasoningPreambleCharacters) {
          initialBuffer = initialBuffer.slice(-holdbackCharacters);
        }
        return "";
      }

      if (initialBuffer.length < initialProbeCharacters) return "";
      probingInitialText = false;
      carry += initialBuffer;
      initialBuffer = "";
      return drainCarry();
    }

    carry += token;
    return drainCarry();
  }

  function drainCarry(holdBackPossibleTags = true): string {
    let output = "";

    while (carry) {
      if (hidden) {
        const end = findTag(carry, endTagPattern);
        if (!end && holdBackPossibleTags) {
          carry = carry.slice(-holdbackCharacters);
          return output;
        }
        if (!end) {
          carry = "";
          return output;
        }
        carry = carry.slice(end.index + end.text.length);
        hidden = false;
        continue;
      }

      const channel = findTag(carry, channelMarkerPattern);
      if (channel) {
        output = "";
        carry = carry.slice(channel.index + channel.text.length);
        hidden = false;
        continue;
      }

      const start = findTag(carry, startTagPattern);
      if (start) {
        output += carry.slice(0, start.index);
        carry = carry.slice(start.index + start.text.length);
        hidden = true;
        continue;
      }

      if (holdBackPossibleTags) {
        if (carry.length <= holdbackCharacters) return output;
        output += carry.slice(0, -holdbackCharacters);
        carry = carry.slice(-holdbackCharacters);
        return output;
      }

      output += carry;
      carry = "";
      return output;
    }

    return output;
  }

  function flush(): string {
    if (probingInitialText) {
      const channel = findTag(initialBuffer, channelMarkerPattern);
      if (channel) {
        carry += initialBuffer.slice(channel.index + channel.text.length);
      } else if (reasoningPreamblePattern.test(initialBuffer)) {
        const finalAnswerStart = findTag(initialBuffer, finalAnswerStartPattern);
        if (finalAnswerStart) {
          carry += initialBuffer.slice(finalAnswerStart.index);
        }
      } else if (!reasoningPreamblePattern.test(initialBuffer)) {
        carry += initialBuffer;
      }
      initialBuffer = "";
      probingInitialText = false;
    }

    return drainCarry(false);
  }

  return { push, flush };
}

function findTag(value: string, pattern: RegExp): { index: number; text: string } | null {
  const match = pattern.exec(value);
  if (!match || match.index < 0) return null;
  return { index: match.index, text: match[0] };
}

function parseSseLineSafely(line: string): ParsedProviderStreamLine | null {
  try {
    return parseOpenAIStreamLine(line);
  } catch {
    return null;
  }
}

function parseOpenAIStreamLine(line: string): ParsedProviderStreamLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice("data:".length).trim();
  if (payload === "[DONE]") {
    return { done: true, token: null };
  }

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ delta?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
      };
    } | null;
  };

  return {
    done: false,
    token: parsed.choices?.[0]?.delta?.content ?? null,
    usage: parseProviderUsage(parsed.usage),
  };
}

function parseProviderUsage(
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  } | null | undefined,
): ProviderStreamUsage | undefined {
  if (!usage) return undefined;
  if (!Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) return undefined;

  const cachedInputTokens = Number.isFinite(usage.prompt_tokens_details?.cached_tokens)
    ? usage.prompt_tokens_details?.cached_tokens
    : undefined;
  return {
    inputTokens: Math.max(0, Math.round(usage.prompt_tokens ?? 0)),
    outputTokens: Math.max(0, Math.round(usage.completion_tokens ?? 0)),
    cachedInputTokens: cachedInputTokens === undefined ? undefined : Math.max(0, Math.round(cachedInputTokens)),
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
