---
inclusion: manual
---

> **【アーカイブ】** これは別プロジェクト（LoL Lab）から持ち込んだファイルです。
> LifePilot の技術スタック確定後に書き直して `.kiro/steering/` へ戻す想定。
> 内容は概ね汎用ですが、`FE-coding-guidelines.md` の選択状態スタイル（amber系）と
> 本ファイル（blue系）が矛盾しているため、統一が必要です。

# デザインシステム

## フォント
**Noto Sans JP**

## カラー

### プライマリ（アクションボタン）
- ボタン背景: `bg-gray-800` / ホバー: `hover:bg-gray-700`
- テキスト: `text-gray-600`（標準）、`text-gray-800`（強調）
- 背景: `bg-gray-50`（薄）、`bg-gray-100`（中）
- ボーダー: `border-gray-200`（標準）、`border-gray-300`（強調）

### インタラクティブ要素（選択・トグル可能なカード・アイコン）
- ホバー: `hover:ring-2 hover:ring-blue-400`
- 選択中: `ring-2 ring-blue-500 shadow-md shadow-blue-500/20 bg-blue-50`

### 削除ボタン
- `bg-red-500` / ホバー: `hover:bg-red-600`

## タイポグラフィ
- サイズ: `text-xs`(12px) / `text-sm`(14px) / `text-base`(16px) / `text-xl`(20px)
- ウェイト: `font-medium`(500) / `font-semibold`(600) / `font-bold`(700)

## スペーシング
- パディング: `p-2`(8px) / `p-3`(12px) / `p-4`(16px)
- ギャップ: `gap-2`(8px) / `gap-3`(12px) / `gap-4`(16px)

## その他
- ボーダー: `rounded`(4px) / `rounded-lg`(8px) / `rounded-full`
- シャドウ: `shadow-sm` / `shadow-md`
- トランジション: `transition-colors duration-150`
- フォーカス（キーボード操作時のみ）: `focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`
- オーバーレイ: `bg-black/20`
