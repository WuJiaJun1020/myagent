/// <reference types="vite/client" />
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/python/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker&inline";

// Bundle the worker locally, including file:// desktop builds. No CDN dependency.
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.languages.registerCompletionItemProvider("python", {
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
    return { suggestions: ["range", "len", "enumerate", "zip", "sorted", "sum", "min", "max", "abs", "print", "input", "int", "str", "list", "dict", "set", "tuple", "isinstance", "reversed", "any", "all"]
      .map(label => ({ label, kind: monaco.languages.CompletionItemKind.Function, insertText: label, range, detail: "Python built-in" })) };
  },
});

export { monaco };
