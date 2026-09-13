import { describe, expect, it } from "vitest";
import { ImageAttachmentStore } from "./image-attachments";

describe("ImageAttachmentStore.addData", () => {
  it("stores pasted image bytes and exposes a preview", () => {
    const store = new ImageAttachmentStore();
    const [attachment] = store.addData([{
      name: "clipboard.png",
      mimeType: "image/png",
      data: new Uint8Array([1, 2, 3]),
    }]);

    expect(attachment).toMatchObject({ name: "clipboard.png", mimeType: "image/png", size: 3 });
    expect(attachment?.previewDataUrl).toBe("data:image/png;base64,AQID");
    expect(store.resolve([attachment!.id])).toEqual([{ type: "image", mimeType: "image/png", data: "AQID" }]);
  });

  it("rejects unsupported pasted file types", () => {
    const store = new ImageAttachmentStore();
    expect(() => store.addData([{
      name: "note.txt",
      mimeType: "text/plain",
      data: new Uint8Array([1]),
    }])).toThrow("仅支持 JPG、PNG、GIF 和 WebP 图片");
  });
});
