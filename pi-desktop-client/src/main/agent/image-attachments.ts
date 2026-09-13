import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import type { ImageAttachment } from "../../shared/contracts/agent-session";

type ImageMimeType = ImageAttachment["mimeType"];

type StoredImageAttachment = Omit<ImageAttachment, "previewDataUrl"> & {
  data: string;
};

const MAX_ATTACHMENTS = 4;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const mimeTypesByExtension: Record<string, ImageMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function mimeTypeForPath(path: string): ImageMimeType | undefined {
  return mimeTypesByExtension[extname(path).toLowerCase()];
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.at(-1) || "image";
}

export class ImageAttachmentStore {
  private readonly attachments = new Map<string, StoredImageAttachment>();

  async addFiles(paths: string[], maxAttachments = MAX_ATTACHMENTS): Promise<ImageAttachment[]> {
    if (paths.length === 0) return [];
    if (paths.length > maxAttachments) throw new Error(`本次最多还能选择 ${maxAttachments} 张图片`);

    const metadata = await Promise.all(paths.map(async (path) => {
      const mimeType = mimeTypeForPath(path);
      if (!mimeType) throw new Error("仅支持 JPG、PNG、GIF 和 WebP 图片");
      const fileStat = await stat(path);
      if (!fileStat.isFile()) throw new Error("附件必须是本地图片文件");
      if (fileStat.size > MAX_FILE_BYTES) throw new Error(`单张图片不能超过 ${MAX_FILE_BYTES / 1024 / 1024} MB`);
      return { path, mimeType, size: fileStat.size };
    }));

    const totalBytes = metadata.reduce((total, item) => total + item.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`图片总大小不能超过 ${MAX_TOTAL_BYTES / 1024 / 1024} MB`);

    const created: ImageAttachment[] = [];
    for (const item of metadata) {
      const data = (await readFile(item.path)).toString("base64");
      const id = randomUUID();
      const stored: StoredImageAttachment = {
        id,
        name: fileName(item.path),
        mimeType: item.mimeType,
        size: item.size,
        data,
      };
      this.attachments.set(id, stored);
      created.push({
        id: stored.id,
        name: stored.name,
        mimeType: stored.mimeType,
        size: stored.size,
        previewDataUrl: `data:${stored.mimeType};base64,${stored.data}`,
      });
    }
    return created;
  }

  addData(
    items: Array<{ name: string; mimeType: string; data: Uint8Array }>,
    maxAttachments = MAX_ATTACHMENTS,
  ): ImageAttachment[] {
    if (items.length === 0) return [];
    if (items.length > maxAttachments) throw new Error(`本次最多还能添加 ${maxAttachments} 张图片`);

    const allowedMimeTypes = new Set<ImageMimeType>(Object.values(mimeTypesByExtension));
    const normalized = items.map((item) => {
      if (!allowedMimeTypes.has(item.mimeType as ImageMimeType)) throw new Error("仅支持 JPG、PNG、GIF 和 WebP 图片");
      const data = Buffer.from(item.data);
      if (data.byteLength === 0) throw new Error("图片附件为空");
      if (data.byteLength > MAX_FILE_BYTES) throw new Error(`单张图片不能超过 ${MAX_FILE_BYTES / 1024 / 1024} MB`);
      return {
        name: item.name.replace(/[\\/\r\n]/g, "_").slice(0, 160) || "pasted-image",
        mimeType: item.mimeType as ImageMimeType,
        data,
      };
    });
    const totalBytes = normalized.reduce((total, item) => total + item.data.byteLength, 0);
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`图片总大小不能超过 ${MAX_TOTAL_BYTES / 1024 / 1024} MB`);

    return normalized.map((item) => {
      const id = randomUUID();
      const data = item.data.toString("base64");
      const stored: StoredImageAttachment = {
        id,
        name: item.name,
        mimeType: item.mimeType,
        size: item.data.byteLength,
        data,
      };
      this.attachments.set(id, stored);
      return {
        id,
        name: stored.name,
        mimeType: stored.mimeType,
        size: stored.size,
        previewDataUrl: `data:${stored.mimeType};base64,${stored.data}`,
      };
    });
  }

  resolve(ids: string[]): Array<{ type: "image"; data: string; mimeType: ImageMimeType }> {
    if (ids.length > MAX_ATTACHMENTS) throw new Error(`一次最多发送 ${MAX_ATTACHMENTS} 张图片`);
    const seen = new Set<string>();
    return ids.map((id) => {
      if (typeof id !== "string" || !id || seen.has(id)) throw new Error("图片附件无效");
      seen.add(id);
      const attachment = this.attachments.get(id);
      if (!attachment) throw new Error("图片附件已失效，请重新选择");
      return { type: "image", data: attachment.data, mimeType: attachment.mimeType };
    });
  }

  release(ids: string[]): void {
    for (const id of ids) this.attachments.delete(id);
  }
}
