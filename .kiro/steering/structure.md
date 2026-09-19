# リポジトリ構造定義

> **重要**: アプリケーションのディレクトリ構造は**まだ実体がない**。
> 下記「想定する構造」は方針であり、最初の Spec で確定させる。
> 実装前に必ず確認する。

## 現在の構造

```
lifepilot/
├── .kiro/
│   ├── specs/                  # Spec定義ファイル（未作成）
│   └── steering/
│       ├── ai-instructions.md  # AI向け共通指示（常時適用）
│       ├── product.md          # プロダクト定義（常時適用）
│       ├── structure.md        # 本ファイル（常時適用）
│       ├── tech.md             # 技術スタック定義（常時適用）
│       ├── spec-guidelines.md  # Spec作成ガイドライン（Spec編集時）
│       ├── data-model.md       # DynamoDBキー設計（specs/database/ へ移行予定）
│       └── _archive/           # 別プロジェクトから流用した未整備のsteering
└── docs/
    └── decisions.md            # 設計・技術選定の決定メモ
```

## 構造（確定）

**npm workspaces によるモノレポ。** すべて TypeScript。

```
lifepilot/
├── package.json              # workspaces ルート（packages/* と infra）
├── tsconfig.base.json
├── packages/
│   ├── shared/               # frontend / backend 両方が使う
│   │   ├── date/             # JST 日付ユーティリティ
│   │   └── types/            # エンティティ型定義
│   ├── backend/              # Lambda 関数
│   │   └── keys/             # PK / SK ビルダー（backend 専用）
│   └── frontend/             # Vite + React + Tailwind（静的SPA）
├── infra/                    # AWS CDK
├── docs/
└── .kiro/
```

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
  （例: `cost-guardrail`、将来の `ci-cd`）
- IaC コードの全体像は `infra/` のスタック分割で管理する。Spec 階層で表現しない

## 構造に関する方針

- **レイヤー間の依存は一方向**にする（UI → ロジック → 外部サービスアダプタ）
- **外部サービス（Cognito、DynamoDB、AI API等）へのアクセスはアダプタ層に隔離**する。
  UIやビジネスロジックが外部SDKに直接依存しないようにする
- **機能単位でまとめる**。食事 / 体重 / 運動 / 目標といったドメインごとに分割する
- **DynamoDB の SK を組み立てる処理は1モジュールに集約する。** SK 文字列を各所で
  直書きしない（キー命名規則の違反を型レベルで防ぐため）

## steering運用ルール

- `_archive/` 配下のファイルは別プロジェクト（LoL Lab）から持ち込んだもので、
  LifePilot には未適合。`inclusion: manual` にしてあり自動では適用されない
- コーディング規約・デザインシステムは**技術スタック確定後**に作成する。
  作るものが決まる前に規約を固めると、実装時に矛盾が生じる
