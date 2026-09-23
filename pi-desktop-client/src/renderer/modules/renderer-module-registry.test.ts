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

  it("loads Knowledge Studio as an independent focused product module", () => {
    const studio = getRendererModule("knowledge-studio");

    expect(studio.title).toBe("知识工坊");
    expect(studio.resolveLayout("studio")).toMatchObject({
      detailVariant: "default",
      detailSuppressed: true,
    });
  });
});
