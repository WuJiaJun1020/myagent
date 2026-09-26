import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InterviewAgentModelLine } from "./InterviewAgentModelLine";

describe("InterviewAgentModelLine", () => {
  it("shows the fixed reasoning beside the model without a reasoning selector", () => {
    const html = renderToStaticMarkup(<InterviewAgentModelLine settings={{ reasoning: "medium" }} models={[]} />);
    expect(html).toContain("GPT-6 Luna");
    expect(html).toContain("思考");
    expect(html).toContain(">中</strong>");
    expect(html).not.toContain("<select");
  });

  it("only displays the chosen model and never renders a sidebar selector", () => {
    const html = renderToStaticMarkup(<InterviewAgentModelLine settings={{
      model: { providerId: "test", modelId: "basic" }, reasoning: "medium",
    }} models={[{ providerId: "test", modelId: "basic", name: "Basic", reasoningLevels: ["low"] }]} />);
    expect(html).toContain("Basic");
    expect(html).toContain(">中</strong>");
    expect(html).not.toContain("<select");
  });
});
