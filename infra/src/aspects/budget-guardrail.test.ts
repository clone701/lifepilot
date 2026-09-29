import { App, Aspects, CfnResource, Stack } from "aws-cdk-lib";
import { AttributeType, BillingMode, CfnTable, Table } from "aws-cdk-lib/aws-dynamodb";
import { describe, expect, it } from "vitest";
import { DataStack } from "../stacks/data-stack";
import {
  BudgetGuardrail,
  FORBIDDEN_RESOURCES,
  type BudgetGuardrailProps,
} from "./budget-guardrail";

/**
 * 予算ガードレール Aspect 自体の検証。
 *
 * 検査する仕組みが壊れていたら禁止リソースが素通りするため、
 * 「違反を確実に落とす」ことと「正常な構成を落とさない」ことの両方を固定する。
 *
 * BudgetGuardrail は違反を Annotations ではなく例外で報告するため、
 * 合成（`app.synth()`）が throw することを検証する。
 */

const TEST_ENV = { account: "123456789012", region: "ap-northeast-1" } as const;

/** Aspect を App 全体に適用して合成する。違反があればここで例外が投げられる。 */
function synthWithGuardrail(app: App, props?: BudgetGuardrailProps): void {
  Aspects.of(app).add(new BudgetGuardrail(props));
  app.synth();
}

/** 検証用の空スタックを持つ App を作る。 */
function testApp(): { app: App; stack: Stack } {
  const app = new App();
  const stack = new Stack(app, "TestStack", { env: TEST_ENV });
  return { app, stack };
}

/** 課金に問題のない DynamoDB テーブルを作る（PK/SK のみ、オンデマンド）。 */
function addCompliantTable(stack: Stack): Table {
  return new Table(stack, "TestTable", {
    partitionKey: { name: "pk", type: AttributeType.STRING },
    sortKey: { name: "sk", type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
  });
}

describe("BudgetGuardrail - 禁止リソース", () => {
  it.each([...FORBIDDEN_RESOURCES.keys()])("%s を含むと合成が失敗する", (resourceType) => {
    const { app, stack } = testApp();
    new CfnResource(stack, "Forbidden", { type: resourceType });

    expect(() => synthWithGuardrail(app)).toThrow(/予算ガードレール違反/);
  });

  it("エラーメッセージに概算月額を含む（なぜ禁止かが分かるようにする）", () => {
    const { app, stack } = testApp();
    new CfnResource(stack, "Nat", { type: "AWS::EC2::NatGateway" });

    expect(() => synthWithGuardrail(app)).toThrow(/\$35〜45\/月/);
  });

  it("エラーメッセージに違反したリソースのパスを含む", () => {
    const { app, stack } = testApp();
    new CfnResource(stack, "Nat", { type: "AWS::EC2::NatGateway" });

    expect(() => synthWithGuardrail(app)).toThrow(/TestStack\/Nat/);
  });

  it("禁止されていないリソースは通過する", () => {
    const { app, stack } = testApp();
    new CfnResource(stack, "Topic", { type: "AWS::SNS::Topic" });
    addCompliantTable(stack);

    expect(() => synthWithGuardrail(app)).not.toThrow();
  });
});

describe("BudgetGuardrail - 現行スタック", () => {
  it("現行の DataStack は通過する", () => {
    const app = new App({ context: { stage: "prod" } });
    new DataStack(app, "LifePilot-Data-prod", { stage: "prod", env: TEST_ENV });

    expect(() => synthWithGuardrail(app)).not.toThrow();
  });
});

describe("BudgetGuardrail - DynamoDB の二次インデックス", () => {
  it("GSI を追加すると失敗する", () => {
    const { app, stack } = testApp();
    addCompliantTable(stack).addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: AttributeType.STRING },
    });

    expect(() => synthWithGuardrail(app)).toThrow(/GSI は作りません/);
  });

  it("LSI を追加すると失敗する", () => {
    const { app, stack } = testApp();
    addCompliantTable(stack).addLocalSecondaryIndex({
      indexName: "lsi1",
      sortKey: { name: "lsi1sk", type: AttributeType.STRING },
    });

    expect(() => synthWithGuardrail(app)).toThrow(/LSI は作りません/);
  });
});

describe("BudgetGuardrail - DynamoDB の課金モード", () => {
  it("プロビジョンドにすると失敗する", () => {
    const { app, stack } = testApp();
    new Table(stack, "ProvisionedTable", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
    });

    expect(() => synthWithGuardrail(app)).toThrow(/PAY_PER_REQUEST/);
  });

  it("課金モードを明示的に PROVISIONED にした場合、現在の値をメッセージに含む", () => {
    const { app, stack } = testApp();
    new CfnTable(stack, "RawTable", {
      billingMode: "PROVISIONED",
      keySchema: [{ attributeName: "pk", keyType: "HASH" }],
      attributeDefinitions: [{ attributeName: "pk", attributeType: "S" }],
      provisionedThroughput: { readCapacityUnits: 5, writeCapacityUnits: 5 },
    });

    expect(() => synthWithGuardrail(app)).toThrow(/現在: PROVISIONED/);
  });

  it("オンデマンドなら通過する", () => {
    const { app, stack } = testApp();
    addCompliantTable(stack);

    expect(() => synthWithGuardrail(app)).not.toThrow();
  });
});

describe("BudgetGuardrail - 例外設定", () => {
  it("理由のない例外設定は Aspect の生成時点で拒否される", () => {
    expect(
      () =>
        new BudgetGuardrail({
          exceptions: [{ resourceType: "AWS::KMS::Key", reason: "", estimatedMonthlyUsd: 1 }],
        }),
    ).toThrow(/例外設定には理由が必要です/);
  });

  it("空白のみの理由も拒否される", () => {
    expect(
      () =>
        new BudgetGuardrail({
          exceptions: [{ resourceType: "AWS::KMS::Key", reason: "   \n ", estimatedMonthlyUsd: 1 }],
        }),
    ).toThrow(/例外設定には理由が必要です/);
  });

  it("理由のある例外設定は該当リソースを通過させる", () => {
    const { app, stack } = testApp();
    new CfnResource(stack, "Key", { type: "AWS::KMS::Key" });

    expect(() =>
      synthWithGuardrail(app, {
        exceptions: [
          {
            resourceType: "AWS::KMS::Key",
            reason: "テスト用。顧客管理キーが必要な事情を記述する場所",
            estimatedMonthlyUsd: 1,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("例外は指定したリソース型にのみ効く", () => {
    const { app, stack } = testApp();
    new CfnResource(stack, "Nat", { type: "AWS::EC2::NatGateway" });

    expect(() =>
      synthWithGuardrail(app, {
        exceptions: [
          {
            resourceType: "AWS::KMS::Key",
            reason: "KMS だけを許可する設定",
            estimatedMonthlyUsd: 1,
          },
        ],
      }),
    ).toThrow(/AWS::EC2::NatGateway/);
  });
});
