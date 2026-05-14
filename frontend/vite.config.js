import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// CRA-style REACT_APP_* vars only reach the client bundle when listed here.
export default defineConfig({
  envPrefix: ["VITE_", "REACT_APP_"],
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/outputs": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
