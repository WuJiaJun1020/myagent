import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  aiFailure,
  aiSuccess,
  assertAiRequestMetadata,
  invalidAiRequest,
  type AiCallOptions,
  type AiGatewayError,
  type AiGatewayErrorCode,
  type AiGatewayResult,
  type AiUsage,
} from "../../shared/ai/contracts";
import type {
  ModelFinishReason,
  ModelGateway,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
} from "../../shared/ai/model-gateway";

type PiModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;
type PiContext = Parameters<ModelRuntime["completeSimple"]>[1];
type PiRequestOptions = NonNullable<Parameters<ModelRuntime["completeSimple"]>[2]>;
type PiAssistantMessage = Awaited<ReturnType<ModelRuntime["completeSimple"]>>;
type PiStreamEvent = ReturnType<ModelRuntime["streamSimple"]> extends AsyncIterable<infer Event> ? Event : never;

/** The small, session-free surface consumed from Pi's model runtime. */
export interface PiModelRuntimePort {
  getModel(providerId: string, modelId: string): PiModel | undefined;
  completeSimple(model: PiModel, context: PiContext, options?: PiRequestOptions): Promise<PiAssistantMessage>;
  streamSimple(model: PiModel, context: PiContext, options?: PiRequestOptions): AsyncIterable<PiStreamEvent>;
  refresh?(options?: { allowNetwork?: boolean; providers?: readonly string[]; signal?: AbortSignal }): Promise<unknown>;
}

/** Settings are deliberately read-only from the gateway. */
export interface PiModelSettingsPort {
  getDefaultProvider(): string | undefined;
  getDefaultModel(): string | undefined;
  reload?(): Promise<void>;
  getHttpIdleTimeoutMs?(): number;
  getProviderRetrySettings?(): { timeoutMs?: number; maxRetries?: number; maxRetryDelayMs: number };
  getWebSocketConnectTimeoutMs?(): number | undefined;
}

export type PiModelGatewayOptions = {
  now?: () => number;
  createRequestId?: () => string;
};

export type CreatePiModelGatewayOptions = PiModelGatewayOptions & {
  /** Current product workspace; Pi uses it only to read project-level settings. */
  cwd: string;
  /** Electron's app.getAppPath(). Required so packaged ESM loading never depends on process.cwd(). */
  appRoot: string;
  /** Override Pi's normal PI_CODING_AGENT_DIR / ~/.pi/agent location. */
  agentDir?: string;
  /** Mirrors the trust decision used by the owning workspace. Defaults to true for backward compatibility. */
  projectTrusted?: boolean;
  signal?: AbortSignal;
};

type PiRuntimeModule = Pick<typeof import("@earendil-works/pi-coding-agent"), "ModelRuntime" | "SettingsManager">;

type ResolvedRequest = {
  model: PiModel;
  providerId: string;
  modelId: string;
  context: PiContext;
  options: PiRequestOptions;
};

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  headers?: unknown;
  cause?: unknown;
};

const MAX_SCHEMA_CHARACTERS = 100_000;
const MAX_SCHEMA_DEPTH = 64;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u;

class SafeRequestError extends Error {
  constructor(
    readonly gatewayCode: Extract<AiGatewayErrorCode, "invalid_request" | "budget_exceeded">,
    message: string,
  ) {
    super(message);
    this.name = "SafeRequestError";
  }
}

class DeadlineMarker extends Error {
  constructor() {
    super("AI request deadline exceeded");
    this.name = "DeadlineMarker";
  }
}

class SafeGatewayFailure extends Error {
  constructor(readonly gatewayError: AiGatewayError) {
    super(gatewayError.message);
    this.name = "SafeGatewayFailure";
  }
}

class CallScope {
  readonly controller = new AbortController();
  private readonly timeout: ReturnType<typeof setTimeout>;
  private readonly onCallerAbort?: () => void;
  private timedOut = false;

  constructor(timeoutMs: number, private readonly callerSignal?: AbortSignal) {
    if (callerSignal?.aborted) {
      this.controller.abort(callerSignal.reason);
    } else if (callerSignal) {
      this.onCallerAbort = () => this.controller.abort(callerSignal.reason);
      callerSignal.addEventListener("abort", this.onCallerAbort, { once: true });
    }
    this.timeout = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort(new DeadlineMarker());
    }, timeoutMs);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get failureCode(): "timeout" | "cancelled" | undefined {
    if (!this.controller.signal.aborted) return undefined;
    return this.timedOut ? "timeout" : "cancelled";
  }

  async race<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(this.controller.signal.reason ?? new Error("AI request cancelled"));
      operation.then(
        (value) => {
          this.controller.signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          this.controller.signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
      if (this.controller.signal.aborted) onAbort();
      else this.controller.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  cancelPendingWork(): void {
    if (!this.controller.signal.aborted) this.controller.abort(new Error("AI stream consumer closed"));
  }

  dispose(): void {
    clearTimeout(this.timeout);
    if (this.onCallerAbort && this.callerSignal) {
      this.callerSignal.removeEventListener("abort", this.onCallerAbort);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeRoutingValue(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!value || value !== value.trim() || value.length > 256 || !SAFE_ID.test(value)) {
    throw new SafeRequestError("invalid_request", `${field} must be a canonical model identifier`);
  }
  return value;
}

function validateRequest(request: ModelRequest): void {
  assertAiRequestMetadata(request.metadata);
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new SafeRequestError("invalid_request", "messages must contain at least one message");
  }
  let sawConversationMessage = false;
  let sawUserMessage = false;
  for (const message of request.messages) {
    if (!isRecord(message)
      || (message.role !== "system" && message.role !== "user" && message.role !== "assistant")
      || typeof message.content !== "string") {
      throw new SafeRequestError("invalid_request", "messages contain an invalid entry");
    }
    if (message.role === "system") {
      if (sawConversationMessage) {
        throw new SafeRequestError("invalid_request", "system messages must precede conversation messages");
      }
    } else {
      sawConversationMessage = true;
      if (message.role === "user" && message.content.trim()) sawUserMessage = true;
    }
  }
  if (!sawUserMessage) throw new SafeRequestError("invalid_request", "messages require a non-blank user message");

  safeRoutingValue(request.model?.providerId, "model.providerId");
  safeRoutingValue(request.model?.modelId, "model.modelId");
  if (request.temperature !== undefined
    && (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2)) {
    throw new SafeRequestError("invalid_request", "temperature must be between 0 and 2");
  }
  if (request.topP !== undefined && (!Number.isFinite(request.topP) || request.topP <= 0 || request.topP > 1)) {
    throw new SafeRequestError("invalid_request", "topP must be greater than 0 and at most 1");
  }
  if (request.stopSequences !== undefined && (
    !Array.isArray(request.stopSequences)
    || request.stopSequences.length > 16
    || request.stopSequences.some((sequence) => typeof sequence !== "string" || !sequence || sequence.length > 1_000)
  )) {
    throw new SafeRequestError("invalid_request", "stopSequences must contain 1 to 16 bounded strings");
  }
  if (request.metadata.budget.maxInputItems !== undefined
    && request.messages.length > request.metadata.budget.maxInputItems) {
    throw new SafeRequestError("budget_exceeded", "message count exceeds the request budget");
  }
  if (request.responseFormat !== undefined
    && request.responseFormat.type !== "text"
    && request.responseFormat.type !== "json") {
    throw new SafeRequestError("invalid_request", "responseFormat type is invalid");
  }
  if (request.responseFormat?.type === "json") {
    safeRoutingValue(request.responseFormat.schemaName, "responseFormat.schemaName");
    serializeAndValidateSchema(request.responseFormat.jsonSchema);
  }
}

function jsonSchemaKeys(schema: Record<string, unknown>): readonly string[] {
  return [
    "$schema", "$id", "title", "description", "default", "examples",
    "type", "enum", "const", "properties", "required", "additionalProperties",
    "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength",
    "pattern", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
    "minProperties", "maxProperties", "anyOf", "allOf", "oneOf", "not",
  ];
}

function assertSupportedSchema(schema: unknown, depth = 0): void {
  if (schema === undefined || schema === true) return;
  if (schema === false) return;
  if (!isRecord(schema) || depth > MAX_SCHEMA_DEPTH) {
    throw new SafeRequestError("invalid_request", "response JSON schema is invalid or too deeply nested");
  }
  const allowed = new Set(jsonSchemaKeys(schema));
  if (Object.keys(schema).some((key) => !allowed.has(key))) {
    throw new SafeRequestError("invalid_request", "response JSON schema uses an unsupported keyword");
  }
  if (schema.type !== undefined) {
    const allowedTypes = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (types.length === 0 || types.some((type) => typeof type !== "string" || !allowedTypes.has(type))) {
      throw new SafeRequestError("invalid_request", "response JSON schema has an invalid type");
    }
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    throw new SafeRequestError("invalid_request", "schema enum must be a non-empty array");
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) throw new SafeRequestError("invalid_request", "schema properties must be an object");
    for (const child of Object.values(schema.properties)) assertSupportedSchema(child, depth + 1);
  }
  if (schema.required !== undefined && (
    !Array.isArray(schema.required) || schema.required.some((key) => typeof key !== "string")
  )) {
    throw new SafeRequestError("invalid_request", "schema required must be a string array");
  }
  if (schema.additionalProperties !== undefined
    && typeof schema.additionalProperties !== "boolean"
    && !isRecord(schema.additionalProperties)) {
    throw new SafeRequestError("invalid_request", "schema additionalProperties is invalid");
  }
  if (isRecord(schema.additionalProperties)) assertSupportedSchema(schema.additionalProperties, depth + 1);
  if (schema.items !== undefined) assertSupportedSchema(schema.items, depth + 1);
  for (const keyword of ["anyOf", "allOf", "oneOf"] as const) {
    if (schema[keyword] === undefined) continue;
    if (!Array.isArray(schema[keyword]) || schema[keyword].length === 0) {
      throw new SafeRequestError("invalid_request", `schema ${keyword} must be a non-empty array`);
    }
    for (const child of schema[keyword]) assertSupportedSchema(child, depth + 1);
  }
  if (schema.not !== undefined) assertSupportedSchema(schema.not, depth + 1);
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string" || schema.pattern.length > 2_000) {
      throw new SafeRequestError("invalid_request", "schema pattern is invalid");
    }
    try {
      new RegExp(schema.pattern, "u");
    } catch {
      throw new SafeRequestError("invalid_request", "schema pattern is invalid");
    }
  }
  for (const keyword of [
    "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum",
    "exclusiveMinimum", "exclusiveMaximum", "minProperties", "maxProperties",
  ] as const) {
    if (schema[keyword] !== undefined
      && (typeof schema[keyword] !== "number" || !Number.isFinite(schema[keyword]))) {
      throw new SafeRequestError("invalid_request", `schema ${keyword} must be a finite number`);
    }
  }
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") {
    throw new SafeRequestError("invalid_request", "schema uniqueItems must be a boolean");
  }
}

function serializeAndValidateSchema(schema: Readonly<Record<string, unknown>> | undefined): string | undefined {
  if (schema === undefined) return undefined;
  assertSupportedSchema(schema);
  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch {
    throw new SafeRequestError("invalid_request", "response JSON schema must be serializable");
  }
  if (!serialized || serialized.length > MAX_SCHEMA_CHARACTERS) {
    throw new SafeRequestError("invalid_request", "response JSON schema is too large");
  }
  return serialized;
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqualJson(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key) && deepEqualJson(left[key], right[key]));
  }
  return false;
}

function matchesSchema(value: unknown, rawSchema: unknown, depth = 0): boolean {
  if (rawSchema === true || rawSchema === undefined) return true;
  if (rawSchema === false || !isRecord(rawSchema) || depth > MAX_SCHEMA_DEPTH) return false;
  const schema = rawSchema;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqualJson(value, candidate))) return false;
  if (Object.hasOwn(schema, "const") && !deepEqualJson(value, schema.const)) return false;
  if (Array.isArray(schema.allOf) && !schema.allOf.every((child) => matchesSchema(value, child, depth + 1))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((child) => matchesSchema(value, child, depth + 1))) return false;
  if (Array.isArray(schema.oneOf)
    && schema.oneOf.filter((child) => matchesSchema(value, child, depth + 1)).length !== 1) return false;
  if (schema.not !== undefined && matchesSchema(value, schema.not, depth + 1)) return false;

  const actualTypes: string[] = [];
  if (value === null) actualTypes.push("null");
  else if (Array.isArray(value)) actualTypes.push("array");
  else if (typeof value === "number") actualTypes.push("number", ...(Number.isInteger(value) ? ["integer"] : []));
  else actualTypes.push(typeof value);
  const expectedTypes = schema.type === undefined ? undefined : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (expectedTypes && !expectedTypes.some((type) => actualTypes.includes(String(type)))) return false;

  if (typeof value === "string") {
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && length > schema.maxLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) return false;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return false;
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true
      && value.some((entry, index) => value.slice(0, index).some((prior) => deepEqualJson(prior, entry)))) return false;
    if (schema.items !== undefined && !value.every((entry) => matchesSchema(entry, schema.items, depth + 1))) return false;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (typeof schema.minProperties === "number" && keys.length < schema.minProperties) return false;
    if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) return false;
    if (Array.isArray(schema.required)
      && schema.required.some((key) => typeof key !== "string" || !Object.hasOwn(value, key))) return false;
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const key of keys) {
      if (Object.hasOwn(properties, key)) {
        if (!matchesSchema(value[key], properties[key], depth + 1)) return false;
      } else if (schema.additionalProperties === false) {
        return false;
      } else if (isRecord(schema.additionalProperties)
        && !matchesSchema(value[key], schema.additionalProperties, depth + 1)) return false;
    }
  }
  return true;
}

function jsonInstruction(request: ModelRequest): string | undefined {
  if (request.responseFormat?.type !== "json") return undefined;
  const serializedSchema = serializeAndValidateSchema(request.responseFormat.jsonSchema);
  const contract = request.responseFormat.schemaName
    ? `JSON contract name: ${request.responseFormat.schemaName}.`
    : "";
  return [
    "Return exactly one valid JSON value with no Markdown fence or surrounding prose.",
    contract,
    serializedSchema ? `The JSON value must satisfy this JSON Schema: ${serializedSchema}` : "",
  ].filter(Boolean).join("\n");
}

function emptyPiUsage(): PiAssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function buildContext(request: ModelRequest, model: PiModel, timestamp: number): PiContext {
  const systemParts: string[] = [];
  const messages: PiContext["messages"] = [];
  for (const message of request.messages) {
    if (message.role === "system") {
      if (message.content) systemParts.push(message.content);
      continue;
    }
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content, timestamp });
      continue;
    }
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyPiUsage(),
      stopReason: "stop",
      timestamp,
    });
  }
  const responseInstruction = jsonInstruction(request);
  if (responseInstruction) systemParts.push(responseInstruction);
  return {
    ...(systemParts.length > 0 ? { systemPrompt: systemParts.join("\n\n") } : {}),
    messages,
  };
}

function estimateTextTokens(text: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const character of text) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil(ascii / 4 + nonAscii);
}

function estimateContextTokens(context: PiContext): number {
  let tokens = context.systemPrompt ? estimateTextTokens(context.systemPrompt) : 0;
  for (const message of context.messages) {
    tokens += 4;
    if (message.role === "user" && typeof message.content === "string") tokens += estimateTextTokens(message.content);
    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text") tokens += estimateTextTokens(block.text);
      }
    }
  }
  return tokens;
}

function maximumRate(model: PiModel, key: "input" | "output"): number {
  const rates = [model.cost[key], ...(model.cost.tiers ?? []).map((tier) => tier[key])];
  return Math.max(0, ...rates.filter((rate) => Number.isFinite(rate)));
}

function assertBudget(request: ModelRequest, model: PiModel, context: PiContext): void {
  const inputEstimate = estimateContextTokens(context);
  if (request.metadata.budget.maxInputTokens !== undefined
    && inputEstimate > request.metadata.budget.maxInputTokens) {
    throw new SafeRequestError("budget_exceeded", "estimated input exceeds the token budget");
  }
  if (request.metadata.budget.maxCostUsd === undefined) return;
  const outputCeiling = Math.min(request.metadata.budget.maxOutputTokens ?? model.maxTokens, model.maxTokens);
  const estimatedCost = (
    inputEstimate * maximumRate(model, "input")
    + outputCeiling * maximumRate(model, "output")
  ) / 1_000_000;
  if (estimatedCost > request.metadata.budget.maxCostUsd) {
    throw new SafeRequestError("budget_exceeded", "estimated cost exceeds the request budget");
  }
}

function assertActualBudget(request: ModelRequest, usage: AiUsage): void {
  const budget = request.metadata.budget;
  const actualInput = (usage.inputTokens ?? 0) + (usage.cachedInputTokens ?? 0);
  if (budget.maxInputTokens !== undefined && actualInput > budget.maxInputTokens) {
    throw new SafeRequestError("budget_exceeded", "provider input usage exceeds the token budget");
  }
  if (budget.maxOutputTokens !== undefined && (usage.outputTokens ?? 0) > budget.maxOutputTokens) {
    throw new SafeRequestError("budget_exceeded", "provider output usage exceeds the token budget");
  }
  if (budget.maxCostUsd !== undefined && (usage.costUsd ?? 0) > budget.maxCostUsd) {
    throw new SafeRequestError("budget_exceeded", "provider cost exceeds the request budget");
  }
}

function requestOptions(request: ModelRequest, settings: PiModelSettingsPort, signal: AbortSignal): PiRequestOptions {
  const retry = settings.getProviderRetrySettings?.();
  const configuredTimeout = retry?.timeoutMs ?? settings.getHttpIdleTimeoutMs?.();
  const timeoutMs = configuredTimeout === undefined || configuredTimeout === 0
    ? request.metadata.budget.timeoutMs
    : Math.min(configuredTimeout, request.metadata.budget.timeoutMs);
  const samplingParams = {
    ...(request.topP === undefined ? {} : { top_p: request.topP }),
    ...(request.stopSequences === undefined ? {} : { stop: [...request.stopSequences] }),
  };
  return {
    signal,
    timeoutMs,
    ...(retry?.maxRetries === undefined ? {} : { maxRetries: retry.maxRetries }),
    ...(retry?.maxRetryDelayMs === undefined ? {} : { maxRetryDelayMs: retry.maxRetryDelayMs }),
    ...(settings.getWebSocketConnectTimeoutMs?.() === undefined
      ? {}
      : { websocketConnectTimeoutMs: settings.getWebSocketConnectTimeoutMs?.() }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.metadata.budget.maxOutputTokens === undefined
      ? {}
      : { maxTokens: request.metadata.budget.maxOutputTokens }),
    ...(Object.keys(samplingParams).length === 0 ? {} : { samplingParams }),
  };
}

function piText(message: PiAssistantMessage): string {
  return message.content
    .filter((block): block is Extract<(typeof message.content)[number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function mapUsage(message: PiAssistantMessage, durationMs: number): AiUsage {
  const usage: AiUsage = {
    inputTokens: message.usage.input,
    outputTokens: message.usage.output,
    totalTokens: message.usage.totalTokens,
    cachedInputTokens: message.usage.cacheRead,
    costUsd: message.usage.cost.total,
    durationMs,
  };
  if (message.usage.reasoning !== undefined) usage.reasoningTokens = message.usage.reasoning;
  return usage;
}

function mapFinishReason(reason: PiAssistantMessage["stopReason"]): ModelFinishReason {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  if (reason === "aborted") return "cancelled";
  return "unknown";
}

function numericStatus(error: ErrorLike): number | undefined {
  const status = typeof error.status === "number" ? error.status : error.statusCode;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
}

function errorChain(error: unknown): ErrorLike[] {
  const result: ErrorLike[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && isRecord(current); depth += 1) {
    result.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return result;
}

function retryAfterMs(chain: readonly ErrorLike[]): number | undefined {
  for (const error of chain) {
    const headers = error.headers;
    let value: string | null | undefined;
    if (headers instanceof Headers) value = headers.get("retry-after");
    else if (isRecord(headers)) {
      const candidate = headers["retry-after"] ?? headers["Retry-After"];
      if (typeof candidate === "string" || typeof candidate === "number") value = String(candidate);
    }
    if (!value) continue;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1_000), 86_400_000);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 86_400_000));
  }
  return undefined;
}

function safeFailure(
  code: AiGatewayErrorCode,
  providerId?: string,
  details: Partial<Pick<AiGatewayError, "statusCode" | "retryAfterMs">> = {},
): AiGatewayError {
  const descriptions: Record<AiGatewayErrorCode, { message: string; retryable: boolean }> = {
    invalid_request: { message: "The AI request is invalid", retryable: false },
    not_configured: { message: "The selected AI provider or model is not configured", retryable: false },
    authentication_failed: { message: "AI provider authentication failed", retryable: false },
    permission_denied: { message: "The AI provider denied this request", retryable: false },
    budget_exceeded: { message: "The AI request exceeds its configured budget", retryable: false },
    rate_limited: { message: "The AI provider rate limited this request", retryable: true },
    quota_exceeded: { message: "The AI provider quota is exhausted", retryable: false },
    timeout: { message: "The AI request timed out", retryable: true },
    cancelled: { message: "The AI request was cancelled", retryable: false },
    content_blocked: { message: "The AI provider blocked the requested content", retryable: false },
    provider_unavailable: { message: "The AI provider is temporarily unavailable", retryable: true },
    invalid_provider_response: { message: "The AI provider returned an invalid response", retryable: true },
    unknown: { message: "The AI request failed", retryable: false },
  };
  return {
    code,
    ...descriptions[code],
    ...(providerId ? { providerId } : {}),
    ...details,
  };
}

function mapError(error: unknown, providerId: string | undefined, scope?: CallScope): AiGatewayError {
  const scopeCode = scope?.failureCode;
  if (scopeCode) return safeFailure(scopeCode, providerId);
  if (error instanceof SafeRequestError) return safeFailure(error.gatewayCode, providerId);
  const chain = errorChain(error);
  const statusCode = chain.map(numericStatus).find((status) => status !== undefined);
  const retryAfter = retryAfterMs(chain);
  const message = chain
    .map((entry) => typeof entry.message === "string" ? entry.message : "")
    .join(" ")
    .slice(0, 8_000);
  const names = chain.map((entry) => String(entry.name ?? "")).join(" ");
  const codes = chain.map((entry) => String(entry.code ?? "")).join(" ");
  const detail = `${message} ${names} ${codes}`;
  const responseDetails = {
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(retryAfter === undefined ? {} : { retryAfterMs: retryAfter }),
  };

  if (/content.?filter|safety|moderation|blocked.?content|responsible.?ai/iu.test(detail)) {
    return safeFailure("content_blocked", providerId, responseDetails);
  }
  if (statusCode === 401) return safeFailure("authentication_failed", providerId, responseDetails);
  if (statusCode === 403) return safeFailure("permission_denied", providerId, responseDetails);
  if (statusCode === 408 || statusCode === 504 || /\bETIMEDOUT\b|timeout|timed out/iu.test(detail)) {
    return safeFailure("timeout", providerId, responseDetails);
  }
  if (statusCode === 429) {
    return safeFailure(
      /quota|billing|credit|balance|usage.?limit/iu.test(detail) ? "quota_exceeded" : "rate_limited",
      providerId,
      responseDetails,
    );
  }
  if (statusCode !== undefined && statusCode >= 500) {
    return safeFailure("provider_unavailable", providerId, responseDetails);
  }
  if (statusCode === 400 || statusCode === 404 || statusCode === 413 || statusCode === 422) {
    return safeFailure("invalid_request", providerId, responseDetails);
  }
  if (/\b(auth|oauth)\b/iu.test(codes)) {
    return safeFailure(/not configured|no api key|missing.*credential/iu.test(detail)
      ? "not_configured"
      : "authentication_failed", providerId, responseDetails);
  }
  if (/quota|insufficient_quota|billing|credit|balance|usage.?limit/iu.test(detail)) {
    return safeFailure("quota_exceeded", providerId, responseDetails);
  }
  if (/rate.?limit|too many requests/iu.test(detail)) {
    return safeFailure("rate_limited", providerId, responseDetails);
  }
  if (/AbortError|ABORT_ERR/iu.test(`${names} ${codes}`)) return safeFailure("cancelled", providerId);
  if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket|service unavailable/iu.test(detail)) {
    return safeFailure("provider_unavailable", providerId, responseDetails);
  }
  if (/\b(model_validation)\b/iu.test(codes)) return safeFailure("invalid_request", providerId, responseDetails);
  if (/\b(model_source|provider|stream)\b/iu.test(codes)) {
    return safeFailure("provider_unavailable", providerId, responseDetails);
  }
  return safeFailure("unknown", providerId, responseDetails);
}

function validateJsonResponse(request: ModelRequest, text: string): void {
  if (request.responseFormat?.type !== "json") return;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SafeGatewayFailure(safeFailure("invalid_provider_response"));
  }
  if (request.responseFormat.jsonSchema !== undefined
    && !matchesSchema(value, request.responseFormat.jsonSchema)) {
    throw new SafeGatewayFailure(safeFailure("invalid_provider_response"));
  }
}

function responseFromPi(
  requestId: string,
  resolved: ResolvedRequest,
  message: PiAssistantMessage,
  durationMs: number,
): ModelResponse {
  return {
    requestId,
    model: { providerId: resolved.providerId, modelId: resolved.modelId },
    text: piText(message),
    finishReason: mapFinishReason(message.stopReason),
    usage: mapUsage(message, durationMs),
  };
}

/**
 * Provider-neutral ModelGateway backed directly by Pi's credentials and model runtime.
 * It never creates, reads, or mutates a Pi Session.
 */
export class PiModelGateway implements ModelGateway {
  private readonly now: () => number;
  private readonly createRequestId: () => string;
  private settingsReload?: Promise<void>;

  constructor(
    private readonly runtime: PiModelRuntimePort,
    private readonly settings: PiModelSettingsPort,
    options: PiModelGatewayOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.createRequestId = options.createRequestId ?? randomUUID;
  }

  async generate(request: ModelRequest, options: AiCallOptions = {}): Promise<AiGatewayResult<ModelResponse>> {
    const startedAt = this.now();
    let scope: CallScope | undefined;
    let providerId: string | undefined;
    try {
      validateRequest(request);
      scope = new CallScope(request.metadata.budget.timeoutMs, options.signal);
      const resolved = await scope.race(this.resolveRequest(request, scope.signal));
      providerId = resolved.providerId;
      const message = await scope.race(Promise.resolve().then(
        () => this.runtime.completeSimple(resolved.model, resolved.context, resolved.options),
      ));
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        return aiFailure(mapError({
          name: message.stopReason === "aborted" ? "AbortError" : "PiProviderError",
          message: message.errorMessage,
        }, providerId, scope));
      }
      const response = responseFromPi(this.createRequestId(), resolved, message, this.now() - startedAt);
      validateJsonResponse(request, response.text);
      assertActualBudget(request, response.usage);
      return aiSuccess(response);
    } catch (error) {
      if (error instanceof SafeGatewayFailure) {
        return aiFailure({ ...error.gatewayError, ...(providerId ? { providerId } : {}) });
      }
      if (error instanceof SafeRequestError) return aiFailure(mapError(error, providerId, scope));
      try {
        assertAiRequestMetadata(request?.metadata);
      } catch (validationError) {
        return invalidAiRequest(validationError);
      }
      return aiFailure(mapError(error, providerId, scope));
    } finally {
      scope?.dispose();
    }
  }

  async *stream(request: ModelRequest, options: AiCallOptions = {}): AsyncIterable<ModelStreamEvent> {
    const startedAt = this.now();
    let scope: CallScope | undefined;
    let providerId: string | undefined;
    let completed = false;
    try {
      validateRequest(request);
      scope = new CallScope(request.metadata.budget.timeoutMs, options.signal);
      const resolved = await scope.race(this.resolveRequest(request, scope.signal));
      providerId = resolved.providerId;
      const requestId = this.createRequestId();
      const source = this.runtime.streamSimple(resolved.model, resolved.context, resolved.options);
      const iterator = source[Symbol.asyncIterator]();
      yield { type: "started", requestId, model: { providerId: resolved.providerId, modelId: resolved.modelId } };

      while (true) {
        const item = await scope.race(Promise.resolve().then(() => iterator.next()));
        if (item.done) {
          throw new SafeGatewayFailure(safeFailure("invalid_provider_response", providerId));
        }
        const event = item.value;
        if (event.type === "text_delta") {
          yield { type: "text_delta", delta: event.delta };
          continue;
        }
        if (event.type === "error") {
          yield { type: "failed", error: mapError({
            name: event.reason === "aborted" ? "AbortError" : "PiProviderError",
            message: event.error.errorMessage,
          }, providerId, scope) };
          completed = true;
          return;
        }
        if (event.type !== "done") continue;
        const response = responseFromPi(requestId, resolved, event.message, this.now() - startedAt);
        validateJsonResponse(request, response.text);
        assertActualBudget(request, response.usage);
        yield { type: "usage", usage: response.usage };
        yield { type: "completed", response };
        completed = true;
        return;
      }
    } catch (error) {
      let failure: AiGatewayError;
      if (error instanceof SafeGatewayFailure) {
        failure = { ...error.gatewayError, ...(providerId ? { providerId } : {}) };
      }
      else if (error instanceof SafeRequestError) failure = mapError(error, providerId, scope);
      else {
        try {
          assertAiRequestMetadata(request?.metadata);
          failure = mapError(error, providerId, scope);
        } catch (validationError) {
          failure = invalidAiRequest(validationError).error;
        }
      }
      yield { type: "failed", error: failure };
      completed = true;
    } finally {
      if (!completed) scope?.cancelPendingWork();
      scope?.dispose();
    }
  }

  private async resolveRequest(request: ModelRequest, signal: AbortSignal): Promise<ResolvedRequest> {
    await this.reloadSettings();
    signal.throwIfAborted();
    const defaultProvider = safeRoutingValue(this.settings.getDefaultProvider(), "default provider");
    const defaultModel = safeRoutingValue(this.settings.getDefaultModel(), "default model");
    const providerId = safeRoutingValue(request.model?.providerId, "model.providerId") ?? defaultProvider;
    const modelId = safeRoutingValue(request.model?.modelId, "model.modelId")
      ?? (providerId === defaultProvider ? defaultModel : undefined);
    if (!providerId || !modelId) {
      throw new SafeGatewayFailure(safeFailure("not_configured", providerId));
    }
    let model = this.runtime.getModel(providerId, modelId);
    if (!model && this.runtime.refresh) {
      await this.runtime.refresh({ allowNetwork: false, providers: [providerId], signal });
      signal.throwIfAborted();
      model = this.runtime.getModel(providerId, modelId);
    }
    if (!model) throw new SafeGatewayFailure(safeFailure("not_configured", providerId));
    const context = buildContext(request, model, this.now());
    assertBudget(request, model, context);
    return {
      model,
      providerId,
      modelId,
      context,
      options: requestOptions(request, this.settings, signal),
    };
  }

  private async reloadSettings(): Promise<void> {
    if (!this.settings.reload) return;
    const current = this.settingsReload ?? Promise.resolve().then(() => this.settings.reload!());
    this.settingsReload = current;
    try {
      await current;
    } finally {
      if (this.settingsReload === current) this.settingsReload = undefined;
    }
  }
}

function piBundleEntry(appRoot: string): string {
  const relativeParts = [
    "node_modules",
    "@earendil-works",
    "pi-coding-agent",
    "dist",
    "bundle",
    "index.js",
  ];
  // Keep the virtual app.asar path in packaged Electron. The coding-agent
  // bundle still imports a few packaged peers (for example pi-ai/chord), and
  // Electron resolves those peers across the archive while transparently
  // redirecting files selected by asarUnpack to app.asar.unpacked.
  return join(appRoot, ...relativeParts);
}

/** Load Pi's self-contained ESM bundle, which is already shipped for the RPC runtime. */
export async function loadPiRuntimeModule(appRoot: string): Promise<PiRuntimeModule> {
  try {
    const loaded = await import(pathToFileURL(piBundleEntry(appRoot)).href) as Partial<PiRuntimeModule>;
    if (typeof loaded.ModelRuntime?.create !== "function" || typeof loaded.SettingsManager?.create !== "function") {
      throw new Error("Required Pi runtime exports are missing");
    }
    return loaded as PiRuntimeModule;
  } catch (cause) {
    throw new Error("Pi model runtime is unavailable", { cause });
  }
}

/**
 * Create the production gateway from Pi's existing model/settings files.
 * No AgentSession or SessionManager is constructed by this path.
 */
export async function createPiModelGateway(options: CreatePiModelGatewayOptions): Promise<PiModelGateway> {
  const pi = await loadPiRuntimeModule(options.appRoot);
  const settings = pi.SettingsManager.create(
    options.cwd,
    options.agentDir,
    { projectTrusted: options.projectTrusted ?? true },
  );
  const runtime = await pi.ModelRuntime.create({
    ...(options.agentDir === undefined
      ? {}
      : {
          authPath: join(options.agentDir, "auth.json"),
          modelsPath: join(options.agentDir, "models.json"),
        }),
    allowModelNetwork: false,
    signal: options.signal,
  });
  return new PiModelGateway(runtime, settings as SettingsManager, options);
}
