import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const QUESTION_BANK_SCHEMA_VERSION = 1 as const;

export const QUESTION_KINDS = ["technical", "project", "behavioral", "scenario"] as const;
export const QUESTION_DIFFICULTIES = ["introductory", "intermediate", "advanced"] as const;
export const QUESTION_STATUSES = ["draft", "reviewing", "published", "deprecated"] as const;
export const QUESTION_SOURCE_KINDS = ["builtin", "file", "web", "manual", "generated"] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type QuestionSourceKind = (typeof QUESTION_SOURCE_KINDS)[number];

export type QuestionSource = {
  kind: QuestionSourceKind;
  locator: string;
  title?: string;
  publishedAt?: string;
  license?: string;
};

export type QuestionRubricItem = {
  id: string;
  label: string;
  description: string;
  weight: number;
  critical: boolean;
};

export type QuestionFollowup = {
  prompt: string;
  trigger: string;
};

export type QuestionBankQuestion = {
  stableKey: string;
  version: number;
  status: QuestionStatus;
  title: string;
  prompt: string;
  intent: string;
  kind: QuestionKind;
  subtype: string;
  difficulty: QuestionDifficulty;
  roles: string[];
  seniority: string[];
  competencies: string[];
  skills: string[];
  estimatedSeconds: number;
  answerOutline: string[];
  rubric: QuestionRubricItem[];
  commonMistakes: string[];
  followUps: QuestionFollowup[];
  source: QuestionSource;
  /** SHA-256 of the canonical question payload. It is derived, never trusted from input. */
  contentHash: string;
  /** Stable revision identity used by importers for idempotent upserts. */
  revisionIdentity: string;
};

export type QuestionBankPackMetadata = {
  id: string;
  version: string;
  locale: string;
  title: string;
  description: string;
  source: QuestionSource;
};

export type QuestionBankPack = {
  schemaVersion: typeof QUESTION_BANK_SCHEMA_VERSION;
  pack: QuestionBankPackMetadata;
  questions: QuestionBankQuestion[];
  /** SHA-256 of the canonical pack payload, excluding derived question fields. */
  contentHash: string;
};

export type QuestionBankManifestPack = {
  id: string;
  version: string;
  file: string;
  contentHash: string;
};

export type QuestionBankManifest = {
  schemaVersion: typeof QUESTION_BANK_SCHEMA_VERSION;
  catalogId: string;
  catalogVersion: string;
  locale: string;
  title: string;
  packs: QuestionBankManifestPack[];
};

export type LoadedQuestionBankCatalog = {
  rootDirectory: string;
  manifest: QuestionBankManifest;
  packs: QuestionBankPack[];
  questions: QuestionBankQuestion[];
  contentHash: string;
};

type JsonRecord = Record<string, unknown>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/u;

export class QuestionBankCatalogError extends Error {
  readonly location: string;

  constructor(location: string, message: string) {
    super(`${location}: ${message}`);
    this.name = "QuestionBankCatalogError";
    this.location = location;
  }
}

function fail(location: string, message: string): never {
  throw new QuestionBankCatalogError(location, message);
}

function record(value: unknown, location: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(location, "应为对象");
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, allowed: readonly string[], location: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) fail(location, `包含未知字段：${unknown.join("、")}`);
}

function stringValue(
  value: unknown,
  location: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): string {
  if (typeof value !== "string") fail(location, "应为字符串");
  if (value !== value.trim()) fail(location, "首尾不能包含空白字符");
  const min = options.min ?? 1;
  const max = options.max ?? 4_000;
  if (value.length < min || value.length > max) fail(location, `长度应在 ${min} 到 ${max} 之间`);
  if (options.pattern && !options.pattern.test(value)) fail(location, "格式不正确");
  return value;
}

function optionalString(
  value: unknown,
  location: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): string | undefined {
  return value === undefined ? undefined : stringValue(value, location, options);
}

function numberValue(
  value: unknown,
  location: string,
  options: { integer?: boolean; min?: number; max?: number } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(location, "应为有限数字");
  if (options.integer && !Number.isInteger(value)) fail(location, "应为整数");
  if (options.min !== undefined && value < options.min) fail(location, `不能小于 ${options.min}`);
  if (options.max !== undefined && value > options.max) fail(location, `不能大于 ${options.max}`);
  return value;
}

function booleanValue(value: unknown, location: string): boolean {
  if (typeof value !== "boolean") fail(location, "应为布尔值");
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, location: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(location, `应为 ${allowed.join("、")} 之一`);
  }
  return value as T[number];
}

function arrayValue(value: unknown, location: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value)) fail(location, "应为数组");
  if (value.length < min || value.length > max) fail(location, `元素数量应在 ${min} 到 ${max} 之间`);
  return value;
}

function uniqueStrings(
  value: unknown,
  location: string,
  options: { min: number; max: number; itemMax?: number; pattern?: RegExp },
): string[] {
  const result = arrayValue(value, location, options.min, options.max).map((item, index) =>
    stringValue(item, `${location}[${index}]`, { max: options.itemMax ?? 80, pattern: options.pattern }),
  );
  if (new Set(result).size !== result.length) fail(location, "不能包含重复项");
  return result;
}

function parseSource(value: unknown, location: string): QuestionSource {
  const input = record(value, location);
  exactKeys(input, ["kind", "locator", "title", "publishedAt", "license"], location);
  const kind = enumValue(input.kind, QUESTION_SOURCE_KINDS, `${location}.kind`);
  const locator = stringValue(input.locator, `${location}.locator`, { max: 2_048 });
  if (kind === "web") {
    let url: URL;
    try {
      url = new URL(locator);
    } catch {
      fail(`${location}.locator`, "网页来源必须是有效 URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      fail(`${location}.locator`, "网页来源只允许 http 或 https");
    }
  }
  if (kind === "builtin" && !locator.startsWith("builtin://")) {
    fail(`${location}.locator`, "内置来源必须使用 builtin:// 定位符");
  }
  return {
    kind,
    locator,
    title: optionalString(input.title, `${location}.title`, { max: 240 }),
    publishedAt: optionalString(input.publishedAt, `${location}.publishedAt`, { pattern: ISO_DATE_PATTERN }),
    license: optionalString(input.license, `${location}.license`, { max: 160 }),
  };
}

function parseRubric(value: unknown, location: string): QuestionRubricItem[] {
  const ids = new Set<string>();
  const result = arrayValue(value, location, 2, 8).map((item, index) => {
    const itemLocation = `${location}[${index}]`;
    const input = record(item, itemLocation);
    exactKeys(input, ["id", "label", "description", "weight", "critical"], itemLocation);
    const id = stringValue(input.id, `${itemLocation}.id`, { max: 60, pattern: ID_PATTERN });
    if (ids.has(id)) fail(`${itemLocation}.id`, "评分点 ID 重复");
    ids.add(id);
    return {
      id,
      label: stringValue(input.label, `${itemLocation}.label`, { min: 2, max: 120 }),
      description: stringValue(input.description, `${itemLocation}.description`, { min: 4, max: 500 }),
      weight: numberValue(input.weight, `${itemLocation}.weight`, { integer: true, min: 1, max: 100 }),
      critical: booleanValue(input.critical, `${itemLocation}.critical`),
    };
  });
  const totalWeight = result.reduce((total, item) => total + item.weight, 0);
  if (totalWeight !== 100) fail(location, `评分权重之和必须为 100，当前为 ${totalWeight}`);
  return result;
}

function parseFollowups(value: unknown, location: string): QuestionFollowup[] {
  return arrayValue(value, location, 1, 6).map((item, index) => {
    const itemLocation = `${location}[${index}]`;
    const input = record(item, itemLocation);
    exactKeys(input, ["prompt", "trigger"], itemLocation);
    return {
      prompt: stringValue(input.prompt, `${itemLocation}.prompt`, { min: 4, max: 600 }),
      trigger: stringValue(input.trigger, `${itemLocation}.trigger`, { min: 2, max: 300 }),
    };
  });
}

function parseQuestionPayload(value: unknown, location: string): Omit<QuestionBankQuestion, "contentHash" | "revisionIdentity"> {
  const input = record(value, location);
  exactKeys(input, [
    "stableKey", "version", "status", "title", "prompt", "intent", "kind", "subtype", "difficulty",
    "roles", "seniority", "competencies", "skills", "estimatedSeconds", "answerOutline", "rubric",
    "commonMistakes", "followUps", "source",
  ], location);
  return {
    stableKey: stringValue(input.stableKey, `${location}.stableKey`, { max: 120, pattern: ID_PATTERN }),
    version: numberValue(input.version, `${location}.version`, { integer: true, min: 1, max: 1_000_000 }),
    status: enumValue(input.status, QUESTION_STATUSES, `${location}.status`),
    title: stringValue(input.title, `${location}.title`, { min: 4, max: 160 }),
    prompt: stringValue(input.prompt, `${location}.prompt`, { min: 10, max: 4_000 }),
    intent: stringValue(input.intent, `${location}.intent`, { min: 8, max: 1_000 }),
    kind: enumValue(input.kind, QUESTION_KINDS, `${location}.kind`),
    subtype: stringValue(input.subtype, `${location}.subtype`, { max: 60, pattern: ID_PATTERN }),
    difficulty: enumValue(input.difficulty, QUESTION_DIFFICULTIES, `${location}.difficulty`),
    roles: uniqueStrings(input.roles, `${location}.roles`, { min: 1, max: 12, pattern: ID_PATTERN }),
    seniority: uniqueStrings(input.seniority, `${location}.seniority`, { min: 1, max: 6, pattern: ID_PATTERN }),
    competencies: uniqueStrings(input.competencies, `${location}.competencies`, { min: 1, max: 12, pattern: ID_PATTERN }),
    skills: uniqueStrings(input.skills, `${location}.skills`, { min: 1, max: 20, pattern: ID_PATTERN }),
    estimatedSeconds: numberValue(input.estimatedSeconds, `${location}.estimatedSeconds`, {
      integer: true,
      min: 30,
      max: 1_800,
    }),
    answerOutline: uniqueStrings(input.answerOutline, `${location}.answerOutline`, { min: 2, max: 12, itemMax: 800 }),
    rubric: parseRubric(input.rubric, `${location}.rubric`),
    commonMistakes: uniqueStrings(input.commonMistakes, `${location}.commonMistakes`, { min: 1, max: 10, itemMax: 500 }),
    followUps: parseFollowups(input.followUps, `${location}.followUps`),
    source: parseSource(input.source, `${location}.source`),
  };
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const input = value as JsonRecord;
  return `{${Object.keys(input)
    .filter((key) => input[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(input[key])}`)
    .join(",")}}`;
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function questionPayload(question: QuestionBankQuestion): Omit<QuestionBankQuestion, "contentHash" | "revisionIdentity"> {
  const { contentHash: _contentHash, revisionIdentity: _revisionIdentity, ...payload } = question;
  return payload;
}

export function getQuestionRevisionIdentity(
  question: Pick<QuestionBankQuestion, "stableKey" | "version" | "contentHash">,
): string {
  return `${question.stableKey}@${question.version}:${question.contentHash}`;
}

export function parseQuestionBankPack(value: unknown, sourceName = "question-bank-pack"): QuestionBankPack {
  const input = record(value, sourceName);
  exactKeys(input, ["schemaVersion", "pack", "questions"], sourceName);
  if (input.schemaVersion !== QUESTION_BANK_SCHEMA_VERSION) {
    fail(`${sourceName}.schemaVersion`, `仅支持版本 ${QUESTION_BANK_SCHEMA_VERSION}`);
  }
  const packInput = record(input.pack, `${sourceName}.pack`);
  exactKeys(packInput, ["id", "version", "locale", "title", "description", "source"], `${sourceName}.pack`);
  const pack: QuestionBankPackMetadata = {
    id: stringValue(packInput.id, `${sourceName}.pack.id`, { max: 100, pattern: ID_PATTERN }),
    version: stringValue(packInput.version, `${sourceName}.pack.version`, { max: 80, pattern: VERSION_PATTERN }),
    locale: stringValue(packInput.locale, `${sourceName}.pack.locale`, { max: 20, pattern: LOCALE_PATTERN }),
    title: stringValue(packInput.title, `${sourceName}.pack.title`, { min: 2, max: 160 }),
    description: stringValue(packInput.description, `${sourceName}.pack.description`, { min: 8, max: 1_000 }),
    source: parseSource(packInput.source, `${sourceName}.pack.source`),
  };
  const stableKeys = new Set<string>();
  const locators = new Set<string>();
  const rawQuestions = arrayValue(input.questions, `${sourceName}.questions`, 1, 5_000);
  const questions = rawQuestions.map((item, index) => {
    const location = `${sourceName}.questions[${index}]`;
    const payload = parseQuestionPayload(item, location);
    if (stableKeys.has(payload.stableKey)) fail(`${location}.stableKey`, "数据包内 stableKey 重复");
    if (locators.has(payload.source.locator)) fail(`${location}.source.locator`, "数据包内来源定位符重复");
    stableKeys.add(payload.stableKey);
    locators.add(payload.source.locator);
    const contentHash = sha256Canonical(payload);
    return {
      ...payload,
      contentHash,
      revisionIdentity: getQuestionRevisionIdentity({ ...payload, contentHash }),
    };
  });
  const contentHash = sha256Canonical({
    schemaVersion: QUESTION_BANK_SCHEMA_VERSION,
    pack,
    questions: questions.map(questionPayload),
  });
  return { schemaVersion: QUESTION_BANK_SCHEMA_VERSION, pack, questions, contentHash };
}

export function parseQuestionBankPackJson(text: string, sourceName = "question-bank-pack.json"): QuestionBankPack {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    fail(sourceName, `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return parseQuestionBankPack(value, sourceName);
}

export function parseQuestionBankManifest(value: unknown, sourceName = "manifest.json"): QuestionBankManifest {
  const input = record(value, sourceName);
  exactKeys(input, ["schemaVersion", "catalogId", "catalogVersion", "locale", "title", "packs"], sourceName);
  if (input.schemaVersion !== QUESTION_BANK_SCHEMA_VERSION) {
    fail(`${sourceName}.schemaVersion`, `仅支持版本 ${QUESTION_BANK_SCHEMA_VERSION}`);
  }
  const ids = new Set<string>();
  const files = new Set<string>();
  const packs = arrayValue(input.packs, `${sourceName}.packs`, 1, 200).map((item, index) => {
    const location = `${sourceName}.packs[${index}]`;
    const pack = record(item, location);
    exactKeys(pack, ["id", "version", "file", "contentHash"], location);
    const id = stringValue(pack.id, `${location}.id`, { max: 100, pattern: ID_PATTERN });
    const file = stringValue(pack.file, `${location}.file`, { max: 240 });
    if (isAbsolute(file) || file.includes("\\") || file.split("/").some((part) => part === ".." || part === "")) {
      fail(`${location}.file`, "必须是数据包目录内的安全相对路径，并使用 / 分隔");
    }
    if (!file.endsWith(".json")) fail(`${location}.file`, "必须指向 .json 文件");
    if (ids.has(id)) fail(`${location}.id`, "数据包 ID 重复");
    if (files.has(file)) fail(`${location}.file`, "数据包文件重复");
    ids.add(id);
    files.add(file);
    return {
      id,
      version: stringValue(pack.version, `${location}.version`, { max: 80, pattern: VERSION_PATTERN }),
      file,
      contentHash: stringValue(pack.contentHash, `${location}.contentHash`, { min: 64, max: 64, pattern: SHA256_PATTERN }),
    };
  });
  return {
    schemaVersion: QUESTION_BANK_SCHEMA_VERSION,
    catalogId: stringValue(input.catalogId, `${sourceName}.catalogId`, { max: 100, pattern: ID_PATTERN }),
    catalogVersion: stringValue(input.catalogVersion, `${sourceName}.catalogVersion`, { max: 80, pattern: VERSION_PATTERN }),
    locale: stringValue(input.locale, `${sourceName}.locale`, { max: 20, pattern: LOCALE_PATTERN }),
    title: stringValue(input.title, `${sourceName}.title`, { min: 2, max: 160 }),
    packs,
  };
}

export function parseQuestionBankManifestJson(text: string, sourceName = "manifest.json"): QuestionBankManifest {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    fail(sourceName, `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return parseQuestionBankManifest(value, sourceName);
}

function resolvePackPath(rootDirectory: string, file: string): string {
  const root = resolve(rootDirectory);
  const candidate = resolve(root, file);
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === "" || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    fail("manifest.packs.file", "数据包文件越出了题库根目录");
  }
  return candidate;
}

/**
 * Loads a versioned catalog and verifies every semantic content hash. The result is deterministic:
 * importing the same stableKey/version/contentHash again yields the same revisionIdentity.
 */
export async function loadQuestionBankCatalog(rootDirectory: string): Promise<LoadedQuestionBankCatalog> {
  const absoluteRoot = resolve(rootDirectory);
  const manifestPath = resolve(absoluteRoot, "manifest.json");
  const manifest = parseQuestionBankManifestJson(await readFile(manifestPath, "utf8"), manifestPath);
  const packs: QuestionBankPack[] = [];
  const revisionByStableKey = new Map<string, QuestionBankQuestion>();
  const sourceLocators = new Set<string>();

  for (const reference of manifest.packs) {
    const packPath = resolvePackPath(absoluteRoot, reference.file);
    const pack = parseQuestionBankPackJson(await readFile(packPath, "utf8"), packPath);
    if (pack.pack.id !== reference.id) fail(packPath, `数据包 ID ${pack.pack.id} 与清单 ${reference.id} 不一致`);
    if (pack.pack.version !== reference.version) fail(packPath, `数据包版本 ${pack.pack.version} 与清单 ${reference.version} 不一致`);
    if (pack.pack.locale !== manifest.locale) fail(packPath, `数据包语言 ${pack.pack.locale} 与清单 ${manifest.locale} 不一致`);
    if (pack.contentHash !== reference.contentHash) fail(packPath, "内容哈希与清单不一致，数据包可能损坏或清单未更新");
    for (const question of pack.questions) {
      const previous = revisionByStableKey.get(question.stableKey);
      if (previous) {
        fail(packPath, `stableKey ${question.stableKey} 已由 ${previous.source.locator} 定义`);
      }
      if (sourceLocators.has(question.source.locator)) {
        fail(packPath, `来源定位符 ${question.source.locator} 在目录中重复`);
      }
      revisionByStableKey.set(question.stableKey, question);
      sourceLocators.add(question.source.locator);
    }
    packs.push(pack);
  }

  const questions = [...revisionByStableKey.values()];
  const contentHash = sha256Canonical({
    schemaVersion: manifest.schemaVersion,
    catalogId: manifest.catalogId,
    catalogVersion: manifest.catalogVersion,
    locale: manifest.locale,
    packs: manifest.packs.map(({ id, version, contentHash: packHash }) => ({ id, version, contentHash: packHash })),
  });
  return { rootDirectory: absoluteRoot, manifest, packs, questions, contentHash };
}

/** Resolves the built-in catalog in development and packaged Electron layouts. */
export function resolveBuiltinQuestionBankDirectory(options: {
  appPath: string;
  resourcesPath?: string;
  packaged: boolean;
}): string {
  return options.packaged
    ? resolve(options.resourcesPath ?? dirname(options.appPath), "interview-question-bank")
    : resolve(options.appPath, "resources", "interview-question-bank");
}
