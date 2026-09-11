import { describe, expect, it } from "vitest";
import { azureOpenAIResponsesProvider } from "../src/providers/azure-openai-responses.ts";

describe("Azure OpenAI provider authentication", () => {
	it("stores the API key with a base URL selected by the login flow", async () => {
		const provider = azureOpenAIResponsesProvider();
		const answers = ["secret-key", "base-url", "https://example.openai.azure.com"];
		const credential = await provider.auth.apiKey?.login?.({
			signal: new AbortController().signal,
			prompt: async () => answers.shift() ?? "",
			notify: () => {},
		});

		expect(credential).toEqual({
			type: "api_key",
			key: "secret-key",
			env: { AZURE_OPENAI_BASE_URL: "https://example.openai.azure.com" },
		});
	});

	it("requires both a key and endpoint during auth resolution", async () => {
		const provider = azureOpenAIResponsesProvider();
		const resolve = provider.auth.apiKey?.resolve;
		expect(resolve).toBeDefined();
		const ctx = {
			env: async () => undefined,
			fileExists: async () => false,
		};
		const signal = new AbortController().signal;

		await expect(
			resolve?.({ ctx, credential: { type: "api_key", key: "secret-key" }, signal }),
		).resolves.toBeUndefined();
		await expect(
			resolve?.({
				ctx,
				credential: {
					type: "api_key",
					key: "secret-key",
					env: { AZURE_OPENAI_RESOURCE_NAME: "my-resource" },
				},
				signal,
			}),
		).resolves.toMatchObject({
			auth: { apiKey: "secret-key" },
			env: { AZURE_OPENAI_RESOURCE_NAME: "my-resource" },
		});
	});
});
