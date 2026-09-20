/**
 * RPC protocol types for headless operation.
 *
 * Commands are sent as JSON lines on stdin.
 * Responses and events are emitted as JSON lines on stdout.
 */

import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type { SessionStats } from "../../core/agent-session.ts";
import type { BashResult } from "../../core/bash-executor.ts";
import type { CompactionResult } from "../../core/compaction/index.ts";
import type { SessionEntry, SessionTreeNode } from "../../core/session-manager.ts";
import type { SourceInfo } from "../../core/source-info.ts";

export interface RpcHostSettings {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: ThinkingLevel;
	modelThinkingLevels?: Record<string, ThinkingLevel>;
	enabledModels?: string[];
	shellPath?: string;
	defaultProjectTrust?: "ask" | "always" | "never";
	compaction?: {
		enabled?: boolean;
		reserveTokens?: number;
		keepRecentTokens?: number;
	};
	retry?: {
		enabled?: boolean;
		maxRetries?: number;
	};
	defaultTools?: string[];
}

export interface RpcHostSettingsState {
	global: RpcHostSettings;
	project: RpcHostSettings;
	effective: RpcHostSettings;
	projectTrusted: boolean;
}

export interface RpcProjectTrustState {
	cwd: string;
	requiresTrust: boolean;
	effectiveTrusted: boolean;
	savedDecision: boolean | null;
	savedPath?: string;
	defaultPolicy: "ask" | "always" | "never";
}

export type RpcPackageScope = "user" | "project";
export type RpcManagedResourceType = "extensions" | "skills" | "prompts" | "themes";

export interface RpcPackageSummary {
	source: string;
	scope: RpcPackageScope;
	filtered: boolean;
	installed: boolean;
	installedPath?: string;
}

export interface RpcManagedResource {
	type: RpcManagedResourceType;
	path: string;
	enabled: boolean;
	sourceInfo: SourceInfo;
}

export interface RpcPackageState {
	packages: RpcPackageSummary[];
	resources: RpcManagedResource[];
	projectTrusted: boolean;
}

// ============================================================================
// RPC Commands (stdin)
// ============================================================================

export type RpcCommand =
	// Prompting
	| { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
	| { id?: string; type: "steer"; message: string; images?: ImageContent[] }
	| { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
	| { id?: string; type: "abort" }
	| { id?: string; type: "clear_queue" }
	| {
			id?: string;
			type: "update_queue_item";
			source: "steer" | "follow_up";
			index: number;
			action: "steer" | "follow_up" | "delete";
	  }
	| { id?: string; type: "new_session"; parentSession?: string; sessionDir?: string }

	// State
	| { id?: string; type: "get_state" }
	| { id?: string; type: "get_settings" }
	| { id?: string; type: "update_settings"; patch: RpcHostSettings }
	| { id?: string; type: "get_project_trust" }
	| {
			id?: string;
			type: "set_project_trust";
			decision: boolean | null;
			target?: "current" | "parent";
	  }
	| { id?: string; type: "reload_resources" }
	| { id?: string; type: "get_package_state" }
	| { id?: string; type: "install_package"; source: string; scope: RpcPackageScope }
	| { id?: string; type: "remove_package"; source: string; scope: RpcPackageScope }
	| { id?: string; type: "update_package"; source: string; scope: RpcPackageScope }
	| {
			id?: string;
			type: "set_resource_enabled";
			resourceType: RpcManagedResourceType;
			path: string;
			source: string;
			scope: RpcPackageScope;
			enabled: boolean;
	  }

	// Model
	| { id?: string; type: "set_model"; provider: string; modelId: string }
	| { id?: string; type: "cycle_model" }
	| { id?: string; type: "get_available_models" }
	| { id?: string; type: "get_providers" }
	| { id?: string; type: "login_provider"; providerId: string; authType: "api_key" | "oauth" }
	| { id?: string; type: "logout_provider"; providerId: string }
	| { id?: string; type: "cancel_provider_login"; flowId: string }

	// Thinking
	| { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
	| { id?: string; type: "cycle_thinking_level" }
	| { id?: string; type: "get_available_thinking_levels" }

	// Queue modes
	| { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
	| { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }

	// Compaction
	| { id?: string; type: "compact"; customInstructions?: string }
	| { id?: string; type: "set_auto_compaction"; enabled: boolean }

	// Retry
	| { id?: string; type: "set_auto_retry"; enabled: boolean }
	| { id?: string; type: "abort_retry" }

	// Bash
	| { id?: string; type: "bash"; command: string; excludeFromContext?: boolean }
	| { id?: string; type: "abort_bash" }

	// Session
	| { id?: string; type: "get_session_stats" }
	| { id?: string; type: "export_html"; outputPath?: string }
	| { id?: string; type: "export_jsonl"; outputPath?: string }
	| { id?: string; type: "import_session"; inputPath: string; cwdOverride?: string }
	| { id?: string; type: "switch_session"; sessionPath: string; cwdOverride?: string }
	| { id?: string; type: "fork"; entryId: string }
	| { id?: string; type: "clone" }
	| { id?: string; type: "get_fork_messages" }
	| { id?: string; type: "get_entries"; since?: string }
	| { id?: string; type: "get_tree" }
	| {
			id?: string;
			type: "navigate_tree";
			targetId: string;
			summarize?: boolean;
			customInstructions?: string;
			replaceInstructions?: boolean;
			label?: string;
	  }
	| { id?: string; type: "get_last_assistant_text" }
	| { id?: string; type: "set_session_name"; name: string }
	| { id?: string; type: "rename_session"; sessionId: string; name: string; sessionPath?: string }
	| { id?: string; type: "set_session_mode"; mode: RpcSessionMode }
	| { id?: string; type: "set_approval_policy"; policy: RpcApprovalPolicy }

	// Messages
	| { id?: string; type: "get_messages" }

	// Runtime resources (tools, extensions, and loaded context files)
	| { id?: string; type: "get_resources" }
	| { id?: string; type: "invoke_extension_shortcut"; shortcut: string }

	// Commands (available for invocation via prompt)
	| { id?: string; type: "get_commands" };

// ============================================================================
// RPC Slash Command (for get_commands response)
// ============================================================================

/** A command available for invocation via prompt */
export interface RpcSlashCommand {
	/** Command name (without leading slash) */
	name: string;
	/** Human-readable description */
	description?: string;
	/** Optional usage hint supplied by a prompt template */
	argumentHint?: string;
	/** What kind of command this is */
	source: "extension" | "prompt" | "skill";
	/** Source metadata for the owning resource */
	sourceInfo: SourceInfo;
}

export interface RpcRuntimeTool {
	name: string;
	description?: string;
	active: boolean;
	sourceInfo: SourceInfo;
}

export interface RpcRuntimeExtension {
	path: string;
	sourceInfo: SourceInfo;
	toolNames: string[];
	commandNames: string[];
	shortcuts: Array<{ shortcut: string; description?: string }>;
}

export interface RpcContextResource {
	kind: "instructions" | "system" | "append-system";
	path: string;
	content: string;
	truncated: boolean;
}

export interface RpcNamedResource {
	name: string;
	description?: string;
	argumentHint?: string;
	path: string;
	sourceInfo: SourceInfo;
}

export interface RpcResourceDiagnostic {
	type: "warning" | "error" | "collision";
	message: string;
	path?: string;
}

export interface RpcResourceState {
	tools: RpcRuntimeTool[];
	extensions: RpcRuntimeExtension[];
	extensionErrors: Array<{ path: string; error: string }>;
	skills: RpcNamedResource[];
	prompts: RpcNamedResource[];
	diagnostics: RpcResourceDiagnostic[];
	contextResources: RpcContextResource[];
	capabilities: {
		nativeMcp: false;
		semanticMemory: false;
	};
}

export interface RpcProviderAuthMethod {
	type: "api_key" | "oauth";
	name: string;
	loginLabel?: string;
	isSubscription: boolean;
	interactive: boolean;
}

export interface RpcProviderSummary {
	id: string;
	name: string;
	configured: boolean;
	authType?: "api_key" | "oauth";
	authSource?: string;
	stored: boolean;
	modelCount: number;
	availableModelCount: number;
	authMethods: RpcProviderAuthMethod[];
}

export interface RpcProviderState {
	providers: RpcProviderSummary[];
	error?: string;
}

export type RpcProviderAuthPrompt =
	| { type: "text" | "secret" | "manual_code"; message: string; placeholder?: string }
	| {
			type: "select";
			message: string;
			options: Array<{ id: string; label: string; description?: string }>;
	  };

export type RpcProviderAuthRequest = {
	type: "provider_auth_request";
	flowId: string;
	id: string;
	providerId: string;
	prompt: RpcProviderAuthPrompt;
};

export type RpcProviderAuthResponse = {
	type: "provider_auth_response";
	flowId: string;
	id: string;
	value?: string;
	cancelled?: boolean;
};

export type RpcProviderAuthEvent = {
	type: "provider_auth_event";
	flowId: string;
	providerId: string;
	event:
		| { type: "started"; authType: "api_key" | "oauth" }
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

// ============================================================================
// RPC State
// ============================================================================

export type RpcSessionMode = "work" | "chat";
export type RpcApprovalPolicy = "ask" | "auto";

export interface RpcSessionState {
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	sessionMode: RpcSessionMode;
	approvalPolicy: RpcApprovalPolicy;
	contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
	autoCompactionEnabled: boolean;
	autoRetryEnabled: boolean;
	isRetrying: boolean;
	messageCount: number;
	pendingMessageCount: number;
}

// ============================================================================
// RPC Responses (stdout)
// ============================================================================

// Success responses with data
export type RpcResponse =
	// Prompting (async - events follow)
	| { id?: string; type: "response"; command: "prompt"; success: true }
	| { id?: string; type: "response"; command: "steer"; success: true }
	| { id?: string; type: "response"; command: "follow_up"; success: true }
	| { id?: string; type: "response"; command: "abort"; success: true }
	| {
			id?: string;
			type: "response";
			command: "clear_queue";
			success: true;
			data: { steering: string[]; followUp: string[] };
	  }
	| {
			id?: string;
			type: "response";
			command: "update_queue_item";
			success: true;
			data: { steering: string[]; followUp: string[] };
	  }
	| { id?: string; type: "response"; command: "new_session"; success: true; data: { cancelled: boolean } }

	// State
	| { id?: string; type: "response"; command: "get_state"; success: true; data: RpcSessionState }
	| { id?: string; type: "response"; command: "get_settings"; success: true; data: RpcHostSettingsState }
	| { id?: string; type: "response"; command: "update_settings"; success: true; data: RpcHostSettingsState }
	| { id?: string; type: "response"; command: "get_project_trust"; success: true; data: RpcProjectTrustState }
	| { id?: string; type: "response"; command: "set_project_trust"; success: true; data: RpcProjectTrustState }
	| { id?: string; type: "response"; command: "reload_resources"; success: true }
	| { id?: string; type: "response"; command: "get_package_state"; success: true; data: RpcPackageState }
	| { id?: string; type: "response"; command: "install_package"; success: true; data: RpcPackageState }
	| { id?: string; type: "response"; command: "remove_package"; success: true; data: RpcPackageState }
	| { id?: string; type: "response"; command: "update_package"; success: true; data: RpcPackageState }
	| { id?: string; type: "response"; command: "set_resource_enabled"; success: true; data: RpcPackageState }

	// Model
	| {
			id?: string;
			type: "response";
			command: "set_model";
			success: true;
			data: Model<any>;
	  }
	| {
			id?: string;
			type: "response";
			command: "cycle_model";
			success: true;
			data: { model: Model<any>; thinkingLevel: ThinkingLevel; isScoped: boolean } | null;
	  }
	| {
			id?: string;
			type: "response";
			command: "get_available_models";
			success: true;
			data: { models: Model<any>[] };
	  }
	| { id?: string; type: "response"; command: "get_providers"; success: true; data: RpcProviderState }
	| { id?: string; type: "response"; command: "login_provider"; success: true; data: RpcProviderState }
	| { id?: string; type: "response"; command: "logout_provider"; success: true; data: RpcProviderState }
	| { id?: string; type: "response"; command: "cancel_provider_login"; success: true }

	// Thinking
	| { id?: string; type: "response"; command: "set_thinking_level"; success: true }
	| {
			id?: string;
			type: "response";
			command: "cycle_thinking_level";
			success: true;
			data: { level: ThinkingLevel } | null;
	  }
	| {
			id?: string;
			type: "response";
			command: "get_available_thinking_levels";
			success: true;
			data: { levels: ThinkingLevel[] };
	  }

	// Queue modes
	| { id?: string; type: "response"; command: "set_steering_mode"; success: true }
	| { id?: string; type: "response"; command: "set_follow_up_mode"; success: true }

	// Compaction
	| { id?: string; type: "response"; command: "compact"; success: true; data: CompactionResult }
	| { id?: string; type: "response"; command: "set_auto_compaction"; success: true }

	// Retry
	| { id?: string; type: "response"; command: "set_auto_retry"; success: true }
	| { id?: string; type: "response"; command: "abort_retry"; success: true }

	// Bash
	| { id?: string; type: "response"; command: "bash"; success: true; data: BashResult }
	| { id?: string; type: "response"; command: "abort_bash"; success: true }

	// Session
	| { id?: string; type: "response"; command: "get_session_stats"; success: true; data: SessionStats }
	| { id?: string; type: "response"; command: "export_html"; success: true; data: { path: string } }
	| { id?: string; type: "response"; command: "export_jsonl"; success: true; data: { path: string } }
	| { id?: string; type: "response"; command: "import_session"; success: true; data: { cancelled: boolean } }
	| { id?: string; type: "response"; command: "switch_session"; success: true; data: { cancelled: boolean } }
	| { id?: string; type: "response"; command: "fork"; success: true; data: { text: string; cancelled: boolean } }
	| { id?: string; type: "response"; command: "clone"; success: true; data: { cancelled: boolean } }
	| {
			id?: string;
			type: "response";
			command: "get_fork_messages";
			success: true;
			data: { messages: Array<{ entryId: string; text: string }> };
	  }
	| {
			id?: string;
			type: "response";
			command: "get_entries";
			success: true;
			data: { entries: SessionEntry[]; leafId: string | null };
	  }
	| {
			id?: string;
			type: "response";
			command: "get_tree";
			success: true;
			data: { tree: SessionTreeNode[]; leafId: string | null };
	  }
	| {
			id?: string;
			type: "response";
			command: "navigate_tree";
			success: true;
			data: { editorText?: string; cancelled: boolean; aborted?: boolean };
	  }
	| {
			id?: string;
			type: "response";
			command: "get_last_assistant_text";
			success: true;
			data: { text: string | null };
	  }
	| { id?: string; type: "response"; command: "set_session_name"; success: true }
	| { id?: string; type: "response"; command: "rename_session"; success: true }
	| { id?: string; type: "response"; command: "set_session_mode"; success: true; data: { mode: RpcSessionMode } }
	| {
			id?: string;
			type: "response";
			command: "set_approval_policy";
			success: true;
			data: { policy: RpcApprovalPolicy };
	  }

	// Messages
	| { id?: string; type: "response"; command: "get_messages"; success: true; data: { messages: AgentMessage[] } }

	// Runtime resources
	| { id?: string; type: "response"; command: "get_resources"; success: true; data: RpcResourceState }
	| { id?: string; type: "response"; command: "invoke_extension_shortcut"; success: true }

	// Commands
	| {
			id?: string;
			type: "response";
			command: "get_commands";
			success: true;
			data: { commands: RpcSlashCommand[] };
	  }

	// Error response (any command can fail)
	| { id?: string; type: "response"; command: string; success: false; error: string };

// ============================================================================
// Extension UI Events (stdout)
// ============================================================================

/** Emitted when an extension needs user input */
export type RpcExtensionUIRequest =
	| { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
	| {
			type: "extension_ui_request";
			id: string;
			method: "input";
			title: string;
			placeholder?: string;
			timeout?: number;
	  }
	| { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
	| {
			type: "extension_ui_request";
			id: string;
			method: "notify";
			message: string;
			notifyType?: "info" | "warning" | "error";
	  }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setStatus";
			statusKey: string;
			statusText: string | undefined;
	  }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
	| { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string };

/** Emitted when a pending extension dialog is no longer actionable. */
export type RpcExtensionUIClose = {
	type: "extension_ui_close";
	id: string;
	reason: "timeout" | "cancelled";
};

// ============================================================================
// Extension UI Commands (stdin)
// ============================================================================

/** Response to an extension UI request */
export type RpcExtensionUIResponse =
	| { type: "extension_ui_response"; id: string; value: string }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; cancelled: true };

// ============================================================================
// Helper type for extracting command types
// ============================================================================

export type RpcCommandType = RpcCommand["type"];
