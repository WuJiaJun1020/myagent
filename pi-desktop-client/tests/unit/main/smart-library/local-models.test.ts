import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LIBRARY_LOCAL_MODELS as defaults } from "../../../../src/shared/contracts/smart-library";
import { LibraryLocalModelService, localEndpoint } from "../../../../src/main/smart-library/local-models";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe("library local model probes", () => {
  it("allows only loopback endpoints and pins localhost", () => {
    expect(localEndpoint("http://localhost:11434/api/embed")).toBe("http://127.0.0.1:11434/api/embed");
    expect(localEndpoint("http://[::1]:18081/rerank")).toContain("[::1]");
    for (const address of ["https://example.com/rerank", "http://127.0.0.1.evil.test", "http://user:pass@localhost/", "file:///tmp/x", "http://localhost/?key=secret", "http://192.168.1.5/rerank"])
      expect(() => localEndpoint(address)).toThrow();
  });
  it("saves validated settings and restores them without losing serialized updates", async () => {
    const root = await mkdtemp(join(tmpdir(), "library-model-test-")); directories.push(root);
    const service = new LibraryLocalModelService(root);
    expect(await service.get()).toEqual(defaults);
    await Promise.all([service.save({ ...defaults, embeddingModel: "first" }), service.save({ ...defaults, embeddingModel: "second" })]);
    expect((await new LibraryLocalModelService(root).get()).embeddingModel).toBe("second");
    expect(JSON.parse(await readFile(join(root, "local-models.json"), "utf8"))).toHaveProperty("rerankerModel");
  });
  it("tests fixed texts, disables redirects and rejects malformed vectors", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [[1, 2], [2, 1]] })));
    const service = new LibraryLocalModelService("unused", request);
    expect((await service.probe("embedding", defaults)).dimensions).toBe(2);
    const options = request.mock.calls[0][1];
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body)).toMatchObject({ truncate: false, input: expect.any(Array) });
    for (const vectors of [[[1], [1, 2]], [[0], [0]], [["1"], ["2"]], [[1]]]) {
      request.mockResolvedValueOnce(new Response(JSON.stringify({ embeddings: vectors })));
      await expect(service.probe("embedding", defaults)).rejects.toThrow("向量响应无效");
    }
  });
  it("migrates the obsolete stage-0 preset but preserves custom services", async () => {
    const root = await mkdtemp(join(tmpdir(), "library-model-test-")); directories.push(root);
    const service = new LibraryLocalModelService(root);
    await service.save({ ...defaults, embeddingUrl: "http://127.0.0.1:11434/api/embed", embeddingModel: "qwen3-embedding:0.6b", rerankerModel: "Xenova/bge-reranker-base" });
    expect(await service.get()).toEqual(defaults);
    await service.save({ ...defaults, embeddingUrl: "http://127.0.0.1:19000/api/embed", embeddingModel: "qwen3-embedding:0.6b", rerankerModel: "Xenova/bge-reranker-base", rerankerUrl: "http://127.0.0.1:19000/rerank" });
    expect((await service.get()).rerankerModel).toBe("Xenova/bge-reranker-base");
    expect((await service.get()).embeddingModel).toBe("qwen3-embedding:0.6b");
  });
  it("validates reranker indices, scores and actual ordering", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.1 }, { index: 1, relevance_score: 0.9 }] })));
    const service = new LibraryLocalModelService("unused", request);
    expect((await service.probe("reranker", defaults)).ranking).toEqual([1, 0]);
    request.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.9 }, { index: 1, relevance_score: 0.1 }] })));
    expect((await service.probe("reranker", defaults)).summary).toContain("不符合预期");
    request.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.1 }, { index: 0, relevance_score: 0.9 }] })));
    await expect(service.probe("reranker", defaults)).rejects.toThrow("重排响应无效");
  });
  it("does not expose arbitrary service response bodies in errors", async () => {
    const service = new LibraryLocalModelService("unused", vi.fn().mockResolvedValue(new Response("PRIVATE SECRET", { status: 404 })));
    await expect(service.probe("embedding", defaults)).rejects.toThrow("HTTP 404");
  });
  it("uses the selected diagnostic case and handles multi-evidence, ties and no-answer cases", async () => {
    const request = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify({ results: body.documents.map((_text: string, index: number) => ({ index, relevance_score: 1 - index * 0.1 })) }));
    });
    const service = new LibraryLocalModelService("unused", request);
    const multi = await service.probe("reranker", defaults, "multi");
    expect(multi.matched).toBe(true);
    expect(multi.scores).toHaveLength(3);
    expect(JSON.parse(request.mock.calls[0][1].body).query).toContain("陈渡");
    expect((await service.probe("reranker", defaults, "absent")).matched).toBeUndefined();
    request.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ index: 1, relevance_score: 0.5 }, { index: 0, relevance_score: 0.5 }] })));
    expect((await service.probe("reranker", defaults)).matched).toBe(false);
    await expect(service.probe("reranker", defaults, "unknown")).rejects.toThrow("未知测试案例");
  });
  it("aborts active requests on disposal and prevents overlapping tests", async () => {
    const request = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Error("abort")))));
    const service = new LibraryLocalModelService("unused", request as typeof fetch);
    const active = service.probe("embedding", defaults);
    const rejection = expect(active).rejects.toThrow("中断");
    await expect(service.probe("reranker", defaults)).rejects.toThrow("已有模型测试");
    await service.dispose(); await rejection;
  });
});
