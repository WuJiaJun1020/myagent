export type ProviderAuthType = "api_key" | "oauth";

export type ProviderAuthMethod = {
  type: ProviderAuthType;
  name: string;
  loginLabel?: string;
  isSubscription: boolean;
  interactive: boolean;
};

export type ModelProvider = {
  id: string;
  name: string;
  configured: boolean;
  authType?: ProviderAuthType;
  authSource?: string;
  stored: boolean;
  modelCount: number;
  availableModelCount: number;
  authMethods: ProviderAuthMethod[];
};

export type ProviderSnapshot = {
  providers: ModelProvider[];
  error?: string;
  updatedAt: number;
};

export type ProviderAuthPrompt =
  | { type: "text" | "secret" | "manual_code"; message: string; placeholder?: string }
  | {
      type: "select";
      message: string;
      options: Array<{ id: string; label: string; description?: string }>;
    };

export type ProviderAuthRequest = {
  type: "provider_auth_request";
  flowId: string;
  id: string;
  providerId: string;
  prompt: ProviderAuthPrompt;
};

export type ProviderAuthResponse = {
  type: "provider_auth_response";
  flowId: string;
  id: string;
  value?: string;
  cancelled?: boolean;
};

export type ProviderAuthProgressEvent = {
  type: "provider_auth_event";
  flowId: string;
  providerId: string;
  event:
    | { type: "started"; authType: ProviderAuthType }
    | { type: "info"; message: string; links?: Array<{ url: string; label?: string }> }
    | { type: "auth_url"; url: string; instructions?: string }
    | {
        type: "device_code";
        userCode: string;
        verificationUri: string;
        intervalSeconds?: number;
        expiresInSeconds?: number;
      }
    | { type: "progress"; message: string }
    | { type: "completed" }
    | { type: "failed"; message: string };
};

export type ProviderAuthUiEvent = ProviderAuthRequest | ProviderAuthProgressEvent;
