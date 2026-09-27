import { beforeEach, describe, expect, it } from "vitest";
import type { ImageAttachment } from "../../shared/contracts/agent-session";
import { parsePersistedNavigation, useUiStore } from "./ui-store";

const attachment: ImageAttachment = {
  id: "image-1",
  name: "example.png",
  mimeType: "image/png",
  size: 128,
  previewDataUrl: "data:image/png;base64,AA==",
};

describe("session composer drafts", () => {
  beforeEach(() => {
    useUiStore.setState({
      sessionComposerDrafts: {},
      sessionChatScroll: {},
      composerDraft: null,
      chatFollowRequest: 0,
      activeModule: "agent",
      moduleViews: { agent: "activity", interview: "dashboard", "knowledge-studio": "studio" },
      resourceCenterTab: "online",
    });
  });

  it("keeps text and attachments isolated by session", () => {
    const store = useUiStore.getState();
    store.setSessionComposerDraft("session-a", { text: "A 的草稿", attachments: [attachment] });
    store.setSessionComposerDraft("session-b", { text: "B 的草稿", attachments: [] });

    expect(useUiStore.getState().sessionComposerDrafts).toEqual({
      "session-a": { text: "A 的草稿", attachments: [attachment] },
      "session-b": { text: "B 的草稿", attachments: [] },
    });
  });

  it("removes empty or explicitly discarded drafts", () => {
    const store = useUiStore.getState();
    store.setSessionComposerDraft("session-a", { text: "草稿", attachments: [] });
    store.setSessionComposerDraft("session-a", { text: "", attachments: [] });
    store.setSessionComposerDraft("session-b", { text: "草稿", attachments: [] });
    store.removeSessionUiState("session-b");

    expect(useUiStore.getState().sessionComposerDrafts).toEqual({});
  });

  it("keeps scroll positions isolated by session and removes discarded session state", () => {
    const store = useUiStore.getState();
    store.setSessionChatScroll("session-a", { scrollTop: 420, pinned: false });
    store.setSessionChatScroll("session-b", { scrollTop: 960, pinned: true });

    expect(useUiStore.getState().sessionChatScroll).toEqual({
      "session-a": { scrollTop: 420, pinned: false },
      "session-b": { scrollTop: 960, pinned: true },
    });

    useUiStore.getState().removeSessionUiState("session-a");
    expect(useUiStore.getState().sessionChatScroll).toEqual({
      "session-b": { scrollTop: 960, pinned: true },
    });
  });

  it("emits a fresh chat follow request for every send", () => {
    const store = useUiStore.getState();
    store.requestChatFollow();
    store.requestChatFollow();

    expect(useUiStore.getState().chatFollowRequest).toBe(2);
  });

  it("keeps the selected resource tab when unrelated state changes", () => {
    const store = useUiStore.getState();
    store.setAgentView("mcp");
    store.setResourceCenterTab("packages");

    useUiStore.getState().setComposerDraft("draft");

    expect(useUiStore.getState()).toMatchObject({
      moduleViews: { agent: "mcp", interview: "dashboard" },
      resourceCenterTab: "packages",
    });
  });

  it("keeps each product module's internal page when switching modules", () => {
    const store = useUiStore.getState();
    store.setAgentView("files");
    store.setActiveModule("interview");
    store.setInterviewView("jobs");
    store.setActiveModule("agent");

    expect(useUiStore.getState()).toMatchObject({
      activeModule: "agent",
      moduleViews: { agent: "files", interview: "jobs" },
    });
  });

  it("migrates the previous sidebar-only navigation without losing its location", () => {
    expect(parsePersistedNavigation({ sidebarView: "interview", resourceCenterTab: "packages" })).toEqual({
      activeModule: "interview",
      moduleViews: { agent: "activity", interview: "dashboard", "knowledge-studio": "studio" },
      resourceCenterTab: "packages",
    });
    expect(parsePersistedNavigation({ sidebarView: "review" })).toEqual({
      activeModule: "agent",
      moduleViews: { agent: "review", interview: "dashboard", "knowledge-studio": "studio" },
      resourceCenterTab: "online",
    });
  });

  it("keeps the current per-module navigation format and rejects invalid pages", () => {
    expect(parsePersistedNavigation({
      activeModule: "interview",
      moduleViews: { agent: "files", interview: "jobs", "knowledge-studio": "studio" },
      resourceCenterTab: "skills",
    })).toEqual({
      activeModule: "interview",
      moduleViews: { agent: "files", interview: "jobs", "knowledge-studio": "studio" },
      resourceCenterTab: "skills",
    });
    expect(parsePersistedNavigation({
      activeModule: "reading",
      moduleViews: { agent: "unknown", interview: "unknown" },
    })).toEqual({
      activeModule: "agent",
      moduleViews: { agent: "activity", interview: "dashboard", "knowledge-studio": "studio" },
      resourceCenterTab: "online",
    });
  });

  it("restores the interview session page as module-local navigation", () => {
    expect(parsePersistedNavigation({
      activeModule: "interview",
      moduleViews: { agent: "activity", interview: "session", "knowledge-studio": "studio" },
      resourceCenterTab: "online",
    })).toEqual({
      activeModule: "interview",
      moduleViews: { agent: "activity", interview: "session", "knowledge-studio": "studio" },
      resourceCenterTab: "online",
    });
  });

  it("restores the separate interview records page", () => {
    expect(parsePersistedNavigation({
      activeModule: "interview",
      moduleViews: { agent: "activity", interview: "records", "knowledge-studio": "studio" },
      resourceCenterTab: "online",
    }).moduleViews.interview).toBe("records");
  });

  it("restores the interview learning entrances as module-local navigation", () => {
    for (const interviewView of ["question-bank", "algorithms"] as const) {
      expect(parsePersistedNavigation({
        activeModule: "interview",
        moduleViews: { agent: "activity", interview: interviewView, "knowledge-studio": "studio" },
        resourceCenterTab: "online",
      })).toEqual({
        activeModule: "interview",
        moduleViews: { agent: "activity", interview: interviewView, "knowledge-studio": "studio" },
        resourceCenterTab: "online",
      });
    }
  });

  it("opens the detail region when entering code review", () => {
    useUiStore.setState({ agentDetailPanelOpen: false });

    useUiStore.getState().setAgentView("review");

    expect(useUiStore.getState()).toMatchObject({
      moduleViews: { agent: "review", interview: "dashboard" },
      agentDetailPanelOpen: true,
    });
  });

  it("keeps Agent panel preferences separate from the interview sidebar", () => {
    useUiStore.setState({ activeModule: "agent", agentDetailPanelOpen: false, detailPanelOpen: true });
    const store = useUiStore.getState();
    store.selectToolCall("tool-1");
    expect(useUiStore.getState().agentDetailPanelOpen).toBe(true);
    store.toggleDetailPanel();
    expect(useUiStore.getState()).toMatchObject({ agentDetailPanelOpen: false, detailPanelOpen: true });
    store.setActiveModule("interview");
    store.toggleDetailPanel();
    store.setActiveModule("agent");
    expect(useUiStore.getState()).toMatchObject({ agentDetailPanelOpen: false, detailPanelOpen: false });
    store.selectFile("example.ts");
    expect(useUiStore.getState()).toMatchObject({ agentDetailPanelOpen: true, detailPanelOpen: false });
  });

  it("toggles code review open, closed and open again without changing interview or terminal panels", () => {
    useUiStore.setState({ agentDetailPanelOpen: false, detailPanelOpen: true, terminalPanelOpen: true });
    const store = useUiStore.getState();
    for (const open of [true, false, true, false]) {
      store.toggleAgentReview();
      expect(useUiStore.getState()).toMatchObject({
        moduleViews: { agent: open ? "review" : "activity", interview: "dashboard" },
        agentDetailPanelOpen: open,
        detailPanelOpen: true,
        terminalPanelOpen: true,
      });
    }
  });

  it("reopens review hidden by the generic panel toggle and keeps sidebar navigation idempotent", () => {
    const store = useUiStore.getState();
    store.setAgentView("review");
    store.setAgentView("review");
    expect(useUiStore.getState().agentDetailPanelOpen).toBe(true);
    store.toggleDetailPanel();
    expect(useUiStore.getState().agentDetailPanelOpen).toBe(false);
    store.toggleAgentReview();
    expect(useUiStore.getState()).toMatchObject({ moduleViews: { agent: "review" }, agentDetailPanelOpen: true });
  });

});
