import { readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type {
  AlgorithmCategory,
  AlgorithmDifficulty,
  AlgorithmMode,
  AlgorithmProblemDetail,
  AlgorithmProblemExample,
  AlgorithmProblemSummary,
  AlgorithmReferenceAnswer,
} from "../../shared/contracts/algorithm-practice";

const SAFE_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SAFE_ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DIFFICULTIES = new Set<AlgorithmDifficulty>(["easy", "medium", "hard"]);
const MODES = new Set<AlgorithmMode>(["leetcode", "acm"]);

type CatalogProblem = Omit<AlgorithmProblemDetail, "drafts" | "progress">;

type CatalogDocument = {
  version: number;
  collection: { id: string; title: string; description: string };
  categories: AlgorithmCategory[];
  problems: Array<Omit<AlgorithmProblemSummary, "progress">>;
  details: Record<string, CatalogProblem>;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`算法题库 ${label} 格式无效`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`算法题库 ${label} 必须是字符串`);
  }
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`算法题库 ${label} 格式无效`);
  }
  return [...value];
}

function parseSummary(value: unknown, label: string): Omit<AlgorithmProblemSummary, "progress"> {
  const row = object(value, label);
  const id = row.id;
  const slug = text(row.slug, `${label}.slug`);
  const difficulty = text(row.difficulty, `${label}.difficulty`) as AlgorithmDifficulty;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) throw new Error(`算法题库 ${label}.id 无效`);
  if (!SAFE_SLUG.test(slug)) throw new Error(`算法题库 slug 不安全: ${slug}`);
  if (!DIFFICULTIES.has(difficulty)) throw new Error(`算法题库难度无效: ${difficulty}`);
  return {
    id: Number(id),
    slug,
    title: text(row.title, `${label}.title`),
    difficulty,
    category: text(row.category, `${label}.category`),
    tags: stringArray(row.tags, `${label}.tags`),
  };
}

function parseExamples(value: unknown, label: string): AlgorithmProblemExample[] {
  if (!Array.isArray(value)) throw new Error(`算法题库 ${label} 格式无效`);
  return value.map((entry, index) => {
    const row = object(entry, `${label}[${index}]`);
    const imageFile = row.imageFile;
    if (imageFile != null && (typeof imageFile !== "string" || !SAFE_ASSET.test(imageFile))) {
      throw new Error(`算法题库图片名不安全: ${String(imageFile)}`);
    }
    return {
      leetcodeInput: text(row.leetcodeInput, `${label}[${index}].leetcodeInput`, true),
      output: text(row.output, `${label}[${index}].output`, true),
      acmStdin: text(row.acmStdin, `${label}[${index}].acmStdin`, true),
      acmStdout: text(row.acmStdout, `${label}[${index}].acmStdout`, true),
      explanation: text(row.explanation, `${label}[${index}].explanation`, true),
      ...(typeof imageFile === "string" ? { imageFile } : {}),
    };
  });
}

function parseAnswers(value: unknown, label: string): AlgorithmReferenceAnswer[] {
  if (!Array.isArray(value)) throw new Error(`算法题库 ${label} 格式无效`);
  return value.map((entry, index) => {
    const row = object(entry, `${label}[${index}]`);
    const mode = text(row.mode, `${label}[${index}].mode`) as AlgorithmMode;
    const file = text(row.file, `${label}[${index}].file`);
    if (!MODES.has(mode)) throw new Error(`参考答案模式无效: ${mode}`);
    if (!SAFE_ASSET.test(file) || extname(file).toLowerCase() !== ".py") {
      throw new Error(`参考答案文件名不安全: ${file}`);
    }
    return {
      mode,
      name: text(row.name, `${label}[${index}].name`),
      file,
      code: text(row.code, `${label}[${index}].code`, true),
    };
  });
}

function parseDetail(value: unknown, summary: Omit<AlgorithmProblemSummary, "progress">): CatalogProblem {
  const row = object(value, `details.${summary.slug}`);
  const leetcode = object(row.leetcode, `details.${summary.slug}.leetcode`);
  const acm = object(row.acm, `details.${summary.slug}.acm`);
  const templates = object(row.templates, `details.${summary.slug}.templates`);
  const parameters = Array.isArray(leetcode.parameters) ? leetcode.parameters.map((entry, index) => {
    const parameter = object(entry, `details.${summary.slug}.leetcode.parameters[${index}]`);
    return {
      name: text(parameter.name, `details.${summary.slug}.leetcode.parameters[${index}].name`),
      type: text(parameter.type, `details.${summary.slug}.leetcode.parameters[${index}].type`),
    };
  }) : [];
  const inputFields = Array.isArray(acm.inputFields) ? acm.inputFields.map((entry, index) => {
    const field = object(entry, `details.${summary.slug}.acm.inputFields[${index}]`);
    return {
      name: text(field.name, `details.${summary.slug}.acm.inputFields[${index}].name`),
      type: text(field.type, `details.${summary.slug}.acm.inputFields[${index}].type`),
    };
  }) : [];
  return {
    ...summary,
    description: text(row.description, `details.${summary.slug}.description`, true),
    constraints: stringArray(row.constraints, `details.${summary.slug}.constraints`),
    followUp: text(row.followUp, `details.${summary.slug}.followUp`, true),
    leetcode: {
      className: text(leetcode.className, `details.${summary.slug}.leetcode.className`),
      ...(typeof leetcode.methodName === "string" ? { methodName: leetcode.methodName } : {}),
      parameters,
      ...(typeof leetcode.returnType === "string" ? { returnType: leetcode.returnType } : {}),
    },
    acm: {
      inputFields,
      outputType: text(acm.outputType, `details.${summary.slug}.acm.outputType`, true),
      description: text(acm.description, `details.${summary.slug}.acm.description`, true),
    },
    examples: parseExamples(row.examples, `details.${summary.slug}.examples`),
    templates: {
      leetcode: text(templates.leetcode, `details.${summary.slug}.templates.leetcode`, true),
      acm: text(templates.acm, `details.${summary.slug}.templates.acm`, true),
    },
    answers: parseAnswers(row.answers, `details.${summary.slug}.answers`),
  };
}

/** Loads only public problem metadata. Hidden tests stay in main-process resources. */
export class AlgorithmCatalog {
  readonly collection: CatalogDocument["collection"];
  readonly categories: AlgorithmCategory[];
  readonly problems: Array<Omit<AlgorithmProblemSummary, "progress">>;
  private readonly details = new Map<string, CatalogProblem>();
  private readonly imageCache = new Map<string, string>();

  constructor(private readonly resourceDirectory: string) {
    const raw = JSON.parse(readFileSync(join(resourceDirectory, "catalog.json"), "utf8")) as unknown;
    const document = object(raw, "catalog.json");
    if (document.version !== 1) throw new Error(`不支持的算法题库版本: ${String(document.version)}`);
    const collection = object(document.collection, "collection");
    this.collection = {
      id: text(collection.id, "collection.id"),
      title: text(collection.title, "collection.title"),
      description: text(collection.description, "collection.description", true),
    };
    if (!Array.isArray(document.categories)) throw new Error("算法题库 categories 格式无效");
    this.categories = document.categories.map((entry, index) => {
      const row = object(entry, `categories[${index}]`);
      if (!Number.isSafeInteger(row.count) || Number(row.count) < 0) throw new Error("算法题库分类数量无效");
      return { name: text(row.name, `categories[${index}].name`), count: Number(row.count) };
    });
    if (!Array.isArray(document.problems)) throw new Error("算法题库 problems 格式无效");
    const seen = new Set<string>();
    this.problems = document.problems.map((entry, index) => {
      const summary = parseSummary(entry, `problems[${index}]`);
      if (seen.has(summary.slug)) throw new Error(`算法题库 slug 重复: ${summary.slug}`);
      seen.add(summary.slug);
      return summary;
    });
    const details = object(document.details, "details");
    for (const summary of this.problems) {
      if (!(summary.slug in details)) throw new Error(`算法题库缺少详情: ${summary.slug}`);
      this.details.set(summary.slug, parseDetail(details[summary.slug], summary));
    }
  }

  hasProblem(slug: string): boolean {
    return this.details.has(slug);
  }

  getProblem(slug: string): CatalogProblem {
    const detail = this.details.get(slug);
    if (!detail) throw new Error(`未找到算法题: ${slug}`);
    const result = structuredClone(detail);
    result.examples = result.examples.map((example) => {
      if (!example.imageFile) return example;
      const imageDataUrl = this.loadImage(result.id, slug, example.imageFile);
      return imageDataUrl ? { ...example, imageDataUrl } : example;
    });
    return result;
  }

  getAnswer(slug: string, mode: AlgorithmMode, file: string): AlgorithmReferenceAnswer | undefined {
    const detail = this.details.get(slug);
    const answer = detail?.answers.find((candidate) => candidate.mode === mode && candidate.file === file);
    return answer ? structuredClone(answer) : undefined;
  }

  private loadImage(id: number, slug: string, file: string): string | undefined {
    if (!SAFE_SLUG.test(slug) || !SAFE_ASSET.test(file) || basename(file) !== file) return undefined;
    const extension = extname(file).toLowerCase();
    const mime = ({
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    } as Record<string, string>)[extension];
    if (!mime) return undefined;
    const key = `${slug}/${file}`;
    const cached = this.imageCache.get(key);
    if (cached) return cached;
    try {
      const problemDirectory = `${String(id).padStart(4, "0")}_${slug}`;
      const path = join(this.resourceDirectory, "problems", problemDirectory, "images", file);
      if (statSync(path).size > MAX_IMAGE_BYTES) return undefined;
      const dataUrl = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
      this.imageCache.set(key, dataUrl);
      return dataUrl;
    } catch {
      return undefined;
    }
  }
}

export type { CatalogProblem as AlgorithmCatalogProblem };
