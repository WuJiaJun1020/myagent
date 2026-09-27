export type BrowserState = {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
};
export type BrowserBounds = { x: number; y: number; width: number; height: number };
export type BrowserAction = "back" | "forward" | "reload" | "stop" | "pick-file";
export const EMPTY_BROWSER_STATE: BrowserState = { url: "", title: "浏览器", loading: false, canGoBack: false, canGoForward: false };
