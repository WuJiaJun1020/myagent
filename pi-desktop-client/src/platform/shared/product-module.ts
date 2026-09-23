/** Product areas known to this build. Modules are registered at compile time. */
export const PRODUCT_MODULE_IDS = ["agent", "interview", "knowledge-studio"] as const;

export type ProductModuleId = (typeof PRODUCT_MODULE_IDS)[number];

export function isProductModuleId(value: unknown): value is ProductModuleId {
  return typeof value === "string" && PRODUCT_MODULE_IDS.includes(value as ProductModuleId);
}
