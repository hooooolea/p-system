import { defineConfig } from "vite";

export default defineConfig({
  base: "/command-map/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/styles.css": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/docs-theme.js": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
