import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LibraryEvaluationService } from "../../../../../src/main/smart-library/evaluation/evaluation-service";
import { EVALUATION_DATASET_ID } from "../../../../../src/main/smart-library/evaluation/dataset";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
it("resolves only recorded question and evidence IDs, rejecting stale reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "library-eval-")); folders.push(root);
  const book = "a".repeat(64), version = "v1", source = "source";
  await mkdir(join(root, "evaluation", book), { recursive: true });
  await writeFile(join(root, "evaluation", book, "latest.json"), JSON.stringify({ state: "completed", report: { dataset:EVALUATION_DATASET_ID,book, version, source, rows: [{ id: "S011", gold: [{ id: "e1", span: { chapter: 2, start: 10, end: 15 } }], hits: [{ id: "h1", chapter: 3, start: 20, end: 30 }] }] } }));
  const service = new LibraryEvaluationService(root);
  expect(await service.reference(book, { version, question: "S011", kind: "gold", id: "e1" })).toEqual({ version, source, chapter: 2, start: 10, end: 15 });
  expect(await service.reference(book, { version, question: "S011", kind: "hit", id: "h1" })).toEqual({ version, source, chapter: 3, start: 20, end: 30 });
  await expect(service.reference(book, { version: "v0", question: "S011", kind: "gold", id: "e1" })).rejects.toThrow("报告已变化");
  await expect(service.reference(book, { version, question: "S011", kind: "gold", id: "fake" })).rejects.toThrow("标准证据不存在");
  await expect(service.reference(book, { version, question: "wrong", kind: "hit", id: "h1" })).rejects.toThrow("题目不存在");
});
it("retires old reports without silently relabelling or deleting their results",async()=>{
  const root=await mkdtemp(join(tmpdir(),"library-eval-"));folders.push(root);const book="b".repeat(64);
  await mkdir(join(root,"evaluation",book),{recursive:true});
  await writeFile(join(root,"evaluation",book,"latest.json"),JSON.stringify({state:"completed",total:245,completed:245,report:{dataset:"fanren-reviewed-v1",rows:[{id:"T001"}]}}));
  expect(await new LibraryEvaluationService(root).action(book,"status")).toMatchObject({state:"idle",total:0,notice:expect.stringContaining("旧题集已停用")});
});
it("derives legacy comparison character counts once without rewriting reports or treating missing data as zero", async () => {
  const root = await mkdtemp(join(tmpdir(), "library-eval-chars-")); folders.push(root);
  const book = "c".repeat(64), directory = join(root, "evaluation", book);
  await mkdir(join(directory, "runs"), { recursive: true });
  const runId = "00000000-0000-0000-0000-000000000001";
  const runs = [{ runId, datasetHash: "fixture" },
    { runId: "00000000-0000-0000-0000-000000000002", datasetHash: "fixture" },
    { runId: "00000000-0000-0000-0000-000000000003", datasetHash: "fixture", meanReturnedChars: 0 }];
  const manifest = JSON.stringify(runs), path = join(directory, "runs", `${runId}.json`);
  const report = JSON.stringify({ report: { book, runId, datasetHash: "fixture", rows: [
    { state: "completed", hits: [{ text: "甲乙" }, { text: "乙丙🐱" }] },
    { state: "completed", hits: [] }, { state: "failed", hits: [{ text: "失败片段" }] },
  ] } });
  await writeFile(join(directory, "runs.json"), manifest); await writeFile(path, report);
  const service = new LibraryEvaluationService(root);
  expect((await service.runs(book)).map(r => r.meanReturnedChars)).toEqual([3, undefined, 0]);
  expect(await readFile(path, "utf8")).toBe(report);
  expect(await readFile(join(directory, "runs.json"), "utf8")).toBe(manifest);
  await rm(path);
  expect((await service.runs(book))[0].meanReturnedChars).toBe(3); // No repeated full-report read on polling.
  expect((await new LibraryEvaluationService(root).runs(book))[0].meanReturnedChars).toBeUndefined();
});
