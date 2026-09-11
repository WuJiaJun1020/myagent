import { describe, expect, it } from "vitest";
import { adaptProviderAuthEvent, adaptProviderSnapshot } from "./pi-provider-service";

describe("Pi provider adapters", () => {
  it("keeps provider status and auth methods without exposing credentials", () => {
    const snapshot = adaptProviderSnapshot({
      providers: [{
        id: "anthropic",
        name: "Anthropic",
        configured: true,
        authType: "oauth",
        authSource: "stored",
        stored: true,
        modelCount: 8,
        availableModelCount: 6,
        authMethods: [
          { type: "api_key", name: "Anthropic API key", interactive: true, isSubscription: false },
          { type: "oauth", name: "Claude Pro/Max", interactive: true, isSubscription: true },
        ],
      }],
    });

    expect(snapshot.providers[0]).toMatchObject({
      id: "anthropic",
      configured: true,
      authType: "oauth",
      authSource: "stored",
      modelCount: 8,
      availableModelCount: 6,
    });
    expect(JSON.stringify(snapshot)).not.toContain("sk-");
  });

  it("accepts safe auth prompts and rejects non-http authentication links", () => {
    expect(adaptProviderAuthEvent({
      type: "provider_auth_request",
      flowId: "flow-12345",
      id: "prompt-12345",
      providerId: "amazon-bedrock",
      prompt: {
        type: "select",
        message: "Select authentication method",
        options: [{ id: "aws-profile", label: "AWS profile" }],
      },
    })).toMatchObject({ type: "provider_auth_request", prompt: { type: "select" } });

    expect(adaptProviderAuthEvent({
      type: "provider_auth_event",
      flowId: "flow-12345",
      providerId: "openai-codex",
      event: { type: "auth_url", url: "javascript:alert(1)" },
    })).toBeUndefined();
  });
});
