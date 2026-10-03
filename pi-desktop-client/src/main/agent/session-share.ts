import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
export function parseGistUrl(output: string): string {
    const url = output.trim();
    if (!/^https:\/\/gist\.github\.com\/(?:[a-zA-Z0-9_-]+\/)?[a-f0-9]+$/.test(url))
        throw Error("GitHub CLI 未返回有效的 Gist 链接，请在 GitHub 核对上传结果后再重试");
    return url;
}
export async function shareSessionHtml(exportHtml: (path: string) => Promise<unknown>): Promise<string> {
    try {
        await exec("gh", ["auth", "status"], { windowsHide: true, timeout: 15000 });
    }
    catch {
        throw Error("请先安装 GitHub CLI，并在终端执行 gh auth login 登录后重试");
    }
    const directory = await mkdtemp(join(tmpdir(), "pi-desktop-share-"));
    try {
        const file = join(directory, "session.html");
        await exportHtml(file);
        const { stdout } = await exec("gh", ["gist", "create", "--desc", "Pi Desktop session", file], { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
        return parseGistUrl(stdout);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
}
