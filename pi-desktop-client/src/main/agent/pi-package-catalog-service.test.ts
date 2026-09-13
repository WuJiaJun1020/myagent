import { describe, expect, it, vi } from "vitest";
import { PiPackageCatalogService } from "./pi-package-catalog-service";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("PiPackageCatalogService", () => {
  it("searches npm's pi-package catalog and normalizes entries", async () => {
    let requestedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return jsonResponse({
      total: 1,
      objects: [{
        downloads: { monthly: 1200, weekly: 300 },
        package: {
          name: "sample-pi-extension",
          version: "1.2.3",
          description: "Sample extension",
          keywords: ["pi-package", "pi-extension", "overlay"],
          license: "MIT",
          date: "2026-09-01T00:00:00.000Z",
          publisher: { username: "alice", trustedPublisher: { id: "github" } },
          links: { npm: "https://www.npmjs.com/package/sample-pi-extension", repository: "https://github.com/a/b" },
        },
      }],
      });
    });
    const service = new PiPackageCatalogService(fetcher);

    const result = await service.search({ query: "sample", page: 0, pageSize: 20 });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(requestedUrl).toContain("keywords%3Api-package+sample");
    expect(result).toMatchObject({ total: 1, page: 0, pageSize: 20, source: "npm" });
    expect(result.entries[0]).toMatchObject({
      name: "sample-pi-extension",
      version: "1.2.3",
      publisher: "alice",
      monthlyDownloads: 1200,
      kinds: ["extension"],
      compatibility: "partial",
      trustedPublisher: true,
    });
  });

  it("loads manifest and install-risk details for a selected package", async () => {
    let requestedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return jsonResponse({
      name: "@scope/pi-skill",
      version: "2.0.0",
      description: "A skill",
      keywords: ["pi-package", "skill"],
      license: "Apache-2.0",
      author: { name: "Bob" },
      scripts: { postinstall: "node setup.js" },
      dependencies: { zod: "^4.0.0" },
      peerDependencies: { "@earendil-works/pi-coding-agent": "*" },
      engines: { node: ">=22" },
      dist: { unpackedSize: 4321 },
      pi: { skills: ["./skills/demo/SKILL.md"], image: "https://example.com/preview.png" },
      });
    });
    const service = new PiPackageCatalogService(fetcher);

    const details = await service.getDetails("@scope/pi-skill");

    expect(requestedUrl).toContain("%40scope%2Fpi-skill/latest");
    expect(details.links.piCatalog).toBe("https://pi.dev/packages/%40scope/pi-skill");
    expect(details).toMatchObject({
      name: "@scope/pi-skill",
      unpackedSize: 4321,
      dependencyNames: ["zod"],
      peerDependencyNames: ["@earendil-works/pi-coding-agent"],
      nodeRequirement: ">=22",
      hasInstallScript: true,
      kinds: ["skill"],
      compatibility: "full",
      manifest: { skills: ["./skills/demo/SKILL.md"], image: "https://example.com/preview.png" },
    });
  });
});
