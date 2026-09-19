/**
 * JST（日本標準時）基準の日付ユーティリティ。
 *
 * このプロジェクトの日付は**すべて JST 基準**で扱う。
 * UTC 基準にすると日本時間の午前9時前に記録したものが前日扱いになり、
 * 食事記録アプリとして致命的な不具合になる。
 *
 * 実装方針: ホストマシンのタイムゾーンに依存しないよう、
 * UTC エポックミリ秒に +9時間 したうえで UTC の日付要素を読む。
 * JST は夏時間を持たないため固定オフセットで正しく扱える。
 */

/** JST のUTCからのオフセット（ミリ秒）。JSTは夏時間を持たないため固定値。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` の形式チェック用。値の妥当性は別途検証する。 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 日付文字列を表す型エイリアス。`YYYY-MM-DD`（JST基準）。 */
export type DateString = string;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * `YYYY-MM-DD` 形式かつ実在する日付かを判定する。
 * 2026-02-30 のような存在しない日付は false を返す。
 */
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Date.UTC は範囲外の値を繰り上げるため、往復させて一致するか確認する
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

/** 不正な日付文字列を弾く。呼び出し側の前提条件チェック用。 */
export function assertValidDateString(value: string): void {
  if (!isValidDateString(value)) {
    throw new Error(`Invalid date string (expected YYYY-MM-DD): ${value}`);
  }
}

/**
 * Date を JST 基準の `YYYY-MM-DD` に変換する。
 * ホストのタイムゾーン設定に影響されない。
 */
export function toJstDateString(instant: Date): DateString {
  const shifted = new Date(instant.getTime() + JST_OFFSET_MS);
  return [
    pad4(shifted.getUTCFullYear()),
    pad2(shifted.getUTCMonth() + 1),
    pad2(shifted.getUTCDate()),
  ].join("-");
}

/** JST 基準の今日を `YYYY-MM-DD` で返す。 */
export function todayJst(now: Date = new Date()): DateString {
  return toJstDateString(now);
}

/**
 * 日付文字列に日数を加算する（負数で減算）。
 * 月末・年末をまたぐ繰り上がりも正しく処理する。
 */
export function addDaysJst(date: DateString, days: number): DateString {
  assertValidDateString(date);

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return [
    pad4(shifted.getUTCFullYear()),
    pad2(shifted.getUTCMonth() + 1),
    pad2(shifted.getUTCDate()),
  ].join("-");
}

/**
 * 直近 n 日間の開始日を返す（当日を含む）。
 * グラフの期間指定（7 / 30 / 90日）に使う。
 */
export function startOfRecentDaysJst(days: number, today: DateString = todayJst()): DateString {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`days must be a positive integer: ${days}`);
  }
  return addDaysJst(today, -(days - 1));
}

/**
 * from から to までの日付を昇順で列挙する（両端を含む）。
 * グラフの日付軸を作る用途。記録が無い日も軸に並べられる。
 */
export function enumerateDatesJst(from: DateString, to: DateString): DateString[] {
  assertValidDateString(from);
  assertValidDateString(to);
  if (from > to) {
    throw new Error(`from must not be after to: ${from} > ${to}`);
  }

  const dates: DateString[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDaysJst(cursor, 1);
  }
  return dates;
}
