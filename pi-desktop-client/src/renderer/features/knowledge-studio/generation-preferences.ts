import { MAX_KNOWLEDGE_BATCH_SOURCES, type KnowledgeThinkingLevel } from "../../../shared/contracts/knowledge-studio";

const SELECTED_SOURCES_STORAGE_KEY = "knowledge-studio:generation-sources:v1";
const SELECTED_MODEL_STORAGE_KEY = "knowledge-studio:generation-model:v1";
const THINKING_LEVEL_STORAGE_KEY = "knowledge-studio:generation-thinking:v1";

export type SavedGenerationModel = { providerId: string; modelId: string };

export function readSavedGenerationModel(): SavedGenerationModel | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const model = parsed as Record<string, unknown>;
    return typeof model.providerId === "string" && model.providerId.length > 0
      && typeof model.modelId === "string" && model.modelId.length > 0
      ? { providerId: model.providerId, modelId: model.modelId } : null;
  } catch {
    return null;
  }
}

export function saveGenerationModel(model?: SavedGenerationModel): void {
  try {
    if (model) window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, JSON.stringify(model));
    else window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the current form still works for this session.
  }
}

export function readSavedGenerationThinkingLevel(): KnowledgeThinkingLevel | null {
  try {
    const level = window.localStorage.getItem(THINKING_LEVEL_STORAGE_KEY);
    return level && ["minimal", "low", "medium", "high", "xhigh", "max"].includes(level)
      ? level as KnowledgeThinkingLevel : null;
  } catch {
    return null;
  }
}

export function saveGenerationThinkingLevel(level?: KnowledgeThinkingLevel): void {
  try {
    if (level && level !== "default") window.localStorage.setItem(THINKING_LEVEL_STORAGE_KEY, level);
    else window.localStorage.removeItem(THINKING_LEVEL_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the current form still works for this session.
  }
}

export function readSavedGenerationSources(): string[] | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_SOURCES_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGenerationSources(sourceIds: string[]): void {
  try {
    window.localStorage.setItem(SELECTED_SOURCES_STORAGE_KEY, JSON.stringify(sourceIds));
  } catch {
    // Storage may be unavailable; the current form still works for this session.
  }
}

export function reconcileGenerationSources(selection: string[] | null, availableIds: string[]): string[] {
  const available = new Set(availableIds);
  const desired = selection ?? availableIds;
  return [...new Set(desired)].filter((id) => available.has(id)).slice(0, MAX_KNOWLEDGE_BATCH_SOURCES);
}
