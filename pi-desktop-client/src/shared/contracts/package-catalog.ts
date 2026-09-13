export type PackageCatalogKind = "extension" | "skill" | "prompt" | "theme" | "package";
export type PackageCatalogCompatibility = "full" | "partial" | "unknown";

export type PackageCatalogLinks = {
  npm: string;
  homepage?: string;
  repository?: string;
  bugs?: string;
  piCatalog: string;
};

export type PackageCatalogEntry = {
  name: string;
  version: string;
  description: string;
  publisher: string;
  license?: string;
  publishedAt?: string;
  monthlyDownloads: number;
  weeklyDownloads: number;
  keywords: string[];
  kinds: PackageCatalogKind[];
  compatibility: PackageCatalogCompatibility;
  trustedPublisher: boolean;
  links: PackageCatalogLinks;
};

export type PackageCatalogQuery = {
  query: string;
  page: number;
  pageSize: number;
};

export type PackageCatalogResult = {
  entries: PackageCatalogEntry[];
  total: number;
  page: number;
  pageSize: number;
  source: "npm";
  fetchedAt: number;
};

export type PackageCatalogManifest = {
  extensions: string[];
  skills: string[];
  prompts: string[];
  themes: string[];
  image?: string;
  video?: string;
};

export type PackageCatalogDetails = PackageCatalogEntry & {
  unpackedSize?: number;
  dependencyNames: string[];
  peerDependencyNames: string[];
  nodeRequirement?: string;
  hasInstallScript: boolean;
  manifest: PackageCatalogManifest;
};
