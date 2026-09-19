#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { REGION, resolveStage, stackName } from "./config";
import { DataStack } from "./stacks/data-stack";

const app = new App();

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
