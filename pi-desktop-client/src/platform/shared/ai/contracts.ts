/**
 * Identifies the product module that owns an AI request.
 *
 * This deliberately remains an open string instead of importing a renderer
 * navigation union. New product modules can use the platform port without
 * changing the port itself. Runtime validation still rejects blank values.
 */
export type AiModuleId = string;

/** A stable, machine-readable reason for the request, for example `prepare_questions`. */
export type AiRequestPurpose = string;

/**
 * `public`: content is already public; `internal`: ordinary private workspace data;
 * `confidential`: personal or commercially sensitive content; `restricted`: the
 * highest policy tier, which an adapter may refuse or route only to local models.
 */
export const AI_PRIVACY_LEVELS = ["public", "internal", "confidential", "restricted"] as const;
export type AiPrivacyLevel = (typeof AI_PRIVACY_LEVELS)[number];

export type AiRequestBudget = {
  /** Hard wall-clock deadline for the whole call, including adapter retries. */
  timeoutMs: number;
  /** Optional caller-side ceiling for prompt or embedding input. */
  maxInputTokens?: number;
  /** Optional caller-side ceiling for generated output. */
  maxOutputTokens?: number;
  /** Optional ceiling for batch size, primarily used by embeddings. */
  maxInputItems?: number;
  /** Optional monetary ceiling in USD. Zero means that paid calls are not allowed. */
  maxCostUsd?: number;
};

/**
 * Metadata every shared AI capability call must carry.
 *
 * It is routing and policy data only. It must never contain a prompt, resume,
 * book content, API key, or other business context.
 */
export type AiRequestMetadata = {
  moduleId: AiModuleId;
  purpose: AiRequestPurpose;
  privacy: AiPrivacyLevel;
  budget: AiRequestBudget;
  /** Optional caller-generated correlation ID. It is not a conversation ID. */
  traceId?: string;
};

export type AiCallOptions = {
  signal?: AbortSignal;
};

export type AiModelSelector = {
  /** Omit both fields to use the platform default for this module and purpose. */
  providerId?: string;
  modelId?: string;
};

export type AiResolvedModel = {
  providerId: string;
  modelId: string;
};

export type AiUsage = {
  /** Values remain optional because not every provider reports every counter. */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  inputItems?: number;
  costUsd?: number;
  durationMs?: number;
};

export const AI_GATEWAY_ERROR_CODES = [
  "invalid_request",
  "not_configured",
  "authentication_failed",
  "permission_denied",
  "budget_exceeded",
  "rate_limited",
  "quota_exceeded",
  "timeout",
  "cancelled",
  "content_blocked",
  "provider_unavailable",
  "invalid_provider_response",
  "unknown",
] as const;

export type AiGatewayErrorCode = (typeof AI_GATEWAY_ERROR_CODES)[number];

/** Whitelisted request/transport diagnostics; never contains provider response bodies or user input. */
export type AiGatewayDiagnosticCode =
  | "UNSUPPORTED_PARAMETER"
  | "CONTEXT_LIMIT"
  | "FETCH_FAILED"
  | "DNS_FAILURE"
  | "CONNECTION_REFUSED"
  | "CONNECTION_RESET"
  | "WEBSOCKET_FAILURE"
  | "HEADER_TIMEOUT";

/**
 * A provider-neutral, serializable error safe to pass across module boundaries.
 * `message` must not include raw prompts, document content, credentials, or response bodies.
 */
export type AiGatewayError = {
  code: AiGatewayErrorCode;
  message: string;
  retryable: boolean;
  providerId?: string;
  statusCode?: number;
  retryAfterMs?: number;
  diagnosticCode?: AiGatewayDiagnosticCode;
  /** Schema paths only; never include model text or user-provided values. */
  validationIssues?: string[];
};

export type AiGatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AiGatewayError };

export function aiSuccess<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function aiFailure(error: AiGatewayError): { ok: false; error: AiGatewayError } {
  return { ok: false, error };
}

function assertOptionalPositiveInteger(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
    throw new TypeError(`${name} must be a positive integer when provided`);
  }
}

function assertRoutingId(value: unknown, name: string, pattern: RegExp, maximum: number): asserts value is string {
  if (typeof value !== "string" || !value) throw new TypeError(`${name} is required`);
  if (value.length > maximum || value !== value.trim() || !pattern.test(value)) {
    throw new TypeError(`${name} must be a canonical lowercase routing ID`);
  }
}

/** Validates unknown policy metadata at an adapter or module boundary. */
export function assertAiRequestMetadata(metadata: unknown): asserts metadata is AiRequestMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("AI request metadata must be an object");
  }
  const candidate = metadata as Partial<AiRequestMetadata>;
  assertRoutingId(candidate.moduleId, "moduleId", /^[a-z][a-z0-9-]*$/u, 64);
  assertRoutingId(candidate.purpose, "purpose", /^[a-z][a-z0-9._-]*$/u, 128);
  if (!AI_PRIVACY_LEVELS.includes(candidate.privacy as AiPrivacyLevel)) {
    throw new TypeError(`Unsupported privacy level: ${String(candidate.privacy)}`);
  }
  if (!candidate.budget || typeof candidate.budget !== "object" || Array.isArray(candidate.budget)) {
    throw new TypeError("budget is required");
  }
  if (!Number.isInteger(candidate.budget.timeoutMs) || candidate.budget.timeoutMs <= 0) {
    throw new TypeError("budget.timeoutMs must be a positive integer");
  }
  assertOptionalPositiveInteger(candidate.budget.maxInputTokens, "budget.maxInputTokens");
  assertOptionalPositiveInteger(candidate.budget.maxOutputTokens, "budget.maxOutputTokens");
  assertOptionalPositiveInteger(candidate.budget.maxInputItems, "budget.maxInputItems");
  if (candidate.budget.maxCostUsd !== undefined
    && (!Number.isFinite(candidate.budget.maxCostUsd) || candidate.budget.maxCostUsd < 0)) {
    throw new TypeError("budget.maxCostUsd must be a non-negative finite number when provided");
  }
  if (candidate.traceId !== undefined && (
    typeof candidate.traceId !== "string"
    || !candidate.traceId.trim()
    || candidate.traceId !== candidate.traceId.trim()
    || candidate.traceId.length > 128
  )) {
    throw new TypeError("traceId must be a non-blank canonical value of at most 128 characters");
  }
}

/** Convert boundary validation failures without exposing prompts or provider payloads. */
export function invalidAiRequest(error: unknown): { ok: false; error: AiGatewayError } {
  return aiFailure({
    code: "invalid_request",
    message: error instanceof Error ? error.message : "Invalid AI request",
    retryable: false,
  });
}
