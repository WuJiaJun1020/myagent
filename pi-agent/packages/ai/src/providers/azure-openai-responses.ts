import { azureOpenAIResponsesApi } from "../api/azure-openai-responses.lazy.ts";
import type { ApiKeyAuth, ApiKeyCredential } from "../auth/types.ts";
import { createProvider, type Provider } from "../models.ts";
import { AZURE_OPENAI_RESPONSES_MODELS } from "./azure-openai-responses.models.ts";

const azureOpenAIAuth: ApiKeyAuth = {
	name: "Azure OpenAI API key and endpoint",
	login: async (interaction): Promise<ApiKeyCredential> => {
		interaction.signal.throwIfAborted();
		const key = await interaction.prompt({ type: "secret", message: "Enter Azure OpenAI API key" });
		const endpointType = await interaction.prompt({
			type: "select",
			message: "Configure the Azure OpenAI endpoint using:",
			options: [
				{ id: "base-url", label: "Base URL", description: "For example https://resource.openai.azure.com" },
				{ id: "resource-name", label: "Resource name", description: "The Azure OpenAI resource name only" },
			],
		});
		interaction.signal.throwIfAborted();
		if (endpointType === "base-url") {
			const baseUrl = await interaction.prompt({
				type: "text",
				message: "Enter Azure OpenAI base URL",
				placeholder: "https://your-resource.openai.azure.com",
			});
			return { type: "api_key", key, env: { AZURE_OPENAI_BASE_URL: baseUrl } };
		}
		if (endpointType === "resource-name") {
			const resourceName = await interaction.prompt({
				type: "text",
				message: "Enter Azure OpenAI resource name",
			});
			return { type: "api_key", key, env: { AZURE_OPENAI_RESOURCE_NAME: resourceName } };
		}
		throw new Error(`Unknown Azure OpenAI endpoint type: ${endpointType}`);
	},
	resolve: async ({ ctx, credential, signal }) => {
		signal.throwIfAborted();
		const key = credential?.key ?? (await ctx.env("AZURE_OPENAI_API_KEY"));
		signal.throwIfAborted();
		if (!key) return undefined;
		const baseUrl = credential?.env?.AZURE_OPENAI_BASE_URL ?? (await ctx.env("AZURE_OPENAI_BASE_URL"));
		signal.throwIfAborted();
		const resourceName = credential?.env?.AZURE_OPENAI_RESOURCE_NAME ?? (await ctx.env("AZURE_OPENAI_RESOURCE_NAME"));
		signal.throwIfAborted();
		if (!baseUrl && !resourceName) return undefined;
		return {
			auth: { apiKey: key },
			env: {
				...(credential?.env ?? {}),
				...(baseUrl ? { AZURE_OPENAI_BASE_URL: baseUrl } : {}),
				...(resourceName ? { AZURE_OPENAI_RESOURCE_NAME: resourceName } : {}),
			},
			source: credential ? "stored credential" : "AZURE_OPENAI_API_KEY",
		};
	},
};

export function azureOpenAIResponsesProvider(): Provider<"azure-openai-responses"> {
	return createProvider({
		id: "azure-openai-responses",
		name: "Azure OpenAI",
		auth: { apiKey: azureOpenAIAuth },
		models: Object.values(AZURE_OPENAI_RESPONSES_MODELS),
		api: azureOpenAIResponsesApi(),
	});
}
