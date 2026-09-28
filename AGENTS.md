# AGENTS.md — StudySnap Agentic Workflow

How StudySnap was built with **Kiro** (agentic AI IDE) driving an automated, self-checking
development loop on top of AWS. This documents the agent hooks that govern the build and the
verified Kiro → AWS connection used to provision and deploy everything as code.

---

## 1. Why agentic

Every commit, file edit, and infra change runs through automated Kiro hooks so the agent
catches errors the moment they happen instead of at deploy time. The result: fast, safe
iteration during a 4-day sprint, with the AI doing the repetitive verification work.

---

## 2. Kiro Agent Hooks

Hooks live in `.kiro/hooks/*.json` and run automatically on IDE/agent events. StudySnap
uses three, mapping exactly to the hackathon's agentic-workflow requirement.

### 2.1 Pre-commit — lint + tests (`pre-commit-lint-test.json`)
- **Trigger:** `PreToolUse` on `execute_bash`, filtered to commands containing `git commit`.
- **Action:** runs `npm run lint` and `npm test` at the repo root.
- **Gate:** if either fails, the hook exits `2` and **blocks the commit**, printing the
  failing output. Clean lint + tests → exit `0`, commit proceeds.
- **Why:** no broken or unlinted code ever enters git history.

### 2.2 Post-edit — typecheck (`post-edit-typecheck.json`)
- **Trigger:** `PostFileSave` matching `\.(ts|tsx)$`.
- **Action:** detects which workspace the saved file belongs to (`infra`/`services`/`web`)
  and runs that workspace's `typecheck` (`tsc --noEmit`).
- **Behavior:** reports type errors immediately (non-blocking) so they surface at edit time,
  not at build/deploy.
- **Why:** "verify file changes compile" — instant feedback on every TypeScript save.

### 2.3 CDK validation — `cdk synth` on infra change (`cdk-validate-on-infra-change.json`)
- **Trigger:** `PostFileSave` matching `/infra/.*\.(ts|json)$`.
- **Action:** runs `npx cdk synth --quiet` in `infra/`.
- **Behavior:** validates that the CloudFormation template still synthesizes after any
  infrastructure edit; prints synth errors if not.
- **Why:** "validate the CDK template on every infra change" — infra stays deployable.

> Hooks are created via Kiro's hook tooling, not hand-written, and activate on session start.
> Each writes progress to `/tmp/ss_*.log` for inspection.

---

## 3. Kiro → AWS Connection (proof of setup)

StudySnap provisions and deploys **entirely as code** — no console clicks for the stack.
The connection was established and verified as follows (capture screenshots at each ✎ for
the submission):

1. **AWS credentials** configured locally via `aws configure` (IAM user `<IAM_USER>`,
   account `<AWS_ACCOUNT_ID>`, region `us-east-1`). ✎ screenshot: `aws sts get-caller-identity`.
2. **Bedrock access verified by real invocation** (not assumption): `bedrock-runtime
   invoke-model` against `us.anthropic.claude-haiku-4-5-20251001-v1:0` returned a live
   completion. ✎ screenshot: the model returning `STUDYSNAP_OK` with token usage.
3. **CDK bootstrap** of `aws://<AWS_ACCOUNT_ID>/us-east-1`. ✎ screenshot: `CDKToolkit` stack
   `CREATE_COMPLETE`.
4. **One-command deploy** — `npm run deploy` (`cdk deploy`) created the API, DynamoDB table,
   S3 bucket, Cognito pool, and the $20 billing alarm. ✎ screenshot: CloudFormation
   `StudySnapStack` resources in the console.
5. **Live endpoints verified:**
   - Backend: `GET https://u1g7hquhsf.execute-api.us-east-1.amazonaws.com/prod/health` → `{"status":"ok"}`
   - Frontend: `https://main.d1wkxjr5bl55l7.amplifyapp.com/` (Amplify Hosting). ✎ screenshot: browser showing "Backend connected".
6. **Cost guardrail:** CloudWatch alarm `StudySnap-Billing-Over-20USD` (threshold $20).
   ✎ screenshot: the alarm in CloudWatch.

### Console-connection screenshot checklist (for submission)
- [ ] `aws sts get-caller-identity` output
- [ ] Bedrock `invoke-model` success
- [ ] CloudFormation `StudySnapStack` resource list
- [ ] Amplify Hosting app + live URL
- [ ] CloudWatch `$20` billing alarm
- [ ] A Kiro hook firing (e.g. cdk-validate log) in the IDE

---

## 4. How AI + AWS were used together
- **Kiro** (agentic IDE) wrote the spec, CDK stack, Lambdas, and React app, and ran the
  verification hooks on every change.
- **Amazon Bedrock (Claude Haiku 4.5)** is the product's AI engine: note summarization,
  flashcard/quiz generation, multimodal handwriting reading, and the adaptive Quiz-Me tutor.
- **AWS CDK** expresses all infra as code; **Amplify Hosting** serves the frontend over HTTPS.

_Updated as the build progresses._
