# 実装タスク: database（データモデル基盤）

前提: `design.md` を SSOT とする。実装は design.md の定義に従うこと。

## 構成の前提（決定済み）

- **モノレポ**: npm workspaces を使う
- **環境数**: 1環境のみデプロイする。ステージ切り替えの仕組みだけ入れておき、
  必要になってから dev を追加する
- **テスト**: Vitest
- **リージョン**: `ap-northeast-1`（東京）

### モジュール配置

```
lifepilot/
├── package.json              # workspaces ルート
├── tsconfig.base.json
├── packages/
│   ├── shared/               # frontend / backend 両方が使う
│   │   ├── date/             # JST 日付ユーティリティ
│   │   └── types/            # エンティティ型定義
│   └── backend/              # backend のみ
│       └── keys/             # PK / SK ビルダー
└── infra/                    # AWS CDK
```

**PK / SK ビルダーを `backend` に置く理由**: フロントエンドは API 経由で通信するため
SK の構造を知る必要がない。`shared` に置くとフロントから import できてしまい、
境界が曖昧になる。日付ユーティリティのみ両方が必要なので `shared` に置く。

---

- [ ] 1. npm workspaces のルート構成を作成
  - ルート `package.json` に workspaces（`packages/*` と `infra`）を定義する
  - `tsconfig.base.json` を作成し、各パッケージから継承する
  - Vitest をルートに導入する
  - `.gitignore` は既存のものを使う
  - _要件: 6_

- [ ] 2. packages/shared に JST 日付ユーティリティを実装
  - `todayJst()`: JST 基準の `YYYY-MM-DD` を返す
  - 日付の加減算、範囲生成（グラフの期間指定用）
  - **UTC を使わない**。ゼロ埋めを必ず行う
  - _要件: 3, 5_

- [ ] 3. packages/shared にエンティティ型定義を実装
  - `design.md` 「5. エンティティ構造」の型を TypeScript で定義する
  - MVP で使うもの（PROFILE / GOAL / FOOD / MEAL / BODY / EX）を対象とする
  - 将来のもの（SLEEP / WATER / HABIT）は含めない
  - _要件: 4, 6_

- [ ] 4. packages/backend にキービルダーを実装
  - `design.md` 「8. キービルダーの方針」のシグネチャを実装する
  - **SK 文字列の直書きを禁止する**ための唯一の入口とする
  - _要件: 1, 2, 3, 5, 6_

- [ ] 5. ユニットテストを実装して実行
  - JST 境界（UTC 00:00 前後）で日付が正しく決定されることを検証する
  - `buildDateRange` が終端文字 `~` を含み、`D#<to>` 配下を包含することを検証する
  - 日付のゼロ埋めが行われることを検証する
  - SK の文字列ソートが日付順になることを検証する
  - マスタ系（`PROFILE` / `GOAL#` / `FOOD#`）が `D#` 系と混ざらないことを検証する
  - _要件: 2, 3, 5_

- [ ] 6. infra に CDK プロジェクトを作成
  - `infra/` に AWS CDK（TypeScript）プロジェクトを作成する
  - リージョンは `ap-northeast-1` を明示する
  - スタック名・テーブル名にステージ識別子を含める（既定値は `prod`）
  - _要件: 7_

- [ ] 7. DynamoDB テーブルを CDK で定義
  - `design.md` 「2. テーブル構成」の表に従う
  - PK: `pk`（String）、SK: `sk`（String）
  - 課金モード: PAY_PER_REQUEST
  - **GSI / LSI を作成しない**
  - 暗号化: AWS 所有キー（顧客管理 KMS キーを使わない）
  - PITR: 有効 / 削除保護: 有効 / RemovalPolicy: RETAIN
  - Streams / Contributor Insights: 無効
  - _要件: 1, 7, 8_

- [ ] 8. cdk synth でローカル検証
  - 生成される CloudFormation テンプレートを確認する
  - GSI が含まれないこと、PITR と削除保護が有効であることを確認する
  - AWS への接続を伴わない検証をここで済ませる
  - _要件: 7, 8_

- [ ] 9. 予算アラートを設定
  - **`cdk bootstrap` より前に実施する**（課金が始まる前に監視を置く）
  - AWS Budgets で月額予算を作成する（2つまで無料）
  - 閾値: 実績 $3（約50%）と $6（約100%）で通知
  - 通知先はメールアドレス
  - _要件: 7_

- [ ] 10. cdk bootstrap と deploy を実行
  - `cdk bootstrap` を実行する（S3 バケット / IAM ロール等が作成される）
  - `cdk deploy` でテーブルを作成する
  - _要件: 7, 8_

- [ ] 11. デプロイ結果を確認
  - テーブルが作成されたことを確認する
  - PITR が有効であることを確認する
  - 削除保護が有効であることを確認する
  - GSI が存在しないことを確認する
  - _要件: 7, 8_

- [ ] 12. コストの実測確認（24時間後）
  - Cost Explorer でコストを確認する
  - **反映まで24時間程度かかるため、即座には確認できない**
  - 月額換算で予算（1,000円）に対する影響が無視できる水準であることを確認する
  - _要件: 7_
