import { Annotations } from "aws-cdk-lib";
import {
  AwsSolutionsChecks,
  type INagLogger,
  type NagLoggerComplianceData,
  type NagLoggerErrorData,
  type NagLoggerNonComplianceData,
  type NagLoggerNotApplicableData,
  type NagLoggerSuppressedData,
  type NagLoggerSuppressedErrorData,
  NagMessageLevel,
  VALIDATION_FAILURE_ID,
} from "cdk-nag";

/**
 * cdk-nag（AWS Solutions ルールパック）の適用方針。
 *
 * SSOT: `.kiro/specs/ci-cd/design.md` 「6. cdk-nag の適用方針」
 * 決定の経緯は `docs/decisions.md` を参照。
 *
 * ## エラーとして扱う範囲（要件4.2）
 *
 * **Error レベル・Warning レベルの指摘をどちらも合成失敗として扱う。**
 * INFO レベルのみ通過させる（AWS Solutions パックに INFO レベルのルールはない）。
 *
 * design.md では「最初から全件エラーにすると着手できないため段階的に厳しくする」と
 * していたが、導入時点のスタック（DynamoDB テーブル1つ）の指摘は0件だった。
 * 未解消の指摘を抱えていない状態なので、最初から最も厳しい設定で始められる。
 * 後からリソースを追加したときに出る指摘は、その場で直すか理由を書いて抑制する。
 *
 * Warning を昇格させる理由は ESLint を `--max-warnings 0` にするのと同じ
 * （design.md 7章）。警告として放置できる置き場所を作らない。
 * 受け入れる判断をしたものは `NagSuppressions` に理由を書いて残す（要件4.3）。
 */

/**
 * cdk-nag の Warning レベルの指摘、およびルール評価そのものの失敗を
 * エラー注釈へ昇格させるロガー。
 *
 * cdk-nag 本体には指摘レベルを引き上げる設定がないため、`additionalLoggers` で足す。
 * `cdk synth --strict` ではなくコード側で昇格させるのは、CLI のフラグ指定漏れや
 * `cdk deploy` の直接実行で素通りしないようにするため（BudgetGuardrail と同じ考え方）。
 *
 * エラー注釈を使い、BudgetGuardrail のように例外を投げないのは、
 * 1件目で止めずに全件を一度に確認できるようにするため。
 * CDK CLI はエラー注釈が1件でもあれば synth / deploy を失敗させる。
 */
export class NagWarningEscalator implements INagLogger {
  public onNonCompliance(data: NagLoggerNonComplianceData): void {
    if (data.ruleLevel !== NagMessageLevel.WARN) {
      // Error レベルは cdk-nag 標準の AnnotationLogger が既にエラーにしている。
      // INFO レベルは昇格対象にしない。
      return;
    }

    Annotations.of(data.resource).addError(
      `${formatFinding(data)}: ${data.ruleInfo} ` +
        "cdk-nag の警告はエラーとして扱います。" +
        "修正するか、受け入れる場合は NagSuppressions に理由を記述してください" +
        "（方針: .kiro/specs/ci-cd/design.md 6章）。",
    );
  }

  /**
   * ルールが評価できなかった場合（多くは組み込み関数による未解決トークンが原因）。
   * cdk-nag 標準では警告どまりだが、検査できていない状態を黙って通さないためエラーにする。
   */
  public onError(data: NagLoggerErrorData): void {
    Annotations.of(data.resource).addError(
      `${VALIDATION_FAILURE_ID}[${data.ruleId}]: ルールを評価できませんでした。` +
        "評価できない状態を放置しないため、エラーとして扱います。" +
        `受け入れる場合は ${VALIDATION_FAILURE_ID} を理由付きで抑制してください。` +
        `詳細: ${data.errorMessage}`,
    );
  }

  // 以下は昇格対象ではないため何もしない（INagLogger の実装上必要）
  public onCompliance(_data: NagLoggerComplianceData): void {}
  /** 抑制済みの指摘。理由は NagSuppressions 側に記録されている */
  public onSuppressed(_data: NagLoggerSuppressedData): void {}
  public onSuppressedError(_data: NagLoggerSuppressedErrorData): void {}
  public onNotApplicable(_data: NagLoggerNotApplicableData): void {}
}

/** 指摘の識別子を `ルールID[検出ID]` 形式にする。抑制設定に転記できる形にそろえる。 */
function formatFinding(data: NagLoggerNonComplianceData): string {
  return data.findingId.length > 0 ? `${data.ruleId}[${data.findingId}]` : data.ruleId;
}

/**
 * このプロジェクトの方針を適用した AwsSolutionsChecks を作る。
 *
 * 設定を1箇所に閉じるための関数（要件7.1）。テストも同じものを使う。
 */
export function awsSolutionsChecks(): AwsSolutionsChecks {
  return new AwsSolutionsChecks({
    // 指摘の理由まで出す。メッセージだけでは何を直せばよいか分からないことが多い
    verbose: true,
    // 抑制したものも合成ログに残す。「いつの間にか全部抑制されていた」を防ぐ
    logIgnores: true,
    additionalLoggers: [new NagWarningEscalator()],
  });
}
