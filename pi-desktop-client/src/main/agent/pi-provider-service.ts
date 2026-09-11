import type {
  ModelProvider,
  ProviderAuthMethod,
  ProviderAuthType,
  ProviderAuthUiEvent,
  ProviderSnapshot,
} from "../../shared/contracts/provider-auth";
import type { RpcMessage } from "../../shared/rpc";
import { PiProcess } from "../pi-process";

type UnknownRecord = Record<string, unknown>;
const RPC_TIMEOUT = 30_000;
const LOGIN_TIMEOUT = 10 * 60_000;
const MAX_PROVIDERS = 500;
const MAX_TEXT = 2_000;
const SAFE_ID = /^[a-zA-Z0-9._:@/+-]{1,160}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = MAX_TEXT): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function authType(value: unknown): ProviderAuthType | undefined {
  return value === "api_key" || value === "oauth" ? value : undefined;
}

function parseMethod(value: unknown): ProviderAuthMethod | undefined {
  if (!isRecord(value)) return undefined;
  const type = authType(value.type);
  const name = text(value.name, 200);
  if (!type || !name) return undefined;
  return {
    type,
    name,
    loginLabel: text(value.loginLabel, 300),
    isSubscription: value.isSubscription === true,
    interactive: value.interactive === true,
  };
}

function parseProvider(value: unknown): ModelProvider | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id, 160);
  const name = text(value.name, 300);
  if (!id || !name || !SAFE_ID.test(id)) return undefined;
  return {
    id,
    name,
    configured: value.configured === true,
    authType: authType(value.authType),
    authSource: text(value.authSource, 300),
    stored: value.stored === true,
    modelCount: Math.max(0, finiteNumber(value.modelCount) ?? 0),
    availableModelCount: Math.max(0, finiteNumber(value.availableModelCount) ?? 0),
    authMethods: Array.isArray(value.authMethods)
      ? value.authMethods.flatMap((method) => parseMethod(method) ?? []).slice(0, 4)
      : [],
  };
}

export function adaptProviderSnapshot(value: unknown): ProviderSnapshot {
  if (!isRecord(value)) throw new Error("Pi provider RPC 返回了无效数据");
  return {
    providers: Array.isArray(value.providers)
      ? value.providers.flatMap((provider) => parseProvider(provider) ?? []).slice(0, MAX_PROVIDERS)
      : [],
    error: text(value.error, 8_000),
    updatedAt: Date.now(),
  };
}

function responseData(response: RpcMessage): unknown {
  return response.data;
}

function safeProviderId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error("Provider ID 无效");
  return value;
}

function safeFlowId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{8,160}$/.test(value)) throw new Error("认证流程 ID 无效");
  return value;
}

function safeHttpUrl(value: unknown): string | undefined {
  const raw = text(value, 2_048);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function adaptProviderAuthEvent(value: unknown): ProviderAuthUiEvent | undefined {
  if (!isRecord(value)) return undefined;
  const flowId = text(value.flowId, 160);
  const providerId = text(value.providerId, 160);
  if (!flowId || !providerId || !/^[a-zA-Z0-9-]{8,160}$/.test(flowId) || !SAFE_ID.test(providerId)) return undefined;

  if (value.type === "provider_auth_request" && isRecord(value.prompt)) {
    const id = text(value.id, 160);
    const promptType = value.prompt.type;
    const message = text(value.prompt.message, 2_000);
    if (!id || !message) return undefined;
    if (promptType === "select") {
      const options = Array.isArray(value.prompt.options)
        ? value.prompt.options.flatMap((option) => {
            if (!isRecord(option)) return [];
            const optionId = text(option.id, 300);
            const label = text(option.label, 500);
            return optionId && label ? [{ id: optionId, label, description: text(option.description, 1_000) }] : [];
          }).slice(0, 100)
        : [];
      return { type: "provider_auth_request", flowId, id, providerId, prompt: { type: "select", message, options } };
    }
    if (promptType === "text" || promptType === "secret" || promptType === "manual_code") {
      return {
        type: "provider_auth_request",
        flowId,
        id,
        providerId,
        prompt: { type: promptType, message, placeholder: text(value.prompt.placeholder, 500) },
      };
    }
    return undefined;
  }

  if (value.type !== "provider_auth_event" || !isRecord(value.event)) return undefined;
  const eventType = value.event.type;
  if (eventType === "started") {
    const method = authType(value.event.authType);
    return method ? { type: "provider_auth_event", flowId, providerId, event: { type: "started", authType: method } } : undefined;
  }
  if (eventType === "completed") return { type: "provider_auth_event", flowId, providerId, event: { type: "completed" } };
  if (eventType === "progress" || eventType === "failed") {
    const message = text(value.event.message, 4_000);
    return message ? { type: "provider_auth_event", flowId, providerId, event: { type: eventType, message } } : undefined;
  }
  if (eventType === "auth_url") {
    const url = safeHttpUrl(value.event.url);
    return url ? {
      type: "provider_auth_event",
      flowId,
      providerId,
      event: { type: "auth_url", url, instructions: text(value.event.instructions, 4_000) },
    } : undefined;
  }
  if (eventType === "device_code") {
    const userCode = text(value.event.userCode, 300);
    const verificationUri = safeHttpUrl(value.event.verificationUri);
    return userCode && verificationUri ? {
      type: "provider_auth_event",
      flowId,
      providerId,
      event: {
        type: "device_code",
        userCode,
        verificationUri,
        intervalSeconds: finiteNumber(value.event.intervalSeconds),
        expiresInSeconds: finiteNumber(value.event.expiresInSeconds),
      },
    } : undefined;
  }
  if (eventType === "info") {
    const message = text(value.event.message, 4_000);
    if (!message) return undefined;
    const links = Array.isArray(value.event.links)
      ? value.event.links.flatMap((link) => {
          if (!isRecord(link)) return [];
          const url = safeHttpUrl(link.url);
          return url ? [{ url, label: text(link.label, 500) }] : [];
        }).slice(0, 20)
      : undefined;
    return { type: "provider_auth_event", flowId, providerId, event: { type: "info", message, links } };
  }
  return undefined;
}

export class PiProviderService {
  constructor(private readonly pi: PiProcess) {}

  async getSnapshot(): Promise<ProviderSnapshot> {
    const response = await this.pi.send({ type: "get_providers" }, RPC_TIMEOUT);
    return adaptProviderSnapshot(responseData(response));
  }

  async login(providerId: unknown, method: unknown, flowId: unknown): Promise<ProviderSnapshot> {
    const safeMethod = authType(method);
    if (!safeMethod) throw new Error("Provider 认证方式无效");
    const response = await this.pi.send({
      id: safeFlowId(flowId),
      type: "login_provider",
      providerId: safeProviderId(providerId),
      authType: safeMethod,
    }, LOGIN_TIMEOUT);
    return adaptProviderSnapshot(responseData(response));
  }

  async logout(providerId: unknown): Promise<ProviderSnapshot> {
    const response = await this.pi.send({ type: "logout_provider", providerId: safeProviderId(providerId) }, RPC_TIMEOUT);
    return adaptProviderSnapshot(responseData(response));
  }

  async cancel(flowId: unknown): Promise<void> {
    await this.pi.send({ type: "cancel_provider_login", flowId: safeFlowId(flowId) }, RPC_TIMEOUT);
  }

  respond(response: unknown): void {
    if (!isRecord(response) || response.type !== "provider_auth_response") throw new Error("认证响应无效");
    const flowId = safeFlowId(response.flowId);
    const id = safeFlowId(response.id);
    if (
      response.cancelled !== true
      && (typeof response.value !== "string" || response.value.length > 65_536)
    ) throw new Error("认证响应无效");
    this.pi.sendWithoutResponse({
      type: "provider_auth_response",
      flowId,
      id,
      ...(response.cancelled === true ? { cancelled: true } : { value: response.value }),
    });
  }
}
