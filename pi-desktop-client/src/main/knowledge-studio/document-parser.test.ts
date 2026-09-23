import { describe, expect, it } from "vitest";
import { parseKnowledgeText, segmentKnowledgeContent } from "./document-parser";

describe("knowledge document parser", () => {
  it("removes active HTML content and keeps readable text", () => {
    const parsed = parseKnowledgeText(
      "source-1",
      "Agent handbook",
      "<html><head><style>.hidden{display:none}</style></head><body><h1>Agent 设计</h1><p>工具调用必须经过权限校验，并保留可追溯的执行记录；模型上下文与业务资料应隔离存储。</p><script>steal()</script></body></html>",
      "html",
    );

    expect(parsed.content).toContain("Agent 设计");
    expect(parsed.content).toContain("权限校验");
    expect(parsed.content).not.toContain("steal()");
    expect(parsed.segments[0]?.id).toBe("source-1:segment:0");
    expect(parsed.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("creates stable ordered segments with source offsets", () => {
    const content = Array.from({ length: 8 }, (_, index) => (
      `## 章节 ${index + 1}\n\n${`这是用于验证知识切片、证据定位和批量出题的正文 ${index + 1}。`.repeat(24)}`
    )).join("\n\n");
    const segments = segmentKnowledgeContent("document-a", content);

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.map((segment) => segment.ordinal)).toEqual(segments.map((_, index) => index));
    expect(segments.every((segment) => segment.id.startsWith("document-a:segment:"))).toBe(true);
    expect(segments.every((segment) => content.slice(segment.startOffset, segment.endOffset) === segment.content)).toBe(true);
  });

  it("keeps the semantic article while removing common website chrome", () => {
    const parsed = parseKnowledgeText(
      "source-web",
      "Agent guide",
      `<html><body>
        <header><a>Documentation</a><a>Search</a></header>
        <nav>Overview Agents Guardrails Tracing</nav>
        <main>
          <div class="table-of-contents"><a>Agents</a><a>Handoffs</a><a>Tracing</a></div>
          <h1>Agent orchestration</h1>
          <p>${"An orchestrator should keep tool policy, handoff boundaries, and failure recovery explicit. ".repeat(18)}</p>
          <h2>Handoffs</h2>
          <p>${"A handoff transfers responsibility together with the minimum required context and an auditable reason. ".repeat(15)}</p>
          <aside>On this page</aside>
        </main>
        <footer>Copyright 2026 Example</footer>
      </body></html>`,
      "html",
    );

    expect(parsed.content).toContain("# Agent orchestration");
    expect(parsed.content).toContain("## Handoffs");
    expect(parsed.content).not.toContain("Overview Agents Guardrails Tracing");
    expect(parsed.content).not.toContain("Agents Handoffs Tracing");
    expect(parsed.content).not.toContain("On this page");
    expect(parsed.content).not.toContain("Copyright 2026");
    expect(parsed.segments.length).toBeLessThanOrEqual(2);
  });

  it("merges tiny markdown sections and bounds large chunks", () => {
    const shortSections = Array.from({ length: 18 }, (_, index) => (
      `## Step ${index + 1}\n\n${Array.from({ length: 4 }, () => `A concise but meaningful instruction for stage ${index + 1}.`).join(" ")}`
    )).join("\n\n");
    const segments = segmentKnowledgeContent("markdown-guide", shortSections, "markdown");

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.length).toBeLessThan(10);
    expect(segments.every((segment) => segment.content.length <= 5_200)).toBe(true);
    expect(segments.every((segment) => shortSections.slice(segment.startOffset, segment.endOffset) === segment.content)).toBe(true);
  });

  it("does not mistake short HTML navigation labels for section headings", () => {
    const content = Array.from({ length: 60 }, (_, index) => (
      `Label ${index + 1}\n\n${"Substantive documentation sentence with enough detail to remain useful. ".repeat(2)}`
    )).join("\n\n");
    const segments = segmentKnowledgeContent("html-guide", content, "html");

    expect(segments.length).toBeLessThan(8);
    expect(segments.every((segment) => segment.heading === undefined)).toBe(true);
  });
});
