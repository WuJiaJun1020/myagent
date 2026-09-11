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

type WorkspaceStore = {
  cwd: string;
  directoriesByPath: Record<string, DirectoryState>;
  filesByPath: Record<string, WorkspaceTextFile>;
  expandedDirectories: Record<string, boolean>;
  activeFilePath: string | null;
  loadingFilePath: string | null;
  fileError: string | null;
  setWorkspace: (cwd: string) => void;
  loadDirectory: (path: string, force?: boolean) => Promise<void>;
  toggleDirectory: (path: string) => Promise<void>;
  openFile: (path: string) => Promise<void>;
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
        loadingFilePath: null,
      }));
    } catch (reason) {
      if (get().cwd !== requestCwd || get().activeFilePath !== path) return;
      set({ loadingFilePath: null, fileError: errorMessage(reason) });
    }
  },

  recordFileChange: (change) => {
    const parent = parentPath(change.path);
    set((state) => {
      const directoriesByPath = { ...state.directoriesByPath };
      if (directoriesByPath[parent]) delete directoriesByPath[parent];
      const filesByPath = { ...state.filesByPath };
      delete filesByPath[change.path];
      return { directoriesByPath, filesByPath };
    });
    if (get().expandedDirectories[parent]) void get().loadDirectory(parent, true);
    if (get().activeFilePath === change.path && change.changeType !== "deleted") {
      void get().openFile(change.path);
    }
  },
}));
