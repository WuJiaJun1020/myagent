import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
  return path;
}

/** Resolve a user-requested terminal directory without exposing filesystem reads to Renderer. */
export async function resolveTerminalDirectory(baseDirectory: unknown, targetDirectory: unknown): Promise<string> {
  if (typeof baseDirectory !== "string" || !baseDirectory.trim()) throw new Error("当前终端路径无效");
  if (typeof targetDirectory !== "string") throw new Error("目录参数无效");
  const target = expandHome(targetDirectory.trim() || "~");
  const candidate = isAbsolute(target) ? target : resolve(baseDirectory, target);
  const resolved = await realpath(candidate);
  const metadata = await stat(resolved);
  if (!metadata.isDirectory()) throw new Error("目标不是目录");
  return resolved;
}
