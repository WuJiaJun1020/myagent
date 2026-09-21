import { describe, expect, it } from "vitest";
import { getRendererModule } from "./renderer-module-registry";

describe("renderer module layout", () => {
  it("uses an immersive layout for focused interview workbenches", () => {
    const interview = getRendererModule("interview");

    for (const view of ["question-bank", "algorithms"] as const) {
      expect(interview.resolveLayout(view)).toMatchObject({
        detailVariant: "default",
        topbarSuppressed: true,
        sidebarSuppressed: true,
        detailSuppressed: true,
      });
    }
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
