import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 各パッケージの *.test.ts を対象にする
    include: ["packages/**/*.test.ts", "infra/**/*.test.ts"],
    environment: "node",
  },
});
