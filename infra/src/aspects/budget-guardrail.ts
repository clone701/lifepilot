import { Annotations, CfnResource, type IAspect, Stack } from "aws-cdk-lib";
import { CfnTable } from "aws-cdk-lib/aws-dynamodb";
import type { IConstruct } from "constructs";

/**
 * 予算ガードレール。月額上限1,000円を単独で超えるリソースを合成時に拒否する。
 *
 * SSOT: `.kiro/specs/ci-cd/design.md` 「5. 予算ガードレール検査」
 * 禁止リソースの根拠は `.kiro/steering/tech.md` 「コスト制約」。
 *
 * テストではなく Aspect にしている理由: テストは実行しなければ素通りするが、
 * Aspect は `cdk synth` / `cdk deploy` の処理の一部なので回避できない。
 *
 * 違反は Annotations ではなく例外で報告する。`Annotations.addError` は CDK CLI 経由の
 * 合成では失敗になるが、`app.synth()` を直接呼ぶ経路では合成が完了してしまうため
 * （CDK は検証時にアノテーションを見ない）、確実に中断させるには throw が必要。
 */

/** 禁止リソース型と概算月額の対応表。エラーメッセージに月額を含めるために使う。 */
export const FORBIDDEN_RESOURCES: ReadonlyMap<string, string> = new Map([
  ["AWS::EC2::NatGateway", "$35〜45/月"],
  ["AWS::ElasticLoadBalancingV2::LoadBalancer", "$18〜/月"],
  ["AWS::ElasticLoadBalancing::LoadBalancer", "$18〜/月"],
  ["AWS::RDS::DBInstance", "$15〜/月"],
  ["AWS::RDS::DBCluster", "$45〜/月"],
  ["AWS::RDS::DBProxy", "$15〜/月"],
  ["AWS::SecretsManager::Secret", "$0.40/月（1シークレットあたり）"],
  ["AWS::KMS::Key", "$1/月（1キーあたり）"],
]);

/** DynamoDB は常にオンデマンドで使う。プロビジョンドは利用しない時期も課金が続くため。 */
const REQUIRED_BILLING_MODE = "PAY_PER_REQUEST";

/** 禁止リソースを例外的に許可する設定。理由の記述を必須にする（要件2.5） */
export interface GuardrailException {
  readonly resourceType: string;
  /** なぜ予算超過を許容するのかを記述する。空文字は許可しない */
  readonly reason: string;
  /** 見積もっている月額の増加分（USD） */
  readonly estimatedMonthlyUsd: number;
}

export interface BudgetGuardrailProps {
  readonly exceptions?: readonly GuardrailException[];
}

export class BudgetGuardrail implements IAspect {
  /** 例外設定を resourceType で引けるようにしたもの。 */
  private readonly exceptions: ReadonlyMap<string, GuardrailException>;

  public constructor(props?: BudgetGuardrailProps) {
    const exceptions = new Map<string, GuardrailException>();

    for (const exception of props?.exceptions ?? []) {
      // 理由のない例外は「とりあえず通す」ための抜け穴になるため、
      // Aspect の生成時点で拒否する（合成を待たずに気づけるようにする）
      if (exception.reason.trim().length === 0) {
        throw new Error(
          `BudgetGuardrail: 例外設定には理由が必要です（resourceType: ${exception.resourceType}）。` +
            "なぜ予算超過を許容するのかを reason に記述してください。",
        );
      }
      exceptions.set(exception.resourceType, exception);
    }

    this.exceptions = exceptions;
  }

  public visit(node: IConstruct): void {
    if (!CfnResource.isCfnResource(node)) {
      return;
    }

    const violations = [
      ...this.checkForbiddenResource(node),
      // DynamoDB の追加検査。L2 Table も内部で CfnTable を生成するため、
      // CDK 経由で定義されたテーブルはすべてここを通る
      ...(node instanceof CfnTable ? checkDynamoTable(node) : []),
    ];

    if (violations.length > 0) {
      const list = violations.map((v) => `  - ${v}`).join("\n");
      throw new Error(`予算ガードレール違反 [${node.node.path}]\n${list}`);
    }
  }

  /** 禁止リソース型かどうかを検査する（要件2.1, 2.2, 2.5） */
  private checkForbiddenResource(node: CfnResource): readonly string[] {
    const resourceType = node.cfnResourceType;
    const estimatedCost = FORBIDDEN_RESOURCES.get(resourceType);
    if (estimatedCost === undefined) {
      return [];
    }

    const exception = this.exceptions.get(resourceType);
    if (exception !== undefined) {
      // 許容した増加分を合成ログに残す。いくら増やす判断をしたのかを追えるようにする
      Annotations.of(node).addInfo(
        `予算ガードレールの例外: ${resourceType}（+$${exception.estimatedMonthlyUsd}/月と見積もり）。理由: ${exception.reason}`,
      );
      return [];
    }

    return [
      `${resourceType} は使用できません（概算 ${estimatedCost}）。` +
        "月額上限1,000円（約$6〜7）を単独で、または大きく圧迫するためです。" +
        "根拠は .kiro/steering/tech.md の「コスト制約」を参照。" +
        "どうしても必要な場合は BudgetGuardrail の exceptions に理由を記述してください。",
    ];
  }
}

/**
 * DynamoDB テーブルの課金に関わる不変条件を検査する（要件2.3, 2.4）。
 *
 * 例外設定の対象にしない。DynamoDB 自体は禁止リソースではなく、
 * ここで見ているのは「使い方」だから。
 */
function checkDynamoTable(table: CfnTable): readonly string[] {
  const violations: string[] = [];

  // CfnTable の GSI / LSI は Lazy トークンとして設定されているため、
  // 生の値を見ると常に「存在する」と判定されてしまう。必ず解決してから見る
  const resolve = (value: unknown): unknown => Stack.of(table).resolve(value);

  if (hasIndex(resolve(table.globalSecondaryIndexes))) {
    violations.push(
      "DynamoDB の GSI は作りません。書き込みが二重に課金され、ストレージも増えます。" +
        "全アクセスパターンを PK/SK で賄う設計です（.kiro/specs/database/design.md）。",
    );
  }

  if (hasIndex(resolve(table.localSecondaryIndexes))) {
    violations.push(
      "DynamoDB の LSI は作りません。" +
        "全アクセスパターンを PK/SK で賄う設計です（.kiro/specs/database/design.md）。",
    );
  }

  const billingMode = resolve(table.billingMode);
  if (billingMode !== REQUIRED_BILLING_MODE) {
    violations.push(
      `DynamoDB の課金モードは ${REQUIRED_BILLING_MODE}（オンデマンド）にしてください` +
        `（現在: ${describeBillingMode(billingMode)}）。` +
        "プロビジョンドは利用しない時期も課金が続きます。",
    );
  }

  return violations;
}

/** 解決後の値が「インデックスを1つ以上持つ」ことを示すかどうか。 */
function hasIndex(resolved: unknown): boolean {
  if (resolved === undefined || resolved === null) {
    return false;
  }
  if (Array.isArray(resolved)) {
    return resolved.length > 0;
  }
  // 解決できないトークンなど、配列でも未定義でもない場合は
  // 安全側に倒して「存在する」とみなす
  return true;
}

/** エラーメッセージ用に課金モードの値を読める形にする。 */
function describeBillingMode(value: unknown): string {
  if (value === undefined || value === null) {
    return "未指定（PROVISIONED 扱い）";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}
