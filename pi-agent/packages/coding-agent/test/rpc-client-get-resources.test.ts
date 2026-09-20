import { describe, expect, it, vi } from "vitest";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";

type RpcClientPrivate = {
	send: (command: { type: string; [key: string]: unknown }, timeoutMs?: number) => Promise<unknown>;
	getData: <T>(response: unknown) => T;
};

describe("RpcClient getResources", () => {
	it("sends the read-only get_resources RPC command", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const resources = {
			tools: [],
			extensions: [],
			extensionErrors: [],
			contextResources: [],
			capabilities: { nativeMcp: false as const, semanticMemory: false as const },
		};
		const send = vi.fn(async () => ({
			type: "response",
			command: "get_resources",
			success: true,
			data: resources,
		}));
		privateClient.send = send;
		privateClient.getData = <T>(response: unknown): T => (response as { data: T }).data;

		const result = await client.getResources();

		expect(send).toHaveBeenCalledWith({ type: "get_resources" });
		expect(result).toEqual(resources);
	});

	it("manages packages and resource activation with typed commands", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const state = { packages: [], resources: [], projectTrusted: true };
		const send = vi.fn(async () => ({ type: "response", command: "packages", success: true, data: state }));
		privateClient.send = send;
		privateClient.getData = <T>(response: unknown): T => (response as { data: T }).data;

		await expect(client.getPackageState()).resolves.toEqual(state);
		expect(send).toHaveBeenLastCalledWith({ type: "get_package_state" });

		await client.installPackage("./fixture", "project");
		expect(send).toHaveBeenLastCalledWith(
			{ type: "install_package", source: "./fixture", scope: "project" },
			600_000,
		);

		await client.setResourceEnabled({
			resourceType: "skills",
			path: "D:/fixture/skills/review/SKILL.md",
			source: "./fixture",
			scope: "project",
			enabled: false,
		});
		expect(send).toHaveBeenLastCalledWith({
			type: "set_resource_enabled",
			resourceType: "skills",
			path: "D:/fixture/skills/review/SKILL.md",
			source: "./fixture",
			scope: "project",
			enabled: false,
		});
	});

	it("invokes extension shortcuts with a typed command", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const send = vi.fn(async () => ({
			type: "response",
			command: "invoke_extension_shortcut",
			success: true,
		}));
		privateClient.send = send;

		await client.invokeExtensionShortcut("ctrl+alt+p");

		expect(send).toHaveBeenCalledWith({ type: "invoke_extension_shortcut", shortcut: "ctrl+alt+p" });
	});
});

describe("RpcClient provider authentication", () => {
	it("lists providers and starts a correlated login flow", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const state = { providers: [] };
		const send = vi.fn(async () => ({ type: "response", command: "get_providers", success: true, data: state }));
		privateClient.send = send;
		privateClient.getData = <T>(response: unknown): T => (response as { data: T }).data;

		await expect(client.getProviders()).resolves.toEqual(state);
		expect(send).toHaveBeenLastCalledWith({ type: "get_providers" });

		await expect(client.loginProvider("anthropic", "oauth", "flow-1")).resolves.toEqual(state);
		expect(send).toHaveBeenLastCalledWith(
			{ id: "flow-1", type: "login_provider", providerId: "anthropic", authType: "oauth" },
			600_000,
		);
	});
});

describe("RpcClient session management", () => {
	it("sends rename and mode commands", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const send = vi.fn(async () => ({ type: "response", command: "session", success: true }));
		privateClient.send = send;

		await client.renameSession("session-1", "设计讨论");
		expect(send).toHaveBeenLastCalledWith({ type: "rename_session", sessionId: "session-1", name: "设计讨论" });

		await client.switchSession("D:/sessions/global-chat.jsonl", "D:/current-workspace");
		expect(send).toHaveBeenLastCalledWith({
			type: "switch_session",
			sessionPath: "D:/sessions/global-chat.jsonl",
			cwdOverride: "D:/current-workspace",
		});

		await client.setSessionMode("chat");
		expect(send).toHaveBeenLastCalledWith({ type: "set_session_mode", mode: "chat" });
	});
});
