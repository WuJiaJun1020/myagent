import { describe, expect, it } from "vitest";
import { getRendererModule } from "./renderer-module-registry";

describe("renderer module layout", () => {
  it("uses an immersive layout only for algorithm practice", () => {
    const interview = getRendererModule("interview");

    expect(interview.resolveLayout("algorithms")).toMatchObject({
      detailVariant: "default",
      topbarSuppressed: true,
      sidebarSuppressed: true,
      detailSuppressed: true,
    });
    expect(interview.resolveLayout("dashboard")).toMatchObject({
      topbarSuppressed: false,
      sidebarSuppressed: false,
      detailSuppressed: false,
    });
  });

  it("does not change the Agent workspace layout", () => {
    expect(getRendererModule("agent").resolveLayout("activity")).toEqual({ detailVariant: "default" });
    expect(getRendererModule("agent").resolveLayout("review")).toEqual({ detailVariant: "review" });
  });
});
