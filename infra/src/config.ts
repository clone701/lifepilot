/**
 * デプロイ環境（ステージ）の設定。
 *
 * 現時点では `prod` の1環境のみをデプロイする。
 * 切り替えの仕組みだけ用意しておき、必要になってから `dev` を追加する。
 * （個人開発で2環境を維持する手間を避けるため）
 */

/** デプロイ先リージョン。東京固定。 */
export const REGION = "ap-northeast-1";

/** プロジェクト識別子。リソース名のプレフィックスに使う。 */
export const PROJECT = "lifepilot";

/** 有効なステージ名。 */
export const STAGES = ["prod", "dev"] as const;

export type Stage = (typeof STAGES)[number];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/**
 * CDK コンテキストからステージを解決する。
 * `cdk deploy -c stage=dev` で切り替える。既定値は `cdk.json` の `prod`。
 */
export function resolveStage(contextValue: unknown): Stage {
  if (typeof contextValue !== "string" || contextValue.length === 0) {
    throw new Error(
      `stage context is required. Set it in cdk.json or pass -c stage=<${STAGES.join("|")}>`,
    );
  }
  if (!isStage(contextValue)) {
    throw new Error(`Unknown stage "${contextValue}". Expected one of: ${STAGES.join(", ")}`);
  }
  return contextValue;
}

/** リソース名を `lifepilot-<stage>-<suffix>` の形式で組み立てる。 */
export function resourceName(stage: Stage, suffix?: string): string {
  return suffix === undefined ? `${PROJECT}-${stage}` : `${PROJECT}-${stage}-${suffix}`;
}

/** CloudFormation スタック名を組み立てる。 */
export function stackName(stage: Stage, name: string): string {
  return `LifePilot-${name}-${stage}`;
}
