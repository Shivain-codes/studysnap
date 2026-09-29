# Screenshot Capture Guide

Save each image in this folder with the **exact filename** below (PNG). The README gallery
references these paths, so once you drop the files in and push, the images render automatically.

Tip: use a clean browser window (hide bookmarks bar if possible) and capture at a normal
laptop width so the mobile-first layout looks intentional.

## Product screenshots

| File | What to capture |
|------|-----------------|
| `login.png` | The live app sign-in screen at https://main.d1wkxjr5bl55l7.amplifyapp.com/ — the Amplify Authenticator "Sign In / Create Account" card. |
| `dashboard.png` | After login: the dashboard showing at least one study kit row with a **Ready** status pill and the "＋ Upload notes" button. |
| `upload.png` | The Upload page (`/upload`) — the camera-first "Take photo / Choose file" card. (Optional: mid-upload with the progress bar.) |
| `kit-detail.png` | A kit open on the **Summary** tab, showing the topic chips and the summary text. |
| `quiz-me.png` | The **Quiz-Me** tab mid-session: a question, and ideally a graded answer showing a grade badge (correct/partial/incorrect) + the mastery bars. This is the differentiator — make it look good. |

## AWS + agentic proof screenshots

| File | What to capture |
|------|-----------------|
| `kiro-hook.png` | A Kiro agent hook firing in the IDE — e.g. the cdk-validate or pre-commit hook output. (Kiro → Agent Hooks panel, or the hook log.) |
| `cloudformation-stack.png` | AWS Console → CloudFormation → **StudySnapStack** → Resources tab, showing the Lambdas, DynamoDB table, S3 bucket, Cognito pool, API Gateway. |
| `amplify-app.png` | AWS Console → Amplify → the StudySnap app, showing the live `*.amplifyapp.com` domain. |
| `billing-alarm.png` | AWS Console → CloudWatch → Alarms → **StudySnap-Billing-Over-20USD** (threshold $20). |

## Optional extras (not referenced by the README, but nice for the submission)
- `bedrock-invoke.png` — a terminal or console showing a successful Nova invocation.
- `cloudwatch-logs.png` — a Lambda log group showing the structured JSON log lines.
- `sts-identity.png` — `aws sts get-caller-identity` output (redact the account ID if you prefer).

After adding files:
```bash
git add docs/screenshots
git commit -m "docs: add submission screenshots"
git push origin main
```
