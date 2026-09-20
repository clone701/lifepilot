import { afterEach, describe, expect, it } from "vitest";
import {
  addDaysJst,
  assertValidDateString,
  enumerateDatesJst,
  isValidDateString,
  startOfRecentDaysJst,
  todayJst,
  toJstDateString,
} from "./jst.js";

describe("toJstDateString - JST境界", () => {
  it("UTC 15:00 は JST では翌日の 00:00 になる", () => {
    // 2026-09-20T15:00:00Z = 2026-09-21T00:00:00+09:00
    expect(toJstDateString(new Date("2026-09-20T15:00:00Z"))).toBe("2026-09-21");
  });

  it("UTC 14:59:59 はまだ JST の同日", () => {
    expect(toJstDateString(new Date("2026-09-20T14:59:59Z"))).toBe("2026-09-20");
  });

  it("UTC 00:00 は JST では同日の 09:00（前日にならない）", () => {
    // これが UTC 基準だと朝食が前日扱いになる不具合の核心
    expect(toJstDateString(new Date("2026-09-20T00:00:00Z"))).toBe("2026-09-20");
  });

  it("JST の早朝（UTC では前日）でも JST の日付を返す", () => {
    // 2026-09-20T22:00:00Z = 2026-09-21T07:00:00+09:00（朝食の時間帯）
    expect(toJstDateString(new Date("2026-09-20T22:00:00Z"))).toBe("2026-09-21");
  });

  it("年境界をまたぐ", () => {
    // 2025-12-31T15:00:00Z = 2026-01-01T00:00:00+09:00
    expect(toJstDateString(new Date("2025-12-31T15:00:00Z"))).toBe("2026-01-01");
  });
});

describe("toJstDateString - ゼロ埋め", () => {
  it("月と日を2桁にゼロ埋めする", () => {
    expect(toJstDateString(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("常に YYYY-MM-DD の10文字になる", () => {
    const result = toJstDateString(new Date("2026-03-07T00:00:00Z"));
    expect(result).toHaveLength(10);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("加算結果もゼロ埋めされる", () => {
    // 1桁の月・日になるケース（ゼロ埋めを外すと "2027-1-1" になる）
    expect(addDaysJst("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysJst("2026-09-10", -1)).toBe("2026-09-09");
    expect(addDaysJst("2026-02-01", -1)).toBe("2026-01-31");
  });

  it("文字列としてソートすると日付順になる（要件5.3）", () => {
    const dates = ["2026-10-01", "2026-01-05", "2026-09-30", "2025-12-31", "2026-01-15"];
    expect([...dates].sort()).toEqual([
      "2025-12-31",
      "2026-01-05",
      "2026-01-15",
      "2026-09-30",
      "2026-10-01",
    ]);

    // 生成側（列挙）も昇順と文字列ソート順が一致する
    const enumerated = enumerateDatesJst("2026-09-28", "2026-10-03");
    expect(enumerated).toEqual([...enumerated].sort());
  });
});

describe("ホストのタイムゾーンに依存しない", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    // テスト間にタイムゾーン設定を漏らさない
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  // JST より進んだ地域 / 遅れた地域 / JST 自身 / UTC を含める
  const timezones = ["UTC", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Midway", "America/New_York"];

  it("同じ時刻はどのタイムゾーンでも同じ JST 日付になる", () => {
    // JST の日付境界をまたぐ前後の時刻
    const instants = [
      "2026-09-20T14:59:59Z",
      "2026-09-20T15:00:00Z",
      "2026-09-20T00:00:00Z",
      "2026-09-20T23:59:59Z",
      "2025-12-31T15:00:00Z",
    ];

    for (const instant of instants) {
      const results = timezones.map((tz) => {
        process.env.TZ = tz;
        return toJstDateString(new Date(instant));
      });

      // すべてのタイムゾーンで結果が一致すること
      expect(new Set(results).size).toBe(1);
    }
  });

  it("JST 境界の期待値はタイムゾーンを変えても変わらない", () => {
    for (const tz of timezones) {
      process.env.TZ = tz;
      expect(toJstDateString(new Date("2026-09-20T15:00:00Z"))).toBe("2026-09-21");
      expect(toJstDateString(new Date("2026-09-20T14:59:59Z"))).toBe("2026-09-20");
      expect(toJstDateString(new Date("2026-09-20T00:00:00Z"))).toBe("2026-09-20");
      expect(todayJst(new Date("2026-09-20T16:30:00Z"))).toBe("2026-09-21");
    }
  });

  it("日付の加減算・列挙もタイムゾーンに依存しない", () => {
    for (const tz of timezones) {
      process.env.TZ = tz;
      expect(addDaysJst("2026-09-30", 1)).toBe("2026-10-01");
      expect(addDaysJst("2026-01-01", -1)).toBe("2025-12-31");
      expect(startOfRecentDaysJst(90, "2026-09-20")).toBe("2026-06-23");
      expect(enumerateDatesJst("2026-06-23", "2026-09-20")).toHaveLength(90);
    }
  });
});

describe("todayJst", () => {
  it("注入した時刻を JST で解釈する", () => {
    expect(todayJst(new Date("2026-09-20T16:30:00Z"))).toBe("2026-09-21");
  });

  it("引数なしでも YYYY-MM-DD 形式を返す", () => {
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isValidDateString", () => {
  it("正しい日付を受け入れる", () => {
    expect(isValidDateString("2026-09-20")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true); // うるう年
  });

  it("実在しない日付を拒否する", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-00-10")).toBe(false);
    expect(isValidDateString("2025-02-29")).toBe(false); // 平年
  });

  it("形式違いを拒否する", () => {
    expect(isValidDateString("2026-9-20")).toBe(false); // ゼロ埋めなし
    expect(isValidDateString("2026/09/20")).toBe(false);
    expect(isValidDateString("20260920")).toBe(false);
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("2026-09-20T00:00:00Z")).toBe(false);
  });
});

describe("assertValidDateString", () => {
  it("不正な値で例外を投げる", () => {
    expect(() => assertValidDateString("2026-02-30")).toThrow(/Invalid date string/);
  });

  it("正しい値では例外を投げない", () => {
    expect(() => assertValidDateString("2026-09-20")).not.toThrow();
  });
});

describe("addDaysJst", () => {
  it("日を加算する", () => {
    expect(addDaysJst("2026-09-20", 1)).toBe("2026-09-21");
  });

  it("日を減算する", () => {
    expect(addDaysJst("2026-09-20", -1)).toBe("2026-09-19");
  });

  it("月末をまたぐ", () => {
    expect(addDaysJst("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysJst("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("年末をまたぐ", () => {
    expect(addDaysJst("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysJst("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("うるう日を正しく扱う", () => {
    expect(addDaysJst("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysJst("2025-02-28", 1)).toBe("2025-03-01");
  });

  it("90日の減算でも正しい", () => {
    expect(addDaysJst("2026-09-20", -89)).toBe("2026-06-23");
  });

  it("0 加算は同じ日付を返す", () => {
    expect(addDaysJst("2026-09-20", 0)).toBe("2026-09-20");
  });

  it("不正な日付で例外を投げる", () => {
    expect(() => addDaysJst("2026-02-30", 1)).toThrow(/Invalid date string/);
  });
});

describe("startOfRecentDaysJst", () => {
  it("直近7日間の開始日は当日を含めて6日前", () => {
    expect(startOfRecentDaysJst(7, "2026-09-20")).toBe("2026-09-14");
  });

  it("直近30日間", () => {
    expect(startOfRecentDaysJst(30, "2026-09-20")).toBe("2026-08-22");
  });

  it("直近90日間", () => {
    expect(startOfRecentDaysJst(90, "2026-09-20")).toBe("2026-06-23");
  });

  it("1日なら当日", () => {
    expect(startOfRecentDaysJst(1, "2026-09-20")).toBe("2026-09-20");
  });

  it("0以下や小数で例外を投げる", () => {
    expect(() => startOfRecentDaysJst(0, "2026-09-20")).toThrow(/positive integer/);
    expect(() => startOfRecentDaysJst(-1, "2026-09-20")).toThrow(/positive integer/);
    expect(() => startOfRecentDaysJst(1.5, "2026-09-20")).toThrow(/positive integer/);
  });
});

describe("enumerateDatesJst", () => {
  it("両端を含めて昇順で列挙する", () => {
    expect(enumerateDatesJst("2026-09-18", "2026-09-21")).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
    ]);
  });

  it("同一日なら1件返す", () => {
    expect(enumerateDatesJst("2026-09-20", "2026-09-20")).toEqual(["2026-09-20"]);
  });

  it("月境界をまたぐ", () => {
    expect(enumerateDatesJst("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("90日間の日数が正しい", () => {
    const dates = enumerateDatesJst("2026-06-23", "2026-09-20");
    expect(dates).toHaveLength(90);
  });

  it("from が to より後なら例外を投げる", () => {
    expect(() => enumerateDatesJst("2026-09-21", "2026-09-20")).toThrow(/must not be after/);
  });
});
