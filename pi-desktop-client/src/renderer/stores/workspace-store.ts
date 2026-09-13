import { create } from "zustand";
import type {
  FileChange,
  WorkspaceDirectoryListing,
  WorkspaceTextFile,
} from "../../shared/contracts/workspace";
import { workspaceGateway } from "../services/workspace-gateway";

type DirectoryState = {
  listing?: WorkspaceDirectoryListing;
  loading: boolean;
  error?: string;
};

type EditorDraft = {
  content: string;
  originalContent: string;
  baseModifiedAt: number;
  saving: boolean;
  conflict: string | null;
};

type WorkspaceStore = {
  cwd: string;
  directoriesByPath: Record<string, DirectoryState>;
  filesByPath: Record<string, WorkspaceTextFile>;
  draftsByPath: Record<string, EditorDraft>;
  expandedDirectories: Record<string, boolean>;
  activeFilePath: string | null;
  loadingFilePath: string | null;
  fileError: string | null;
  setWorkspace: (cwd: string) => void;
  loadDirectory: (path: string, force?: boolean) => Promise<void>;
  toggleDirectory: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  updateDraft: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  discardDraft: (path: string) => void;
  refreshFile: (path: string) => Promise<void>;
  closeActiveFile: () => void;
  recordFileChange: (change: FileChange) => void;
};

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  cwd: "",
  directoriesByPath: {},
  filesByPath: {},
  draftsByPath: {},
  expandedDirectories: { "": true },
  activeFilePath: null,
  loadingFilePath: null,
  fileError: null,

  setWorkspace: (cwd) => {
    if (get().cwd === cwd) return;
    set({
      cwd,
      directoriesByPath: {},
      filesByPath: {},
      draftsByPath: {},
      expandedDirectories: { "": true },
      activeFilePath: null,
      loadingFilePath: null,
      fileError: null,
    });
  },

  loadDirectory: async (path, force = false) => {
    const requestCwd = get().cwd;
    if (!requestCwd) return;
    const current = get().directoriesByPath[path];
    if (!force && (current?.loading || current?.listing)) return;
    set((state) => ({
      directoriesByPath: {
        ...state.directoriesByPath,
        [path]: { ...state.directoriesByPath[path], loading: true, error: undefined },
      },
    }));
    try {
      const listing = await workspaceGateway.listDirectory(path);
      if (get().cwd !== requestCwd) return;
      set((state) => ({
        directoriesByPath: {
          ...state.directoriesByPath,
          [path]: { listing, loading: false },
        },
      }));
    } catch (reason) {
      if (get().cwd !== requestCwd) return;
      set((state) => ({
        directoriesByPath: {
          ...state.directoriesByPath,
          [path]: { loading: false, error: errorMessage(reason) },
        },
      }));
    }
  },

  toggleDirectory: async (path) => {
    const expanded = Boolean(get().expandedDirectories[path]);
    set((state) => ({
      expandedDirectories: { ...state.expandedDirectories, [path]: !expanded },
    }));
    if (!expanded) await get().loadDirectory(path);
  },

  openFile: async (path) => {
    const requestCwd = get().cwd;
    if (!requestCwd) return;
    set({ activeFilePath: path, loadingFilePath: path, fileError: null });
    try {
      const file = await workspaceGateway.readFile(path);
      if (get().cwd !== requestCwd || get().activeFilePath !== path) return;
      set((state) => ({
        filesByPath: { ...state.filesByPath, [path]: file },
        draftsByPath: {
          ...state.draftsByPath,
          [path]: state.draftsByPath[path]?.content !== state.draftsByPath[path]?.originalContent
            ? state.draftsByPath[path]
            : {
              content: file.content,
              originalContent: file.content,
              baseModifiedAt: file.modifiedAt,
              saving: false,
              conflict: null,
            },
        },
        loadingFilePath: null,
      }));
    } catch (reason) {
      if (get().cwd !== requestCwd || get().activeFilePath !== path) return;
      set({ loadingFilePath: null, fileError: errorMessage(reason) });
    }
  },

  updateDraft: (path, content) => {
    const draft = get().draftsByPath[path];
    const file = get().filesByPath[path];
    if (!draft && !file) return;
    const originalContent = draft?.originalContent ?? file?.content ?? "";
    const baseModifiedAt = draft?.baseModifiedAt ?? file?.modifiedAt ?? 0;
    set((state) => ({
      draftsByPath: {
        ...state.draftsByPath,
        [path]: { content, originalContent, baseModifiedAt, saving: false, conflict: null },
      },
    }));
  },

  saveFile: async (path) => {
    const draft = get().draftsByPath[path];
    const file = get().filesByPath[path];
    if (!draft || !file || draft.content === draft.originalContent || draft.saving) return;
    set((state) => ({
      draftsByPath: { ...state.draftsByPath, [path]: { ...draft, saving: true, conflict: null } },
      fileError: null,
    }));
    try {
      const saved = await workspaceGateway.saveFile({
        path,
        content: draft.content,
        expectedModifiedAt: draft.baseModifiedAt,
      });
      set((state) => ({
        filesByPath: { ...state.filesByPath, [path]: saved },
        draftsByPath: {
          ...state.draftsByPath,
          [path]: {
            content: saved.content,
            originalContent: saved.content,
            baseModifiedAt: saved.modifiedAt,
            saving: false,
            conflict: null,
          },
        },
      }));
      const parent = parentPath(path);
      if (get().expandedDirectories[parent]) void get().loadDirectory(parent, true);
    } catch (reason) {
      const conflict = errorMessage(reason);
      set((state) => ({
        draftsByPath: {
          ...state.draftsByPath,
          [path]: { ...(state.draftsByPath[path] ?? draft), saving: false, conflict },
        },
        fileError: conflict,
      }));
    }
  },

  discardDraft: (path) => {
    const draft = get().draftsByPath[path];
    if (!draft) return;
    set((state) => ({
      draftsByPath: {
        ...state.draftsByPath,
        [path]: { ...draft, content: draft.originalContent, saving: false, conflict: null },
      },
      fileError: null,
    }));
  },

  refreshFile: async (path) => {
    const parent = parentPath(path);
    set((state) => {
      const filesByPath = { ...state.filesByPath };
      const draftsByPath = { ...state.draftsByPath };
      delete filesByPath[path];
      delete draftsByPath[path];
      return { filesByPath, draftsByPath, fileError: null };
    });
    if (get().expandedDirectories[parent]) await get().loadDirectory(parent, true);
    if (get().activeFilePath === path) await get().openFile(path);
  },

  closeActiveFile: () => set({ activeFilePath: null, loadingFilePath: null, fileError: null }),

  recordFileChange: (change) => {
    const parent = parentPath(change.path);
    set((state) => {
      const directoriesByPath = { ...state.directoriesByPath };
      if (directoriesByPath[parent]) delete directoriesByPath[parent];
      const filesByPath = { ...state.filesByPath };
      const draftsByPath = { ...state.draftsByPath };
      delete filesByPath[change.path];
      if (draftsByPath[change.path]?.content !== draftsByPath[change.path]?.originalContent) {
        draftsByPath[change.path] = {
          ...draftsByPath[change.path],
          conflict: "Agent 已修改磁盘上的同一文件；请保存前先重新加载并处理冲突。",
        };
      } else {
        delete draftsByPath[change.path];
      }
      return { directoriesByPath, filesByPath, draftsByPath };
    });
    if (get().expandedDirectories[parent]) void get().loadDirectory(parent, true);
    if (get().activeFilePath === change.path && change.changeType !== "deleted") {
      void get().openFile(change.path);
    }
  },
}));
