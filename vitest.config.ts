import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Hier laufen nur die reinen Module aus shared/. Sie brauchen keinen Browser.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts"],
  },
});
