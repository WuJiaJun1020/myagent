import type { AiGatewayError } from "../../platform/shared/ai/contracts";
import type { ModelCallDiagnostics, ModelGateway, ModelRequest, ModelResponseDiagnostics } from "../../platform/shared/ai/model-gateway";
import type { InterviewCallError, InterviewCallTrace } from "../../shared/contracts/interview";

type Attempt = InterviewCallTrace["attempts"][number];

function failureStage(error: AiGatewayError, response?: ModelResponseDiagnostics, call?: ModelCallDiagnostics): InterviewCallError["stage"] {
  if (error.validationStage) return response?.finishReason === "length" ? "output_length" : error.validationStage;
  if (call && call.phase !== "runtime_call" && call.phase !== "response_validation") return "request";
  if (error.code === "invalid_request" || error.code === "not_configured" || error.code === "budget_exceeded") return "request";
  if (error.code === "unknown" || error.code === "invalid_provider_response") return "unknown";
  return "provider";
}

/** Records each physical attempt without changing the caller's fallback or repair policy. */
export async function invokeInterviewModel(gateway: ModelGateway, request: ModelRequest,
  trace: InterviewCallTrace, signal?: AbortSignal, retryInstruction?: string) {
  const attempt: Attempt = {
    providerId: request.model?.providerId ?? "default", modelId: request.model?.modelId ?? "default",
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    ...(retryInstruction ? { retryInstruction } : {}),
  };
  let diagnostics: ModelResponseDiagnostics | undefined;
  try {
    const result = await gateway.generate(request, { signal, onCallDiagnostics: (call) => {
      attempt.requestId = call.requestId;
      attempt.diagnostics = call;
      if (call.model) Object.assign(attempt, call.model);
    }, onResponseDiagnostics: (response) => {
      diagnostics = response;
      Object.assign(attempt, { providerId: response.model.providerId, modelId: response.model.modelId,
        requestId: response.requestId, finishReason: response.finishReason, providerStopReason: response.providerStopReason,
        usage: response.usage, outputText: response.text });
    } });
    if (result.ok) {
      Object.assign(attempt, { providerId: result.value.model.providerId, modelId: result.value.model.modelId,
        requestId: result.value.requestId, finishReason: result.value.finishReason,
        usage: result.value.usage, outputText: result.value.text });
    } else {
      const { validationStage: _validationStage, ...error } = result.error;
      attempt.error = { ...error, stage: failureStage(result.error, diagnostics, attempt.diagnostics) };
    }
    return { result, attempt };
  } catch (error) {
    attempt.error = { code: "transport_error", stage: "unknown",
      message: error instanceof Error ? error.message : String(error) };
    throw error;
  } finally {
    attempt.finishedAt = new Date().toISOString();
    trace.attempts.push(attempt);
  }
}
