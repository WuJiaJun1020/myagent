import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  // Only the app HTML is an entry. Generated preview/test HTML and Python
  // packages under .cache must not enter Vite's cold dependency scan.
  optimizeDeps: { entries: ["index.html"] },
  server: {
    watch: {
      // Pi writes project-scoped package/resource state here. It is runtime data,
      // not renderer source, so changes must not trigger a full-page Vite reload.
      ignored: ["**/.pi/**", "**/.cache/**", "**/tests/**", "**/models/**", "**/resources/python/**", "**/release/**", "**/dist/**"],
    },
    warmup: {
      clientFiles: [
        "./src/renderer/main.tsx",
        "./src/renderer/App.tsx",
        "./src/renderer/styles.css",
        "./src/renderer/modules/interview/InterviewRendererModule.tsx",
        "./src/renderer/modules/knowledge-studio/KnowledgeStudioRendererModule.tsx",
        "./src/renderer/modules/smart-library/LibraryRendererModule.tsx",
      ],
    },
  },
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          // Keep lazy editors independent of the application entry module.
          if (id.includes("vite/preload-helper")) return "preload-helper";
          const modulePath = id.replaceAll("\\", "/");
          if (modulePath.includes("/node_modules/framer-motion/")) return "vendor-motion";
          if (
            modulePath.includes("/node_modules/react-markdown/")
            || modulePath.includes("/node_modules/remark-gfm/")
          ) return "vendor-markdown";
          if (
            modulePath.includes("/node_modules/zustand/")
            || modulePath.includes("/node_modules/@tanstack/react-virtual/")
          ) return "vendor-state";
          if (modulePath.includes("/node_modules/@xterm/")) return "vendor-terminal";
          if (modulePath.includes("/node_modules/prismjs/")) return "vendor-highlight";
        },
      },
    },
  },
});
