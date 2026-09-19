import { Stack, type StackProps, Tags } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { PROJECT, type Stage } from "../config";

export interface LifePilotStackProps extends StackProps {
  readonly stage: Stage;
}

/**
 * このプロジェクトの全スタックの基底クラス。
 *
 * コスト追跡タグを必ず付ける。Cost Explorer でプロジェクト・ステージ別の
 * 内訳を見るために必要で、付け忘れると予算監視の精度が落ちる。
 * 基底クラスで付けることで、新しいスタックを追加したときの漏れを防ぐ。
 */
export abstract class LifePilotStack extends Stack {
  public readonly stage: Stage;

  protected constructor(scope: Construct, id: string, props: LifePilotStackProps) {
    super(scope, id, props);
    this.stage = props.stage;

    Tags.of(this).add("Project", PROJECT);
    Tags.of(this).add("Stage", props.stage);
    Tags.of(this).add("ManagedBy", "cdk");
  }
}
