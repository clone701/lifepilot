# LifePilot 決定メモ

生活管理アプリ「LifePilot」の設計・技術選定に関する決定事項を記録する。
会話で決まった内容を随時追記していく。

最終更新: 2026-09-20

---

## 1. プロジェクト方針

- 食事・運動・体重・生活習慣をまとめて管理できるWebアプリを開発する
- 最終的には蓄積データをAIで分析し、個人最適化された提案を行う
- **最優先事項**: 機能の多さではなく「毎日面倒なく使えること」
- 開発優先順位: 毎日使える → 入力が簡単 → データ蓄積 → 可視化 → AI活用 → 複数ユーザー対応
- いきなり大量実装しない。MVPを小さく作り、使いながら育てる

## 2. ユーザー範囲

- **初期**: 自分専用アプリとして利用
- **将来**: 知り合いにも使ってもらえるようにする
- **設計要件**: 後から複数ユーザー化しても耐えられる設計にすること
  - DBは最初から `user_id` でデータを分離する
  - 他ユーザーのデータを閲覧できない構造にする
  - 目標値・AI提案はユーザーごとに持つ

## 3. インフラ

- **クラウド**: AWS で統一（完全AWS構成）
- **予算**: 多少の有料は許容する

### コスト上限（最重要）

**月額 1,000円以内（約 $6〜7）を目標上限とする。**
全ての技術判断でこの上限を超えないか検討する。超える可能性がある場合は実装前に確認する。

### コスト管理の仕組み（実装は後のフェーズ）

- 現在いくらかかっているかを常に確認できる仕組みを構築する
- 一定額を超えた場合に通知する
- 一定額を超えた場合にシステムを止める仕組みも入れたい
- 注意点: AWSの「完全自動停止」は技術的に難しい領域。実装方針は別途設計する
- AWS Budgets は2つまで無料

## 3.1 コスト見積もり（東京リージョン・1〜3ユーザー・MVP時点）

| 項目                                          | 月額概算                               |
| --------------------------------------------- | -------------------------------------- |
| DynamoDB（オンデマンド、3MB・数千リクエスト） | $0.05                                  |
| S3（静的ファイル数十MB）                      | $0.01                                  |
| CloudFront（転送量・リクエスト）              | $0〜0.10（1TB/月の無料枠あり・要確認） |
| API Gateway HTTP API（3万リクエスト/月）      | $0.03                                  |
| Lambda（3万リクエスト/月）                    | $0（100万req/月の無料枠内）            |
| Cognito                                       | $0（無料枠内）                         |
| CloudWatch Logs（retention設定前提）          | $0.10〜1.00                            |
| Route 53（独自ドメイン使用時）                | $0.50                                  |
| AWS Budgets                                   | $0                                     |
| **合計**                                      | **約 $0.7〜1.8（¥110〜280）**          |

予算 ¥1,000 に対して大きな余裕がある。※Pricing Calculator での検証が必要。

ビルドは GitHub Actions（無料枠）で行い S3 へ同期する想定のため、ビルド課金は発生しない。
API Gateway は **HTTP API** を使う（REST API は約3.5倍高い）。

補足: DynamoDB には 25GB ストレージ + 25 WCU/25 RCU の永久無料枠があるとされる（要確認）。
プロビジョンドモード 25/25 なら実質 ¥0 になるが、オンデマンドとの差は月100円未満のため
運用の簡潔さを優先してオンデマンドを選択。コスト圧縮が必要になった際の調整余地として記録。

Cognito の注意点: 標準のユーザープールは 10,000 MAU 相当の無料枠があるが、
**外部IdP連携（Google等のフェデレーション）は無料枠が 50 MAU** と大幅に小さい。
知人数名規模なら問題ないが、公開する場合は要再確認。

## 4. 認証

- **Amazon Cognito** を採用
- 初期は自分だけが使うが、Cognito前提で複数ユーザーに対応できる土台を作る

## 5. AI機能の扱い

- MVPには含めない
- 基礎機能（食事登録 → 集計 → 目標 → グラフ）の完成後に追加する
- AIが推定した値は**無条件で確定しない**。必ずユーザーが確認・修正できるUIにする

## 6. 対象デバイス

- スマートフォン中心での利用を想定（入力しやすさ、操作数の少なさを重視）
- PCでも使えるレスポンシブWebアプリとする

## 7. 栄養データ（カロリー・PFC）の元ネタ

**方針: 併用（c）**

- **MVP**: ユーザーが自分で食品マスタを登録する。実装が軽く、すぐ毎日使い始められる
- **後フェーズ**: 公開栄養データベースを取り込んで検索できるようにする
- **設計要件**: 食品マスタのスキーマは、後から成分表データを流し込める形にしておく
  - 外部由来データと自前登録データを区別できるフィールドを持つ（例: `source`, `external_id`）
  - 栄養値は「可食部100gあたり」を基準に保持し、分量換算はアプリ側で行う

### 調査結果（2026-09 時点）

**日本食品標準成分表（八訂）増補2023年 / 文部科学省** ← 第一候補

- **公式APIは存在しない**。「食品成分データベース」(fooddb.mext.go.jp) は検索用Webサイトであり、
  プログラムから叩くAPIは提供されていない
- データは **Excel形式でダウンロード可能**。これを自前DBにインポートする方式を取る
- ライセンスが緩い: 文科省は「食品成分データは、ご自由に利用して頂けます」と明記。
  アプリ等への二次利用時は出典表記「日本食品標準成分表（八訂）増補2023年から引用」が必要
- 収載食品数は約2,500件程度と小規模なため、DBに取り込んでもコスト影響はない
- 制約: **素材中心**（白米、鶏むね肉など）。コンビニ弁当のような商品データは含まれない
- 出典: https://www.mext.go.jp/a_menu/syokuhinseibun/

**その他の選択肢（いずれも採用しない方向）**

- **Open Food Facts**: 無料・API有り・バーコード対応。日本の商品も一部あるが有志ベースで
  網羅性と精度にばらつきがある。ライセンスが ODbL（シェアアライク）で、取り込んだ派生
  データベースの公開義務が生じうる点に注意
- **FatSecret Platform API**: 無料枠は 5,000 req/日 あるが **データセットが米国のみ**。
  日本データは上位プラン（要問い合わせ）
- **Nutritionix / Edamam / Spoonacular**: 英語圏の食品中心。商用課金。日本の食事管理には不向き

**商品単位（コンビニ弁当等）のデータ**は公的にも無料APIにも網羅的なものが無い。
自前登録、または将来のAI推定で埋める前提とする。

## 8. 医療的な位置づけ

- 医療的な診断・治療を行うアプリにはしない
- ユーザーが入力したデータに基づく生活上の提案に留める

---

## 9. アーキテクチャ（確定）

**構成スタイル: サーバーレス中心。VPC を作らない。**

```
[ブラウザ / スマートフォン]
   ↓
CloudFront + S3（静的SPA配信・OAC経由。S3は非公開）
   ↓
API Gateway (HTTP API) + Cognito Authorizer  ← JWT検証をインフラで強制
   ↓
Lambda (TypeScript)
   ↓
DynamoDB（オンデマンド・シングルテーブル設計）

成分表データ: 不変・約2,500件 → ビルド時にJSON化してバンドル同梱 or S3
IaC: AWS CDK (TypeScript)
コストガードレール: AWS Budgets → SNS → Lambda（後フェーズ）
アドホック分析: DynamoDB → S3エクスポート → Athena / DuckDB（必要時）
```

### フロントエンド構成（確定）

**Vite + React + TypeScript + Tailwind CSS。PWA 化する。**

- ルーティング: React Router
- データ取得: TanStack Query
- PWA: `vite-plugin-pwa`。スマホのホーム画面に置けることが「毎日面倒なく使える」に直結する

### 認証の実装方針（確定）

- **サインイン方式: メール + パスワード**
  - Google フェデレーションを採用しなかった理由: `sub` が IdP ごとに異なり後から
    変更するとデータが孤立する。加えてフェデレーションの無料枠は 50 MAU と小さく、
    将来公開する場合の制約になる。外部サービス（Google Cloud）の設定も不要にできる
- Cognito Hosted UI + Authorization Code Grant with PKCE
- クライアントは `aws-amplify` の Auth モジュール
- **トークンを localStorage / sessionStorage に保存しない。** メモリ保持
- JWT 検証は API Gateway の Cognito Authorizer で行う。Lambda は claims から `sub` を受け取る

### 却下した選択肢と理由

- **ECS Fargate + ALB**: 常時稼働で $40〜60/月。予算超過
- **RDS for PostgreSQL（プロビジョンド）**: 常時起動 $15〜20/月
- **Aurora Serverless v2（min 0 ACU）**: 24時間以上停止すると復帰に30秒以上。
  「毎日面倒なく使える」に反する。常時ウォームにすると $45〜50/月で予算超過
- **Aurora DSQL**: PostgreSQL 互換に欠落があり、外部キー制約が使えないとされる（要確認）。
  DPU 課金の事前見積もりも困難
- **Amplify Hosting**:
  - SSR compute のコールドスタートが1〜3秒（CDN 配信なら0秒）
  - 認証の JWT 検証をアプリコードで書く必要があり、1箇所の書き忘れが情報漏洩になる。
    API Gateway の Cognito Authorizer ならインフラレベルで全エンドポイントに強制できる
  - ビルド分数・SSRリクエスト・compute・転送の4軸課金でコスト予測性が低い
  - 参考: SSR compute は VPC に接続できない（AWS が re:Post で未サポートと回答）
- **Next.js**: 静的SPA構成では SSR / Server Components / Route Handlers が使えず、
  選ぶ利点がない。加えて static export の制約（画像最適化、middleware等）を背負う

## 10. DynamoDB データモデルの管理方針（確定）

**SSOT は `.kiro/specs/database/design.md`（作成予定）。**

決定の要点のみ:

- テーブル1つ、GSI ゼロ
- PK は `USER#<cognitoSub>`、SK の先頭を日付（`D#`）にして「今日の全データを1クエリ」
- meal_items は分離せず食事アイテムに配列として埋め込む
- 栄養値は書き込み時のスナップショット（マスタ編集で過去記録が変わらないように）
- 成分表データは DynamoDB に入れない

### 管理方針の経緯

当初「キー設計台帳を steering に置く」案を採ったが、以下の方針に変更した。

- **SSOT は `.kiro/specs/database/design.md` の1箇所のみ**
- **各機能 Spec の design.md の Data Models セクションは参照のみ。** 構造を書き写さない。
  `#[[file:.kiro/specs/database/design.md]]` で参照する
- steering には「固有の事情」（規約・運用ルール）のみを置き、台帳の実体は持たせない

### `#[[file:]]` 記法の検証結果（重要）

公式ドキュメント上、この記法は **steering の機能としてのみ記載**されている。
実際に `.kiro/steering/data-model.md`（inclusion: auto）で検証したところ、
**参照は展開されず、リテラル文字列としてそのまま返った。**

そのため「参照を書けば自動で内容が注入される」という前提は成立しない。対応:

- `#[[file:]]` は残すが、**それに依存しない。**
- steering と各 Spec に「**`.kiro/specs/database/design.md` を必ず読むこと**」という
  明示的な指示を併記する。これは展開の有無に関わらず機能する
- 展開されなかった場合も文字列がポインタとして残るため、誤情報が入ることはない（劣化のみ）

### 将来的な強制手段

ドキュメントによる SSOT は必ずいつか乖離する。実装開始後は
**SK を組み立てる関数を1モジュールに集約し、SK 文字列の直書きを禁止する。**
これにより命名規則違反が型レベルで不可能になる。

## 11. Spec 分割方針（確定）

Spec は機能単位で作成する（ルールは `.kiro/steering/structure.md`）。

- **ディレクトリをネストさせない。** `specs/infra/auth/` のような2階層は Spec として
  認識されない可能性がある。グループ化はプレフィックス（`specs/infra-auth/`）で行う
- **インフラ専用の Spec 階層を作らない。** このプロジェクトのインフラは機能と1対1に
  対応しない（テーブルは1つで全機能共有、ホスティングも共通）。機能ごとに infra spec を
  作ると中身が空の Spec が並ぶ
- インフラはそれを必要とする機能 Spec のタスクに含める
- インフラ自体が成果物になるものだけ独立 Spec にする（`cost-guardrail` など）

### 想定する Spec 一覧（順序は暫定）

| #   | Spec             | 内容                                                              |
| --- | ---------------- | ----------------------------------------------------------------- |
| 1   | `database`       | データモデルのSSOT。テーブル作成（CDK）。Design-First             |
| 2   | `auth-login`     | Vite+React雛形 + CloudFront/S3 + Cognito + ログイン確認 + CDK基盤 |
| 3   | `body-record`    | 体重・体脂肪の記録とグラフ                                        |
| 4   | `food-master`    | ユーザー登録食品の CRUD                                           |
| 5   | `meal-log`       | 食事記録と日次集計                                                |
| 6   | `goal`           | 目標値の設定と残量表示                                            |
| 7   | `exercise-log`   | 運動記録                                                          |
| 8   | `home-dashboard` | 今日の状態を一目で表示                                            |
| -   | `cost-guardrail` | コスト可視化・通知・停止（後フェーズ）                            |

**`auth-login` のスコープは「画面からログインできることの確認」まで。** 機能は一切作らない。

`body-record` を食事記録より先に置く理由: フロント → API Gateway → Lambda → DynamoDB → グラフ
という全レイヤーを、1日1レコード・属性2つという最小の複雑さで一度貫通できる。
食事記録は品目配列・集計・マスタ参照が絡み MVP 内で最も複雑なため、型が固まってから着手する。

## 12. 実装構成（確定）

- **モノレポ**: npm workspaces（`packages/*` と `infra`）
- **テスト**: Vitest
- **環境数**: 1環境のみデプロイ。ステージ切り替えの仕組みだけ入れる（既定値 `prod`）
  - 2環境にしてもコスト増はほぼゼロだが、管理の手間が2倍になる
  - テーブルは削除保護 + PITR があるため1環境でも事故リスクは低い
- **モジュール配置**: 詳細は `.kiro/steering/structure.md`
  - PK / SK ビルダーは `packages/backend/keys/`（フロントは SK を知る必要がない）
  - JST 日付ユーティリティは `packages/shared/date/`（両方が必要）
  - エンティティ型定義は `packages/shared/types/`

### 環境情報

- AWS アカウント: `354443915910`（IAM ユーザー `inor_dev`）
- リージョン: `ap-northeast-1`（東京）
- Node.js v24 / npm 11 / AWS CLI 2.34 / CDK 2.1142

### コスト監視の着手方針

**`cdk bootstrap` より前に AWS Budgets で予算アラートを設定する。**
課金が始まる前に監視を置く。閾値は実績 $3（約50%）と $6（約100%）。
Budgets は2つまで無料。フルのコストガードレール（自動停止）は後フェーズ（`cost-guardrail` Spec）。

## 13. IaC セキュリティ検査（cdk-nag）の適用範囲（確定）

`ci-cd` Spec タスク4での決定。方針の詳細は `infra/src/aspects/nag-policy.ts` に記載。

### エラーとして扱う範囲

| cdk-nag の指摘レベル     | 扱い                                                     |
| ------------------------ | -------------------------------------------------------- |
| Error                    | 合成失敗（cdk-nag 標準の挙動）                           |
| Warning                  | **合成失敗に昇格させる**                                 |
| INFO                     | 通過（AWS Solutions パックに INFO レベルのルールはない） |
| ルール評価そのものの失敗 | 合成失敗に昇格させる（検査できていない状態を通さない）   |

design.md では「段階的に厳しくする」としていたが、**導入時点の指摘は0件**だったため
最初から最も厳しい設定で始めた。未解消の指摘を抱えていない状態なら妥協する理由がない。

昇格の実装は `additionalLoggers` に自作ロガーを挿す方式。`cdk synth --strict` を使わないのは、
CLI のフラグ指定漏れや `cdk deploy` の直接実行で素通りするため（BudgetGuardrail と同じ理由）。
1件目で例外を投げずエラー注釈にしているのは、全件をまとめて確認できるようにするため。

抑制（`NagSuppressions`）は cdk-nag が `reason` を必須にするため、
受け入れる判断の理由が必ず残る（要件4.3）。`logIgnores: true` にして
抑制したものも合成ログに出す。

### バージョン選定

**cdk-nag 2.38.2 を採用。最新の 3.0.2 は採用しない。**

- v3 は評価基盤が CDK の policy validation framework に変わり、`NagSuppressions` が廃止、
  `aws-cdk-lib` も 2.257.0 以上が必要になる
- 現在の `aws-cdk-lib` は 2.230.0。v3 を選ぶと本 Spec の範囲外である CDK 本体の
  アップグレードが前提になる
- 参考: [cdk-nag v3 の移行点](https://dev.classmethod.jp/articles/cdk-nag-v3-release/)
  （内容はライセンス上の制約により要約）

cdk-nag 2.38.2 の peer 依存に合わせて **`constructs` を 10.4.2 → 10.5.1** に上げた。
10.x 内のマイナー更新で API 互換。

## 14. ESLint の版数と設定方針（確定）

`ci-cd` Spec タスク6での決定。設定の詳細は `eslint.config.js` に記載。

### 版数: ESLint 10 を採用（design.md の「ESLint 9」から変更）

design.md 執筆時点では ESLint 9 が最新だったが、**9 系はサポート終了（maintenance）**
になっており、インストール時に非推奨警告が出る。`typescript-eslint` 8.70.0 は
`eslint ^10.0.0` に対応済みで、Flat Config・設定ファイル1つ・`--max-warnings 0` の
方針はそのまま実現できるため 10 系を採用した。
9 系に留まると ajv@6 由来の脆弱性を抱えたまま要件5（脆弱性ゲート）と噛み合わなくなる。

固定した版数（すべて `--save-exact`）: `eslint` 10.11.0 / `@eslint/js` 10.0.1 /
`typescript-eslint` 8.70.0 / `eslint-config-prettier` 10.1.8

### 型情報つき検査の適用範囲

`recommendedTypeChecked` を `packages/*/src/**` と `infra/src/**` に適用する。
`projectService: true` で各パッケージの tsconfig を自動解決させ、
tsconfig のパスを設定ファイルに列挙しない（パッケージ追加時の更新漏れを避けるため）。

ルート直下の `vitest.config.ts` はどの tsconfig の include にも入っていないため、
構文レベルの検査のみ行う。lint 用の tsconfig を別に作ると設定が二重化するため作らない（要件7.1）。

### 検査で守るようになった規約

| 規約                                                     | 出典                                         | 検査手段                                   |
| -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| フロントエンドから `@lifepilot/backend` を import しない | `structure.md`                               | `@typescript-eslint/no-restricted-imports` |
| 型のみの import は `import type` で書く                  | `tsconfig.base.json` の verbatimModuleSyntax | `consistent-type-imports`                  |
| Promise を放置しない                                     | -                                            | `no-floating-promises`（型情報つき）       |

境界の import 制限の検証結果は「15. ESLint のルール検証結果」に記載する。

### 既存コードの修正

`infra/src/stacks/data-stack.test.ts` が `findResources` の戻り値（`Properties` が `any`）を
直接辿っていたため `no-unsafe-member-access` に触れた。`unknown` に落として型を確認する
ヘルパーに置き換えた。副次的に、テーブル名が取得できない場合に黙って通らなくなった。

## 15. ESLint のルール検証結果（確定）

`ci-cd` Spec タスク7での検証。**「検査が実際に落ちること」を確認した記録。**
lollab では追加ルールが全て `warn` かつ `--max-warnings` 未指定で、
CI が緑のまま通り続けていた。同じ状態になっていないことを実測で確かめる目的。

検証は一時ファイルを作って `npm run lint` / `npx eslint` を実行し、終了コードを確認する
方法で行った。一時ファイルはすべて削除済み。

### 検証項目と結果

| #   | 確認したこと                                      | 結果                                                       |
| --- | ------------------------------------------------- | ---------------------------------------------------------- |
| 1   | 型情報つきルールの違反で lint が失敗する          | 失敗（終了コード1）。`no-floating-promises` が検出         |
| 2   | 警告レベルの違反だけでも lint が失敗する          | 失敗（終了コード1）。`--max-warnings 0` が効いている       |
| 3   | `--max-warnings 0` を外すと警告のみでは失敗しない | 終了コード0。この差が lollab の問題そのもの                |
| 4   | フロントエンド境界の import 制限が発火する        | 発火。`@typescript-eslint/no-restricted-imports`           |
| 5   | 型のみの import も禁止される                      | 発火（`allowTypeImports: false`）                          |
| 6   | サブパス（`@lifepilot/backend/keys`）も禁止される | 発火（group の `@lifepilot/backend/*`）                    |
| 7   | 境界ルールが `packages/frontend` 以外に及ばない   | `packages/shared` の同じ import は検出されない（想定通り） |

**1** は `async` 関数の戻り値を捨てるコードを `packages/backend/src/` に置いて確認した。
型情報がないと検出できない違反であり、`projectService` による型解決が実際に
機能していることの裏付けにもなる。

**2** は警告レベルのルールをプロジェクト設定に残さないため、
CLI の `--rule 'no-console: warn'` で一時的に注入して検証した。
`eslint.config.js` に `warn` のルールは1つも追加していない。

### 境界の import 制限は検証済み（design.md の想定から変更）

design.md とタスク定義では「`packages/frontend` が未作成なので `auth-login` 時に検証」と
していたが、一時的に `packages/frontend/src/` と `packages/frontend/tsconfig.json` を
作ることで**この時点で検証できた。** 検証後に削除しており、リポジトリには残していない。

### 判明した注意点（auth-login への引き継ぎ）

**`packages/frontend` を作る際は `tsconfig.json` を必ず同時に置く。**

`eslint.config.js` の型情報つき設定は `packages/*/src/**/*.{ts,tsx}` を対象にしており、
`projectService: true` はファイルから上位に向かって `tsconfig.json` を探す。
tsconfig がないと以下の parse error になり、**境界ルールの評価まで到達しない。**

```
Parsing error: ... was not found by the project service.
Consider either including it in the tsconfig.json or including it in allowDefaultProject
```

lint は失敗するので事故にはならないが、原因が境界違反ではなく設定不足に見えるため
混乱しやすい。あわせてルートの `tsconfig.json` の `references` にも追加する。

### auth-login に持ち越す項目

- **`.tsx` ファイルでの検証**。ルール設定は `.tsx` を対象に含めているが、
  実ファイルがないため未検証。React コンポーネントを作った時点で確認する
- **`vitest.config.ts` の `include`** が `.tsx` を拾わない問題（design.md 10章）。
  本 Spec の範囲外のまま

## 16. Node バージョンの管理方針（確定）

`ci-cd` Spec タスク8での決定。値そのものは `.nvmrc` を唯一の正とする（要件7.3, 7.4）。

- **`.nvmrc` にはメジャーバージョンのみを書く。** パッチまで固定すると Node の更新ごとに
  ファイルを書き換える運用が発生する。Dependabot は `.nvmrc` を更新しないため放置されやすい。
  nvm も `setup-node` も major 指定からその系列の最新を解決するため、CI とローカルで
  系列が揃えば十分と判断した
- **`package.json` の `engines.node` を `>=20` から `.nvmrc` と矛盾しない下限に上げた。**
  下限が `.nvmrc` より緩いと「engines を満たすのに CI と異なる系列」で開発できてしまう
- CI は `setup-node` の `node-version-file` で `.nvmrc` を参照し、YAML に値を転記しない

## 17. gitleaks はローカルに導入せず CI でのみ実行する（確定）

`ci-cd` Spec タスク10での決定。除外設定は `.gitleaks.toml`（唯一）。

### 決定

**gitleaks はローカルに入れない。GitHub Actions の gitleaks Action でのみ実行する。**

- 理由1: **npm パッケージではなく単体バイナリ**であり、導入するとローカル環境を汚す。
  このプロジェクトのツールは npm で完結させる方針（secretlint を選んだのと同じ理由）
- 理由2: **Windows でのバイナリ取得が現実的でなかった。** 実際に2回試して所要時間が
  許容範囲を超えた。Docker 経由も同様に重い
- ローカルのコミット前検査は secretlint が担当する。作業ツリーの検査はこれで足りる
- gitleaks の役目は「既にコミットされた履歴」の検査であり、これは CI で1回動けばよい。
  毎コミットでローカル実行する必要がない性質のもの

design.md 3章の表と方針は変えていない（元から「CI では Action」としていた）。
変えたのは「ローカルでも実行できるようにしておく」という含みを捨てた点。

### 申し送り（重要・未完了）

**既存コミットの履歴検査は、この時点では実行していない。** 検出があるかどうかは未確認。

- 検査の実施はタスク16（ワークフロー作成）後の**タスク17で、実際の CI 実行として確認する**
- タスク17は「CI が意図通り落ちること」の確認タスクなので、
  gitleaks ステップが実際に履歴を読んでいることもそこで併せて確かめる
- **検出が出た場合は履歴書き換え（認証情報の失効 + `git filter-repo` 等）が必要になりうる。**
  対処方針は検出内容を見てから相談する。コミット数が4つと少ないうちに済ませたい
- CI の checkout は `fetch-depth: 0` にする（これがないと履歴を見ずに緑で通る）

## 18. git hooks は husky 9 + lint-staged、設定はルート `package.json` のみ（確定）

`ci-cd` Spec タスク11での決定。

### 版数

| パッケージ  | 版数     | 備考                                                             |
| ----------- | -------- | ---------------------------------------------------------------- |
| husky       | `9.1.7`  | 執筆時点の最新。v10 は未リリース、9系に deprecated 表示もない    |
| lint-staged | `17.5.1` | 執筆時点の最新。`engines.node >= 22.22.1` で `.nvmrc` の24と適合 |

ESLint 10 のときと違い、husky は design.md 指定の9系がそのまま最新だったため変更なし。
いずれも `--save-exact` で固定する（更新は Dependabot 経由に限る）。

### lint-staged の設定場所

**ルートの `package.json` の `lint-staged` フィールドのみ。** `.lintstagedrc` は作らない
（要件7.1: ツールごとに設定ファイルは1つ）。

### 検査の中身と、そう書いた理由

| 対象                  | コマンド                                          |
| --------------------- | ------------------------------------------------- |
| `*.{ts,tsx}`          | eslint --fix → prettier → secretlint → 関連テスト |
| `*.{json,md,yml,css}` | prettier → secretlint                             |

- **順序**: ESLint 自動修正を先、Prettier を後にする。整形の最終決定権を Prettier に寄せ、
  両者が競合した結果が残らないようにする
- **`eslint --no-warn-ignored`**: ESLint 9 以降、無視対象のファイルを明示的に渡すと
  警告になる。`--max-warnings 0` と組み合わせると、その警告だけでコミットが落ちる
- **`secretlint --no-glob`**: lint-staged は**絶対パス**を渡す。Windows のパスは
  `D:\git\...` とバックスラッシュを含み、これは picomatch のエスケープ文字として解釈される。
  `--no-glob` でリテラルパス扱いにしないと Windows でファイルが1つも検査されない
- **`vitest related --run --passWithNoTests`**: 全テストではなく、変更ファイルから
  モジュールグラフを辿って到達するテストのみ実行する（要件6.1）。
  関連テストが無いファイル（型定義のみのファイル等）で落ちないよう `--passWithNoTests` が必要
- **`secretlint` のマスキング**: v13 では既定で有効。追加のフラグは不要
  （design.md 11章「値そのものはログに出さない」を満たす）

### `.husky/` の扱い

- `prepare` スクリプトは `husky` のみ。`npm install` 時に `core.hooksPath` が
  `.husky/_` に設定される
- **`husky init` は使っていない。** 既定の `pre-commit`（中身は `npm test`）を
  生成してしまうため、フック本体はタスク12・13で定義する
- `.husky/_/` は husky が自身で `.gitignore`（`*`）を置くため、リポジトリに入らない。
  ルートの `.gitignore` に追記する必要はない

## 19. pre-push の検査内容と依存脆弱性の現状（確定 + 一部未決定）

`ci-cd` Spec タスク13での決定。フック本体は `.husky/pre-push`（唯一）。

### 検査内容

型検査（全体）→ 全テスト → 高深刻度以上の脆弱性検査。実測 15 秒（design.md 段2の
「数十秒」に収まる）。いずれかが失敗すると push は中断される（`set -e`）。

> タスク19で `npm run validate` + `npm run audit:high` の2行に置き換えた。
> 整形チェックと lint が加わり、実測は約 23 秒になった。経緯は24を参照。

### 深刻度のしきい値を npm スクリプトに寄せた

**`audit:high` スクリプト（`npm audit --audit-level=high`）を単一の正とし、
pre-push と CI の双方がこれを呼ぶ**（要件6.4, 7.3）。lollab ではしきい値が
フックと CI とドキュメントに転記されて食い違っていたため、値を1箇所だけに置く。

### 脆弱性8件を依存の更新で解消した

タスク13着手時点で `npm audit` が 8件（critical 1 / high 4 / moderate 3）を報告していた。
**しきい値を下げる代わりに、固定していた版数を上げて解消した。** いずれもメジャー更新ではない。

| パッケージ     | 変更                  | 解消した指摘                                                                       |
| -------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `vitest`       | 3.2.4 → **3.2.7**     | critical 1件（`@vitest/mocker` 経由のパストラバーサル）                            |
| `aws-cdk-lib`  | 2.230.0 → **2.270.0** | high 3件（コマンドインジェクション2件、`minimatch` ReDoS）+ moderate 1件（`yaml`） |
| 推移的依存のみ | lock の更新           | high 2件（`brace-expansion`, `fast-uri`）+ moderate 1件（`ajv`）                   |

結果、`audit:high` は通る。テスト 128件は更新後も全て通ることを確認した。

### 残っている moderate 2件は CI（段3）で問題になる

`@vitest/mocker` のパストラバーサル（GHSA-82fw-gwwq-j7x9）が moderate として残る。
**修正には vitest 5 系へのメジャー更新が必要**で、本 Spec の範囲を超える。

pre-push（段2 = high 以上）は通るが、design.md 段3 は「全深刻度」としているため、
**タスク16の CI をそのまま書くと落ちる。** 対処の選択肢は下記の未決定事項に記載する。

`|| true` や `continue-on-error` で見逃す選択は取らない（要件5.2、design.md 8章）。

### 副作用: cdk-nag v3 の前提条件が揃った

`aws-cdk-lib` が 2.270.0 になったため、これまで保留していた cdk-nag v3 への移行が
技術的に可能になった。現状 cdk-nag 2.38.2 + aws-cdk-lib 2.270.0 でテストは通っている。

## 20. フックの動作確認結果（確定）

`ci-cd` Spec タスク14での確認。要件6.3（検査失敗で中断）と要件6.5（`--no-verify` で回避）。

### 確認方法の制約と、それをどう回避したか

作業ツリーにタスク1〜13の未コミット変更が大量にあったため、**このリポジトリに
コミットも push も作らずに**検証した。

- **中断の確認は実リポジトリで行える。** フックが落ちればコミットも push も作られないため、
  本物の `git commit` / `git push --dry-run` を使った
- **`--no-verify` の確認は必ずコミットが作られるため実リポジトリでは行わない。**
  一時ディレクトリに捨てリポジトリを作り、`core.hooksPath` を `.husky/_` に設定して
  本リポジトリの husky shim をコピーし、フック本体だけを「終了コード1を返す」ものに
  差し替えて検証した。検証対象は husky の配線と git の `--no-verify` の挙動であり、
  フックの中身（lint-staged / typecheck）ではないため、この置き換えで十分

### 結果

| 確認項目                                                 | 結果                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| pre-commit: 違反ファイルをステージして `git commit`      | 中断（exit 1）。HEAD 不変、コミットは作られない           |
| pre-commit 失敗後の作業ツリー                            | lint-staged が元の状態へ巻き戻す。stash も残らない        |
| pre-commit: `git commit --no-verify`（捨てリポジトリ）   | フックは実行されずコミット成功                            |
| pre-push: `git push --dry-run`（一時的に型エラーを混入） | typecheck で失敗し push 中断。リモートに ref は作られない |
| pre-push: `git push --no-verify`（捨てリポジトリ）       | フックは実行されず push 成功                              |

違反させた内容は `@typescript-eslint/no-explicit-any` と `no-unused-vars`。
lint-staged は逐次実行なので eslint で落ちた時点で prettier / secretlint / vitest は
スキップされた（無駄な待ち時間が発生しない）。

### `git push --dry-run` は pre-push を実行する（重要）

git 2.53.0.windows.2 で確認。**`--dry-run` でも pre-push は走り、かつリモートには
何も書かれない。** フックが成功する場合も `[new branch]` と表示されるだけで
リモートの ref は増えなかった。

そのため **push 前の全体検査を試したいだけなら `git push --dry-run` が安全な手段**になる。

### `--no-verify` の位置づけ

要件6.5 の回避手段は git の標準機能であり、フック側に実装は不要。
回避しても段3（CI）が同じ検査を行うため、マージ前には必ず検出される。

## 21. VSCode 設定は共有し、`.vscode/settings.json` を git 管理下に置く（確定）

`ci-cd` Spec タスク15での決定。設定の唯一の正は `.vscode/settings.json`。

- `.gitignore` は `.vscode/*` を除外したうえで `!.vscode/settings.json` と
  `!.vscode/extensions.json` のみ例外にする。個人設定（`launch.json` 等）は共有しない
- 共有する理由: 段0（保存時整形）が人によって効かないと、pre-commit 以降で初めて
  差分が出る。整形設定は全員同一であるべきなのでリポジトリに入れる
- `editor.codeActionsOnSave` の `source.fixAll.eslint` は **`"explicit"`**。
  自動保存やフォーカス移動では走らせず、明示的な保存時のみ修正する
- `typescript.tsdk` は `node_modules/typescript/lib`。エディタと `npm run typecheck` が
  同じ TypeScript 5.9.3 を使うようにする（版数は `package.json` を唯一の正とする）
- `.vscode/settings.json` はコメント（JSONC）を書かず素の JSON にする。
  Prettier の検査対象に入るため、パーサ差異で落ちる余地を作らない
- **エディタ設定に強制力はない。** 規約を機械的に守らせるのは pre-commit と CI であり、
  段0 は「その前に気づける」ための補助

## 22. CI（GitHub Actions）の構成と脆弱性しきい値（確定）

`ci-cd` Spec タスク16での決定。ワークフローの唯一の正は `.github/workflows/ci.yml`。

### CI（段3）の脆弱性しきい値は `audit:high` に揃える（19の未決定事項を解決）

**(b) を採用した。** 段2（pre-push）と段3（CI）が同じ `npm run audit:high` を呼ぶ。

| 選択肢                             | 採否 | 理由                                                                                                                       |
| ---------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| (a) vitest をメジャー更新して解消  | 却下 | 3.2.7 → 5.0.1 の2メジャー跨ぎ。テスト基盤の入れ替えは本 Spec（CI 構築）の範囲外で、同じコミットに混ぜると切り戻しが困る    |
| (b) 段3も `audit:high` に揃える    | 採用 | しきい値が npm スクリプト1箇所に集約され、ローカルと CI が食い違わない（要件6.4, 7.3）。`continue-on-error` を使わずに済む |
| (c) 当該アドバイザリのみ理由付除外 | 却下 | `npm audit` に個別アドバイザリの除外機能がなく、`better-npm-audit` 等の追加ツールが必要になる。設定ファイルが1つ増える     |

**受け入れた指摘**: GHSA-82fw-gwwq-j7x9（`vitest` / `@vitest/mocker` のパストラバーサル、
moderate / CVSS 5.9）。`npm audit` が2件と数えるが実体は同一アドバイザリ。

受け入れられると判断した根拠:

- vitest は `devDependencies` であり、**デプロイされる Lambda / フロントエンドの成果物に含まれない**
- 悪用には vitest に攻撃者が用意したテストコードや設定を実行させる必要がある。
  このリポジトリのテストコードは全て自前で、外部から注入される経路がない
- 修正版（vitest 4.1.11 以降）へはいずれ上げるが、**`ci-cd` とは別のコミットで行う**

**常時赤い CI は、緑のまま通り続ける CI と同じくらい機能しない。** lollab の失敗は
「落ちない CI」だったが、「常に落ちている CI」も失敗が情報を持たなくなる点で同じ。
要件5.2 の「一定以上の深刻度」を high 以上と定め、design.md 段3の表と8章を書き換えた。

**再検討の契機**: high 以上が出たら CI が止まる（= 自動で気づける）。
moderate 以下は Dependabot の更新 PR、または vitest のメジャー更新を扱う Spec で見直す。

### ワークフローの構成

- **1ジョブ（`verify`）。** 全体が TypeScript のモノレポなので分割しない
- **各ステップは npm スクリプトを呼ぶだけにする。** バージョンもしきい値も YAML に書かない
- `timeout-minutes: 15` を付ける。ハングした実行が無料枠を食い続けないため
- トリガー: `pull_request`（main, develop）/ `push`（main, develop）/ 週次 cron。
  **cron は UTC** なので `0 0 * * 1` は月曜 9:00 JST
- `permissions: contents: read` のみ。`concurrency` で同一 ref の進行中実行をキャンセル
- **`continue-on-error` / `|| true` は使わない**

### Action は全てコミット SHA で固定する

タグは付け替えられるため、`@v6` のようなタグ指定では実行される中身が変わりうる。
SHA で固定し、横に版数をコメントで残す（Dependabot は github-actions エコシステムで
この形式を更新できる）。固定した版数:

| Action                     | 版数   |
| -------------------------- | ------ |
| `actions/checkout`         | v6.1.0 |
| `actions/setup-node`       | v6.5.0 |
| `gitleaks/gitleaks-action` | v3.0.0 |

### gitleaks Action の設定

- **`GITLEAKS_LICENSE` は不要。** このリポジトリの所有者 `clone701` は個人アカウントであり、
  ライセンスキーが必要なのは Organization 所有のリポジトリのみ（公開/非公開は関係ない）。
  Action は GitHub API でアカウント種別を判定するため `GITHUB_TOKEN` は渡す（自動発行のもの。
  リポジトリシークレットは1つも追加していない）
- **`GITLEAKS_CONFIG: .gitleaks.toml` を明示する。** gitleaks の自動検出はファイル名の
  規約に依存するため、唯一の除外設定ファイルを取り違えないよう明示的に指定する
- **`GITLEAKS_ENABLE_COMMENTS: false`。** PR コメントには `pull-requests: write` が必要で、
  最小権限の方針と衝突する。検出は job の失敗とサマリで分かる
- **`GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false`。** 検出レポートには機密情報の値が入るため、
  ダウンロード可能な成果物として残さない（design.md 11章）
- v3 は Action ランタイムが Node 24。GitHub が 2026年6月に Node 20 を既定から外すため、
  v2 ではなく v3 を選んだ。v2 → v3 の差は実行環境のみで入出力の変更はない

### `cdk synth` の実行方法

`npm run synth --workspace @lifepilot/infra -- --quiet`。`--quiet` はテンプレート本文の
標準出力を抑えるだけで、BudgetGuardrail と cdk-nag の検査結果は出る。
AWS 認証情報は不要（`app.ts` は `CDK_DEFAULT_ACCOUNT` 未定義でも動く）。

## 23. Dependabot の構成（確定）

`ci-cd` Spec タスク18での決定。唯一の正は `.github/dependabot.yml`。
npm（`/`）と github-actions（`/`）の2エントリ。週次（月曜 9:00 JST）。

- **npm のエントリはルートだけ。** workspaces はルートの `package-lock.json` を1つ見るため、
  `packages/*` や `infra` ごとのエントリは不要
- **`labels` は書かない。** Dependabot は**リポジトリに既存のラベルしか付けられず**、
  存在しないラベルを指定すると設定エラーになる。lollab は `frontend` 等を指定していたが
  こちらでは追加しない（ラベルを増やすほどの PR 量にならない）
- **`versioning-strategy` は書かない。** 依存は全て完全固定（`"eslint": "10.11.0"` 形式）
  なので、既定の挙動で manifest と lock の両方が書き換わる
- **`commit-message.prefix` は `chore(deps)`、開発依存は `chore(deps-dev)`。**
  `include: "scope"` でパッケージ名が入る
- **SHA 固定のままにする。** `ci.yml` の `uses` はコミット SHA 固定だが、Dependabot は
  github-actions エコシステムで SHA を追跡し、横の `# vX.Y.Z` コメントも書き換える。
  更新のためにタグ参照へ戻す必要はない（22の方針を維持）

### メジャー更新を除外する副作用

要件5.4 により npm / github-actions の両方で `version-update:semver-major` を除外した。
**`ignore` は Dependabot のセキュリティ更新にも適用される**ため、修正がメジャー版にしか
入らない脆弱性は PR として提案されない。これは CI の `audit:high`（段3・週次）で
検出する前提で受け入れる。検出と提案を別の仕組みに分けたことになる。

## 24. `validate` スクリプトと CI のステップ分割（確定）

`ci-cd` Spec タスク19での決定（要件7.2）。

### `validate` は4つの既存スクリプトを合成するだけにする

```
validate = format:check → lint → typecheck → test
```

design.md 8章のステップ順（速く落ちるものを先に）をそのまま踏襲する。
**しきい値やフラグを `validate` 側に書かない。** `--max-warnings 0` は `lint` が、
`--audit-level=high` は `audit:high` が持つ唯一の正であり、合成側は呼ぶだけにする。

`secretlint` と `audit:high` は `validate` に含めない。前者は段1（lint-staged）と
段3で対象範囲が異なり、後者はコードの変更と無関係に結果が変わる（週次実行の対象）。
コード品質のゲートと性質が違うものを1つの名前に混ぜない。

### CI は `validate` に集約せず、4ステップに分けたまま残す

要件7.2 が求めるのは「CI とローカルが同じ設定を参照する」ことで、
**同じ1コマンドを呼ぶことではない。** 実体はすでに同じ npm スクリプトなので、
分割してもローカルと食い違わない。

| 方式                         | 採否 | 理由                                                                                           |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| CI も `npm run validate` 1本 | 却下 | どの検査で落ちたかがステップ名から分からなくなる。ログを読まないと切り分けできず診断が劣化する |
| CI は4ステップのまま         | 採用 | 失敗箇所がステップ名で分かる。実体は `validate` と同じスクリプト・同じ順序                     |

ずれの防止策として、`ci.yml` の冒頭に「項目を増減するときは `validate` と本ファイルを
同時に直す」ことと、4ステップが `validate` と同一である旨をコメントで明記した。

### pre-push は `validate` を呼ぶように変更した

変更前は `typecheck` / `test` / `audit:high` の3行で、整形と lint は段1
（pre-commit、ステージ済みファイルのみ）にしかなかった。このため
**`git commit --no-verify` を1度使うと、lint 違反がローカルで一度も検査されずに
CI まで到達する**状態だった。

`validate` に置き換えて段2が段1を包含するようにした（design.md 2章「段3は段1〜2の
上位集合」と同じ考え方を段2にも適用）。

実測（同一環境・連続計測）: 旧構成 約 10 秒 → 新構成 約 23 秒（`validate` 単体 16 秒）。
**+13 秒**。design.md 段2の「数十秒」に収まるため許容する。型情報つき lint は
規模の拡大とともに伸びるため、押し付けがましくなったら段2から lint を外して
段3のみに戻す（その時点で再判断する）。

## 未決定事項

- [ ] vitest を 4.1.11 以降へ上げるか（GHSA-82fw-gwwq-j7x9 の解消。22で moderate の
      受け入れを決めたため急ぎではない。メジャー更新なので単独のコミットで行う。
      23の除外設定により **Dependabot は提案しない**ので手動で上げる）
- [ ] gitleaks による既存履歴の検査結果（タスク17の CI 実行で確認する）
- [ ] cdk-nag を v3 へ移行するか（`aws-cdk-lib` の 2.270.0 化により前提条件は解消済み）
- [ ] 独自ドメインを使うか（Route 53 ホストゾーン $0.50/月）
- [ ] コーディング規約・デザインシステムの作成（`.kiro/steering/_archive/` を書き直す）
