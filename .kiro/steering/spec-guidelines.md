---
inclusion: fileMatch
fileMatchPattern: ".kiro/specs/**/requirements.md|.kiro/specs/**/design.md"
---

# Spec作成ガイドライン

## 要件定義書（requirements.md）

- **WHAT（何を）とWHY（なぜ）** に集中する
- **HOW（どうやって）** は書かない（設計書で記述）
- 具体的な実装詳細（px値、クラス名、関数名）を避ける
- 抽象的な表現を使う（例: "適切なパディング"、"プライマリカラー"）

### EARS記法

受け入れ基準は **EARS (Easy Approach to Requirements Syntax)** 形式で記述すること。

**5つのパターン:**
1. **Ubiquitous**: `<システム>は<動作>する`
2. **Event-driven**: `WHEN <トリガー>、<システム>は<動作>する`
3. **State-driven**: `WHILE <状態>、<システム>は<動作>する`
4. **Optional**: `WHERE <機能>、<システム>は<動作>する`
5. **Unwanted**: `IF <条件>、<システム>は<動作>する`

**例:**
```markdown
ノートページは /notes URLでアクセス可能である
WHEN ユーザーがタブをクリックする場合、タブナビゲーションは選択状態を表示する
IF 検索結果が0件の場合、「該当するチャンピオンが見つかりません」と表示する
```

---

## 設計書（design.md）

### 基本原則

**CRITICAL: 設計書には実装コードを書かない**

設計書は「何を作るか」「どう繋がるか」を定義するもので、実際のコード実装はタスク実行時にAIが書く。

- **HOW（どうやって）** に集中する
- コンポーネント構造、データフロー、状態管理の方針を記述する
- 実装コード例は書かない（型定義とシグネチャのみ）

### 設計書に書くべきもの

- **システム構成図**: mermaid graph TBで視覚的に表現（コンポーネント間の関係、データフロー）
- **画面遷移図**: mermaid stateDiagramで状態遷移を表現
- コンポーネント名と責務
- Props/関数のシグネチャ（型定義のみ）
- データフロー（どのデータがどう流れるか）
- 状態管理の方針
- API設計（関数名、パラメータ、戻り値の型のみ）
- UI/UXの方針（レイアウト構成、スタイル方針）
- エラーハンドリングの方針

### 設計書に書いてはいけないもの

- ❌ 実装コード例（関数の中身、JSX、具体的なロジック）
- ❌ 詳細なコードスニペット
- ❌ className の具体的な値
- ❌ 具体的な実装手順

### 良い例と悪い例

**❌ 悪い例（実装コードを書いている）**:
```typescript
export default function DeleteConfirmationDialog({ isOpen, onConfirm }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button onClick={onConfirm}>削除</button>
    </div>
  );
}
```

**✅ 良い例（設計のみ）**:
```typescript
interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**UI要素**:
- オーバーレイ（黒50%透明）
- ダイアログボックス（白背景、角丸）
- 削除ボタン（赤色）、キャンセルボタン（グレー）

---

## Spec修正ワークフロー

ユーザーが「直して」「修正して」などと言った場合、適切な修正フェーズを自動判断して修正する。

### 修正フェーズの判断基準

- **Requirements**: 「何を作るか」が間違っている、機能の追加・削除
- **Design**: 「どう作るか」が間違っている、コンポーネント構造・データフロー・API設計の問題
- **Tasks**: 実装の順序や粒度の問題
- **実装**: 細かいバグ、スタイル調整、タイポ

### 修正手順

1. 問題の性質を判断
2. 修正フェーズを明示
3. 適切なフェーズから修正実行
4. 影響範囲を考慮（上流の修正は下流にも影響）
