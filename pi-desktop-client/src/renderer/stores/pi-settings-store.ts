import { create } from "zustand";
import type { PiHostSettingsState, PiSettingsPatch, ProjectTrustState } from "../../shared/contracts/pi-settings";
import { agentGateway } from "../services/agent-gateway";

type PiSettingsStore = {
  settings: PiHostSettingsState | null;
  trust: ProjectTrustState | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  update: (patch: PiSettingsPatch) => Promise<void>;
  setTrust: (decision: boolean | null, target?: "current" | "parent") => Promise<void>;
  clearError: () => void;
  reset: () => void;
};

let generation = 0;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export const usePiSettingsStore = create<PiSettingsStore>((set) => ({
  settings: null,
  trust: null,
  loading: false,
  saving: false,
  error: null,

  initialize: async () => {
    const currentGeneration = ++generation;
    set({ loading: true, error: null });
    try {
      const [settings, trust] = await Promise.all([
        agentGateway.getPiSettings(),
        agentGateway.getProjectTrust(),
      ]);
      if (currentGeneration !== generation) return;
      set({ settings, trust, loading: false });
    } catch (reason) {
      if (currentGeneration === generation) set({ loading: false, error: errorMessage(reason) });
    }
  },

  update: async (patch) => {
    set({ saving: true, error: null });
    try {
      const settings = await agentGateway.updatePiSettings(patch);
      set({ settings, saving: false });
    } catch (reason) {
      set({ saving: false, error: errorMessage(reason) });
    }
  },

  setTrust: async (decision, target) => {
    set({ saving: true, error: null });
    try {
      const trust = await agentGateway.setProjectTrust(decision, target);
      const settings = await agentGateway.getPiSettings();
      set({ trust, settings, saving: false });
    } catch (reason) {
      set({ saving: false, error: errorMessage(reason) });
      throw reason;
    }
  },

  clearError: () => set({ error: null }),
  reset: () => {
    generation += 1;
    set({ settings: null, trust: null, loading: false, saving: false, error: null });
  },
}));
