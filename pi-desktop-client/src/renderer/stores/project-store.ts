import { create } from "zustand";
import { persist } from "zustand/middleware";
import { workspaceKey } from "../features/sessions/session-projects";

export const useProjectStore = create(persist<{
  directories: string[];
  remember: (cwd: string) => void;
}>((set) => ({
  directories: [],
  remember: (cwd) => {
    if (!cwd) return;
    set((state) => state.directories.some((path) => workspaceKey(path) === workspaceKey(cwd))
      ? state : { directories: [...state.directories, cwd] });
  },
}), { name: "pi-desktop-projects", version: 1 }));
