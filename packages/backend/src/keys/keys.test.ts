import { describe, expect, it } from "vitest";
import {
  RANGE_END,
  buildBodySk,
  buildDatePrefix,
  buildDateRange,
  buildDateTypePrefix,
  buildExerciseSk,
  buildFoodSk,
  buildGoalRangeUpTo,
  buildGoalSk,
  buildMasterPrefix,
  buildMealSk,
  buildProfileSk,
  buildTemplateSk,
  buildUserPk,
} from "./keys.js";

const SUB = "a1b2c3d4-0000-4000-8000-000000000001";
const ULID = "01J8XQZK9M0000000000000000";

describe("buildUserPk", () => {
  it("USER# プレフィックスを付ける", () => {
    expect(buildUserPk(SUB)).toBe(`USER#${SUB}`);
  });

  it("空文字を拒否する", () => {
    expect(() => buildUserPk("")).toThrow(/must not be empty/);
  });

  it("区切り文字 # を含む値を拒否する（キーインジェクション対策）", () => {
    expect(() => buildUserPk("evil#USER#other")).toThrow(/must not contain/);
  });

  it("範囲終端文字 ~ を含む値を拒否する", () => {
    expect(() => buildUserPk("evil~")).toThrow(/must not contain/);
  });
});

describe("マスタ系 SK", () => {
  it("PROFILE は固定値", () => {
    expect(buildProfileSk()).toBe("PROFILE");
  });

  it("GOAL は適用開始日を含む", () => {
    expect(buildGoalSk("2026-09-01")).toBe("GOAL#2026-09-01");
  });

  it("GOAL は不正な日付を拒否する", () => {
    expect(() => buildGoalSk("2026-02-30")).toThrow(/Invalid date string/);
  });

  it("FOOD は foodId を含む", () => {
    expect(buildFoodSk(ULID)).toBe(`FOOD#${ULID}`);
  });

  it("TPL は templateId を含む", () => {
    expect(buildTemplateSk(ULID)).toBe(`TPL#${ULID}`);
  });

  it("foodId に # を含む値を拒否する", () => {
    expect(() => buildFoodSk("x#y")).toThrow(/must not contain/);
  });
});

describe("日付軸 SK", () => {
  it("MEAL は D#<date>#MEAL#<区分>#<ulid> の形式", () => {
    expect(buildMealSk("2026-09-20", "lunch", ULID)).toBe(`D#2026-09-20#MEAL#lunch#${ULID}`);
  });

  it("BODY は D#<date>#BODY の形式（ulid を持たない）", () => {
    expect(buildBodySk("2026-09-20")).toBe("D#2026-09-20#BODY");
  });

  it("BODY は同じ日付なら常に同じ SK を返す（upsert になる）", () => {
    expect(buildBodySk("2026-09-20")).toBe(buildBodySk("2026-09-20"));
  });

  it("EX は D#<date>#EX#<ulid> の形式", () => {
    expect(buildExerciseSk("2026-09-20", ULID)).toBe(`D#2026-09-20#EX#${ULID}`);
  });

  it("不正な日付を拒否する", () => {
    expect(() => buildBodySk("2026-9-20")).toThrow(/Invalid date string/);
    expect(() => buildMealSk("2026-02-30", "lunch", ULID)).toThrow(/Invalid date string/);
  });

  it("日付軸エンティティはすべて D# で始まる", () => {
    expect(buildBodySk("2026-09-20").startsWith("D#")).toBe(true);
    expect(buildMealSk("2026-09-20", "dinner", ULID).startsWith("D#")).toBe(true);
    expect(buildExerciseSk("2026-09-20", ULID).startsWith("D#")).toBe(true);
  });
});

describe("SK の文字列ソート順", () => {
  it("日付順にソートされる", () => {
    const keys = [
      buildBodySk("2026-09-21"),
      buildBodySk("2026-01-05"),
      buildBodySk("2026-09-20"),
      buildBodySk("2025-12-31"),
    ].sort();

    expect(keys).toEqual([
      "D#2025-12-31#BODY",
      "D#2026-01-05#BODY",
      "D#2026-09-20#BODY",
      "D#2026-09-21#BODY",
    ]);
  });

  it("同日内では種別ごとにまとまる", () => {
    const keys = [
      buildMealSk("2026-09-20", "lunch", ULID),
      buildBodySk("2026-09-20"),
      buildExerciseSk("2026-09-20", ULID),
    ].sort();

    // BODY < EX < MEAL（アルファベット順）
    expect(keys[0]).toContain("#BODY");
    expect(keys[1]).toContain("#EX#");
    expect(keys[2]).toContain("#MEAL#");
  });

  it("マスタ系と日付軸系が混ざらない", () => {
    const dated = buildBodySk("2026-09-20");
    const profile = buildProfileSk();
    const goal = buildGoalSk("2026-09-01");
    const food = buildFoodSk(ULID);

    // D# 系はすべて FOOD# / GOAL# / PROFILE より小さい（D < F < G < P）
    expect(dated < food).toBe(true);
    expect(dated < goal).toBe(true);
    expect(dated < profile).toBe(true);
  });
});

describe("buildDatePrefix - A1（今日の全データ）", () => {
  it("D#<date># を返す", () => {
    expect(buildDatePrefix("2026-09-20")).toBe("D#2026-09-20#");
  });

  it("その日の全種別が begins_with にマッチする", () => {
    const prefix = buildDatePrefix("2026-09-20");
    expect(buildBodySk("2026-09-20").startsWith(prefix)).toBe(true);
    expect(buildMealSk("2026-09-20", "breakfast", ULID).startsWith(prefix)).toBe(true);
    expect(buildExerciseSk("2026-09-20", ULID).startsWith(prefix)).toBe(true);
  });

  it("別の日はマッチしない", () => {
    const prefix = buildDatePrefix("2026-09-20");
    expect(buildBodySk("2026-09-21").startsWith(prefix)).toBe(false);
    expect(buildBodySk("2026-09-02").startsWith(prefix)).toBe(false);
  });

  it("マスタ系はマッチしない", () => {
    const prefix = buildDatePrefix("2026-09-20");
    expect(buildProfileSk().startsWith(prefix)).toBe(false);
    expect(buildGoalSk("2026-09-20").startsWith(prefix)).toBe(false);
  });
});

describe("buildDateTypePrefix - A2（特定日の特定種別）", () => {
  it("MEAL のみにマッチする", () => {
    const prefix = buildDateTypePrefix("2026-09-20", "MEAL");
    expect(prefix).toBe("D#2026-09-20#MEAL");
    expect(buildMealSk("2026-09-20", "lunch", ULID).startsWith(prefix)).toBe(true);
    expect(buildBodySk("2026-09-20").startsWith(prefix)).toBe(false);
    expect(buildExerciseSk("2026-09-20", ULID).startsWith(prefix)).toBe(false);
  });

  it("BODY のみにマッチする", () => {
    const prefix = buildDateTypePrefix("2026-09-20", "BODY");
    expect(buildBodySk("2026-09-20").startsWith(prefix)).toBe(true);
    expect(buildMealSk("2026-09-20", "lunch", ULID).startsWith(prefix)).toBe(false);
  });
});

describe("buildDateRange - A3（期間指定）", () => {
  it("終端に ~ を付ける", () => {
    expect(buildDateRange("2026-06-23", "2026-09-20")).toEqual([
      "D#2026-06-23",
      `D#2026-09-20${RANGE_END}`,
    ]);
  });

  it("開始日のアイテムを含む", () => {
    const [start, end] = buildDateRange("2026-09-18", "2026-09-20");
    const sk = buildBodySk("2026-09-18");
    expect(sk >= start).toBe(true);
    expect(sk <= end).toBe(true);
  });

  it("終了日のアイテムを含む（~ が # より大きいため）", () => {
    const [start, end] = buildDateRange("2026-09-18", "2026-09-20");

    for (const sk of [
      buildBodySk("2026-09-20"),
      buildMealSk("2026-09-20", "dinner", ULID),
      buildExerciseSk("2026-09-20", ULID),
    ]) {
      expect(sk >= start).toBe(true);
      expect(sk <= end).toBe(true);
    }
  });

  it("範囲外の日を含まない", () => {
    const [start, end] = buildDateRange("2026-09-18", "2026-09-20");

    const before = buildBodySk("2026-09-17");
    const after = buildBodySk("2026-09-21");
    expect(before >= start).toBe(false);
    expect(after <= end).toBe(false);
  });

  it("終端 ~ は翌日のアイテムより小さい", () => {
    const [, end] = buildDateRange("2026-09-18", "2026-09-20");
    expect(end < buildBodySk("2026-09-21")).toBe(true);
  });

  it("マスタ系を含まない", () => {
    const [start, end] = buildDateRange("2026-01-01", "2026-12-31");
    for (const sk of [buildProfileSk(), buildGoalSk("2026-06-01"), buildFoodSk(ULID)]) {
      expect(sk >= start && sk <= end).toBe(false);
    }
  });

  it("from が to より後なら例外を投げる", () => {
    expect(() => buildDateRange("2026-09-21", "2026-09-20")).toThrow(/must not be after/);
  });

  it("同一日でも範囲として成立する", () => {
    const [start, end] = buildDateRange("2026-09-20", "2026-09-20");
    const sk = buildMealSk("2026-09-20", "snack", ULID);
    expect(sk >= start && sk <= end).toBe(true);
  });
});

describe("buildGoalRangeUpTo - A4（現在有効な目標値）", () => {
  it("下限を GOAL# で閉じる", () => {
    expect(buildGoalRangeUpTo("2026-09-20")).toEqual(["GOAL#", `GOAL#2026-09-20${RANGE_END}`]);
  });

  it("指定日以前の目標値を含む", () => {
    const [start, end] = buildGoalRangeUpTo("2026-09-20");
    for (const sk of [buildGoalSk("2026-01-01"), buildGoalSk("2026-09-01"), buildGoalSk("2026-09-20")]) {
      expect(sk >= start && sk <= end).toBe(true);
    }
  });

  it("指定日より後の目標値を含まない", () => {
    const [start, end] = buildGoalRangeUpTo("2026-09-20");
    const future = buildGoalSk("2026-09-21");
    expect(future >= start && future <= end).toBe(false);
  });

  it("FOOD# を含まない（上限のみ指定だと F < G で混入する）", () => {
    const [start, end] = buildGoalRangeUpTo("2026-09-20");
    const food = buildFoodSk(ULID);
    expect(food >= start && food <= end).toBe(false);
  });

  it("日付軸アイテムを含まない（上限のみ指定だと D < G で混入する）", () => {
    const [start, end] = buildGoalRangeUpTo("2026-09-20");
    const body = buildBodySk("2026-09-20");
    expect(body >= start && body <= end).toBe(false);
  });

  it("PROFILE を含まない", () => {
    const [start, end] = buildGoalRangeUpTo("2026-09-20");
    expect(buildProfileSk() >= start && buildProfileSk() <= end).toBe(false);
  });
});

describe("buildMasterPrefix - A5, A6（マスタ系一覧）", () => {
  it("FOOD# を返し FOOD アイテムのみにマッチする", () => {
    const prefix = buildMasterPrefix("FOOD");
    expect(prefix).toBe("FOOD#");
    expect(buildFoodSk(ULID).startsWith(prefix)).toBe(true);
    expect(buildGoalSk("2026-09-01").startsWith(prefix)).toBe(false);
    expect(buildTemplateSk(ULID).startsWith(prefix)).toBe(false);
  });

  it("GOAL# を返す", () => {
    expect(buildMasterPrefix("GOAL")).toBe("GOAL#");
    expect(buildGoalSk("2026-09-01").startsWith("GOAL#")).toBe(true);
  });

  it("TPL# を返す", () => {
    expect(buildMasterPrefix("TPL")).toBe("TPL#");
  });
});
