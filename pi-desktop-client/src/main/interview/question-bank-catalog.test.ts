import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  INTERVIEW_QUESTION_DIFFICULTIES,
  INTERVIEW_QUESTION_KINDS,
} from "../../shared/contracts/interview";
import {
  QUESTION_BANK_SOURCE_TYPES,
  QUESTION_BANK_STATUSES,
} from "../../shared/contracts/interview-question-bank";
import {
  QUESTION_DIFFICULTIES,
  QUESTION_KINDS,
  QUESTION_SOURCE_KINDS,
  QUESTION_STATUSES,
  getQuestionRevisionIdentity,
  loadQuestionBankCatalog,
  parseQuestionBankManifest,
  parseQuestionBankPack,
  parseQuestionBankPackJson,
  type QuestionBankPack,
} from "./question-bank-catalog";

const catalogRoot = resolve(process.cwd(), "resources", "interview-question-bank");
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-question-bank-catalog-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function readRawPack(name = "python-backend.zh-CN.json"): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(catalogRoot, "packs", name), "utf8")) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("question bank catalog", () => {
  it("keeps parser enums aligned with public interview contracts", () => {
    expect(QUESTION_DIFFICULTIES).toEqual(INTERVIEW_QUESTION_DIFFICULTIES);
    expect(QUESTION_KINDS).toEqual(INTERVIEW_QUESTION_KINDS);
    expect(QUESTION_STATUSES).toEqual(QUESTION_BANK_STATUSES);
    expect(QUESTION_SOURCE_KINDS).toEqual(QUESTION_BANK_SOURCE_TYPES);
  });

  it("loads and verifies the four built-in packs", async () => {
    const catalog = await loadQuestionBankCatalog(catalogRoot);

    expect(catalog.manifest.catalogVersion).toBe("1.0.0");
    expect(catalog.packs).toHaveLength(4);
    expect(catalog.questions).toHaveLength(40);
    expect(new Set(catalog.questions.map((question) => question.stableKey)).size).toBe(40);
    expect(new Set(catalog.questions.map((question) => question.source.locator)).size).toBe(40);
    expect(catalog.questions.every((question) => question.status === "published")).toBe(true);
    expect(catalog.questions.every((question) => question.rubric.reduce((sum, item) => sum + item.weight, 0) === 100)).toBe(true);
    expect(catalog.questions.some((question) => question.roles.includes("python-backend"))).toBe(true);
    expect(catalog.questions.some((question) => question.roles.includes("ai-application"))).toBe(true);
    expect(catalog.questions.some((question) => question.roles.includes("agent-engineer"))).toBe(true);
    expect(catalog.questions.some((question) => question.roles.includes("general-engineering"))).toBe(true);
    expect(catalog.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("derives deterministic semantic hashes and revision identities", async () => {
    const text = await readFile(resolve(catalogRoot, "packs", "python-backend.zh-CN.json"), "utf8");
    const first = parseQuestionBankPackJson(text, "first.json");
    const reorderedText = JSON.stringify(JSON.parse(text) as unknown, null, 4);
    const second = parseQuestionBankPackJson(reorderedText, "second.json");

    expect(second.contentHash).toBe(first.contentHash);
    expect(second.questions[0]?.contentHash).toBe(first.questions[0]?.contentHash);
    expect(first.questions[0]?.revisionIdentity).toBe(getQuestionRevisionIdentity(first.questions[0]!));
    expect(new Set(first.questions.map((question) => question.revisionIdentity)).size).toBe(first.questions.length);
  });

  it("rejects unknown fields instead of silently dropping imported content", async () => {
    const raw = await readRawPack();
    const questions = raw.questions as Array<Record<string, unknown>>;
    questions[0] = { ...questions[0], accidentalField: "must fail" };

    expect(() => parseQuestionBankPack(raw, "unknown-field.json")).toThrow(/未知字段/u);
  });

  it("rejects duplicate stable keys and malformed scoring weights", async () => {
    const duplicate = await readRawPack();
    const duplicateQuestions = duplicate.questions as Array<Record<string, unknown>>;
    duplicateQuestions[1] = { ...duplicateQuestions[1], stableKey: duplicateQuestions[0]?.stableKey };
    expect(() => parseQuestionBankPack(duplicate, "duplicate.json")).toThrow(/stableKey 重复/u);

    const malformed = await readRawPack();
    const malformedQuestions = malformed.questions as Array<Record<string, unknown>>;
    const rubric = malformedQuestions[0]?.rubric as Array<Record<string, unknown>>;
    rubric[0] = { ...rubric[0], weight: 39 };
    expect(() => parseQuestionBankPack(malformed, "weights.json")).toThrow(/权重之和必须为 100/u);
  });

  it("accepts future web, file, manual, and generated provenance through the same parser", async () => {
    const raw = await readRawPack();
    const questions = raw.questions as Array<Record<string, unknown>>;
    const kinds = ["web", "file", "manual", "generated"] as const;
    for (const [index, kind] of kinds.entries()) {
      const question = questions[index]!;
      question.source = {
        kind,
        locator: kind === "web" ? `https://example.com/questions/${index}` : `${kind}://import/${index}`,
        title: `${kind} import`,
      };
    }

    const parsed = parseQuestionBankPack(raw, "imported-pack.json");
    expect(parsed.questions.slice(0, 4).map((question) => question.source.kind)).toEqual(kinds);
  });

  it("rejects unsafe manifest paths", () => {
    expect(() => parseQuestionBankManifest({
      schemaVersion: 1,
      catalogId: "unsafe.catalog",
      catalogVersion: "1.0.0",
      locale: "zh-CN",
      title: "Unsafe",
      packs: [{
        id: "unsafe.pack",
        version: "1.0.0",
        file: "../outside.json",
        contentHash: "0".repeat(64),
      }],
    })).toThrow(/安全相对路径/u);
  });

  it("detects a manifest content-hash mismatch before import", async () => {
    const directory = await temporaryDirectory();
    const packsDirectory = join(directory, "packs");
    await mkdir(packsDirectory, { recursive: true });
    const rawText = await readFile(resolve(catalogRoot, "packs", "python-backend.zh-CN.json"), "utf8");
    const parsed = parseQuestionBankPackJson(rawText);
    const manifest = {
      schemaVersion: 1,
      catalogId: "test.catalog",
      catalogVersion: "1.0.0",
      locale: "zh-CN",
      title: "Test catalog",
      packs: [{
        id: parsed.pack.id,
        version: parsed.pack.version,
        file: "packs/python.json",
        contentHash: "0".repeat(64),
      }],
    };
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
    await writeFile(join(packsDirectory, "python.json"), rawText, "utf8");

    await expect(loadQuestionBankCatalog(directory)).rejects.toThrow(/内容哈希与清单不一致/u);
  });

  it("makes a repeated catalog load idempotent at the package boundary", async () => {
    const first = await loadQuestionBankCatalog(catalogRoot);
    const second = await loadQuestionBankCatalog(catalogRoot);
    const project = (catalog: Awaited<ReturnType<typeof loadQuestionBankCatalog>>): Array<{
      id: string;
      version: string;
      hash: string;
      revisions: string[];
    }> => catalog.packs.map((pack: QuestionBankPack) => ({
      id: pack.pack.id,
      version: pack.pack.version,
      hash: pack.contentHash,
      revisions: pack.questions.map((question) => question.revisionIdentity),
    }));

    expect(project(second)).toEqual(project(first));
  });
});
