import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { DataStack } from "./data-stack";

/**
 * 生成される CloudFormation テンプレートの不変条件を検証する。
 *
 * ここで守っているのは `.kiro/specs/database/design.md` 「2. テーブル構成」の決定事項。
 * 特にコストに直結する項目（GSI なし / 顧客管理KMSキーなし / Contributor Insights 無効）は、
 * 崩れても動作はするため気づきにくい。テストで固定する。
 */
function synth(stage: "prod" | "dev" = "prod"): Template {
  const app = new App({ context: { stage } });
  const stack = new DataStack(app, `LifePilot-Data-${stage}`, {
    stage,
    env: { account: "123456789012", region: "ap-northeast-1" },
  });
  return Template.fromStack(stack);
}

describe("DataStack - キー設計", () => {
  it("PK は pk（String）、SK は sk（String）", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
    });
  });

  it("テーブルは1つだけ", () => {
    synth().resourceCountIs("AWS::DynamoDB::Table", 1);
  });
});

describe("DataStack - コスト関連の不変条件", () => {
  it("オンデマンド課金である", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("プロビジョンドスループットを設定しない", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      ProvisionedThroughput: Match.absent(),
    });
  });

  it("GSI を作らない", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      GlobalSecondaryIndexes: Match.absent(),
    });
  });

  it("LSI を作らない", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      LocalSecondaryIndexes: Match.absent(),
    });
  });

  it("顧客管理 KMS キーを使わない（$1/月/キーを避ける）", () => {
    const template = synth();

    // SSEEnabled: false は「KMS を使わず AWS 所有キーで暗号化」を意味する。
    // DynamoDB は常に保存時暗号化されており、これが無料の選択肢。
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      SSESpecification: { SSEEnabled: false },
    });

    // KMS キーリソース自体が作られていないことも確認する
    template.resourceCountIs("AWS::KMS::Key", 0);
  });

  it("Contributor Insights を有効にしない（追加課金が発生する）", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      ContributorInsightsSpecification: Match.absent(),
    });
  });

  it("Streams を有効にしない", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      StreamSpecification: Match.absent(),
    });
  });
});

describe("DataStack - データ保護", () => {
  it("PITR が有効（S3エクスポートの前提条件）", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it("削除保護が有効", () => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      DeletionProtectionEnabled: true,
    });
  });

  it("スタック削除時もテーブルを保持する", () => {
    synth().hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
  });
});

describe("DataStack - ステージ分離", () => {
  it("prod のテーブル名は lifepilot-prod", () => {
    synth("prod").hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "lifepilot-prod",
    });
  });

  it("dev のテーブル名は lifepilot-dev", () => {
    synth("dev").hasResourceProperties("AWS::DynamoDB::Table", {
      TableName: "lifepilot-dev",
    });
  });

  it("ステージごとにテーブル名が異なる（環境が混ざらない）", () => {
    const prodName = synth("prod").findResources("AWS::DynamoDB::Table");
    const devName = synth("dev").findResources("AWS::DynamoDB::Table");
    const prod = Object.values(prodName)[0]?.Properties?.["TableName"];
    const dev = Object.values(devName)[0]?.Properties?.["TableName"];
    expect(prod).not.toBe(dev);
  });
});

describe("DataStack - コスト追跡", () => {
  // Match.arrayWith は順序を要求するため、タグは1件ずつ検証する
  it.each([
    ["Project", "lifepilot"],
    ["Stage", "prod"],
    ["ManagedBy", "cdk"],
  ])("%s タグが %s で付く", (key, value) => {
    synth().hasResourceProperties("AWS::DynamoDB::Table", {
      Tags: Match.arrayWith([{ Key: key, Value: value }]),
    });
  });

  it("dev ステージでは Stage タグが dev になる", () => {
    synth("dev").hasResourceProperties("AWS::DynamoDB::Table", {
      Tags: Match.arrayWith([{ Key: "Stage", Value: "dev" }]),
    });
  });
});
