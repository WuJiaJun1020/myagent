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
import type { AuthEvent, AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	WorkingIndicatorOptions,
} from "../../core/extensions/index.ts";
import {
	flushRawStdout,
	takeOverStdout,
	waitForRawStdoutBackpressure,
	writeRawStdout,
} from "../../core/output-guard.ts";
import { SessionManager } from "../../core/session-manager.ts";
import { killTrackedDetachedChildren } from "../../utils/shell.ts";
import { type Theme, theme } from "../interactive/theme/theme.ts";
import { toJsonEvent } from "../json-event.ts";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.ts";
import type {
	RpcApprovalPolicy,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
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
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcProviderAuthEvent,
	RpcProviderAuthRequest,
	RpcProviderAuthResponse,
	RpcProviderState,
	RpcResourceState,
	RpcResponse,
	RpcSessionMode,
	RpcSessionState,
} from "./rpc-types.ts";

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

			const onAbort = () => {
				cleanup();
				resolve(defaultValue);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			if (opts?.timeout) {
				timeoutId = setTimeout(() => {
					cleanup();
					resolve(defaultValue);
				}, opts.timeout);
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
				if (!result.cancelled) {
					await rebindSession();
				}
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
					messageCount: session.messages.length,
					pendingMessageCount: session.pendingMessageCount,
				};
				return success(id, "get_state", state);
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
				if (!result.cancelled) {
					await rebindSession();
				}
				return success(id, "switch_session", result);
			}

			case "fork": {
				const result = await runtimeHost.fork(command.entryId);
				if (!result.cancelled) {
					await rebindSession();
				}
				return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "clone": {
				const leafId = session.sessionManager.getLeafId();
				if (!leafId) {
					return error(id, "clone", "Cannot clone session: no current entry selected");
				}
				const result = await runtimeHost.fork(leafId, { position: "at" });
				if (!result.cancelled) {
					await rebindSession();
				}
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
					})),
					extensionErrors: extensionsResult.errors.slice(0, 100).map((item) => ({
						path: item.path,
						error: item.error.slice(0, 4_000),
					})),
					contextResources,
					capabilities: { nativeMcp: false, semanticMemory: false },
				};
				return success(id, "get_resources", resources);
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
