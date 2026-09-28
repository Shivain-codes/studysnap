# StudySnap — Build Tasks (tasks.md)

> Ordered for shipping. **Task 1 gets a public HTTPS URL live before any feature work.**
> Each task is small, independently verifiable, and ends with a commit + this file updated.
> Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Primary model: **Claude Haiku 4.5**
> (`us.anthropic.claude-haiku-4-5-20251001-v1:0`), Sonnet 4.5 behind `AI_MODEL_ID` fallback.

---

## Milestone A — Day-1 Skeleton (SHIP GATE: public URL live)

### T1. Repo scaffold + tooling ✅ DONE
- [x] `git init`; monorepo layout: `/infra` (CDK TS), `/services` (Lambdas), `/web` (React+Vite).
- [x] Root `package.json` workspaces; `.gitignore` (node_modules, cdk.out, .env, dist).
- [x] TypeScript + ESLint + Prettier configs shared.
- **Done:** `npm install` succeeds; both workspaces typecheck clean.
- **Commit:** `chore: scaffold monorepo (infra/services/web)` (078e528)

### T2. CDK skeleton stack + `/health` ✅ DONE (deployed & verified)
- [x] CDK app in `/infra`; `StudySnapStack`: DynamoDB `StudySnap` (PK/SK, on-demand, PITR),
      S3 uploads bucket (browser CORS, block public access), Cognito User Pool + client.
- [x] API Gateway (REST) + `GET /health` Lambda → `{status:"ok"}` (public route).
- [x] **$20 CloudWatch billing alarm** on `AWS/Billing EstimatedCharges` + SNS topic
      (email subscription added once ALARM_EMAIL provided).
- [x] `cdk bootstrap` + `cdk deploy` succeeded.
- **VERIFIED LIVE:**
  - Health: `https://u1g7hquhsf.execute-api.us-east-1.amazonaws.com/prod/health` → 200 `{"status":"ok",...}`
  - Billing alarm `StudySnap-Billing-Over-20USD` threshold 20.0, state OK
  - DynamoDB `StudySnap` ACTIVE; Cognito pool `us-east-1_FTWr35GEJ`
  - Outputs saved to `infra/outputs.json`
- **Commit:** `feat(infra): skeleton stack + /health + $20 billing alarm`

### T3. Frontend shell on Amplify Hosting
- [ ] Vite React app; single page that fetches `/health` and renders "ok".
- [ ] Connect repo to Amplify Hosting; first deploy.
- **Done when:** public HTTPS Amplify URL loads and shows backend "ok". **← SHIP GATE MET.**
- **Commit:** `feat(web): app shell wired to /health, deployed to Amplify`

### T4. CI/CD — GitHub Actions
- [ ] Workflow: push to `main` → install → lint → test → `cdk deploy` (backend);
      Amplify auto-builds frontend on push (or explicit build step).
- [ ] Store AWS creds as GitHub OIDC role (preferred) or repo secrets.
- **Done when:** a push to main deploys both without manual steps.
- **Commit:** `ci: deploy backend+frontend on push to main`

---

## Milestone B — Agentic Workflow (judged; do early so it governs the build)

### T5. Kiro hooks + AGENTS.md
- [ ] Pre-commit hook: lint + tests before every commit.
- [ ] Post-edit hook: typecheck/compile changed code.
- [ ] CDK-validation hook: `cdk synth` on any `/infra` change.
- [ ] `AGENTS.md` documenting each hook + the Kiro→AWS console-connection proof (steps + screenshots).
- **Done when:** hooks fire automatically; AGENTS.md explains the workflow.
- **Commit:** `chore(agents): kiro hooks + AGENTS.md`

---

## Milestone C — Auth

### T6. Cognito + Amplify Authenticator
- [ ] Wire `@aws-amplify/ui-react` Authenticator drop-in (email signup/login/logout).
- [ ] Protect app routes; attach JWT to API calls; API Gateway Cognito authorizer on `/uploads*`.
- **Done when:** sign up → confirm → log in → see empty dashboard; API rejects unauth calls (401).
- **Commit:** `feat(auth): cognito + amplify authenticator, protected routes`

---

## Milestone D — Upload

### T7. `getUploadUrl` Lambda + client upload
- [ ] `POST /uploads` → validate type/size, mint `uploadId` (ULID), pre-signed S3 PUT URL,
      write `UPLOAD#` item status `PROCESSING`.
- [ ] Client: type+size validation; **downscale images to ≤1568px longest side (JPEG)** pre-upload;
      progress bar; redirect to kit detail (PROCESSING).
- **Done when:** file lands in S3 under `uploads/<userId>/<uploadId>/`; DDB item created.
- **Commit:** `feat(upload): presigned url + client validation/downscale`

---

## Milestone E — Generation

### T8. `processNotes` Lambda (S3 trigger)
- [ ] S3 `ObjectCreated` trigger. PDF → `unpdf` text; image → Claude Haiku multimodal.
- [ ] One Claude call → strict JSON (summary, topics, 10 flashcards, 5 quiz w/ topic tags).
- [ ] Validate shape/counts; one retry on bad JSON; write kit + status `READY`/`FAILED`.
- [ ] `aiClient` reads `AI_MODEL_ID` (Haiku default; Sonnet fallback). Structured logs.
- **Done when:** uploading a PDF and a photo each yields a READY kit with correct counts.
- **Commit:** `feat(generate): processNotes -> kit via Claude Haiku`

### T9. Dashboard + kit detail
- [ ] Dashboard: list uploads with status pills + date; poll `GET /uploads/{id}` until READY.
- [ ] Kit detail tabs: Summary · Flashcards (flip) · Quiz (5-Q reveal). Loading/empty/error states.
- **Done when:** user sees generated content; status transitions render live.
- **Commit:** `feat(web): dashboard + kit detail (summary/flashcards/quiz)`

---

## Milestone F — Differentiator: Adaptive Quiz-Me

### T10. `quizMe` Lambda + chat UI
- [ ] `POST /uploads/{id}/quiz-me` actions: start / answer / end.
- [ ] Grade (correct/partial/incorrect) + explain + pick next question biased to weak topics.
- [ ] **Prompt context cap: summary + topics + mastery + last 10 turns only** (history persisted full).
- [ ] Persist `SESSION#` history + `MASTERY#` counters (correct/asked ratio). Chat UI + mastery bars.
- **Done when:** a session grades answers, explains mistakes, adapts, and mastery persists.
- **Commit:** `feat(quiz-me): adaptive session + mastery tracking`

---

## Milestone G — Polish & Ship Quality

### T11. Delete + logging
- [ ] `DELETE /uploads/{id}`: remove S3 object + `UPLOAD#`/`SESSION#*`/`MASTERY#*` items → 204.
- [ ] Structured JSON logging (requestId, userId, uploadId, latency) in every Lambda.
- **Done when:** delete fully cleans up; CloudWatch shows structured logs per invocation.
- **Commit:** `feat: delete flow + structured cloudwatch logging`

### T12. README + proof
- [ ] `README.md`: architecture diagram, setup steps, live demo link, screenshots,
      "how I used Kiro + AWS" (agentic workflow). Include console-connection proof.
- **Commit:** `docs: readme with architecture, demo link, screenshots, ai/agent story`

### T13. End-to-end verification on live URL
- [ ] On the public URL: signup/login; upload a PDF and a handwritten photo; confirm kit
      counts; run a Quiz-Me session; delete. Fix anything broken.
- **Done when:** all §12 acceptance criteria pass on the live site.
- **Commit:** `test: e2e verification on live deployment`

---

## Stretch (only if ahead of schedule)
- [ ] Timed exam mode.
- [ ] Study-plan generator from weak topics.

---

## Deploy commands (reference)
```bash
# one-time
cd infra && npx cdk bootstrap
# deploy backend
cd infra && npx cdk deploy --require-approval never
# frontend: pushed to Amplify via git; or `amplify`/console build
```
