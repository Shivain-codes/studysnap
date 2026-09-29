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

### T3. Frontend shell on Amplify Hosting ✅ DONE (deployed & verified)
- [x] Vite + React + TS app; shell page fetches `/health`, renders connected/loading/error + retry.
- [x] Brand color scheme applied; mobile-first card layout.
- [x] Amplify Hosting app created (`d1wkxjr5bl55l7`), `main` branch, manual zip deploy.
- **VERIFIED LIVE — SHIP GATE MET:**
  - Web: `https://main.d1wkxjr5bl55l7.amplifyapp.com/` → 200, title + shell served
  - CORS preflight 204; health GET from web origin → 200 `{"status":"ok"}`
- **Note:** manual deploy for Day-1 speed; git-based Amplify CI wired in T4 once repo exists.
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

### T6. Cognito + Amplify Authenticator ✅ DONE (deployed & verified)
- [x] `@aws-amplify/ui-react` Authenticator drop-in (email signup/login/logout) wraps the app.
- [x] Top bar with user email + Sign out; auth-gated Dashboard placeholder.
- [x] `api.ts` attaches Cognito JWT (`Authorization: Bearer`) to every request; `ApiError` handling.
- [x] Backend: Cognito authorizer + `GET /uploads` (listUploads Lambda, user-scoped DynamoDB query).
- [x] Lambda `getUserId` derives userId from JWT `sub` (never trusted from client).
- **VERIFIED:**
  - `/uploads` no/invalid token → 403 (denied); `/health` still public → 200
  - Authenticated JWT → `GET /uploads` → 200 `{"items":[]}` (full chain: Cognito→APIGW→Lambda→DDB)
  - Frontend with Authenticator redeployed live (Amplify job 2)
  - Enabled `adminUserPassword` auth flow for automated e2e auth tests (browser still uses SRP)
- **Test user:** `tester@studysnap.dev` (for e2e + proof screenshots)
- **Commit:** `feat(auth): cognito + amplify authenticator, protected routes`

---

## Milestone D — Upload

### T7. `getUploadUrl` Lambda + client upload ✅ DONE (deployed & verified)
- [x] `POST /uploads` → validate type/size, mint `uploadId` (ULID), pre-signed S3 PUT URL,
      write `UPLOAD#` item status `PROCESSING`. Returns 400 (bad type) / 413 (too large).
- [x] Client: type+size validation; **downscale images to ≤1568px longest side, JPEG re-encode**
      (`web/src/lib/image.ts`); XHR progress bar; redirect to kit detail.
- [x] React Router added: Dashboard / Upload / KitDetail; "＋ Upload notes" on dashboard;
      camera-first file input (`capture="environment"`). Amplify SPA rewrite rule added.
- **VERIFIED (full round trip):**
  - authed `POST /uploads` → 200 with presigned URL + user-scoped s3Key
  - bad type → 400; oversized → 413
  - PUT to presigned URL → 200, file in S3; DDB shows `PROCESSING`
  - frontend redeployed; `/` and deep-link `/upload` both 200
- **Commit:** `feat(upload): presigned url + client validation/downscale`

---

## Milestone E — Generation

### T8. `processNotes` Lambda (S3 trigger) ✅ DONE (deployed & PROVEN on Amazon Nova)
- [x] S3 `ObjectCreated` trigger (prefix `uploads/`) → processNotes Lambda.
- [x] PDF → `unpdf` text; image → Amazon Nova multimodal (base64).
- [x] One model call → strict JSON; `validateKit` enforces 10 flashcards / 5 quiz / 4 options;
      one retry on bad output; writes `READY` (+summary/topics/flashcards/quiz) or `FAILED`.
- [x] `aiClient` seam supports Nova (Converse-style) + Claude (Messages); reads `AI_MODEL_ID`.
- [x] IAM: `bedrock:InvokeModel` on Nova Lite/Pro + Claude Haiku/Sonnet ARNs (profiles + FMs).
- **MODEL SWITCH:** Claude blocked by account Marketplace billing (`INVALID_PAYMENT_INSTRUMENT`,
  confirmed in console playground). Switched PRIMARY to **Amazon Nova Lite** (first-party,
  multimodal, unblocked). Claude stays as `AI_MODEL_ID` fallback.
- **PROVEN with real invocation:** uploaded a PDF → READY kit with 6 topics, coherent summary,
  **exactly 10 flashcards + 5 quiz** (4 options, valid answerIndex, topic-tagged). STRUCTURE VALID.
- **Quiz-Me grading tested on Nova Lite:** correct/partial/incorrect all graded accurately with
  good explanations → Lite is sufficient; `QUIZ_MODEL_ID` can flip to Nova Pro if needed.
- **Commit:** `feat(ai): switch primary to Amazon Nova; processNotes proven end-to-end`

### T9. Dashboard + kit detail ✅ DONE (deployed & verified)
- [x] Backend: `GET /uploads/{uploadId}` getUpload Lambda (user-scoped, returns kit + status).
- [x] Dashboard: lists uploads with status pills (Ready/Processing/Failed) + date; empty/error/retry.
- [x] Kit detail: topic chips + tabs — Summary (prose) · Flashcards (flip + prev/next counter) ·
      Quiz (tap option → correct/wrong reveal). Polls `GET /uploads/{id}` every 4s while PROCESSING.
- [x] Loading / empty / error / FAILED states throughout.
- **Verified:** backend deployed; frontend redeployed live (root 200, SPA routing works).
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
