import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/maplibre-gl")) return "vendor-map";
          if (
            id.includes("node_modules/echarts") ||
            id.includes("node_modules/zrender")
          )
            return "vendor-charts";
          if (
            id.includes("node_modules/@xyflow") ||
            id.includes("node_modules/d3-")
          )
            return "vendor-flow";
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/scheduler")
          )
            return "vendor-react";
        },
      },
    },
  },
});
