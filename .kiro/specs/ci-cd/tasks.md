# 実装タスク: ci-cd（品質ゲートと自動化）

前提: `design.md` の方針に従う。**デプロイ自動化は含まない。**

実装順の考え方: まず予算ガードレール（最も重要かつ他に依存しない）→ 静的解析 →
git hooks → CI → 自動化の周辺、の順に進める。各段階で動作を確認できる。

---

## 予算ガードレール（要件2）

- [x] 1. 禁止リソース検査の Aspect を実装
  - `infra/src/aspects/budget-guardrail.ts` に `design.md` 5章の型定義どおり実装する
  - 禁止リソース型と概算月額の対応表を持ち、エラーメッセージに月額を含める
  - DynamoDB の追加検査（GSI/LSI なし、`PAY_PER_REQUEST`）も行う
  - 例外設定は `reason` が空文字の場合に拒否する
  - _要件: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Aspect のテストを実装
  - 禁止リソースを含むテスト用スタックで合成が失敗することを検証する
  - 現行の `DataStack` が通過することを検証する
  - DynamoDB に GSI を追加すると失敗することを検証する
  - 課金モードをプロビジョンドにすると失敗することを検証する
  - 理由のない例外設定が拒否されることを検証する
  - _要件: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Aspect を App 全体に適用
  - `infra/src/app.ts` で App に適用する（スタック追加時に自動で対象になるように）
  - `cdk synth` が通ることを確認する
  - _要件: 2.1, 2.6_

## IaC セキュリティ（要件4）

- [x] 4. cdk-nag を導入
  - `AwsSolutionsChecks` を App 全体に適用する
  - 指摘内容を確認し、**エラーとして扱う範囲を決めて記録する**
  - 受け入れる指摘には `NagSuppressions` で理由を記述する
  - _要件: 4.1, 4.2, 4.3_

## 静的解析（要件1, 7）

- [x] 5. Prettier を導入
  - ルートに `.prettierrc` と `.prettierignore` を作成する（**設定ファイルは1つだけ**）
  - 既存の全ファイルを整形する（差分が大きくなるため単独のコミットにする）
  - `format` / `format:check` スクリプトを追加する
  - _要件: 1.6, 7.1_

- [x] 6. ESLint を導入
  - ルートに `eslint.config.js` を作成する（**Flat Config、設定ファイルは1つだけ**）
  - `typescript-eslint` の型情報つきルールを有効にする
  - `no-restricted-imports` でフロントエンドから `@lifepilot/backend` への import を禁止する
  - `lint` スクリプトに **`--max-warnings 0`** を指定する
  - Prettier と競合するルールを無効化する
  - _要件: 1.2, 1.3, 7.1_

- [x] 7. ESLint のルールが機能することを確認
  - 意図的に違反コードを書き、lint が失敗することを確認する
  - 警告レベルの違反でも失敗することを確認する
  - フロントエンド境界の import 制限が機能することを確認する（`packages/frontend` は
    未作成なので、設定のみ入れて `auth-login` 時に検証する場合はその旨を記録する）
  - _要件: 1.3_

- [x] 8. Node バージョンを単一の正にする
  - `.nvmrc` を作成する（ローカルの Node 24 系に合わせる）
  - `package.json` の `engines` と矛盾しないようにする
  - _要件: 7.3_

## 機密情報検査（要件3）

- [x] 9. secretlint を導入
  - `.secretlintrc.json` を作成し、AWS 認証情報を含む推奨ルールセットを有効にする
  - `secretlint` スクリプトを追加する
  - **既存ファイルに対して実行し、検出がないことを確認する**
  - _要件: 3.1, 3.2, 3.4_

- [x] 10. gitleaks で履歴を検査
  - まず**ローカルまたは CI で既存の4コミットの履歴を検査する**
  - 検出があった場合は報告し、対処方針を相談する（履歴書き換えが必要になりうる）
  - 誤検知には `.gitleaks.toml` で除外を設定する
  - _要件: 3.3, 3.4_

## git hooks（要件6）

- [x] 11. husky と lint-staged を導入
  - husky 9 を導入し、`prepare` スクリプトを設定する
  - lint-staged の設定を**ルートの `package.json` に置く**（設定ファイルを分散させない）
  - 対象: `*.{ts,tsx}` に ESLint 自動修正 + Prettier + secretlint + 関連テスト、
    `*.{json,md,yml,css}` に Prettier + secretlint
  - _要件: 6.1, 7.1_

- [x] 12. pre-commit フックを作成
  - `npx lint-staged` のみを実行する（lollab のようなディレクトリ移動は不要）
  - 変更ファイルのみを対象にし、コミットが遅くならないことを確認する
  - _要件: 6.1, 6.3_

- [x] 13. pre-push フックを作成
  - 全体の型検査、全テスト、高深刻度の脆弱性検査を実行する
  - **CI の検査項目と矛盾しないことを確認する**
  - _要件: 6.2, 6.3, 6.4_

- [x] 14. フックの動作確認
  - 違反のあるファイルでコミットが中断されることを確認する
  - `--no-verify` で回避できることを確認する
  - _要件: 6.3, 6.5_

## エディタ連携（要件6）

- [x] 15. VSCode の設定を追加
  - 保存時の Prettier 整形と ESLint 自動修正を有効にする
  - `typescript.tsdk` をルートの `node_modules` に向ける
  - `.gitignore` の `.vscode/*` 除外と整合させる（`settings.json` は共有対象にする）
  - _要件: 6.1_

## CI（要件1, 3, 5）

- [x] 16. GitHub Actions のワークフローを作成
  - `.github/workflows/ci.yml` を作成する
  - トリガー: `pull_request`（main, develop）、`push`（main, develop）、週次スケジュール
  - **`permissions: contents: read`** で最小権限にする
  - **`concurrency`** で同一 ref の進行中ジョブをキャンセルする
  - checkout は**履歴全体を取得**する（gitleaks 用）
  - Node は **`.nvmrc` を参照**し、バージョンを YAML に転記しない
  - ステップ順序は `design.md` 8章に従う
  - **`continue-on-error` を使わない**
  - _要件: 1.1, 1.2, 1.4, 1.5, 1.6, 3.3, 5.1, 5.2, 5.5, 7.2_

- [ ] 17. CI の動作確認
  - **意図的に失敗する変更を push し、CI が実際に落ちることを確認する**
    （緑のまま通る状態になっていないか確かめる。lollab の主要な問題がこれだった）
  - lint 警告のみの場合も失敗することを確認する
  - 禁止リソースを追加した場合に `cdk synth` ステップで失敗することを確認する
  - 確認後、失敗させた変更は元に戻す
  - _要件: 1.2, 1.3, 2.1_

## 依存の自動更新（要件5）

- [x] 18. Dependabot を設定
  - `.github/dependabot.yml` を作成する
  - エントリは **npm（`/`）と github-actions（`/`）の2つ**
  - 週次、**メジャーバージョン更新は自動提案しない**
  - コミットメッセージの接頭辞を設定する
  - _要件: 5.3, 5.4_

## 仕上げ

- [x] 19. npm スクリプトを整理
  - `validate` スクリプト（format:check + lint + typecheck + test）を追加する
  - CI とローカルが同じスクリプトを呼ぶようにする（挙動の食い違いを防ぐ）
  - _要件: 7.2_

- [x] 20. steering を更新
  - `.kiro/steering/tech.md` に導入したツールを記録する
  - `.kiro/steering/structure.md` に設定ファイルの配置を反映する
  - **規約が自動検査されるようになった項目には、その旨を記載する**
    （文書だけの約束と、機械的に守られる規約を区別する）
  - _要件: 7.4_

- [x] 21. 全体の動作確認
  - `npm run validate` が通ることを確認する
  - `cdk synth` が通ることを確認する
  - クリーンな状態でコミットと push ができることを確認する
  - _要件: 1, 6_
