import { beforeEach, describe, expect, it } from "vitest";
import type { ImageAttachment } from "../../shared/contracts/agent-session";
import { useUiStore } from "./ui-store";

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
      sidebarView: "activity",
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
    store.setSidebarView("mcp");
    store.setResourceCenterTab("packages");

    useUiStore.getState().setComposerDraft("draft");

    expect(useUiStore.getState()).toMatchObject({
      sidebarView: "mcp",
      resourceCenterTab: "packages",
    });
  });

  it("opens the detail region when entering code review", () => {
    useUiStore.setState({ detailPanelOpen: false });

    useUiStore.getState().setSidebarView("review");

    expect(useUiStore.getState()).toMatchObject({ sidebarView: "review", detailPanelOpen: true });
  });

});
