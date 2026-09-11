import { describe, expect, it } from "vitest";
import { JsonlDecoder } from "./jsonl";

describe("JsonlDecoder", () => {
  it("keeps partial records between chunks", () => {
    const decoder = new JsonlDecoder();
    expect(decoder.push('{"type":"mes')).toEqual([]);
    expect(decoder.push('sage"}\n{"type":"done"}\n')).toEqual([
      '{"type":"message"}',
      '{"type":"done"}',
    ]);
  });

  it("does not split JSON strings on Unicode separators", () => {
    const decoder = new JsonlDecoder();
    expect(decoder.push('{"text":"a\u2028b\u2029c"}\n')).toEqual([
      '{"text":"a\u2028b\u2029c"}',
    ]);
  });

  it("accepts CRLF framing", () => {
    const decoder = new JsonlDecoder();
    expect(decoder.push('{"ok":true}\r\n')).toEqual(['{"ok":true}']);
  });
});
