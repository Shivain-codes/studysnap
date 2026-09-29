#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StudySnapStack } from '../lib/studysnap-stack';

const app = new cdk.App();

// Billing metrics live in us-east-1; the whole app targets us-east-1 (verified backend).
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// Alarm email can come from -c alarmEmail=... or the ALARM_EMAIL env var.
const alarmEmail =
  (app.node.tryGetContext('alarmEmail') as string | undefined) ?? process.env.ALARM_EMAIL;

// Primary model: Amazon Nova Lite (first-party, multimodal, unblocked).
// Claude Haiku stays available as an env-var fallback if the Anthropic
// Marketplace subscription ever clears.
const aiModelId =
  (app.node.tryGetContext('aiModelId') as string | undefined) ??
  process.env.AI_MODEL_ID ??
  'us.amazon.nova-lite-v1:0';

// Per-feature override for Quiz-Me grading (defaults to the primary model).
const quizModelId =
  (app.node.tryGetContext('quizModelId') as string | undefined) ??
  process.env.QUIZ_MODEL_ID ??
  aiModelId;

new StudySnapStack(app, 'StudySnapStack', {
  env,
  alarmEmail,
  aiModelId,
  quizModelId,
  description: 'StudySnap — AI study assistant (skeleton: health + data + auth + billing alarm)',
  tags: {
    Project: 'StudySnap',
    Hackathon: 'zero-to-shipped',
    Lane: 'social-good-community',
  },
});

// Frontend CI/CD is handled by AWS Amplify Hosting (Git-connected, amplify.yml).
// Backend deploys via `npm run deploy`. No GitHub OIDC role needed.
