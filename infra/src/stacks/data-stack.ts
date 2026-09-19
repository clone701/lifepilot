import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table, TableEncryption } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { resourceName } from "../config";
import { LifePilotStack, type LifePilotStackProps } from "./base-stack";

export type DataStackProps = LifePilotStackProps;

/**
 * DynamoDB シングルテーブルを構築するスタック。
 *
 * SSOT: `.kiro/specs/database/design.md` 「2. テーブル構成」
 * 設定を変更する場合は design.md を先に更新すること。
 */
export class DataStack extends LifePilotStack {
  public readonly table: Table;

  public constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.table = new Table(this, "LifePilotTable", {
      tableName: resourceName(props.stage),

      // シングルテーブル設計。PK/SK は種別に依存しない汎用名にする
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },

      // 利用しない時期があっても課金がほぼゼロになる
      billingMode: BillingMode.PAY_PER_REQUEST,

      // AWS 所有キー。顧客管理 KMS キーは $1/月/キーで予算の15%を占めるため使わない。
      // DynamoDB は常に保存時暗号化されており、これが無料の選択肢
      encryption: TableEncryption.DEFAULT,

      // S3 エクスポート（アドホック分析）の前提条件。3MB 規模ではコストは無視できる
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },

      // 蓄積した生活データの誤削除を防ぐ
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,

      // Streams は現時点で用途がないため無効（未指定 = 無効）
      // Contributor Insights は追加課金が発生するため無効（未指定 = 無効）
      // GSI / LSI は作らない。全アクセスパターンを PK/SK で賄う
    });

    new CfnOutput(this, "TableName", {
      value: this.table.tableName,
      description: "DynamoDB シングルテーブルの名前",
      exportName: `${this.stackName}-TableName`,
    });

    new CfnOutput(this, "TableArn", {
      value: this.table.tableArn,
      description: "DynamoDB シングルテーブルの ARN",
      exportName: `${this.stackName}-TableArn`,
    });
  }
}
