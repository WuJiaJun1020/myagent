import { randomUUID } from "node:crypto";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BrowserWindow, session } from "electron";
import { assertPublicUrl } from "./document-parser";

const SNAPSHOT_TIMEOUT_MS = 25_000;
const MAX_SNAPSHOT_DIRECTORY_BYTES = 48 * 1_024 * 1_024;

async function directorySize(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(target);
    else if (entry.isFile()) total += (await stat(target)).size;
  }
  return total;
}

async function removeSnapshotFiles(path: string): Promise<void> {
  await Promise.all((await readdir(path, { withFileTypes: true })).map(async (entry) => {
    if (/^original(?:\.|$)/u.test(entry.name)) return;
    await rm(join(path, entry.name), { recursive: true, force: true });
  }));
}

function hardenSnapshotHtml(content: string): string {
  const guard = [
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; object-src \'none\'; frame-src \'none\'; connect-src \'none\'; form-action \'none\'; base-uri \'none\'; style-src \'self\' \'unsafe-inline\' data:; img-src \'self\' data: blob:; font-src \'self\' data:; media-src \'self\' data: blob:">',
    "<style>a,button,input,select,textarea,form{pointer-events:none!important}iframe,object,embed,script{display:none!important}</style>",
  ].join("");
  const safe = content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, "")
    .replace(/<script\b[^>]*\/?>/giu, "")
    .replace(/<(?:iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)\s*>/giu, "")
    .replace(/<(?:iframe|object|embed)\b[^>]*\/?>/giu, "")
    .replace(/<base\b[^>]*>/giu, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*(?:["']?content-security-policy["']?))[^>]*>/giu, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*(?:["']?refresh["']?))[^>]*>/giu, "");
  if (/<head\b[^>]*>/iu.test(safe)) return safe.replace(/<head\b[^>]*>/iu, (head) => `${head}${guard}`);
  if (/<html\b[^>]*>/iu.test(safe)) return safe.replace(/<html\b[^>]*>/iu, (html) => `${html}<head>${guard}</head>`);
  return `<!doctype html><html><head>${guard}</head><body>${safe}</body></html>`;
}

export async function captureWebPageSnapshot(url: string, targetPath: string): Promise<void> {
  const isolatedSession = session.fromPartition(`knowledge-snapshot-${randomUUID()}`, { cache: false });
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^(?:data|blob):/iu.test(details.url)) {
      callback({});
      return;
    }
    void assertPublicUrl(details.url).then(() => callback({})).catch(() => callback({ cancel: true }));
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
      session: isolatedSession,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("保存离线网页快照超时")), SNAPSHOT_TIMEOUT_MS).unref();
  });
  try {
    await Promise.race([window.loadURL(url), timeout]);
    await window.webContents.savePage(targetPath, "HTMLComplete");
    const snapshotDirectory = dirname(targetPath);
    if (await directorySize(snapshotDirectory) > MAX_SNAPSHOT_DIRECTORY_BYTES) {
      await removeSnapshotFiles(snapshotDirectory);
      throw new Error("离线网页快照超过 48 MB 限制");
    }
    const saved = await readFile(targetPath, "utf8");
    await writeFile(targetPath, hardenSnapshotHtml(saved), "utf8");
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}
