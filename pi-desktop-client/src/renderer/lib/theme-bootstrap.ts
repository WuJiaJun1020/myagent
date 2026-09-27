import { applyWorkspaceAppearance, normalizeAccent, normalizePalette, workspaceThemeCss } from "./workspace-theme";

// Runs before React mounts; uses the same palette as runtime settings and previews.
let stored: Record<string, unknown> = {};
try { stored = JSON.parse(localStorage.getItem("pi-desktop-settings") || "null")?.state ?? {}; } catch { /* Use defaults for malformed storage. */ }
const preference = stored.theme === "dark" || stored.theme === "system" ? stored.theme : "light";
const mode = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
const style = document.getElementById("workspace-theme-palettes") ?? document.createElement("style");
style.id = "workspace-theme-palettes";
style.textContent = workspaceThemeCss();
document.head.appendChild(style);
let workspace = "agent";
try {
  const navigation = JSON.parse(sessionStorage.getItem("pi-desktop-current-navigation") || "null");
  if (navigation?.activeModule === "interview" || navigation?.activeModule === "knowledge-studio") workspace = navigation.activeModule;
  else if (!navigation?.activeModule && navigation?.sidebarView === "interview") workspace = "interview";
} catch { /* Match the navigation store's default workspace. */ }
document.documentElement.dataset.workspace = workspace;
applyWorkspaceAppearance(document.documentElement, normalizePalette(stored.palette), normalizeAccent(stored.accent), mode, stored.animationEnabled !== false);
