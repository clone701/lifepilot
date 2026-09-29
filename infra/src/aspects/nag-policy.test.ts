import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { NagSuppressions } from "cdk-nag";
import { describe, expect, it } from "vitest";
import { DataStack } from "../stacks/data-stack";
import { awsSolutionsChecks } from "./nag-policy";

/**
 * cdk-nag が実際に機能していることを検証する。
 *
 * 検査する仕組みが動いていなければ「指摘0件」は何も意味しないため、
 * 意図的に違反するリソースを置いたスタックで指摘が出ることを確かめる。
 *
 * 検証用リソースの選び方:
 * - Error レベル: 素の S3 バケット（AwsSolutions-S1 / S10 を踏む）
 * - Warning レベル: PITR を無効にした DynamoDB テーブル（AwsSolutions-DDB3 を踏む）
 */

/** cdk-nag を適用した検証用スタックを作り、注釈を取り出す。 */
function nagAnnotations(configure: (stack: Stack) => void): Annotations {
  const app = new App();
  Aspects.of(app).add(awsSolutionsChecks());
  const stack = new Stack(app, "TestStack", {
    env: { account: "123456789012", region: "ap-northeast-1" },
  });
  configure(stack);
  return Annotations.fromStack(stack);
}

/** Warning レベルの指摘を出すためのテーブル（PITR を有効にしない）。 */
function addTableWithoutPitr(stack: Stack): Table {
  return new Table(stack, "NoPitrTable", {
    partitionKey: { name: "pk", type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
  });
}

describe("cdk-nag の適用", () => {
  it("Error レベルの指摘はエラーになる（AwsSolutions-S10）", () => {
    const annotations = nagAnnotations((stack) => {
      new Bucket(stack, "InsecureBucket");
    });

    expect(
      annotations.findError("*", Match.stringLikeRegexp("AwsSolutions-S10")).length,
    ).toBeGreaterThan(0);
  });

  it("Warning レベルの指摘もエラーに昇格する（AwsSolutions-DDB3）", () => {
    const annotations = nagAnnotations(addTableWithoutPitr);

    // 昇格したエラーには、抑制の方法を案内するメッセージが付く
    expect(
      annotations.findError(
        "*",
        Match.stringLikeRegexp("AwsSolutions-DDB3.*警告はエラーとして扱います"),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("理由を書いて抑制した指摘はエラーにならない", () => {
    const annotations = nagAnnotations((stack) => {
      const table = addTableWithoutPitr(stack);
      NagSuppressions.addResourceSuppressions(table, [
        {
          id: "AwsSolutions-DDB3",
          reason: "検証用のテーブルであり、復旧対象となるデータを持たない",
        },
      ]);
    });

    expect(annotations.findError("*", Match.stringLikeRegexp("AwsSolutions-DDB3"))).toHaveLength(0);
    expect(annotations.findWarning("*", Match.stringLikeRegexp("AwsSolutions-DDB3"))).toHaveLength(
      0,
    );
  });

  it("抑制は理由なしでは設定できない（要件4.3）", () => {
    expect(() =>
      nagAnnotations((stack) => {
        const table = addTableWithoutPitr(stack);
        NagSuppressions.addResourceSuppressions(table, [{ id: "AwsSolutions-DDB3", reason: "" }]);
      }),
    ).toThrow();
  });
});

describe("DataStack の cdk-nag 指摘", () => {
  /**
   * 導入時点の指摘は0件。この状態を固定する。
   * 新しいリソースを足して指摘が出た場合は、直すか理由付きで抑制する。
   */
  it("エラーも警告も出ない", () => {
    const app = new App({ context: { stage: "prod" } });
    Aspects.of(app).add(awsSolutionsChecks());
    const stack = new DataStack(app, "LifePilot-Data-prod", {
      stage: "prod",
      env: { account: "123456789012", region: "ap-northeast-1" },
    });

    const annotations = Annotations.fromStack(stack);
    expect(annotations.findError("*", Match.anyValue())).toHaveLength(0);
    expect(annotations.findWarning("*", Match.anyValue())).toHaveLength(0);
  });
});
