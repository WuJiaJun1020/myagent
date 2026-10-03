export const PET_ACTIONS = ["reading", "chess", "bamboo"] as const;
export type PetActionId = typeof PET_ACTIONS[number];
export type PetSettings = { enabled: boolean; action: PetActionId; scales: Record<PetActionId, number>; position: { x: number; y: number } | null };
export type PetSettingsPatch = Partial<Pick<PetSettings, "enabled" | "action">> & { scale?: number };
export type PetFrame = { file: string; durationMs: number; sha256?: string };
export type PetAnimation = { id: PetActionId; title: string; width: number; height: number; contentBounds: { x: number; y: number; width: number; height: number }; displayWidth: number; displayHeight: number; loop: boolean; poster: string; frames: PetFrame[] };
export type PetManifest = { version: 1; name: string; actions: PetAnimation[] };
export type PetSnapshot = { settings: PetSettings; actions: Array<Omit<PetAnimation, "frames" | "poster"> & { posterUrl: string; frameCount: number; durationMs: number }> };
export type PetPlayback = { settings: PetSettings; animation: Omit<PetAnimation, "frames"> & { frames: Array<PetFrame & { url: string }> }; revision: number };

export function petFrameAtElapsed(frames: PetFrame[], elapsed: number, loop: boolean): { index: number; finished: boolean } {
  const total = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  if (!loop && elapsed >= total) return { index: frames.length - 1, finished: true };
  let offset = Math.max(0, elapsed) % total;
  for (let i = 0; i < frames.length; i++) { if (offset < frames[i].durationMs) return { index: i, finished: false }; offset -= frames[i].durationMs; }
  return { index: 0, finished: false };
}

export function parsePetPatch(input: unknown): PetSettingsPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("桌宠设置无效");
  const value = input as Record<string, unknown>, patch: PetSettingsPatch = {};
  for (const key of Object.keys(value)) if (!["enabled", "action", "scale"].includes(key)) throw new Error("桌宠设置无效");
  if ("enabled" in value) { if (typeof value.enabled !== "boolean") throw new Error("桌宠开关无效"); patch.enabled = value.enabled; }
  if ("action" in value) { if (!PET_ACTIONS.includes(value.action as PetActionId)) throw new Error("桌宠动作无效"); patch.action = value.action as PetActionId; }
  if ("scale" in value) { if (typeof value.scale !== "number" || !Number.isFinite(value.scale) || value.scale < .01 || value.scale > 1) throw new Error("桌宠大小范围为 1% 到 100%，100% 为原始分辨率"); patch.scale = value.scale; }
  return patch;
}
