import Prism from "prismjs";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-json5";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-yaml";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "markup",
  html: "markup",
  java: "java",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  json5: "json5",
  jsonc: "json5",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  ps1: "powershell",
  py: "python",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: "bash",
  makefile: "bash",
};

export function languageForPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const filename = path.replaceAll("\\", "/").split("/").at(-1)?.toLocaleLowerCase() ?? "";
  const byFilename = LANGUAGE_BY_FILENAME[filename];
  if (byFilename) return byFilename;
  const extension = filename.includes(".") ? filename.split(".").at(-1) ?? "" : "";
  const language = LANGUAGE_BY_EXTENSION[extension];
  return language && Prism.languages[language] ? language : undefined;
}

export function highlightCode(code: string, path: string | undefined): string | undefined {
  const language = languageForPath(path);
  if (!language) return undefined;
  const grammar = Prism.languages[language];
  return grammar ? Prism.highlight(code, grammar, language) : undefined;
}
