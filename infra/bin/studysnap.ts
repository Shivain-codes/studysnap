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

const aiModelId =
  (app.node.tryGetContext('aiModelId') as string | undefined) ??
  process.env.AI_MODEL_ID ??
  'us.anthropic.claude-haiku-4-5-20251001-v1:0';

new StudySnapStack(app, 'StudySnapStack', {
  env,
  alarmEmail,
  aiModelId,
  description: 'StudySnap — AI study assistant (skeleton: health + data + auth + billing alarm)',
  tags: {
    Project: 'StudySnap',
    Hackathon: 'zero-to-shipped',
    Lane: 'social-good-community',
  },
});
