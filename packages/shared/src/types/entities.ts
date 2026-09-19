/**
 * DynamoDB エンティティの型定義。
 *
 * SSOT: `.kiro/specs/database/design.md` 「5. エンティティ構造」
 * このファイルを変更する場合は design.md を先に更新すること。
 *
 * MVP 対象: PROFILE / GOAL / FOOD / MEAL / BODY / EX
 * 将来追加: SLEEP / WATER / HABIT（design.md に定義を追記してから実装する）
 */

import type { DateString } from "../date/index.js";

/**
 * エンティティ種別。
 * 期間クエリ（アクセスパターンA3）は複数種別が混在して返るため、
 * SK のパースではなくこの属性で判別する。
 */
export type EntityType =
  | "PROFILE"
  | "GOAL"
  | "FOOD"
  | "TPL"
  | "MEAL"
  | "BODY"
  | "EX"
  | "SLEEP"
  | "WATER"
  | "HABIT";

/** 食事区分。SK の一部になるため値を変更してはいけない。 */
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

/** 分量の単位。 */
export type AmountUnit = "g" | "ml" | "個" | "枚" | "杯";

/** 食品マスタの由来。後フェーズで成分表を取り込む際の区別に使う。 */
export type FoodSource = "user" | "mext";

/** 全エンティティ共通の属性。 */
export interface BaseItem {
  /** `USER#<cognitoSub>` */
  pk: string;
  /** エンティティごとの規則に従う。design.md 「3. キー一覧」参照 */
  sk: string;
  type: EntityType;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** カロリーとPFC。 */
export interface Nutrition {
  /** kcal */
  kcal: number;
  /** g */
  protein: number;
  /** g */
  fat: number;
  /** g */
  carb: number;
}

/** 食事に含まれる1品目。栄養値は記録時点の確定値（スナップショット）。 */
export interface MealItemEntry extends Nutrition {
  name: string;
  amount: number;
  unit: AmountUnit;
  /**
   * 由来の記録用。集計には使わない。
   * マスタを後から編集しても過去の記録が変わらないようにするため、
   * 栄養値はこの参照を辿らず上記のフィールドを使う。
   */
  foodRef: string | null;
}

/** 食事記録。品目を配列として埋め込む（別アイテムに分離しない）。 */
export interface MealItem extends BaseItem {
  type: "MEAL";
  date: DateString;
  mealType: MealType;
  items: MealItemEntry[];
  /** items の合計。書き込み時に確定させ、読み取り時に再計算しない。 */
  totals: Nutrition;
}

/** 体重・体脂肪。1日1件（同日の再登録は upsert）。 */
export interface BodyItem extends BaseItem {
  type: "BODY";
  date: DateString;
  /** kg */
  weight: number | null;
  /** % */
  bodyFat: number | null;
}

/** 目標値。履歴として保持し、過去を振り返るとき当時の目標が分かるようにする。 */
export interface GoalItem extends BaseItem {
  type: "GOAL";
  effectiveFrom: DateString;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carb: number | null;
  /** kg */
  targetWeight: number | null;
}

/** ユーザー登録食品。栄養値は baseAmount / baseUnit あたりの値。 */
export interface FoodItem extends BaseItem, Nutrition {
  type: "FOOD";
  /** ULID */
  foodId: string;
  name: string;
  /** 栄養値が何単位あたりか（通常 100） */
  baseAmount: number;
  baseUnit: AmountUnit;
  source: FoodSource;
  /** 成分表の食品番号など。自前登録の場合は null */
  externalId: string | null;
}

/** 運動記録。MVP では簡易記録に留める。 */
export interface ExerciseItem extends BaseItem {
  type: "EX";
  date: DateString;
  /** 例: 腕立て伏せ, ウォーキング */
  name: string;
  reps: number | null;
  sets: number | null;
  /** 分 */
  minutes: number | null;
}

/** ユーザープロフィール。 */
export interface ProfileItem extends BaseItem {
  type: "PROFILE";
  email: string;
  displayName: string | null;
  /** 現時点では "Asia/Tokyo" 固定。将来の多地域対応用に属性として持つ */
  timezone: string;
}

/** MVP で扱う全エンティティの判別可能ユニオン。 */
export type LifePilotItem =
  | ProfileItem
  | GoalItem
  | FoodItem
  | MealItem
  | BodyItem
  | ExerciseItem;
