import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
      "/media": { target: "http://127.0.0.1:8787", changeOrigin: false }
    }
  },
  build: {
    outDir: "../../dist-web",
    emptyOutDir: true,
    manifest: "bundle-manifest.json",
    rollupOptions: {
      output: {
        manualChunks: {
          rapier: ["@dimforge/rapier3d-compat"]
        }
      }
    }
  }
});
