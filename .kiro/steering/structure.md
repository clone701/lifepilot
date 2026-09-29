# リポジトリ構造定義

> **重要**: `packages/frontend` はまだ存在しない（`auth-login` Spec で作成する）。
> 下記の構造のうち、実体があるのは `packages/shared` / `packages/backend` / `infra` と
> ルートの設定ファイル群。

## 構造（確定）

**npm workspaces によるモノレポ。** すべて TypeScript。

```
lifepilot/
├── package.json              # workspaces ルート（packages/* と infra）+ lint-staged 設定
├── tsconfig.base.json
├── packages/
│   ├── shared/               # frontend / backend 両方が使う
│   │   ├── date/             # JST 日付ユーティリティ
│   │   └── types/            # エンティティ型定義
│   ├── backend/              # Lambda 関数
│   │   └── keys/             # PK / SK ビルダー（backend 専用）
│   └── frontend/             # Vite + React + Tailwind（静的SPA・未作成）
├── infra/                    # AWS CDK
│   └── src/
│       ├── stacks/           # スタック定義
│       └── aspects/          # 合成時に規約を強制する Aspect（予算 / cdk-nag）
├── docs/                     # decisions.md（決定・未決定の記録）
└── .kiro/
    ├── specs/                # 機能単位の Spec
    └── steering/             # 常時適用の方針（_archive/ は未適合・manual）
```

### ツール設定ファイルの配置

**各ツールの設定はルートに1つだけ置く。** 同じツールの設定を複数箇所に置かない
（どちらが有効か分からなくなるため）。テストはソースと同じ場所に `*.test.ts` で置く。

```
lifepilot/
├── .nvmrc / eslint.config.js / .prettierrc(+ignore)
├── .secretlintrc.json(+ignore) / .gitleaks.toml / vitest.config.ts
├── .husky/                   # pre-commit / pre-push
├── .vscode/                  # settings.json / extensions.json（git 管理下・共有する）
└── .github/                  # workflows/ci.yml / dependabot.yml
```

ファイルの一覧と各段の責務は `.kiro/specs/ci-cd/design.md`、
設定値は各ファイル自体が唯一の正。本ファイルに設定値を転記しない。

**モノレポにした理由**: 全層 TypeScript なので型を1箇所で共有できる見返りが大きい。
後からモノレポ化するのは面倒なため最初に入れる。

**PK / SK ビルダーを `shared` ではなく `backend` に置く理由**: フロントエンドは API 経由で
通信するため SK の構造を知る必要がない。`shared` に置くとフロントから import できてしまい
境界が曖昧になる。日付ユーティリティのみ両方が必要なので `shared` に置く。

### 環境（ステージ）

**1環境のみデプロイする。** ステージ切り替えの仕組みだけ入れておき（既定値 `prod`）、
必要になってから dev を追加する。個人開発で2環境を維持する手間を避けるため。

## Spec作成ルール（重要）

**Spec は必ず機能単位で作成する。** 巨大な1つの Spec にまとめてはいけない。

- 配置: `.kiro/specs/{spec-name}/`（`requirements.md` / `design.md` / `tasks.md`）
- **ディレクトリをネストさせない。** `.kiro/specs/infra/auth/` のような2階層は
  Spec として認識されない可能性がある。グループ化したい場合は
  `.kiro/specs/infra-auth/` のようにプレフィックスで平坦にする
- 1つの Spec は「単体で動作確認できる機能」の粒度にする
- 複数機能を横断する変更が必要になった場合も、Spec は機能ごとに分けたまま
  依存関係を明記する
- 機能を追加するたびに新しい Spec を作る。既存 Spec を膨らませない

### インフラの扱い

**インフラ専用の Spec 階層を作らない。** このプロジェクトのインフラは機能と1対1に
対応しない（DynamoDB テーブルは1つで全機能が共有、ホスティングも共通）。
機能ごとに infra spec を作ると中身が空の Spec が並ぶ。

- インフラは**それを必要とする機能 Spec のタスクに含める**
  （例: Cognito は `auth-login`、DynamoDB テーブルは `database`）
- **インフラ自体が成果物になるものだけ独立 Spec** にする
  （例: `ci-cd`、将来の `cost-guardrail`）
- IaC コードの全体像は `infra/` のスタック分割で管理する。Spec 階層で表現しない

## 構造に関する方針

自動検査があるものは【検査あり】と記す。それ以外は**文書上の約束**であり、人が守る。
検査手段の一覧は `.kiro/steering/tech.md` の「品質ゲート」にある。

- 【検査あり】**フロントエンドは `@lifepilot/backend` を import しない**（ESLint が禁止）
- 【検査あり】**DynamoDB の SK を組み立てる処理は1モジュールに集約する。** SK 文字列を
  各所で直書きしない（`packages/backend/src/keys/` の型で不可能にしている）
- **レイヤー間の依存は一方向**にする（UI → ロジック → 外部サービスアダプタ）
- **外部サービス（Cognito、DynamoDB、AI API等）へのアクセスはアダプタ層に隔離**する。
  UIやビジネスロジックが外部SDKに直接依存しないようにする
- **機能単位でまとめる**。食事 / 体重 / 運動 / 目標といったドメインごとに分割する

## steering運用ルール

- `_archive/` 配下のファイルは別プロジェクト（LoL Lab）から持ち込んだもので、
  LifePilot には未適合。`inclusion: manual` にしてあり自動では適用されない
- **機械的に検査できる規約は steering に書かない。** 整形・lint・import 境界のように
  ツールで強制できるものは設定ファイル側を唯一の正とし、steering には
  「どこで検査されるか」だけを書く（二重管理を避けるため）
- デザインシステムは機械検査できない部分のみを対象に、実装が進んでから作成する
