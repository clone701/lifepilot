---
inclusion: auto
name: DynamoDBデータモデル台帳
description: DynamoDBのキー設計、SK命名規則、アクセスパターン、アイテム構造を定義する台帳。食事・体重・運動・目標・食品マスタなどのデータ構造を追加または変更する作業、DynamoDBへの読み書きを実装する作業、新しいエンティティを設計する作業で参照する。
---

# DynamoDB データモデル台帳

> **移行予定**: この台帳の実体は `.kiro/specs/database/design.md` に移し、
> 本ファイルは規約と SSOT への参照のみに縮小する（未実施）。
> 移行後は `.kiro/specs/database/design.md` が唯一の正となる。

シングルテーブル設計のキー設計を一元管理する。
**新しいエンティティを追加するときは必ずこのファイルに追記する。**
機能Specごとにキー設計を決めてはいけない（SK命名がばらつくと日付軸クエリが破綻する）。

## 基本方針

- テーブルは**1つだけ**。GSI は**作らない**（ストレージ・書き込みコスト増を避ける）
- PK は `USER#<cognitoSub>`。全データをユーザー単位で分離する
- **SK の先頭を日付にする**（`D#` プレフィックス）。これにより
  「今日の全データを1クエリ」が成立する。この規則を崩してはいけない
- 日付軸を持たないマスタ系は `D#` を付けない

## キー一覧

| 種別 | PK | SK | 状態 |
|---|---|---|---|
| プロフィール | `USER#<sub>` | `PROFILE` | 未実装 |
| 目標値 | `USER#<sub>` | `GOAL#<適用開始日>` | 未実装 |
| ユーザー登録食品 | `USER#<sub>` | `FOOD#<foodId>` | 未実装 |
| いつもの食事 | `USER#<sub>` | `TPL#<templateId>` | 将来 |
| 食事 | `USER#<sub>` | `D#<date>#MEAL#<区分>#<ulid>` | 未実装 |
| 体重・体脂肪 | `USER#<sub>` | `D#<date>#BODY` | 未実装 |
| 運動 | `USER#<sub>` | `D#<date>#EX#<ulid>` | 未実装 |
| 睡眠 | `USER#<sub>` | `D#<date>#SLEEP` | 将来 |
| 水分・カフェイン | `USER#<sub>` | `D#<date>#WATER` | 将来 |
| 自由習慣 | `USER#<sub>` | `D#<date>#HABIT#<key>` | 将来 |

- `<date>` は `YYYY-MM-DD` 形式（ゼロ埋め必須。文字列ソートが日付順になることが前提）
- `<区分>` は `breakfast` / `lunch` / `dinner` / `snack`
- 1日1件のもの（BODY, SLEEP, WATER）は SK に ulid を付けない（upsert になる）
- 1日複数件のもの（MEAL, EX）は ulid を付ける

## アクセスパターン

| 用途 | クエリ |
|---|---|
| 今日の全データ（ホーム画面） | `PK = USER#x AND begins_with(SK, "D#<today>")` |
| 期間グラフ（7/30/90日） | `PK = USER#x AND SK BETWEEN "D#<from>" AND "D#<to>~"` |
| 現在有効な目標値 | `PK = USER#x AND SK <= "GOAL#<today>"` 降順 Limit 1 |
| ユーザー登録食品の一覧 | `PK = USER#x AND begins_with(SK, "FOOD#")` |

- 90日分の全種別で約1,700アイテム・500KB程度。1ページ上限1MB に収まる
- **Scan は使わない。** Query で設計できないアクセスパターンが出た場合は、
  この台帳のキー設計自体を見直す

## アイテム構造

### 食事（MEAL）

```
PK: USER#<sub>
SK: D#2026-09-20#MEAL#lunch#01J8X...
type: "MEAL"
date: "2026-09-20"
mealType: "lunch"
items: [
  { name: "ご飯", amount: 150, unit: "g",
    kcal: 234, protein: 3.8, fat: 0.5, carb: 51.9, foodRef: "mext:01088" }
]
totals: { kcal, protein, fat, carb }
createdAt / updatedAt
```

- **meal_items を別アイテムに分離しない。** 配列として埋め込む。
  1食は多くて10品程度で、1アイテム上限400KBには届かない。
  1回の読み書きで1食が完結し、JOIN が不要になる
- **栄養値は書き込み時のスナップショット。** `foodRef` は由来の記録用であり
  集計には使わない。マスタを後から編集しても過去の記録は変わらない

### 体重・体脂肪（BODY）

```
PK / SK: USER#<sub> / D#2026-09-20#BODY
type: "BODY", date, weight, bodyFat
```

1日1件。同日の再登録は upsert。

### 目標値（GOAL）

```
PK / SK: USER#<sub> / GOAL#2026-09-01
type: "GOAL", effectiveFrom, kcal, protein, fat, carb, targetWeight
```

履歴として保持する。過去を振り返るとき「当時の目標」が分かるようにするため。

### 運動（EX）

```
PK / SK: USER#<sub> / D#2026-09-20#EX#01J8X...
type: "EX", date, name, reps?, sets?, minutes?
```

## 成分表データの扱い

日本食品標準成分表（約2,500件・不変）は **DynamoDB に入れない。**
ビルド時に JSON へ変換してバンドル同梱、または S3 に配置してメモリ上で検索する。
書き込みもクエリも発生しないため、コストゼロで済む。

## セキュリティ上の必須事項

**`userId`（PK）は必ず Cognito の JWT から取得する。クライアントから受け取ってはいけない。**

Next.js Route Handlers 経由では実行ロールが1つのため、IAM レベルのユーザー分離
（`dynamodb:LeadingKeys`）が効かない。アプリ層が唯一の防壁になる。
ここを誤るとリクエスト改変で他人のデータが読める。

## アドホック分析

SQL で探索したくなった場合は、DynamoDB の S3 エクスポート機能（RCU消費なし）を使い、
Athena または手元の DuckDB で分析する。DynamoDB 側にクエリ用の仕組みを足さない。
