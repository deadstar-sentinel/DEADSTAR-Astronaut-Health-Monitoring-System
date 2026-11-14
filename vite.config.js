import { defineConfig } from "vite";

// AI Studio / local web preview of the hologram twin. The Python engine (app/) deploys separately on Railway.
export default defineConfig({
  server: { host: "0.0.0.0", port: 3000 },
  preview: { host: "0.0.0.0", port: 3000 },
});
