#!/usr/bin/env node
import { App, Aspects } from "aws-cdk-lib";
import { BudgetGuardrail } from "./aspects/budget-guardrail";
import { awsSolutionsChecks } from "./aspects/nag-policy";
import { REGION, resolveStage, stackName } from "./config";
import { DataStack } from "./stacks/data-stack";

const app = new App();

// 予算ガードレールを App 全体に適用する。スタック単位ではなく App に付けるのは、
// 今後スタックを追加したときに適用漏れが起きないようにするため。
// 例外を認める場合は exceptions に理由を書く（BudgetGuardrail 参照）。
Aspects.of(app).add(new BudgetGuardrail());

// cdk-nag（AWS Solutions ルールパック）も同じ理由で App 全体に適用する。
// Error / Warning どちらの指摘も合成失敗として扱う。方針は nag-policy.ts を参照。
Aspects.of(app).add(awsSolutionsChecks());

const stage = resolveStage(app.node.tryGetContext("stage"));

// アカウントは CDK CLI が認証情報から渡す CDK_DEFAULT_ACCOUNT を使う。
// リポジトリにアカウントIDを埋め込まないため。
// exactOptionalPropertyTypes のため、未定義時はプロパティ自体を含めない。
const account = process.env["CDK_DEFAULT_ACCOUNT"];
const env = account === undefined ? { region: REGION } : { account, region: REGION };

// コスト追跡タグは LifePilotStack 基底クラスが自動で付ける
new DataStack(app, stackName(stage, "Data"), {
  stage,
  env,
  description: "LifePilot: DynamoDB シングルテーブル",
});
