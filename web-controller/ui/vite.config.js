import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTargets = ["/state", "/battery", "/open", "/close", "/healthz"];

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      proxyTargets.map((p) => [p, "http://localhost:8080"]),
    ),
  },
});
