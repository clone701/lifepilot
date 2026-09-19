---
inclusion: manual
---

> **【アーカイブ】** これは別プロジェクト（LoL Lab）から持ち込んだファイルです。
> 前提が NextAuth.js / Supabase RLS / Riot API であり、LifePilot の
> Amazon Cognito + AWS 構成とは一致しません。構成確定後に書き直す想定。
> XSS / SQLi / 入力検証 / 環境変数管理 / localStorage の考え方は流用可能です。

# セキュリティガイドライン

## 認証・認可

**フロントエンド**: NextAuth.jsの`useSession()`で認証状態を確認。未認証時は`redirect('/api/auth/signin')`

**バックエンド**: FastAPIの`Depends()`でJWTトークン検証。無効時は`HTTPException(401)`

## 入力検証

**必須**: 全ユーザー入力を検証

**フロントエンド**: 正規表現で形式チェック、DOMPurifyでサニタイズ

**バックエンド**: Pydanticの`Field()`で長さ制限、`@validator`で危険文字列検出

```python
# Pydantic例
class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    
    @validator('title')
    def sanitize(cls, v):
        if '<script>' in v.lower():
            raise ValueError('Invalid input')
        return v.strip()
```

## XSS対策

**React**: 自動エスケープ（`<div>{userInput}</div>`）

**禁止**: `dangerouslySetInnerHTML`の無検証使用、`eval()`

**必要時**: DOMPurify.sanitize()を使用

## SQLインジェクション対策

**Supabase**: パラメータ化クエリ（`.eq('id', note_id)`）

**禁止**: 文字列結合クエリ（`f"SELECT * FROM notes WHERE id = {note_id}"`）

## CSRF対策

**NextAuth.js**: 自動保護（追加設定不要）

**FastAPI**: CORS設定で`allow_origins`を信頼できるオリジンのみに制限

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
)
```

## 環境変数管理

**必須**: 機密情報は環境変数（`.env`ファイル、Git除外）

**禁止**: コードにハードコード

**フロントエンド**: `NEXT_PUBLIC_`プレフィックスは公開される

**バックエンド**: `pydantic-settings`で管理（`settings.riot_api_key`）

## レート制限

**Riot API**: デコレータで100req/2min制限

```python
@rate_limit(max_calls=100, period=120)
async def fetch_riot_api(endpoint: str):
    pass
```

## エラーハンドリング

**必須**: 一般的なエラーメッセージ（"Internal server error"）

**禁止**: 詳細エラー情報の露出（トレースバック、機密情報）

**ログ**: エラーはログに記録、機密情報は記録しない

```python
logger.error(f"Operation failed: {e}", exc_info=True)
raise HTTPException(status_code=500, detail="Operation failed")
```

## データベースセキュリティ

**Supabase RLS**: ユーザーは自分のデータのみアクセス可能

```sql
CREATE POLICY "Users can only access their own notes"
ON notes FOR ALL USING (auth.uid() = user_id);
```

**最小権限**: `anon_key`使用、`service_role_key`は必要時のみ

## セキュリティチェックリスト

**実装前**: 認証・認可、入力検証、機密情報の扱いを確認

**実装中**: 入力検証、パラメータ化クエリ、環境変数使用、エラーメッセージに機密情報を含めない

**実装後**: 依存関係チェック（npm audit, pip-audit）、セキュリティスキャン（bandit）、認証動作確認、HTTPS確認

## 絶対禁止

**TypeScript**: `eval()`, 無検証`dangerouslySetInnerHTML`, 機密情報ハードコード, 文字列結合クエリ

**Python**: `exec()`, 機密情報ログ出力, 文字列結合クエリ

## localStorage / sessionStorage

**禁止**: 認証トークン、セッションID、APIキー、個人情報の保存

**許可**: UIテーマ、検索履歴（サモナー名程度）、キャッシュ的データなど機密性のないもの

## 参考

OWASP Top 10, NextAuth.js Security, FastAPI Security, Supabase Security
