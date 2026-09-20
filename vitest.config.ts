import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    setupFiles: ["./server/_test-setup.ts"],
    // The integration tests talk to the shared Aiven MySQL over the public
    // internet, where a single test that does a dozen round trips
    // legitimately takes 5-10s. At vitest's 5s default, 8 of them failed
    // purely on latency ("Test timed out in 5000ms") while passing at 60s --
    // a red suite that said nothing about the code. High enough for the
    // network, still low enough to catch a genuine hang.
    testTimeout: 30000,
  },
});
