---
inclusion: manual
---

> **【アーカイブ】** これは別プロジェクト（LoL Lab）から持ち込んだファイルです。
> 大半は流用可能ですが、以下は LifePilot 用に修正が必要です。
> - 認証が「Supabase Auth の useAuth()」→ Amazon Cognito に変更
> - 画像パスが LoL 固有（`/images/champion/`, `/images/item/`, `/images/runes/`）
> - 選択状態スタイルが amber 系（design-system.md は blue 系）で矛盾
> - fileMatchPattern が `frontend/**` 前提。ディレクトリ構成確定後に見直すこと

# フロントエンドコーディング規約

## 命名規則
- 変数・関数: camelCase / コンポーネント: PascalCase / 定数: UPPER_SNAKE_CASE
- boolean: `is`, `has`, `should` プレフィックス
- イベントハンドラ: `handle` プレフィックス

## 型定義
- 関数の引数と戻り値に型を明示。`any` 禁止（代替: `unknown`）

## ファイルサイズ規約
- 1ファイル1関数・1コンポーネント
- import除き**60行以内**
- 超える場合はサブディレクトリに分割し `index.ts` に集約（例外なし）

## ファイル種別ルール
- `.tsx`: JSX・Reactフック・コンポーネント・カスタムフックのみ
- `.ts`: 純粋関数・ビジネスロジック・型定義・zodスキーマ・APIマッピング
- `.ts` に JSX・React import 禁止 / `.tsx` にビジネスロジック直書き禁止

## Public API パターン
- サブディレクトリには必ず `index.ts` を置き、外部からは `index.ts` 経由のみ参照
- `index.ts` 内部の import は相対パス（`./`）を使用

## コンポーネント
- デフォルトはServer Components。hooks/ブラウザAPI使用時のみ `'use client'`

## セマンティックHTML
- `<div onClick>` 禁止 → `<button>` を使用
- ナビ: `<nav>` / ヘッダー: `<header>` / メイン: `<main>` / フッター: `<footer>`

## 依存方向ルール

```
app/ → components/ → adapters/
                   → lib/
```

- `app/` は `components/` に依存してよい（逆は禁止）
- `components/` は `adapters/` と `lib/` に依存してよい（逆は禁止）
- `components/` 内では「使う側 → 使われる側」の一方向のみ（汎用コンポーネントが固有コンポーネントを参照しない）

## 認証（Supabase Auth）
- `useAuth()` で認証状態取得（`@/lib/contexts/AuthContext`）
- 外部サービス操作は `@/adapters/` 経由のみ

## 画像
- 静的画像: `next/image` / GIF: `<img>` タグ
- パス: `/images/champion/`, `/images/item/`, `/images/runes/`, `/images/loading/`

## スタイル
- Tailwind CSSをインラインで使用
- 選択状態: `ring-2 ring-amber-400 shadow-md shadow-amber-400/30 bg-amber-50/50`

## パス解決
- `@/*` → `./src/*`（tsconfig.jsonで設定済み）

## SOLID原則

- **S（単一責任）**: 1コンポーネント・1関数は1つの責務のみ。表示とデータ取得を混ぜない
- **O（開放閉鎖）**: props/型で拡張可能に設計し、既存コードの修正なく機能追加できるようにする
- **L（リスコフの置換）**: 共通interfaceを実装するコンポーネントは、親が期待する振る舞いを満たす
- **I（インターフェース分離）**: propsは必要最小限。巨大なpropsオブジェクトを渡さず、必要なデータだけ受け取る
- **D（依存性逆転）**: コンポーネントは具体的な外部サービスに直接依存しない。adapters/lib経由で抽象化する
