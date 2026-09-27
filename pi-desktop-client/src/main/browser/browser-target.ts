import { homedir } from "node:os";
import { extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function browserTarget(input: unknown, cwd: string): { kind: "web" | "file"; value: string } {
  if (typeof input !== "string" || !input.trim() || input.length > 8192) throw new Error("请输入网页地址或 HTML 文件路径");
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password) throw new Error("请使用不含用户名和密码的地址");
    return { kind: "web", value: url.href };
  }
  if (/^file:/i.test(value)) value = fileURLToPath(value);
  if (/^\/[a-z]:[\\/]/i.test(value)) value = value.slice(1);
  if (value.startsWith("~/") || value.startsWith("~\\")) value = resolve(homedir(), value.slice(2));
  if (/\.html?$/i.test(value)) {
    if (!isAbsolute(value) && /^[a-z][a-z\d+.-]*:/i.test(value)) throw new Error("不支持此地址协议");
    return { kind: "file", value: resolve(cwd, value) };
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#]|$)/i.test(value)) return browserTarget(`http://${value}`, cwd);
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || isAbsolute(value) || extname(value) === ".exe") throw new Error("仅支持 HTTP、HTTPS 和本地 HTML");
  if (/^[^\s/]+\.[a-z]{2,}([/:?#]|$)/i.test(value)) return browserTarget(`https://${value}`, cwd);
  throw new Error("请输入完整网页地址或 HTML 文件路径");
}
