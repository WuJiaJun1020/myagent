import { Puzzle } from "lucide-react";
import { useMemo } from "react";
import { useAgentStore } from "../../stores/agent-store";

export function ExtensionWidgets({ placement }: { placement: "aboveEditor" | "belowEditor" }) {
  const widgetByKey = useAgentStore((state) => state.extensionWidgets);
  const widgets = useMemo(
    () => Object.values(widgetByKey).filter((widget) => widget.placement === placement),
    [widgetByKey, placement],
  );
  if (widgets.length === 0) return null;
  return (
    <div className={`extension-widgets ${placement}`}>
      {widgets.map((widget) => (
        <section key={widget.key}><Puzzle size={13} /><pre>{widget.lines.join("\n")}</pre></section>
      ))}
    </div>
  );
}
