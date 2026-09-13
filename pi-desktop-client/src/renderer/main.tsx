import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTypographySettings } from "./lib/typography";
import { useSettingsStore } from "./stores/settings-store";
import "./fonts.css";
import "./styles.css";

applyTypographySettings(useSettingsStore.getState());
createRoot(document.getElementById("root")!).render(<App />);
