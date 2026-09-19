/**
 * DynamoDB の PK / SK を組み立てる唯一の入口。
 *
 * SSOT: `.kiro/specs/database/design.md` 「3. キー一覧」「4. アクセスパターン」
 *
 * **このモジュール以外で SK 文字列を組み立ててはいけない。**
 * SK の先頭を日付にする規則（`D#<date>#...`）が崩れると
 * 「今日の全データを1クエリ」が成立しなくなる。
 */

import { assertValidDateString, type DateString } from "@lifepilot/shared/date";
import type { MealType } from "@lifepilot/shared/types";

/** キーの区切り文字。キー内の値にこの文字を含めてはいけない。 */
const SEP = "#";

/** 日付軸データを示すプレフィックス。マスタ系と SK 空間を分離する。 */
const DATE_PREFIX = "D";

/**
 * 範囲クエリの終端に付ける文字。
 * `~`(U+007E) は `#`(U+0023) より大きいため、`D#<date>` 配下のアイテムを
 * すべて包含できる。かつ翌日の `D#<date+1>` より小さい。
 */
export const RANGE_END = "~";

/** 期間クエリのキー条件（`sk BETWEEN start AND end`）。 */
export type SkRange = readonly [start: string, end: string];

/** 日付軸を持つエンティティ種別。SK が `D#<date>#...` になるもの。 */
export type DatedEntityType = "MEAL" | "BODY" | "EX" | "SLEEP" | "WATER" | "HABIT";

/** 日付軸を持たないマスタ系エンティティ種別。SK が `<TYPE>#...` になるもの。 */
export type MasterEntityType = "GOAL" | "FOOD" | "TPL";

/**
 * キーに埋め込む値の検証。
 * 区切り文字を含む値を許すとキー構造が壊れ、
 * 他ユーザーのデータを指すキーを作られる恐れがある（キーインジェクション）。
 */
function assertKeySegment(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (value.includes(SEP)) {
    throw new Error(`${label} must not contain "${SEP}": ${value}`);
  }
  if (value.includes(RANGE_END)) {
    throw new Error(`${label} must not contain "${RANGE_END}": ${value}`);
  }
}

// --- パーティションキー ---

/**
 * ユーザーのパーティションキーを組み立てる。
 *
 * **`sub` は必ず Cognito JWT の claims から取得した値を渡すこと。**
 * リクエストボディ・クエリパラメータ・パスパラメータの値を渡してはいけない。
 */
export function buildUserPk(sub: string): string {
  assertKeySegment(sub, "cognito sub");
  return `USER${SEP}${sub}`;
}

// --- ソートキー（マスタ系） ---

export function buildProfileSk(): string {
  return "PROFILE";
}

export function buildGoalSk(effectiveFrom: DateString): string {
  assertValidDateString(effectiveFrom);
  return `GOAL${SEP}${effectiveFrom}`;
}

export function buildFoodSk(foodId: string): string {
  assertKeySegment(foodId, "foodId");
  return `FOOD${SEP}${foodId}`;
}

export function buildTemplateSk(templateId: string): string {
  assertKeySegment(templateId, "templateId");
  return `TPL${SEP}${templateId}`;
}

// --- ソートキー（日付軸） ---

function datePart(date: DateString): string {
  assertValidDateString(date);
  return `${DATE_PREFIX}${SEP}${date}`;
}

export function buildMealSk(date: DateString, mealType: MealType, ulid: string): string {
  assertKeySegment(ulid, "ulid");
  return `${datePart(date)}${SEP}MEAL${SEP}${mealType}${SEP}${ulid}`;
}

export function buildBodySk(date: DateString): string {
  return `${datePart(date)}${SEP}BODY`;
}

export function buildExerciseSk(date: DateString, ulid: string): string {
  assertKeySegment(ulid, "ulid");
  return `${datePart(date)}${SEP}EX${SEP}${ulid}`;
}

// --- クエリ用のキー条件 ---

/**
 * A1: 特定日の全エンティティを取得する `begins_with` 条件。
 * ホーム画面で「今日の状態」を1クエリで取るために使う。
 */
export function buildDatePrefix(date: DateString): string {
  return `${datePart(date)}${SEP}`;
}

/** A2: 特定日の特定種別を取得する `begins_with` 条件。 */
export function buildDateTypePrefix(date: DateString, type: DatedEntityType): string {
  return `${datePart(date)}${SEP}${type}`;
}

/**
 * A3: 期間指定の `BETWEEN` 条件。
 * 指定期間の全エンティティ種別が混在して返るため、
 * 種別で絞る場合は取得後に `type` 属性でフィルタする。
 */
export function buildDateRange(from: DateString, to: DateString): SkRange {
  assertValidDateString(from);
  assertValidDateString(to);
  if (from > to) {
    throw new Error(`from must not be after to: ${from} > ${to}`);
  }
  return [datePart(from), `${datePart(to)}${RANGE_END}`];
}

/**
 * A4: 指定日時点で有効な目標値を取得する `BETWEEN` 条件。
 * 降順 + Limit 1 で最新の1件を取る。
 *
 * 注意: `sk <= "GOAL#<date>"` では `FOOD#` や `D#` 系も条件を満たしてしまう
 * （`F` < `G`, `D` < `G`）。必ず下限も `GOAL#` で閉じる。
 */
export function buildGoalRangeUpTo(date: DateString): SkRange {
  assertValidDateString(date);
  return [`GOAL${SEP}`, `${buildGoalSk(date)}${RANGE_END}`];
}

/**
 * A5, A6: マスタ系エンティティの一覧を取得する `begins_with` 条件。
 */
export function buildMasterPrefix(type: MasterEntityType): string {
  return `${type}${SEP}`;
}
