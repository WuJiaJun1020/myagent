/**
 * RPC mode: Headless operation with JSON stdin/stdout protocol.
 *
 * Used for embedding the agent in other applications.
 * Receives commands as JSON on stdin, outputs events and responses as JSON on stdout.
 *
 * Protocol:
 * - Commands: JSON objects with `type` field, optional `id` for correlation
 * - Responses: JSON objects with `type: "response"`, `command`, `success`, and optional `data`/`error`
 * - Events: AgentSessionEvent objects streamed as they occur
 * - Extension UI: Extension UI requests are emitted, client responds with extension_ui_response
 */

import * as crypto from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AuthEvent, AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	WorkingIndicatorOptions,
} from "../../core/extensions/index.ts";
import { resolveModelScopeFromModels } from "../../core/model-resolver.ts";
import {
	flushRawStdout,
	takeOverStdout,
	waitForRawStdoutBackpressure,
	writeRawStdout,
} from "../../core/output-guard.ts";
import { DefaultPackageManager, type ResolvedResource } from "../../core/package-manager.ts";
import { SessionManager } from "../../core/session-manager.ts";
import type { PackageSource, Settings } from "../../core/settings-manager.ts";
import {
	getProjectTrustParentPath,
	hasTrustRequiringProjectResources,
	ProjectTrustStore,
} from "../../core/trust-manager.ts";
import { killTrackedDetachedChildren } from "../../utils/shell.ts";
import { type Theme, theme } from "../interactive/theme/theme.ts";
import { toJsonEvent } from "../json-event.ts";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.ts";
import type {
	RpcApprovalPolicy,
	RpcCommand,
	RpcExtensionUIClose,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcHostSettings,
	RpcHostSettingsState,
	RpcManagedResourceType,
	RpcPackageScope,
	RpcPackageState,
	RpcProjectTrustState,
	RpcProviderAuthEvent,
	RpcProviderAuthMethod,
	RpcProviderAuthRequest,
	RpcProviderAuthResponse,
	RpcProviderState,
	RpcResourceState,
	RpcResponse,
	RpcSessionMode,
	RpcSessionState,
	RpcSlashCommand,
} from "./rpc-types.ts";

// Re-export types for consumers
export type {
	RpcApprovalPolicy,
	RpcCommand,
	RpcExtensionUIClose,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcHostSettings,
	RpcHostSettingsState,
	RpcPackageState,
	RpcProjectTrustState,
	RpcProviderAuthEvent,
	RpcProviderAuthRequest,
	RpcProviderAuthResponse,
	RpcProviderState,
	RpcResourceState,
	RpcResponse,
	RpcSessionMode,
	RpcSessionState,
} from "./rpc-types.ts";

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const BUILTIN_TOOL_NAMES = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);
const MANAGED_RESOURCE_TYPES = ["extensions", "skills", "prompts", "themes"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) {
		throw new Error(`${field} must be an array of non-empty strings`);
	}
	return value.map((item) => item.trim());
}

function pickHostSettings(settings: Settings): RpcHostSettings {
	return {
		...(settings.defaultProvider ? { defaultProvider: settings.defaultProvider } : {}),
		...(settings.defaultModel ? { defaultModel: settings.defaultModel } : {}),
		...(settings.defaultThinkingLevel ? { defaultThinkingLevel: settings.defaultThinkingLevel } : {}),
		...(settings.modelThinkingLevels ? { modelThinkingLevels: { ...settings.modelThinkingLevels } } : {}),
		...(settings.enabledModels ? { enabledModels: [...settings.enabledModels] } : {}),
		...(settings.shellPath ? { shellPath: settings.shellPath } : {}),
		...(settings.defaultProjectTrust ? { defaultProjectTrust: settings.defaultProjectTrust } : {}),
		...(settings.compaction
			? {
					compaction: {
						...(settings.compaction.enabled === undefined ? {} : { enabled: settings.compaction.enabled }),
						...(settings.compaction.reserveTokens === undefined
							? {}
							: { reserveTokens: settings.compaction.reserveTokens }),
						...(settings.compaction.keepRecentTokens === undefined
							? {}
							: { keepRecentTokens: settings.compaction.keepRecentTokens }),
					},
				}
			: {}),
		...(settings.retry
			? {
					retry: {
						...(settings.retry.enabled === undefined ? {} : { enabled: settings.retry.enabled }),
						...(settings.retry.maxRetries === undefined ? {} : { maxRetries: settings.retry.maxRetries }),
					},
				}
			: {}),
		...(settings.defaultTools ? { defaultTools: [...settings.defaultTools] } : {}),
	};
}

/**
 * Run in RPC mode.
 * Listens for JSON commands on stdin, outputs events and responses on stdout.
 */
export async function runRpcMode(runtimeHost: AgentSessionRuntime): Promise<never> {
	takeOverStdout();
	let session = runtimeHost.session;
	let unsubscribe: (() => void) | undefined;
	let unsubscribeBackpressure: (() => void) | undefined;

	const output = (obj: RpcResponse | RpcExtensionUIRequest | object) => {
		writeRawStdout(serializeJsonLine(obj));
	};

	const success = <T extends RpcCommand["type"]>(
		id: string | undefined,
		command: T,
		data?: object | null,
	): RpcResponse => {
		if (data === undefined) {
			return { id, type: "response", command, success: true } as RpcResponse;
		}
		return { id, type: "response", command, success: true, data } as RpcResponse;
	};

	const error = (id: string | undefined, command: string, message: string): RpcResponse => {
		return { id, type: "response", command, success: false, error: message };
	};

	// Pending extension UI requests waiting for response
	const pendingExtensionRequests = new Map<
		string,
		{ resolve: (value: any) => void; reject: (error: Error) => void }
	>();
	const pendingProviderAuthRequests = new Map<
		string,
		{
			flowId: string;
			resolve: (value: string) => void;
			reject: (error: Error) => void;
			cleanup: () => void;
		}
	>();
	const providerLoginControllers = new Map<string, AbortController>();
	const sessionModeEntryType = "pi.rpc.session-mode";
	const approvalPolicyEntryType = "pi.rpc.approval-policy";
	let approvalPolicy: RpcApprovalPolicy = "auto";

	function getSettingsState(): RpcHostSettingsState {
		const manager = session.settingsManager;
		const compaction = manager.getCompactionSettings();
		const retry = manager.getRetrySettings();
		return {
			global: pickHostSettings(manager.getGlobalSettings()),
			project: pickHostSettings(manager.getProjectSettings()),
			effective: {
				...(manager.getDefaultProvider() ? { defaultProvider: manager.getDefaultProvider() } : {}),
				...(manager.getDefaultModel() ? { defaultModel: manager.getDefaultModel() } : {}),
				...(manager.getDefaultThinkingLevel() ? { defaultThinkingLevel: manager.getDefaultThinkingLevel() } : {}),
				modelThinkingLevels: manager.getAllModelThinkingLevels(),
				...(manager.getEnabledModels() ? { enabledModels: manager.getEnabledModels() } : {}),
				...(manager.getShellPath() ? { shellPath: manager.getShellPath() } : {}),
				defaultProjectTrust: manager.getDefaultProjectTrust(),
				compaction,
				retry: { enabled: retry.enabled, maxRetries: retry.maxRetries },
				...(manager.getDefaultTools() ? { defaultTools: manager.getDefaultTools() } : {}),
			},
			projectTrusted: manager.isProjectTrusted(),
		};
	}

	function getProjectTrustState(): RpcProjectTrustState {
		const cwd = runtimeHost.cwd;
		const store = new ProjectTrustStore(runtimeHost.services.agentDir);
		const entry = store.getEntry(cwd);
		return {
			cwd,
			requiresTrust: hasTrustRequiringProjectResources(cwd),
			effectiveTrusted: session.settingsManager.isProjectTrusted(),
			savedDecision: entry?.decision ?? null,
			...(entry ? { savedPath: entry.path } : {}),
			defaultPolicy: session.settingsManager.getDefaultProjectTrust(),
		};
	}

	function createPackageManager(): DefaultPackageManager {
		return new DefaultPackageManager({
			cwd: runtimeHost.cwd,
			agentDir: runtimeHost.services.agentDir,
			settingsManager: session.settingsManager,
		});
	}

	async function getPackageState(manager = createPackageManager()): Promise<RpcPackageState> {
		const resolved = await manager.resolve(async () => "skip");
		const resources = MANAGED_RESOURCE_TYPES.flatMap((resourceType) =>
			resolved[resourceType].map((resource) => ({
				type: resourceType,
				path: resource.path,
				enabled: resource.enabled,
				sourceInfo: {
					path: resource.path,
					source: resource.metadata.source,
					scope: resource.metadata.scope,
					origin: resource.metadata.origin,
					...(resource.metadata.baseDir ? { baseDir: resource.metadata.baseDir } : {}),
				},
			})),
		).sort((left, right) => left.type.localeCompare(right.type) || left.path.localeCompare(right.path));
		return {
			packages: manager.listConfiguredPackages().map((pkg) => ({
				...pkg,
				installed: pkg.installedPath !== undefined,
			})),
			resources,
			projectTrusted: session.settingsManager.isProjectTrusted(),
		};
	}

	function resourcePathMatches(left: string, right: string): boolean {
		const leftPath = resolve(left);
		const rightPath = resolve(right);
		return process.platform === "win32"
			? leftPath.toLocaleLowerCase() === rightPath.toLocaleLowerCase()
			: leftPath === rightPath;
	}

	function replaceResourcePattern(entries: string[], pattern: string, enabled: boolean): string[] {
		const updated = entries.filter((entry) => {
			const target =
				entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-") ? entry.slice(1) : entry;
			return target !== pattern;
		});
		updated.push(`${enabled ? "+" : "-"}${pattern}`);
		return updated;
	}

	function setScopedPackages(scope: RpcPackageScope, packages: PackageSource[]): void {
		if (scope === "project") session.settingsManager.setProjectPackages(packages);
		else session.settingsManager.setPackages(packages);
	}

	function setTopLevelResourcePaths(type: RpcManagedResourceType, scope: RpcPackageScope, paths: string[]): void {
		const manager = session.settingsManager;
		if (type === "extensions") {
			if (scope === "project") manager.setProjectExtensionPaths(paths);
			else manager.setExtensionPaths(paths);
		} else if (type === "skills") {
			if (scope === "project") manager.setProjectSkillPaths(paths);
			else manager.setSkillPaths(paths);
		} else if (type === "prompts") {
			if (scope === "project") manager.setProjectPromptTemplatePaths(paths);
			else manager.setPromptTemplatePaths(paths);
		} else if (scope === "project") manager.setProjectThemePaths(paths);
		else manager.setThemePaths(paths);
	}

	async function setManagedResourceEnabled(
		command: Extract<RpcCommand, { type: "set_resource_enabled" }>,
	): Promise<void> {
		if (!MANAGED_RESOURCE_TYPES.includes(command.resourceType)) throw new Error("Unsupported resource type");
		const manager = createPackageManager();
		const resolved = await manager.resolve(async () => "skip");
		const resource: ResolvedResource | undefined = resolved[command.resourceType].find(
			(candidate) =>
				resourcePathMatches(candidate.path, command.path) &&
				candidate.metadata.source === command.source &&
				candidate.metadata.scope === command.scope,
		);
		if (!resource) throw new Error(`Resource not found: ${command.path}`);

		const settings =
			command.scope === "project"
				? session.settingsManager.getProjectSettings()
				: session.settingsManager.getGlobalSettings();
		const baseDir = resource.metadata.baseDir ?? dirname(resource.path);
		const pattern = relative(baseDir, resource.path);
		if (resource.metadata.origin === "package") {
			const packages = [...(settings.packages ?? [])];
			const packageIndex = packages.findIndex(
				(entry) => (typeof entry === "string" ? entry : entry.source) === resource.metadata.source,
			);
			if (packageIndex < 0) throw new Error(`Package not found: ${resource.metadata.source}`);
			const current = packages[packageIndex];
			if (current === undefined) throw new Error(`Package not found: ${resource.metadata.source}`);
			const configured = typeof current === "string" ? { source: current } : { ...current };
			configured[command.resourceType] = replaceResourcePattern(
				configured[command.resourceType] ?? [],
				pattern,
				command.enabled,
			);
			packages[packageIndex] = configured;
			setScopedPackages(command.scope, packages);
			return;
		}

		const current = (settings[command.resourceType] ?? []) as string[];
		setTopLevelResourcePaths(
			command.resourceType,
			command.scope,
			replaceResourcePattern(current, pattern, command.enabled),
		);
	}

	async function updateHostSettings(value: unknown): Promise<RpcHostSettingsState> {
		if (!isRecord(value)) throw new Error("patch must be an object");
		const allowed = new Set([
			"defaultProvider",
			"defaultModel",
			"defaultThinkingLevel",
			"modelThinkingLevels",
			"enabledModels",
			"shellPath",
			"defaultProjectTrust",
			"compaction",
			"retry",
			"defaultTools",
		]);
		const unknown = Object.keys(value).filter((key) => !allowed.has(key));
		if (unknown.length > 0) throw new Error(`Unsupported settings: ${unknown.join(", ")}`);

		const manager = session.settingsManager;
		if (value.defaultProvider !== undefined || value.defaultModel !== undefined) {
			if (
				typeof value.defaultProvider !== "string" ||
				!value.defaultProvider.trim() ||
				typeof value.defaultModel !== "string" ||
				!value.defaultModel.trim()
			) {
				throw new Error("defaultProvider and defaultModel must be non-empty strings and updated together");
			}
			manager.setDefaultModelAndProvider(value.defaultProvider.trim(), value.defaultModel.trim());
		}
		if (value.defaultThinkingLevel !== undefined) {
			if (
				typeof value.defaultThinkingLevel !== "string" ||
				!THINKING_LEVELS.has(value.defaultThinkingLevel as ThinkingLevel)
			) {
				throw new Error("defaultThinkingLevel is invalid");
			}
			manager.setDefaultThinkingLevel(value.defaultThinkingLevel as ThinkingLevel);
		}
		if (value.modelThinkingLevels !== undefined) {
			if (!isRecord(value.modelThinkingLevels)) throw new Error("modelThinkingLevels must be an object");
			const next = new Map<string, ThinkingLevel>();
			for (const [key, level] of Object.entries(value.modelThinkingLevels)) {
				if (!key.includes("/") || typeof level !== "string" || !THINKING_LEVELS.has(level as ThinkingLevel)) {
					throw new Error(`Invalid model thinking level for ${key}`);
				}
				next.set(key, level as ThinkingLevel);
			}
			for (const key of Object.keys(manager.getGlobalSettings().modelThinkingLevels ?? {})) {
				if (next.has(key)) continue;
				const separator = key.indexOf("/");
				manager.removeModelThinkingLevel(key.slice(0, separator), key.slice(separator + 1));
			}
			for (const [key, level] of next) {
				const separator = key.indexOf("/");
				manager.setModelThinkingLevel(key.slice(0, separator), key.slice(separator + 1), level);
			}
		}
		if (value.enabledModels !== undefined) {
			const patterns = optionalStringArray(value.enabledModels, "enabledModels") ?? [];
			const { scopedModels, diagnostics } = resolveModelScopeFromModels(
				patterns,
				session.modelRuntime.getAvailableSnapshot(),
			);
			if (diagnostics.length > 0) throw new Error(diagnostics.map((item) => item.message).join("; "));
			manager.setEnabledModels(patterns);
			session.setScopedModels(scopedModels);
		}
		if (value.shellPath !== undefined) {
			if (typeof value.shellPath !== "string") throw new Error("shellPath must be a string");
			manager.setShellPath(value.shellPath.trim() || undefined);
		}
		if (value.defaultProjectTrust !== undefined) {
			if (!new Set(["ask", "always", "never"]).has(String(value.defaultProjectTrust))) {
				throw new Error("defaultProjectTrust must be ask, always, or never");
			}
			manager.setDefaultProjectTrust(value.defaultProjectTrust as "ask" | "always" | "never");
		}
		if (value.compaction !== undefined) {
			if (!isRecord(value.compaction)) throw new Error("compaction must be an object");
			if (value.compaction.enabled !== undefined) {
				if (typeof value.compaction.enabled !== "boolean") throw new Error("compaction.enabled must be a boolean");
				manager.setCompactionEnabled(value.compaction.enabled);
			}
			if (value.compaction.reserveTokens !== undefined || value.compaction.keepRecentTokens !== undefined) {
				const current = manager.getCompactionSettings();
				manager.setCompactionTokenSettings(
					value.compaction.reserveTokens === undefined
						? current.reserveTokens
						: Number(value.compaction.reserveTokens),
					value.compaction.keepRecentTokens === undefined
						? current.keepRecentTokens
						: Number(value.compaction.keepRecentTokens),
				);
			}
		}
		if (value.retry !== undefined) {
			if (!isRecord(value.retry)) throw new Error("retry must be an object");
			if (value.retry.enabled !== undefined) {
				if (typeof value.retry.enabled !== "boolean") throw new Error("retry.enabled must be a boolean");
				manager.setRetryEnabled(value.retry.enabled);
			}
			if (value.retry.maxRetries !== undefined) manager.setRetryMaxRetries(Number(value.retry.maxRetries));
		}
		if (value.defaultTools !== undefined) {
			const tools = optionalStringArray(value.defaultTools, "defaultTools") ?? [];
			const invalid = tools.filter((tool) => !BUILTIN_TOOL_NAMES.has(tool));
			if (invalid.length > 0) throw new Error(`Unknown built-in tools: ${invalid.join(", ")}`);
			manager.setDefaultTools([...new Set(tools)]);
		}
		await manager.flush();
		return getSettingsState();
	}

	type PersistedSessionMode = { mode: RpcSessionMode; workToolNames: string[] };

	function readPersistedSessionMode(): PersistedSessionMode | undefined {
		const entries = session.sessionManager.getEntries();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry.type !== "custom" || entry.customType !== sessionModeEntryType) continue;
			const data = entry.data;
			if (!data || typeof data !== "object" || Array.isArray(data)) continue;
			const mode = (data as { mode?: unknown }).mode;
			if (mode !== "work" && mode !== "chat") continue;
			const names = (data as { workToolNames?: unknown }).workToolNames;
			const workToolNames = Array.isArray(names)
				? names.filter((name): name is string => typeof name === "string")
				: [];
			return { mode, workToolNames };
		}
		return undefined;
	}

	function applyPersistedSessionMode(): void {
		const persisted = readPersistedSessionMode();
		if (persisted) session.setInteractionMode(persisted.mode, persisted.workToolNames);
	}

	function setSessionMode(mode: RpcSessionMode): void {
		const previous = readPersistedSessionMode();
		const activeToolNames = session.getActiveToolNames();
		const workToolNames =
			mode === "chat"
				? session.interactionMode === "work"
					? activeToolNames
					: (previous?.workToolNames ?? [])
				: previous?.workToolNames.length
					? previous.workToolNames
					: session.getAllTools().map((tool) => tool.name);
		session.setInteractionMode(mode, workToolNames);
		session.sessionManager.appendCustomEntry(sessionModeEntryType, { mode, workToolNames });
	}

	function readPersistedApprovalPolicy(): RpcApprovalPolicy {
		const entries = session.sessionManager.getEntries();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry.type !== "custom" || entry.customType !== approvalPolicyEntryType) continue;
			const data = entry.data;
			if (!data || typeof data !== "object" || Array.isArray(data)) continue;
			const policy = (data as { policy?: unknown }).policy;
			if (policy === "ask" || policy === "auto") return policy;
		}
		return "auto";
	}

	function formatToolApprovalMessage(toolName: string, input: Record<string, unknown>): string {
		let details: string;
		try {
			details = JSON.stringify(input, null, 2);
		} catch {
			details = String(input);
		}
		if (details.length > 4_000) details = `${details.slice(0, 4_000)}\n…`;
		return `Pi 请求调用工具：${toolName}\n\n${details}`;
	}

	function applyApprovalPolicy(policy: RpcApprovalPolicy): void {
		approvalPolicy = policy;
		session.setToolApprovalHandler(
			policy === "ask"
				? async (request, signal) => {
						const confirmed = await createDialogPromise(
							{ signal },
							false,
							{
								method: "confirm",
								title: "批准工具调用",
								message: formatToolApprovalMessage(request.toolName, request.input),
							},
							(response) =>
								"cancelled" in response && response.cancelled
									? false
									: "confirmed" in response && response.confirmed,
						);
						return confirmed
							? undefined
							: { block: true, reason: `用户未批准工具调用：${request.toolName}`, terminate: true };
					}
				: undefined,
		);
	}

	function setApprovalPolicy(policy: RpcApprovalPolicy): void {
		applyApprovalPolicy(policy);
		session.sessionManager.appendCustomEntry(approvalPolicyEntryType, { policy });
	}

	// Shutdown request flag
	let shutdownRequested = false;
	let shuttingDown = false;
	const signalCleanupHandlers: Array<() => void> = [];

	/** Helper for dialog methods with signal/timeout support */
	function createDialogPromise<T>(
		opts: ExtensionUIDialogOptions | undefined,
		defaultValue: T,
		request: Record<string, unknown>,
		parseResponse: (response: RpcExtensionUIResponse) => T,
	): Promise<T> {
		if (opts?.signal?.aborted) return Promise.resolve(defaultValue);

		const id = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			let timeoutId: ReturnType<typeof setTimeout> | undefined;

			const cleanup = () => {
				if (timeoutId) clearTimeout(timeoutId);
				opts?.signal?.removeEventListener("abort", onAbort);
				pendingExtensionRequests.delete(id);
			};

			const close = (reason: RpcExtensionUIClose["reason"]) => {
				cleanup();
				output({ type: "extension_ui_close", id, reason } satisfies RpcExtensionUIClose);
				resolve(defaultValue);
			};

			const onAbort = () => close("cancelled");
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			if (opts?.timeout) {
				timeoutId = setTimeout(() => close("timeout"), opts.timeout);
			}

			pendingExtensionRequests.set(id, {
				resolve: (response: RpcExtensionUIResponse) => {
					cleanup();
					resolve(parseResponse(response));
				},
				reject,
			});
			output({ type: "extension_ui_request", id, ...request } as RpcExtensionUIRequest);
		});
	}

	function providerState(): RpcProviderState {
		const availableCounts = new Map<string, number>();
		for (const model of session.modelRuntime.getAvailableSnapshot()) {
			availableCounts.set(model.provider, (availableCounts.get(model.provider) ?? 0) + 1);
		}
		const providers = session.modelRuntime
			.getProviders()
			.map((provider) => {
				const status = session.modelRuntime.getProviderAuthStatus(provider.id);
				const authMethods: RpcProviderAuthMethod[] = [];
				if (provider.auth.apiKey) {
					authMethods.push({
						type: "api_key" as const,
						name: provider.auth.apiKey.name,
						isSubscription: false,
						interactive: provider.auth.apiKey.login !== undefined,
					});
				}
				if (provider.auth.oauth) {
					authMethods.push({
						type: "oauth" as const,
						name: provider.auth.oauth.name,
						loginLabel: provider.auth.oauth.loginLabel,
						isSubscription: provider.auth.oauth.isSubscription === true,
						interactive: true,
					});
				}
				return {
					id: provider.id,
					name: provider.name,
					configured: status.configured,
					authType: status.configured
						? session.modelRuntime.isUsingOAuth(provider.id)
							? ("oauth" as const)
							: ("api_key" as const)
						: undefined,
					authSource: status.label ?? status.source,
					stored: status.source === "stored",
					modelCount: session.modelRuntime.getModels(provider.id).length,
					availableModelCount: availableCounts.get(provider.id) ?? 0,
					authMethods,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name));
		return { providers, error: session.modelRuntime.getError() };
	}

	function createProviderAuthPrompt(
		flowId: string,
		providerId: string,
		flowSignal: AbortSignal,
		prompt: AuthPrompt,
	): Promise<string> {
		const id = crypto.randomUUID();
		const signal = prompt.signal ? AbortSignal.any([flowSignal, prompt.signal]) : flowSignal;
		const rpcPrompt =
			prompt.type === "select"
				? {
						type: prompt.type,
						message: prompt.message,
						options: prompt.options.map((option) => ({ ...option })),
					}
				: {
						type: prompt.type,
						message: prompt.message,
						placeholder: prompt.placeholder,
					};

		return new Promise((resolve, reject) => {
			const cleanup = () => {
				signal.removeEventListener("abort", onAbort);
				pendingProviderAuthRequests.delete(id);
			};
			const onAbort = () => {
				cleanup();
				reject(new Error("Provider authentication cancelled"));
			};
			signal.addEventListener("abort", onAbort, { once: true });
			pendingProviderAuthRequests.set(id, { flowId, resolve, reject, cleanup });
			output({
				type: "provider_auth_request",
				flowId,
				id,
				providerId,
				prompt: rpcPrompt,
			} satisfies RpcProviderAuthRequest);
			if (signal.aborted) onAbort();
		});
	}

	function emitProviderAuthEvent(flowId: string, providerId: string, event: RpcProviderAuthEvent["event"]): void {
		output({ type: "provider_auth_event", flowId, providerId, event } satisfies RpcProviderAuthEvent);
	}

	function forwardProviderAuthEvent(flowId: string, providerId: string, event: AuthEvent): void {
		if (event.type === "info") {
			emitProviderAuthEvent(flowId, providerId, {
				type: "info",
				message: event.message,
				links: event.links?.map((link) => ({ ...link })),
			});
			return;
		}
		emitProviderAuthEvent(flowId, providerId, { ...event });
	}

	/**
	 * Create an extension UI context that uses the RPC protocol.
	 */
	const createExtensionUIContext = (): ExtensionUIContext => ({
		select: (title, options, opts) =>
			createDialogPromise(opts, undefined, { method: "select", title, options, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		confirm: (title, message, opts) =>
			createDialogPromise(opts, false, { method: "confirm", title, message, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? false : "confirmed" in r ? r.confirmed : false,
			),

		input: (title, placeholder, opts) =>
			createDialogPromise(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		notify(message: string, type?: "info" | "warning" | "error"): void {
			// Fire and forget - no response needed
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "notify",
				message,
				notifyType: type,
			} as RpcExtensionUIRequest);
		},

		onTerminalInput(): () => void {
			// Raw terminal input not supported in RPC mode
			return () => {};
		},

		setStatus(key: string, text: string | undefined): void {
			// Fire and forget - no response needed
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setStatus",
				statusKey: key,
				statusText: text,
			} as RpcExtensionUIRequest);
		},

		setWorkingMessage(_message?: string): void {
			// Working message not supported in RPC mode - requires TUI loader access
		},

		setWorkingVisible(_visible: boolean): void {
			// Working visibility not supported in RPC mode - requires TUI loader access
		},

		setWorkingIndicator(_options?: WorkingIndicatorOptions): void {
			// Working indicator customization not supported in RPC mode - requires TUI loader access
		},

		setHiddenThinkingLabel(_label?: string): void {
			// Hidden thinking label not supported in RPC mode - requires TUI message rendering access
		},

		setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void {
			// Only support string arrays in RPC mode - factory functions are ignored
			if (content === undefined || Array.isArray(content)) {
				output({
					type: "extension_ui_request",
					id: crypto.randomUUID(),
					method: "setWidget",
					widgetKey: key,
					widgetLines: content as string[] | undefined,
					widgetPlacement: options?.placement,
				} as RpcExtensionUIRequest);
			}
			// Component factories are not supported in RPC mode - would need TUI access
		},

		setFooter(_factory: unknown): void {
			// Custom footer not supported in RPC mode - requires TUI access
		},

		setHeader(_factory: unknown): void {
			// Custom header not supported in RPC mode - requires TUI access
		},

		setTitle(title: string): void {
			// Fire and forget - host can implement terminal title control
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setTitle",
				title,
			} as RpcExtensionUIRequest);
		},

		async custom() {
			// Custom UI not supported in RPC mode
			return undefined as never;
		},

		pasteToEditor(text: string): void {
			// Paste handling not supported in RPC mode - falls back to setEditorText
			this.setEditorText(text);
		},

		setEditorText(text: string): void {
			// Fire and forget - host can implement editor control
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "set_editor_text",
				text,
			} as RpcExtensionUIRequest);
		},

		getEditorText(): string {
			// Synchronous method can't wait for RPC response
			// Host should track editor state locally if needed
			return "";
		},

		async editor(title: string, prefill?: string): Promise<string | undefined> {
			const id = crypto.randomUUID();
			return new Promise((resolve, reject) => {
				pendingExtensionRequests.set(id, {
					resolve: (response: RpcExtensionUIResponse) => {
						if ("cancelled" in response && response.cancelled) {
							resolve(undefined);
						} else if ("value" in response) {
							resolve(response.value);
						} else {
							resolve(undefined);
						}
					},
					reject,
				});
				output({ type: "extension_ui_request", id, method: "editor", title, prefill } as RpcExtensionUIRequest);
			});
		},

		addAutocompleteProvider(): void {
			// Autocomplete provider composition is not supported in RPC mode
		},

		setEditorComponent(): void {
			// Custom editor components not supported in RPC mode
		},

		getEditorComponent() {
			// Custom editor components not supported in RPC mode
			return undefined;
		},

		get theme() {
			return theme;
		},

		getAllThemes() {
			return [];
		},

		getTheme(_name: string) {
			return undefined;
		},

		setTheme(_theme: string | Theme) {
			// Theme switching not supported in RPC mode
			return { success: false, error: "Theme switching not supported in RPC mode" };
		},

		getToolsExpanded() {
			// Tool expansion not supported in RPC mode - no TUI
			return false;
		},

		setToolsExpanded(_expanded: boolean) {
			// Tool expansion not supported in RPC mode - no TUI
		},
	});

	runtimeHost.setRebindSession(async () => {
		await rebindSession();
	});

	const rebindSession = async (): Promise<void> => {
		session = runtimeHost.session;
		await session.bindExtensions({
			uiContext: createExtensionUIContext(),
			mode: "rpc",
			commandContextActions: {
				waitForIdle: () => session.waitForIdle(),
				newSession: async (options) => runtimeHost.newSession(options),
				fork: async (entryId, forkOptions) => {
					const result = await runtimeHost.fork(entryId, forkOptions);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, options) => {
					const result = await session.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath, options) => {
					return runtimeHost.switchSession(sessionPath, options);
				},
				reload: async () => {
					await session.reload();
				},
			},
			shutdownHandler: () => {
				shutdownRequested = true;
			},
			onError: (err) => {
				output({ type: "extension_error", extensionPath: err.extensionPath, event: err.event, error: err.error });
			},
		});
		applyPersistedSessionMode();
		applyApprovalPolicy(readPersistedApprovalPolicy());

		unsubscribe?.();
		unsubscribeBackpressure?.();
		unsubscribe = session.subscribe((event) => {
			output(toJsonEvent(event));
			if (event.type === "agent_settled") {
				void checkShutdownRequested();
			}
		});
		unsubscribeBackpressure = session.agent.subscribe(async () => {
			await waitForRawStdoutBackpressure();
		});
	};

	const registerSignalHandlers = (): void => {
		const signals: NodeJS.Signals[] = ["SIGTERM"];
		if (process.platform !== "win32") {
			signals.push("SIGHUP");
		}

		for (const signal of signals) {
			const handler = () => {
				killTrackedDetachedChildren();
				void shutdown(signal === "SIGHUP" ? 129 : 143, signal);
			};
			process.on(signal, handler);
			signalCleanupHandlers.push(() => process.off(signal, handler));
		}
	};

	await rebindSession();
	registerSignalHandlers();

	// Handle a single command
	const handleCommand = async (command: RpcCommand): Promise<RpcResponse | undefined> => {
		const id = command.id;

		switch (command.type) {
			// =================================================================
			// Prompting
			// =================================================================

			case "prompt": {
				// Start prompt handling immediately, but emit the authoritative response only after
				// prompt preflight succeeds. Queued and immediately handled prompts also count as success.
				let preflightSucceeded = false;
				void session
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
						preflightResult: (didSucceed) => {
							if (didSucceed) {
								preflightSucceeded = true;
								output(success(id, "prompt"));
							}
						},
					})
					.catch((e) => {
						if (!preflightSucceeded) {
							output(error(id, "prompt", e.message));
						}
					});
				return undefined;
			}

			case "steer": {
				await session.steer(command.message, command.images, { source: "rpc" });
				return success(id, "steer");
			}

			case "follow_up": {
				await session.followUp(command.message, command.images, { source: "rpc" });
				return success(id, "follow_up");
			}

			case "abort": {
				await session.abort();
				return success(id, "abort");
			}

			case "clear_queue": {
				return success(id, "clear_queue", session.clearQueue());
			}

			case "update_queue_item": {
				const source = command.source === "follow_up" ? "followUp" : command.source;
				const action = command.action === "follow_up" ? "followUp" : command.action;
				return success(id, "update_queue_item", session.updateQueueItem(source, command.index, action));
			}

			case "new_session": {
				if (
					command.sessionDir !== undefined &&
					(typeof command.sessionDir !== "string" ||
						!command.sessionDir.trim() ||
						command.sessionDir.includes("\0"))
				) {
					return error(id, "new_session", "sessionDir must be a non-empty path");
				}
				const options =
					command.parentSession || command.sessionDir
						? {
								...(command.parentSession ? { parentSession: command.parentSession } : {}),
								...(command.sessionDir ? { sessionDir: command.sessionDir } : {}),
							}
						: undefined;
				const result = await runtimeHost.newSession(options);
				return success(id, "new_session", result);
			}

			// =================================================================
			// State
			// =================================================================

			case "get_state": {
				const state: RpcSessionState = {
					model: session.model,
					thinkingLevel: session.thinkingLevel,
					isStreaming: session.isStreaming,
					isCompacting: session.isCompacting,
					steeringMode: session.steeringMode,
					followUpMode: session.followUpMode,
					sessionFile: session.sessionFile,
					sessionId: session.sessionId,
					sessionName: session.sessionName,
					sessionMode: session.interactionMode,
					approvalPolicy,
					contextUsage: session.getContextUsage(),
					autoCompactionEnabled: session.autoCompactionEnabled,
					autoRetryEnabled: session.autoRetryEnabled,
					isRetrying: session.isRetrying,
					messageCount: session.messages.length,
					pendingMessageCount: session.pendingMessageCount,
				};
				return success(id, "get_state", state);
			}

			case "get_settings": {
				return success(id, "get_settings", getSettingsState());
			}

			case "update_settings": {
				return success(id, "update_settings", await updateHostSettings(command.patch));
			}

			case "get_project_trust": {
				return success(id, "get_project_trust", getProjectTrustState());
			}

			case "set_project_trust": {
				if (session.isStreaming || session.isCompacting) {
					return error(
						id,
						"set_project_trust",
						"Wait for the current task or compaction to finish before changing project trust",
					);
				}
				if (command.decision !== true && command.decision !== false && command.decision !== null) {
					return error(id, "set_project_trust", "decision must be true, false, or null");
				}
				if (command.target !== undefined && command.target !== "current" && command.target !== "parent") {
					return error(id, "set_project_trust", "target must be current or parent");
				}
				const cwd = runtimeHost.cwd;
				const store = new ProjectTrustStore(runtimeHost.services.agentDir);
				if (command.target === "parent") {
					const parent = getProjectTrustParentPath(cwd);
					if (!parent) return error(id, "set_project_trust", "Current directory has no parent");
					store.setMany([
						{ path: parent, decision: command.decision },
						{ path: cwd, decision: null },
					]);
				} else {
					store.set(cwd, command.decision);
				}
				const saved = store.get(cwd);
				const defaultPolicy = session.settingsManager.getDefaultProjectTrust();
				const effectiveTrusted = !hasTrustRequiringProjectResources(cwd)
					? true
					: (saved ?? defaultPolicy === "always");
				session.settingsManager.setProjectTrusted(effectiveTrusted);
				await session.reload();
				return success(id, "set_project_trust", getProjectTrustState());
			}

			case "reload_resources": {
				if (session.isStreaming || session.isCompacting) {
					return error(
						id,
						"reload_resources",
						"Wait for the current task or compaction to finish before reloading",
					);
				}
				await session.reload();
				return success(id, "reload_resources");
			}

			case "get_package_state": {
				return success(id, "get_package_state", await getPackageState());
			}

			case "install_package": {
				if (session.isStreaming || session.isCompacting) {
					return error(
						id,
						"install_package",
						"Wait for the current task or compaction to finish before installing",
					);
				}
				const source = command.source.trim();
				if (!source || source.length > 2_048 || source.includes("\0")) {
					return error(id, "install_package", "Package source must be a valid non-empty string");
				}
				if (command.scope !== "user" && command.scope !== "project") {
					return error(id, "install_package", "Package scope must be user or project");
				}
				const manager = createPackageManager();
				await manager.installAndPersist(source, { local: command.scope === "project" });
				await session.reload();
				return success(id, "install_package", await getPackageState(manager));
			}

			case "remove_package": {
				if (session.isStreaming || session.isCompacting) {
					return error(id, "remove_package", "Wait for the current task or compaction to finish before removing");
				}
				const manager = createPackageManager();
				await manager.removeAndPersist(command.source, { local: command.scope === "project" });
				await session.reload();
				return success(id, "remove_package", await getPackageState(manager));
			}

			case "update_package": {
				if (session.isStreaming || session.isCompacting) {
					return error(id, "update_package", "Wait for the current task or compaction to finish before updating");
				}
				const manager = createPackageManager();
				await manager.update(command.source, { local: command.scope === "project" });
				await session.reload();
				return success(id, "update_package", await getPackageState(manager));
			}

			case "set_resource_enabled": {
				if (session.isStreaming || session.isCompacting) {
					return error(
						id,
						"set_resource_enabled",
						"Wait for the current task or compaction to finish before changing resources",
					);
				}
				await setManagedResourceEnabled(command);
				await session.reload();
				return success(id, "set_resource_enabled", await getPackageState());
			}

			// =================================================================
			// Model
			// =================================================================

			case "set_model": {
				const models = session.modelRuntime.getAvailableSnapshot();
				const model = models.find((m) => m.provider === command.provider && m.id === command.modelId);
				if (!model) {
					return error(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				await session.setModel(model);
				return success(id, "set_model", model);
			}

			case "cycle_model": {
				const result = await session.cycleModel();
				if (!result) {
					return success(id, "cycle_model", null);
				}
				return success(id, "cycle_model", result);
			}

			case "get_available_models": {
				const models = session.modelRuntime.getAvailableSnapshot();
				return success(id, "get_available_models", { models });
			}

			case "get_providers": {
				return success(id, "get_providers", providerState());
			}

			case "login_provider": {
				if (session.isStreaming)
					return error(id, "login_provider", "Cannot configure a provider while the agent is running");
				const flowId = id ?? crypto.randomUUID();
				if (providerLoginControllers.has(flowId)) {
					return error(id, "login_provider", `Provider login flow already exists: ${flowId}`);
				}
				const provider = session.modelRuntime.getProvider(command.providerId);
				if (!provider) return error(id, "login_provider", `Provider not found: ${command.providerId}`);
				const controller = new AbortController();
				providerLoginControllers.set(flowId, controller);
				emitProviderAuthEvent(flowId, command.providerId, { type: "started", authType: command.authType });
				const interaction: AuthInteraction = {
					signal: controller.signal,
					prompt: (prompt) => createProviderAuthPrompt(flowId, command.providerId, controller.signal, prompt),
					notify: (event) => forwardProviderAuthEvent(flowId, command.providerId, event),
				};
				try {
					await session.modelRuntime.login(command.providerId, command.authType, interaction);
					emitProviderAuthEvent(flowId, command.providerId, {
						type: "progress",
						message: "Refreshing provider model catalog…",
					});
					const refreshController = new AbortController();
					const refreshTimeout = setTimeout(() => refreshController.abort(), 15_000);
					try {
						const result = await session.modelRuntime.refresh({
							providers: [command.providerId],
							signal: refreshController.signal,
						});
						const refreshError = result.errors.get(command.providerId);
						if (result.aborted || refreshError) {
							emitProviderAuthEvent(flowId, command.providerId, {
								type: "info",
								message:
									refreshError?.message ?? "Model catalog refresh timed out; cached models remain available.",
							});
						}
					} finally {
						clearTimeout(refreshTimeout);
					}
					emitProviderAuthEvent(flowId, command.providerId, { type: "completed" });
					return success(id, "login_provider", providerState());
				} catch (loginError: unknown) {
					const message = loginError instanceof Error ? loginError.message : String(loginError);
					emitProviderAuthEvent(flowId, command.providerId, { type: "failed", message });
					throw loginError;
				} finally {
					providerLoginControllers.delete(flowId);
					for (const request of pendingProviderAuthRequests.values()) {
						if (request.flowId === flowId) request.cleanup();
					}
				}
			}

			case "logout_provider": {
				if (session.isStreaming)
					return error(id, "logout_provider", "Cannot remove provider auth while the agent is running");
				if (!session.modelRuntime.getProvider(command.providerId)) {
					return error(id, "logout_provider", `Provider not found: ${command.providerId}`);
				}
				await session.modelRuntime.logout(command.providerId);
				return success(id, "logout_provider", providerState());
			}

			case "cancel_provider_login": {
				providerLoginControllers.get(command.flowId)?.abort();
				return success(id, "cancel_provider_login");
			}

			// =================================================================
			// Thinking
			// =================================================================

			case "set_thinking_level": {
				session.setThinkingLevel(command.level);
				return success(id, "set_thinking_level");
			}

			case "cycle_thinking_level": {
				const level = session.cycleThinkingLevel();
				if (!level) {
					return success(id, "cycle_thinking_level", null);
				}
				return success(id, "cycle_thinking_level", { level });
			}

			case "get_available_thinking_levels": {
				const levels = session.getAvailableThinkingLevels();
				return success(id, "get_available_thinking_levels", { levels });
			}

			// =================================================================
			// Queue Modes
			// =================================================================

			case "set_steering_mode": {
				session.setSteeringMode(command.mode);
				return success(id, "set_steering_mode");
			}

			case "set_follow_up_mode": {
				session.setFollowUpMode(command.mode);
				return success(id, "set_follow_up_mode");
			}

			// =================================================================
			// Compaction
			// =================================================================

			case "compact": {
				const result = await session.compact(command.customInstructions);
				return success(id, "compact", result);
			}

			case "set_auto_compaction": {
				session.setAutoCompactionEnabled(command.enabled);
				return success(id, "set_auto_compaction");
			}

			// =================================================================
			// Retry
			// =================================================================

			case "set_auto_retry": {
				session.setAutoRetryEnabled(command.enabled);
				return success(id, "set_auto_retry");
			}

			case "abort_retry": {
				session.abortRetry();
				return success(id, "abort_retry");
			}

			// =================================================================
			// Bash
			// =================================================================

			case "bash": {
				const eventResult = await session.extensionRunner.emitUserBash({
					type: "user_bash",
					command: command.command,
					excludeFromContext: command.excludeFromContext ?? false,
					cwd: session.sessionManager.getCwd(),
				});

				if (eventResult?.result) {
					session.recordBashResult(command.command, eventResult.result, {
						excludeFromContext: command.excludeFromContext,
					});
					return success(id, "bash", eventResult.result);
				}

				const result = await session.executeBash(command.command, undefined, {
					excludeFromContext: command.excludeFromContext,
					id,
					operations: eventResult?.operations,
				});
				return success(id, "bash", result);
			}

			case "abort_bash": {
				session.abortBash();
				return success(id, "abort_bash");
			}

			// =================================================================
			// Session
			// =================================================================

			case "get_session_stats": {
				const stats = session.getSessionStats();
				return success(id, "get_session_stats", stats);
			}

			case "export_html": {
				const path = await session.exportToHtml(command.outputPath);
				return success(id, "export_html", { path });
			}

			case "export_jsonl": {
				const path = session.exportToJsonl(command.outputPath);
				return success(id, "export_jsonl", { path });
			}

			case "import_session": {
				if (
					typeof command.inputPath !== "string" ||
					!command.inputPath.trim() ||
					command.inputPath.includes("\0")
				) {
					return error(id, "import_session", "inputPath must be a non-empty path");
				}
				if (
					command.cwdOverride !== undefined &&
					(typeof command.cwdOverride !== "string" ||
						!command.cwdOverride.trim() ||
						command.cwdOverride.includes("\0"))
				) {
					return error(id, "import_session", "cwdOverride must be a non-empty path");
				}
				const result = await runtimeHost.importFromJsonl(command.inputPath, command.cwdOverride);
				return success(id, "import_session", result);
			}

			case "switch_session": {
				if (
					command.cwdOverride !== undefined &&
					(typeof command.cwdOverride !== "string" ||
						!command.cwdOverride.trim() ||
						command.cwdOverride.includes("\0"))
				) {
					return error(id, "switch_session", "cwdOverride must be a non-empty path");
				}
				const result = await runtimeHost.switchSession(
					command.sessionPath,
					command.cwdOverride === undefined ? undefined : { cwdOverride: command.cwdOverride },
				);
				return success(id, "switch_session", result);
			}

			case "fork": {
				const result = await runtimeHost.fork(command.entryId);
				return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "clone": {
				const leafId = session.sessionManager.getLeafId();
				if (!leafId) {
					return error(id, "clone", "Cannot clone session: no current entry selected");
				}
				const result = await runtimeHost.fork(leafId, { position: "at" });
				return success(id, "clone", { cancelled: result.cancelled });
			}

			case "get_fork_messages": {
				const messages = session.getUserMessagesForForking();
				return success(id, "get_fork_messages", { messages });
			}

			case "get_entries": {
				const sessionManager = session.sessionManager;
				let entries = sessionManager.getEntries();
				if (command.since !== undefined) {
					const sinceIndex = entries.findIndex((e) => e.id === command.since);
					if (sinceIndex === -1) {
						return error(id, "get_entries", `Entry not found: ${command.since}`);
					}
					entries = entries.slice(sinceIndex + 1);
				}
				return success(id, "get_entries", { entries, leafId: sessionManager.getLeafId() });
			}

			case "get_tree": {
				const sessionManager = session.sessionManager;
				return success(id, "get_tree", { tree: sessionManager.getTree(), leafId: sessionManager.getLeafId() });
			}

			case "navigate_tree": {
				if (typeof command.targetId !== "string" || !command.targetId.trim()) {
					return error(id, "navigate_tree", "targetId must be a non-empty entry ID");
				}
				const result = await session.navigateTree(command.targetId, {
					summarize: command.summarize,
					customInstructions: command.customInstructions,
					replaceInstructions: command.replaceInstructions,
					label: command.label,
				});
				return success(id, "navigate_tree", {
					...(result.editorText === undefined ? {} : { editorText: result.editorText }),
					cancelled: result.cancelled,
					...(result.aborted === undefined ? {} : { aborted: result.aborted }),
				});
			}

			case "get_last_assistant_text": {
				const text = session.getLastAssistantText();
				return success(id, "get_last_assistant_text", { text });
			}

			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return error(id, "set_session_name", "Session name cannot be empty");
				}
				session.setSessionName(name);
				return success(id, "set_session_name");
			}

			case "rename_session": {
				if (session.isStreaming)
					return error(id, "rename_session", "Cannot rename a session while the agent is running");
				const name = command.name.replace(/[\r\n]+/g, " ").trim();
				if (!name || name.length > 120) return error(id, "rename_session", "Session name must be 1-120 characters");
				if (command.sessionId === session.sessionId) {
					session.setSessionName(name);
					return success(id, "rename_session");
				}
				if (command.sessionPath) {
					const target = SessionManager.open(command.sessionPath);
					if (target.getSessionId() !== command.sessionId) {
						return error(id, "rename_session", `Session path does not match: ${command.sessionId}`);
					}
					target.appendSessionInfo(name);
					return success(id, "rename_session");
				}
				const sessions = await SessionManager.list(
					session.sessionManager.getCwd(),
					session.sessionManager.getSessionDir(),
				);
				const target = sessions.find((candidate) => candidate.id === command.sessionId);
				if (!target) return error(id, "rename_session", `Session not found: ${command.sessionId}`);
				SessionManager.open(target.path, session.sessionManager.getSessionDir()).appendSessionInfo(name);
				return success(id, "rename_session");
			}

			case "set_session_mode": {
				if (session.isStreaming)
					return error(id, "set_session_mode", "Cannot change mode while the agent is running");
				if (command.mode !== "work" && command.mode !== "chat") {
					return error(id, "set_session_mode", "Session mode must be work or chat");
				}
				setSessionMode(command.mode);
				return success(id, "set_session_mode", { mode: command.mode });
			}

			case "set_approval_policy": {
				if (session.isStreaming)
					return error(id, "set_approval_policy", "Cannot change approval policy while the agent is running");
				if (command.policy !== "ask" && command.policy !== "auto") {
					return error(id, "set_approval_policy", "Approval policy must be ask or auto");
				}
				setApprovalPolicy(command.policy);
				return success(id, "set_approval_policy", { policy: command.policy });
			}

			// =================================================================
			// Messages
			// =================================================================

			case "get_messages": {
				return success(id, "get_messages", { messages: session.messages });
			}

			// =================================================================
			// Runtime resources (read-only observability for embedded clients)
			// =================================================================

			case "get_resources": {
				const maxTools = 500;
				const maxExtensions = 200;
				const maxContextResourceLength = 100_000;
				let remainingContextLength = 400_000;
				const resourceLoader = session.resourceLoader;
				const activeToolNames = new Set(session.getActiveToolNames());
				const extensionsResult = resourceLoader.getExtensions();
				const skillsResult = resourceLoader.getSkills();
				const promptsResult = resourceLoader.getPrompts();
				const themesResult = resourceLoader.getThemes();
				const contextResources: RpcResourceState["contextResources"] = [];
				const appendContextResource = (
					kind: RpcResourceState["contextResources"][number]["kind"],
					path: string,
					content: string,
				) => {
					const allowed = Math.max(0, Math.min(maxContextResourceLength, remainingContextLength));
					const boundedContent = content.slice(0, allowed);
					remainingContextLength -= boundedContent.length;
					contextResources.push({
						kind,
						path,
						content: boundedContent,
						truncated: boundedContent.length < content.length,
					});
				};
				for (const resource of resourceLoader.getAgentsFiles().agentsFiles) {
					appendContextResource("instructions", resource.path, resource.content);
				}

				const systemPromptSource = resourceLoader.getSystemPromptSource();
				const systemPrompt = resourceLoader.getSystemPrompt();
				if (systemPromptSource && systemPrompt !== undefined) {
					appendContextResource("system", systemPromptSource.path, systemPrompt);
				}

				const appendSources = resourceLoader.getAppendSystemPromptSources();
				const appendPrompts = resourceLoader.getAppendSystemPrompt();
				appendSources.forEach((source, index) => {
					appendContextResource("append-system", source.path, appendPrompts[index] ?? "");
				});

				const resources: RpcResourceState = {
					tools: session
						.getAllTools()
						.slice(0, maxTools)
						.map((tool) => ({
							name: tool.name,
							description: tool.description?.slice(0, 4_000),
							active: activeToolNames.has(tool.name),
							sourceInfo: tool.sourceInfo,
						})),
					extensions: extensionsResult.extensions.slice(0, maxExtensions).map((extension) => ({
						path: extension.path,
						sourceInfo: extension.sourceInfo,
						toolNames: [...extension.tools.keys()].slice(0, maxTools),
						commandNames: [...extension.commands.keys()].slice(0, 500),
						shortcuts: [...extension.shortcuts.values()].slice(0, 500).map((shortcut) => ({
							shortcut: shortcut.shortcut,
							...(shortcut.description ? { description: shortcut.description } : {}),
						})),
					})),
					extensionErrors: extensionsResult.errors.slice(0, 100).map((item) => ({
						path: item.path,
						error: item.error.slice(0, 4_000),
					})),
					skills: skillsResult.skills.slice(0, 1_000).map((skill) => ({
						name: skill.name,
						description: skill.description?.slice(0, 4_000),
						path: skill.filePath,
						sourceInfo: skill.sourceInfo,
					})),
					prompts: promptsResult.prompts.slice(0, 1_000).map((prompt) => ({
						name: prompt.name,
						description: prompt.description?.slice(0, 4_000),
						...(prompt.argumentHint ? { argumentHint: prompt.argumentHint } : {}),
						path: prompt.filePath,
						sourceInfo: prompt.sourceInfo,
					})),
					diagnostics: [...skillsResult.diagnostics, ...promptsResult.diagnostics, ...themesResult.diagnostics]
						.slice(0, 300)
						.map((item) => ({
							type: item.type,
							message: item.message.slice(0, 4_000),
							...(item.path ? { path: item.path } : {}),
						})),
					contextResources,
					capabilities: { nativeMcp: false, semanticMemory: false },
				};
				return success(id, "get_resources", resources);
			}

			case "invoke_extension_shortcut": {
				if (typeof command.shortcut !== "string" || !command.shortcut.trim() || command.shortcut.length > 200) {
					return error(id, "invoke_extension_shortcut", "shortcut must be a valid non-empty string");
				}
				await session.extensionRunner.invokeShortcut(command.shortcut.trim());
				return success(id, "invoke_extension_shortcut");
			}

			// =================================================================
			// Commands (available for invocation via prompt)
			// =================================================================

			case "get_commands": {
				const commands: RpcSlashCommand[] = [];

				for (const command of session.extensionRunner.getRegisteredCommands()) {
					commands.push({
						name: command.invocationName,
						description: command.description,
						source: "extension",
						sourceInfo: command.sourceInfo,
					});
				}

				for (const template of session.promptTemplates) {
					commands.push({
						name: template.name,
						description: template.description,
						...(template.argumentHint ? { argumentHint: template.argumentHint } : {}),
						source: "prompt",
						sourceInfo: template.sourceInfo,
					});
				}

				for (const skill of session.resourceLoader.getSkills().skills) {
					commands.push({
						name: `skill:${skill.name}`,
						description: skill.description,
						source: "skill",
						sourceInfo: skill.sourceInfo,
					});
				}

				return success(id, "get_commands", { commands });
			}

			default: {
				const unknownCommand = command as { type: string };
				return error(id, unknownCommand.type, `Unknown command: ${unknownCommand.type}`);
			}
		}
	};

	/**
	 * Check if shutdown was requested and perform shutdown if so.
	 * Called after handling each command when waiting for the next command.
	 */
	let detachInput = () => {};

	async function shutdown(exitCode = 0, signal?: NodeJS.Signals): Promise<never> {
		if (shuttingDown) {
			process.exit(exitCode);
		}
		shuttingDown = true;
		for (const controller of providerLoginControllers.values()) controller.abort();
		providerLoginControllers.clear();
		for (const cleanup of signalCleanupHandlers) {
			cleanup();
		}
		unsubscribe?.();
		unsubscribeBackpressure?.();
		await runtimeHost.dispose();
		detachInput();
		process.stdin.pause();
		if (signal !== "SIGTERM") {
			await flushRawStdout();
		}
		process.exit(exitCode);
	}

	async function checkShutdownRequested(): Promise<void> {
		if (!shutdownRequested) return;
		await shutdown();
	}

	const handleInputLine = async (line: string) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (parseError: unknown) {
			output(
				error(
					undefined,
					"parse",
					`Failed to parse command: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
				),
			);
			await waitForRawStdoutBackpressure();
			return;
		}

		// Handle provider authentication responses
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"type" in parsed &&
			parsed.type === "provider_auth_response"
		) {
			const response = parsed as RpcProviderAuthResponse;
			const pending = pendingProviderAuthRequests.get(response.id);
			if (pending && pending.flowId === response.flowId) {
				pending.cleanup();
				if (response.cancelled || response.value === undefined) {
					pending.reject(new Error("Provider authentication cancelled"));
				} else {
					pending.resolve(response.value);
				}
			}
			return;
		}

		// Handle extension UI responses
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"type" in parsed &&
			parsed.type === "extension_ui_response"
		) {
			const response = parsed as RpcExtensionUIResponse;
			const pending = pendingExtensionRequests.get(response.id);
			if (pending) {
				pendingExtensionRequests.delete(response.id);
				pending.resolve(response);
			}
			return;
		}

		const command = parsed as RpcCommand;
		try {
			const response = await handleCommand(command);
			if (response) {
				output(response);
				await waitForRawStdoutBackpressure();
			}
			await checkShutdownRequested();
		} catch (commandError: unknown) {
			output(
				error(
					command.id,
					command.type,
					commandError instanceof Error ? commandError.message : String(commandError),
				),
			);
			await waitForRawStdoutBackpressure();
		}
	};

	const onInputEnd = () => {
		void shutdown();
	};
	process.stdin.on("end", onInputEnd);

	detachInput = (() => {
		const detachJsonl = attachJsonlLineReader(process.stdin, (line) => {
			void handleInputLine(line);
		});
		return () => {
			detachJsonl();
			process.stdin.off("end", onInputEnd);
		};
	})();

	// Keep process alive forever
	return new Promise(() => {});
}
