import type { PiDesktopApi } from "../shared/rpc";

declare global {
  interface Window {
    piDesktop: PiDesktopApi;
  }
}

export {};
