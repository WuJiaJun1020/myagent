import { useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";

export function PythonCodeEditor({ value, onChange, readOnly = false, className = "" }: {
  value: string; onChange?: (value: string) => void; readOnly?: boolean; className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<editor.IStandaloneCodeEditor | null>(null);
  const latest = useRef({ value, onChange, readOnly });
  latest.current = { value, onChange, readOnly };
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("../../lib/monaco-runtime").then(({ monaco }) => {
      if (disposed || !host.current) return;
      const model = monaco.editor.createModel(latest.current.value, "python");
      const view = monaco.editor.create(host.current, {
        model, readOnly: latest.current.readOnly, automaticLayout: true,
        minimap: { enabled: false }, scrollBeyondLastLine: false, mouseStyle: "text",
        tabSize: 4, insertSpaces: true, lineNumbersMinChars: 3,
        padding: { top: 10, bottom: 12 }, fontSize: 13, renderLineHighlight: "line",
        quickSuggestions: { other: true, comments: false, strings: false },
        wordBasedSuggestions: "currentDocument", fixedOverflowWidgets: true,
        ariaLabel: latest.current.readOnly ? "Python 参考代码，只读" : "Python 代码编辑器",
      });
      instance.current = view;
      let syncing = false;
      const subscription = model.onDidChangeContent(() => {
        if (!syncing) latest.current.onChange?.(model.getValue());
      });
      function appearance() {
        if (!host.current) return;
        const css = getComputedStyle(host.current);
        const color = (name: string) => css.getPropertyValue(name).trim();
        const dark = document.documentElement.dataset.theme !== "light";
        monaco.editor.defineTheme("pi-python", {
          base: dark ? "vs-dark" : "vs", inherit: true, rules: [],
          colors: {
            "editor.background": color("--bg-app"), "editor.foreground": color("--text"),
            "editorLineNumber.foreground": color("--text-muted"),
            "editorLineNumber.activeForeground": color("--text"),
            "editorCursor.foreground": color("--text"),
            "editorSuggestWidget.background": color("--bg-elevated"),
            "editorSuggestWidget.foreground": color("--text"),
            "editorSuggestWidget.border": color("--border"),
            "editorSuggestWidget.selectedBackground": color("--bg-selected"),
            "editorSuggestWidget.selectedForeground": color("--text"),
            "editorSuggestWidget.highlightForeground": color("--accent"),
            "editorSuggestWidget.focusHighlightForeground": color("--accent"),
            "editorWidget.background": color("--bg-elevated"),
            "editorWidget.border": color("--border"),
          },
        });
        monaco.editor.setTheme("pi-python");
        view.updateOptions({ fontFamily: color("--font-code"), fontSize: parseFloat(color("--code-font-size")) || 13 });
      }
      appearance();
      const observer = new MutationObserver(appearance);
      observer.observe(document.documentElement, { attributes: true });
      // Async loading must not overwrite a draft changed while Monaco was loading.
      syncing = true;
      if (model.getValue() !== latest.current.value) model.setValue(latest.current.value);
      syncing = false;
      cleanup = () => { observer.disconnect(); subscription.dispose(); view.dispose(); model.dispose(); instance.current = null; };
    }).catch(failure => { if (!disposed) setError(String(failure)); });
    return () => { disposed = true; cleanup(); };
  }, []);
  useEffect(() => {
    const view = instance.current;
    if (view && view.getValue() !== value) view.setValue(value);
  }, [value]);
  useEffect(() => { instance.current?.updateOptions({ readOnly }); }, [readOnly]);
  return <div className={`python-code-editor ${className}`} ref={host} data-readonly={readOnly}>
    {error && <div role="alert">编辑器加载失败：{error}</div>}
  </div>;
}
