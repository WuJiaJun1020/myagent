import "./lib/theme-bootstrap";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTypographySettings } from "./lib/typography";
import { useSettingsStore } from "./stores/settings-store";
import "./fonts.css";
import "./styles.css";
import "./styles/workspace-shell.css";
import "./styles/conversation.css";
import "./styles/browser.css";
import "./styles/workspace-surfaces.css";
import "./styles/workspace-tokens.css";
import "./styles/overlays.css";
import "./styles/interview.css";
import "./styles/knowledge.css";

applyTypographySettings(useSettingsStore.getState());
createRoot(document.getElementById("root")!).render(<App />);
