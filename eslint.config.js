import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";

/**
 * ESLint の設定（Flat Config）。**このプロジェクトの ESLint 設定はこのファイルだけ。**
 *
 * SSOT: `.kiro/specs/ci-cd/design.md` 「7. ESLint の設定方針」
 *
 * 方針の要点:
 * - 設定ファイルを1つに限る（要件7.1）。`.mjs` と `.mts` が並立して
 *   どちらが効いているか分からない状態を作らない
 * - 型情報つきルールを使う。`no-floating-promises` のように
 *   型情報なしでは検出できない実バグを捕まえたいため
 * - 警告を残さない。`lint` スクリプトに `--max-warnings 0` を付けてある（要件1.3）
 * - Prettier と競合する整形系ルールは最後で無効化する
 */
export default tseslint.config(
  // --- 検査対象外 ---
  {
    // 生成物は検査しない。`dist/` には tsc が出力した .js があり、
    // 指定しないと ESLint がソースと同じ内容を二重に検査してしまう
    ignores: ["**/dist/", "**/cdk.out/", "**/coverage/", "**/*.d.ts"],
  },

  // --- 全ファイル共通の JavaScript 基本ルール ---
  js.configs.recommended,

  // --- TypeScript（型情報つき） ---
  {
    // tsconfig の include と一致させる。ここに載らないファイルは
    // 型情報つき検査の対象外になるため、新しいパッケージを追加したら追記する
    files: ["packages/*/src/**/*.{ts,tsx}", "infra/src/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // 各パッケージの tsconfig.json を自動的に解決させる。
        // tsconfig のパスを列挙するとパッケージ追加時に更新漏れが起きるため
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `_` 始まりの引数は「意図的に使わない」ことを示す慣習として許可する。
      // インターフェース実装で使わない引数を受け取る場合に必要（例: INagLogger）
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // tsconfig で verbatimModuleSyntax を有効にしているため、
      // 型のみの import は `import type` で書く必要がある。書き方を統一する
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  // --- フロントエンドの依存の境界（design.md 7章） ---
  {
    // `packages/frontend` はまだ存在しない。フロントエンドを作った時点で
    // 自動的に効くように、設定だけ先に入れておく。
    // 動作は一時ファイルで検証済み（docs/decisions.md 15章）。
    // 注意: `packages/frontend` を作る際は `tsconfig.json` も必ず置く。
    // 無いと projectService の解決に失敗し、parse error でこのルールまで到達しない
    files: ["packages/frontend/src/**/*.{ts,tsx}"],
    rules: {
      // 基底ルールは無効化し、TypeScript 対応版を使う（両方有効だと二重報告になる）
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@lifepilot/backend", "@lifepilot/backend/*"],
              // structure.md の「フロントエンドは SK の構造を知る必要がない」を
              // 文書上の約束ではなく検査で守る
              message:
                "フロントエンドから @lifepilot/backend を import してはいけません。" +
                "PK/SK の構造はバックエンド専用です。API 経由で通信してください" +
                "（.kiro/steering/structure.md）。",
              // 型だけの import も禁止する。型を知ること自体が境界の漏れになる
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },

  // --- ルート直下の設定ファイル ---
  {
    // `vitest.config.ts` などはどの tsconfig の include にも入っていないため、
    // 型情報つきの検査はできない。構文レベルの検査のみ行う
    files: ["*.ts"],
    extends: [tseslint.configs.recommended],
  },

  // --- Prettier と競合するルールの無効化（必ず最後） ---
  prettier,
);
