# Plan 2 — Building Agent v2 (Phase 11) in small phases

**Status: approved for implementation, 15 November 2026.** The owner answered every open decision (§1). Nothing is built yet.

- **What** to build and **why** is in [`docs/agent-v2.md`](agent-v2.md) (the design). This file is **how and in what order**: small phases, each one a single reviewable change.
- `docs/plan.md` remains the source of truth for scope. Its Phase 11 section points here, and its checklist tracks the stages below.
- Section numbers like "design §5.6" refer to `agent-v2.md`.

---

## 1. Owner's decisions (15 November 2026)

| #   | Decision                                     | Answer                          | What it changes in the build                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | AI Gateway tier and default model            | **Paid tier**                   | The paid-tier column of design §2 is the target. Frontier models are available for the Planner and workers. The rate-limit scheduler (B7) has no fixed limit by default and reacts to 429s instead (all parallel calls back off together).                                                                   |
| 2   | Browserbase plan                             | **Free plan**                   | About 1 browser hour a month, 3 concurrent sessions, sessions up to 15 minutes, 5 new sessions a minute. `AGENT_BROWSER_QA` defaults to `smoke`; `full` (acceptance checks) is for evals and is used sparingly. A monthly browser-time guard (G4) skips QA before the quota runs out, and the reply says so. |
| 3   | Model choice and plan approval               | **Auto mode, no plan approval** | **Auto** is the default in the model chip (H2); the user can still pick a model. The Planner's plan is shown as a Task list and the build continues straight away.                                                                                                                                           |
| 4   | A Version that still has errors after repair | **As in the plan**              | Save it with status `issues`, and the reply lists what is still broken.                                                                                                                                                                                                                                      |
| 5   | Browserbase session recording                | **Off**                         | `recordSession: false` on every session, enforced by a unit test.                                                                                                                                                                                                                                            |
| 6   | Verification summary in chat                 | **Approved**                    | Built in G9 from existing AI Elements parts (`Task`, `Tool`) and the existing image chip pattern.                                                                                                                                                                                                            |
| 7   | Backends in generated apps                   | **Not required**                | Permanently out of scope for Phase 11.                                                                                                                                                                                                                                                                       |
| 8   | Charging for QA and the critic               | **Required**                    | QA, critic, planner, repair and memory are part of the run's cost and listed as their own agents on the usage page (H3).                                                                                                                                                                                     |
| 9   | Memory on by default                         | **Yes**                         | `User.memoryEnabled` defaults to `true`; the Privacy Policy explains it and the panel turns it off.                                                                                                                                                                                                          |
| 10  | Memory settings panel                        | **Approved**                    | Built in I8 as a dialog opened from the account menu, composed of existing `Dialog`, `Switch`, `Button` and list patterns.                                                                                                                                                                                   |
| 11  | Supermemory plan                             | **Free plan**                   | $5 of credits a month. A monthly usage guard (I9) stops memory writes, then reads, before the credits run out, and alerts the owner. The vendor's legal pack (spike M3) is still requested before launch.                                                                                                    |

---

## 2. Rules for every phase

Each phase below is one change. It is **done** only when all of these hold (from `CLAUDE.md`):

1. The relevant `agents` skill was loaded before writing code (listed per stage).
2. `bunx prettier --write` on the touched files; no leftover comments; no Tailwind warnings.
3. `bun run lint` and the TypeScript check are clean.
4. `bun run test:run` passes, with new or updated unit tests for the phase's logic.
5. A phase that changes a route, flow or UI adds or updates a Playwright spec under `e2e/` and passes `bun run test:e2e` (`E2E_PORT=3100`, because port 3000 is taken by Docker locally).
6. Every new data-fetching component has skeleton loading, an error state with retry, and an empty state.
7. Docs updated in the same change: `docs/plan.md` checklist, `docs/decisions.md` for every package or approach choice, `src/config/env.ts` + `.env.example` + `vitest.config.mts` + the plan's env list for every env change, and the legal pages for every new processor or kind of personal data (flagged to the owner).
8. Phases marked **eval** also run `bun run agent:eval --suite smoke` and must not make any metric worse than the last recorded run. Phases marked **eval-gate** must meet the stage's target.
9. Cleanup: `bun run clean`, background processes stopped, `git status --short --ignored` shows only intended changes.

Size: a phase should be about half a day to two days of work. If one grows beyond that, split it before starting.

---

## 3. Stages and order

```
A  Measure ─────────► B  Quick wins ─────► C  Edit tools + context ─┬─► E  Verify + repair ─► F  Planner + generator ─► G  Browser QA ─► H  Critic + roles
                                                                    │        ▲
                                           D  Template v2 ──────────┘────────┘
                                                                    └─► I  Memory (after C6)
                                                                                                                             J  Wrap-up (last)
```

- **A** comes first: nothing else ships without a baseline to compare against.
- **D** (template work) can run in parallel with **C**; **E** needs both.
- **I** (memory) needs only the context pack (C6) and can run alongside E–H.
- **H1–H3** (model roles, Auto, cost breakdown) can start as soon as F2 exists.

| Stage | Skills to load first                                               | Eval target at the end (paid tier)                             |
| ----- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| A     | `ai-sdk`, `prisma-client-api`, `prisma-cli`                        | baseline recorded                                              |
| B     | `ai-sdk`, `prisma-client-api`                                      | wall time −40% on `smoke`, no quality metric worse             |
| C     | `ai-sdk`, `prisma-client-api`, `prisma-cli`                        | small edits: median ≤ 3 model calls; edit locality −80%        |
| D     | `shadcn`, `tailwind-css`, `next-best-practices`, `frontend-design` | template builds with all checks; blocks pass axe               |
| E     | `ai-sdk`, `prisma-cli`                                             | build pass rate ≥ 95%; no run claims success with open errors  |
| F     | `ai-sdk`, `shadcn`, `vercel-composition-patterns`                  | new landing page: first preview ≤ 60 s; multi-page app ≤ 4 min |
| G     | `ai-sdk`, `shadcn`, `next-best-practices`                          | ≥ 90% of runs free of browser errors; acceptance ≥ 85%         |
| H     | `ai-sdk`, `shadcn`                                                 | judge score +1.0 over baseline within the agreed cost per run  |
| I     | `ai-sdk`, `prisma-cli`, `shadcn`                                   | memory evals (design §17.10)                                   |
| J     | none specific                                                      | every design §2 target met or explained                        |

---

## Stage A — Measure

### A1 — `AgentRun` metrics table

- **Change:** a Prisma model `AgentRun` (id = Inngest run id, project, user, intent, models per role, per-phase durations as JSON, model calls, tokens, cost, repair rounds, verification and browser outcomes, memory outcome). No prompt or code text. A small `recordRunMetrics` helper called once at the end of `run-agent` (and in `onFailure`). Nightly cleanup deletes rows older than 30 days.
- **Tests:** helper unit test; cleanup sweep test; `no-secret-leak` style test that no text fields exist.
- **Docs:** Privacy Policy retention line (flag to owner).
- **Done when:** a smoke run writes one row with real timings.

### A2 — Phase timer inside the run

- **Change:** a tiny timer used by `run-agent` and `runAgentLoop` to record time spent queued, waiting on rate limits, in model calls, in tool steps, in persist. Feeds A1.
- **Tests:** unit test with fake clocks.
- **Done when:** a smoke run's `AgentRun` row adds up to its wall time within 5%.

### A3 — Eval case format and runner

- **Change:** `evals/cases/*.json` (prompt, optional follow-ups, deterministic assertions: routes, text, Playwright interactions). `scripts/agent-eval.ts` (`bun run agent:eval`) reuses `agent:smoke` plumbing, waits for each run, then checks assertions with local Playwright against the preview URL. Writes `evals/results/<date>-<sha>.json` (gitignored). 5 `smoke` cases first.
- **Tests:** unit tests for case parsing and assertion evaluation with a fake page.
- **Done when:** `bun run agent:eval --suite smoke` completes and writes results.

### A4 — LLM judge and comparison report

- **Change:** a judge step (a model different from the one under test, set by `--judge`) scoring the rubric from design §5.9 on screenshots. A markdown report comparing to `evals/baseline.json`.
- **Tests:** report diff logic.
- **Done when:** the report shows each metric with its change since the baseline.

### A5 — Full suite and baseline (**eval**)

- **Change:** the remaining 25 cases (design §9). Run the full suite on the **current** agent and commit `evals/baseline.json` plus a summary in `docs/evals/baseline.md`.
- **Done when:** the baseline is committed and the plan records it.

---

## Stage B — Quick wins (no new vendor)

### B1 — Remove the skill gate and `loadSkill`

- **Change:** delete `skillGate`, the `loadSkill` tool and `SkillProgress` gating; write the distilled house rules (design §5.2, about 2,000 tokens) into `prompts/system.ts`; drop the "read `AGENTS.md` first" instructions. Skill files stay readable with `readFiles`.
- **Tests:** update `execute-tool`, `skills`, `system` prompt tests; remove the first-write rejection test.
- **Docs:** plan §5.7 note that the gate is retired.
- **Done when:** a smoke run's first turn writes code. **eval**

### B2 — One step per turn for tool calls

- **Change:** all tool calls of one model turn run in a single `step.run`. Reads, listings and searches run concurrently; writes to the same path run in order. Each call's result is still recorded separately.
- **Tests:** loop tests for ordering, partial failure, recovery replay and idempotent retry of the batched step.
- **Done when:** the step count per run drops by at least 3× on `smoke`. **eval**

### B3 — Stop check inside the model step

- **Change:** remove the per-turn `-stop-` step; the model step reads the stop flag at its start and returns `stopped`.
- **Tests:** stop tests in `loop.test.ts` and `run-agent.test.ts` still pass.
- **Done when:** Stop still takes effect after the current turn (e2e `agent.spec.ts`).

### B4 — Drop the summary and title calls

- **Change:** the reply is the Builder's `<task_summary>` with tags stripped and lightly normalised in code; the title is derived in code from the summary's first sentence (until F8 replaces it with the plan's title).
- **Tests:** reply and title derivation unit tests (long text, missing summary, HTML entities).
- **Done when:** a run makes 2 fewer model calls and the reply still reads well. **eval**

### B5 — Parallel setup

- **Change:** the sandbox step and `guard-classify` run in parallel (`Promise.all` of steps). A classifier `block` discards the sandbox result.
- **Tests:** run-agent tests for block-while-sandbox-ready and both orders.
- **Done when:** time from claim to first model call drops on `smoke`.

### B6 — Sandbox pre-warm

- **Change:** `project.create` also sends `sandbox/warm`; a new Inngest function creates the sandbox and saves `sandboxId`/`previewUrl` (same project-level concurrency as `run-agent`). `run-agent` reuses it.
- **Tests:** function test; create-flow e2e unchanged.
- **Done when:** a new project's run starts with a ready sandbox in most smoke runs.

### B7 — Shared rate-limit backoff

- **Change:** a per-model Postgres bucket (`ModelThrottle`, same upsert pattern as `ThrottleWindow`). `AI_GATEWAY_RPM` empty means no fixed limit (paid tier). When any call gets a 429, its `retry-after` is written to the bucket and every step for that model waits durably with `step.sleep` instead of calling. The overlay shows "Waiting for the model…".
- **Tests:** bucket unit tests; loop test where one 429 makes the next call wait.
- **Docs:** env (`AI_GATEWAY_RPM`).
- **Done when:** a forced 429 in a test produces one wait, not a burst of retries.

### B8 — Append-only compaction

- **Change:** replace in-place `compactHistory` with an append-only summary every 6 turns (built in code from the tool log, no model call).
- **Tests:** conversation tests: earlier messages are never edited; size stays bounded.
- **Done when:** cached input tokens per run rise on `smoke` (from gateway usage).

### B9 — Prompt-cache breakpoints for Anthropic models

- **Change:** `cacheControl` provider options on the system message and the stable context parts when the model is Anthropic.
- **Tests:** unit test that the options are set only for Anthropic models.
- **Done when:** an Anthropic smoke run reports cache reads. **eval-gate** for stage B.

---

## Stage C — Edit tools and context

### C1 — `editFile` tool

- **Change:** a pure `applyEdits(content, blocks)` (exact-once match, whitespace-tolerant retry, closest region with line numbers on failure, all-or-nothing) and the tool in `tools.ts` + executor, going through the path guard, secret scan and tripwire on the resulting file.
- **Tests:** thorough unit tests for `applyEdits` (no match, multiple matches, CRLF, indentation, overlapping blocks) and executor guard tests.
- **Done when:** a follow-up "change the button colour" changes only the relevant lines. **eval**

### C2 — Ranged reads, `listFiles`, `searchCode`

- **Change:** `readFiles` takes an optional line range; `listFiles` (globs, tree output); `searchCode` (`grep -rnE` now, `rg` after D1), output capped and wrapped as untrusted.
- **Tests:** executor tests, caps, path guard on globs.
- **Done when:** the Builder stops using `terminal` for `ls`/`cat`/`grep` in smoke traces.

### C3 — `installPackages` tool

- **Change:** structured package list through the existing package policy (allowlist, npq, 20 installs per run). Raw `npm install` in `terminal` returns a pointer to the tool.
- **Tests:** package policy tests reused through the new tool.
- **Done when:** installs in smoke traces go through the tool.

### C4 — Repo map

- **Change:** `buildRepoMap(files)` computed **on our server** from the snapshot (tree, exports, imports, line counts; capped at about 4,000 tokens). Saved as `Version.repoMap` (migration).
- **Tests:** unit tests on sample files (default exports, re-exports, `"use client"`, large trees truncated).
- **Done when:** every new Version has a repo map.

### C5 — `ProjectSpec` storage

- **Change:** zod schema for `ProjectSpec` (design §5.2), `Version.spec` (migration), and a renderer to prompt text. Until F8 writes it, Finalize fills what code can infer (routes from the repo map, tokens from `globals.css`).
- **Tests:** schema and renderer tests; restore copies the spec.
- **Done when:** restore brings back the matching spec (e2e `workspace.spec.ts` restore case).

### C6 — Context pack builder

- **Change:** one function that assembles the context in design §5.2 order with token budgets, used by the Builder. Replaces the flat file list note in `historyToMessages`.
- **Tests:** ordering, budgets, stable prefix across turns.
- **Done when:** smoke follow-ups read fewer files before their first edit. **eval**

### C7 — Intent router (heuristics)

- **Change:** pure `routeIntent(message, project)` → `create | edit | fix | large-change | question` from the rules in design §5.1. Recorded in `AgentRun`.
- **Tests:** a table of example messages.
- **Done when:** the router labels the eval cases correctly ≥ 90% of the time.

### C8 — Router fallback, target files and preloading

- **Change:** when the heuristics are unsure, one structured call to the fast model with the repo map → `{ intent, scope, targetFiles }`; unknown paths dropped. Target files preloaded with line numbers into the first message.
- **Tests:** structured-output parsing, unknown paths, empty list.
- **Done when:** small-edit cases make their first edit in turn 1.

### C9 — Editor mode and `question` intent

- **Change:** `edit` and `fix` run the loop with an 8-turn cap; touching more than 8 files or adding a route switches to `large-change` (the full loop until F7 exists). `question` answers from the context pack with no sandbox writes and no Version.
- **Tests:** loop tests for the cap and the switch; run-agent test for `question` (no Version, no file changes, charged).
- **Done when:** **eval-gate** for stage C.

---

## Stage D — Template v2

### D1 — `.vibe/` folder, dev log and ripgrep

- **Change:** the template creates `.vibe/`, installs `ripgrep`, and the start command writes `next dev` output to `.vibe/next.log`. `.vibe/` is excluded from snapshots and export and write-protected by the path guard.
- **Tests:** guard and snapshot exclusion tests; template build checks (`grep`/`test -f` steps that fail the build).
- **Done when:** the template builds and a sandbox has the log.

### D2 — `check` script and parser

- **Change:** `.vibe/bin/check` collects raw output (`tsc --noEmit --incremental`, ESLint JSON, route status codes and overlay markers, new `next.log` lines). All parsing lives in our repo (`src/server/sandbox/diagnostics.ts`) so it can be unit tested. Warm `tsc` and ESLint caches at template build.
- **Tests:** parser tests on recorded outputs (type errors, lint errors, hydration warnings, overlay HTML).
- **Done when:** a sandbox with an injected error returns it as a structured diagnostic.

### D3 — Preview probe

- **Change:** `.vibe/probe.js` (errors, unhandled rejections, `console.error`, failed fetches and resources into `window.__vibe`, only when `NEXT_PUBLIC_VIBE_PREVIEW=1`). `instrumentationClientInject` added to `next.config.ts` at template build with a build check. `ensureDevOrigins` becomes `ensurePreviewConfig` (repairs both on restore); export removes both options.
- **Tests:** `ensurePreviewConfig` and export-transform unit tests. Spike: confirm the sandbox's Next.js version supports the option.
- **Done when:** a page with a thrown error shows it in `window.__vibe` in a local browser.

### D4 — Marketing blocks

- **Change:** `components/blocks/`: navbar, three heroes, logo cloud, feature grid, bento, stats, pricing, testimonials, FAQ, CTA, footer. Typed props, tokens only, responsive.
- **Tests:** a template build step renders each block on a test page and runs axe.
- **Docs:** owner reviews the block set (screenshots in the PR).
- **Done when:** every block passes axe in light and dark.

### D5 — App blocks

- **Change:** dashboard shell, data-table page, sign-in/sign-up forms (UI only), settings page, empty states.
- **Tests and done when:** as D4.

### D6 — Theme presets and preinstalled packages

- **Change:** several token presets in `globals.css`; preinstall `motion`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, `zustand`; add them to the allowlist.
- **Tests:** allowlist tests.
- **Docs:** `docs/decisions.md` package entries.
- **Done when:** smoke runs need no install turns for these.

### D7 — Catalog, house rules and template rebuild

- **Change:** generate the component and block catalog at build (written to `.vibe/catalog.md`, read into the context pack). Sandbox `AGENTS.md` shortened to the house rules, kept identical by the existing sync test. Rebuild the template, update `skills-lock.json` and `E2B_TEMPLATE_ID`. The workspace Console shows the real dev log.
- **Tests:** agent-rules sync test; Console e2e update.
- **Done when:** **eval** shows fewer lines written per create case (blocks reused).

---

## Stage E — Verification and repair

### E1 — `runChecks`

- **Change:** server function running the check script and returning diagnostics (deduplicated, capped at 30), plus the `runChecks` tool.
- **Tests:** executor tests with recorded outputs.
- **Done when:** the tool returns real diagnostics in a sandbox.

### E2 — Automatic gate and Version status

- **Change:** the gate runs after the Builder/Editor finishes, in code. `Version.verification` (`verified | issues | skipped` + report JSON, migration).
- **Tests:** run-agent tests for each outcome.
- **Done when:** every new Version has a verification status.

### E3 — Deterministic fixes

- **Change:** before any model repair: `eslint --fix`, add missing `"use client"`, install an allowlisted missing import.
- **Tests:** each fix on fixture files.
- **Done when:** these error kinds never reach a model repair in smoke runs.

### E4 — Repair loop

- **Change:** Editor in repair mode with grouped diagnostics and preloaded files; 3 rounds for create, 2 for edits; stop when errors don't drop; roll back a round that raises them.
- **Tests:** loop tests for no-progress, rollback, round limits.
- **Done when:** injected-bug cases end clean.

### E5 — Honest reply and overlay rows

- **Change:** with errors left, the Version is saved as `issues` (decision 4) and the reply lists them in plain words. Overlay rows "Checking your app" and "Fixing N issues".
- **Tests:** reply builder tests; overlay e2e with a stubbed run.
- **Done when:** no run says it succeeded while errors remain.

### E6 — Agent lessons for owner review

- **Change:** `AgentLesson` table (error signature, count, fix description from the repair model's structured output, no user code); `bun run lessons:list` prints the top lessons. Nothing is fed to the model automatically.
- **Tests:** signature normalisation and redaction tests.
- **Done when:** **eval-gate** for stage E.

---

## Stage F — Planner and parallel generator

### F1 — `BuildPlan` schema and validator

- **Change:** zod schema (design §5.3) and pure validation (paths, ≤ 40 files, acyclic `dependsOn`, packages through the policy, ≤ 8 acceptance checks).
- **Tests:** valid and invalid plans.
- **Done when:** validator rejects every invalid fixture.

### F2 — Planner step

- **Change:** structured-output call (AI SDK `Output.object`) for `create`. Web search for website references and image attachments move from the Builder to the Planner.
- **Tests:** run-agent test with a stubbed model; search offered only when a site is referenced.
- **Done when:** create runs produce a valid plan.

### F3 — Plan in the chat

- **Change:** `plan` realtime topic and a persisted `plan` part, rendered as an AI Elements `Task` list that ticks off as files are written.
- **Tests:** parts parser test; workspace e2e with a stubbed plan.
- **Done when:** the plan shows live and after reload.

### F4 — Packages from the plan

- **Change:** code installs the plan's packages in one step, in parallel with the foundation call.
- **Tests:** run-agent test.
- **Done when:** no model turn is spent on installs in create runs.

### F5 — Foundation call

- **Change:** one call writes tokens, layout, shared types, mock data and shared components from the plan.
- **Tests:** stubbed-model run test.
- **Done when:** the foundation compiles in smoke runs before any worker starts.

### F6 — Waves and parallel workers

- **Change:** pure `planWaves(files)` (dependency layers, groups of up to 6) and one-shot workers run as parallel steps through the shared backoff (B7). Home route in the first wave.
- **Tests:** `planWaves` tests; run test with parallel stubbed workers and one failing worker retried.
- **Done when:** first preview of a landing page ≤ 60 s on the paid tier.

### F7 — Delta plans for large changes

- **Change:** `large-change` gets the spec and repo map and a plan with only the files to add or edit, then the same waves.
- **Tests:** validator and run tests for delta plans.
- **Done when:** "add a blog section with list and detail pages" cases pass.

### F8 — Spec, title and reply from the plan

- **Change:** Finalize writes the `ProjectSpec` from the plan and the changed files; the title comes from the plan; the reply is built from the plan, changed files and verification report plus one model sentence.
- **Tests:** spec merge tests; reply builder tests.
- **Done when:** **eval-gate** for stage F.

---

## Stage G — Browser QA (Browserbase + Stagehand)

### G1 — Spikes S1–S3

- **Change:** throwaway scripts outside the repo (scratchpad): S1 Stagehand `generate` callback through AI Gateway; S2 reading `window.__vibe` from a v4 page; S3 reconnecting to one session across two processes. Results in `docs/decisions.md`. Pin the Stagehand version.
- **Done when:** each spike has a recorded answer and a chosen fallback where it failed.

### G2 — `BrowserProvider` and local Playwright implementation

- **Change:** the interface (design §6.2) and a Playwright implementation used by tests and evals.
- **Tests:** provider contract tests against a local test page.
- **Done when:** evals can run QA without Browserbase.

### G3 — Browserbase implementation

- **Change:** Stagehand v4 implementation: `browserbase.launch` with `recordSession: false` (decision 5), 10-minute timeout, metadata tag, reconnect by `sessionId`, close in Finalize and `onFailure`.
- **Tests:** unit tests with a mocked SDK, including a test that recording is always off.
- **Docs:** env (`BROWSERBASE_API_KEY`, `AGENT_BROWSER_QA`); decisions entry.
- **Done when:** a live session opens a preview and closes.

### G4 — Free-plan browser budget

- **Change:** a monthly counter of browser seconds (`BrowserUsage`, reset per calendar month). At 90% of the monthly allowance (`BROWSER_MONTHLY_SECONDS`, default 3,300 for the free plan) QA is skipped with `browser: skipped (monthly limit)` and an alert. Session creation respects the free plan's 5 per minute and 3 concurrent through the same throttle table.
- **Tests:** counter and skip logic.
- **Docs:** env (`BROWSER_MONTHLY_SECONDS`).
- **Done when:** a simulated full month skips QA and alerts once.

### G5 — Page checks

- **Change:** the deterministic checks of design §6.5 (probe, overlay, layout, screenshots to the private bucket under `qa/<projectId>/<runId>/`, keys only in step output).
- **Tests:** against the local provider with fixture pages (thrown error, overflow, broken image).
- **Done when:** fixture failures are all detected.

### G6 — QA in the pipeline (`smoke`)

- **Change:** after a clean gate, home route on desktop and mobile; failures go to repair as diagnostics; QA failure of the infrastructure never fails the run.
- **Tests:** run-agent tests for pass, page failure, Browserbase down.
- **Done when:** smoke runs show browser results in `AgentRun`.

### G7 — Acceptance checks (`full`)

- **Change:** `observe` → `act` → `extract` for the plan's interaction checks, at most 5, `act` never retried.
- **Tests:** mocked Stagehand flows.
- **Done when:** eval `full` runs report acceptance results.

### G8 — `inspectPage` tool and origin lock

- **Change:** the tool for the Editor and Repair (path only), the origin check after every navigation and action, 6 calls per run, screenshot as an image part for vision models.
- **Tests:** a test that a URL or a different origin is refused; budget test.
- **Done when:** the tool works in a fix-intent eval case.

### G9 — Verification summary in the chat (approved, decision 6)

- **Change:** a persisted `verification` part (checks, outcomes, screenshot keys) rendered with AI Elements `Task`/`Tool` and thumbnails that open the full screenshot; overlay row "Checking in the browser".
- **Tests:** parts parser; workspace e2e with a stubbed report; axe in light and dark.
- **Done when:** the summary shows live and after reload.

### G10 — Screenshot retention

- **Change:** the nightly job deletes `qa/` objects older than 14 days; project delete removes them.
- **Tests:** cleanup and delete tests.
- **Done when:** no screenshot outlives its retention in tests.

### G11 — Legal update

- **Change:** Privacy Policy and Terms: Browserbase as a processor, stored screenshots, retention.
- **Done when:** flagged to the owner. **eval-gate** for stage G.

---

## Stage H — Model roles, Auto and the critic

### H1 — Role resolver

- **Change:** `resolveRoles(choice, available)` mapping Auto or a picked model to planner, worker, fast and critic models from an ordered preference list and `AI_PLANNER_MODEL`, `AI_FAST_MODEL`, `AI_CRITIC_MODEL`.
- **Tests:** resolver table tests (retired models, no vision model).
- **Docs:** env.
- **Done when:** every call site gets its model from the resolver.

### H2 — Auto in the model chip (default, decision 3)

- **Change:** an **Auto** row at the top of the existing `ModelSelector`, selected by default on Home and in the workspace; stored on `Message.model` as `auto`.
- **Tests:** model picker unit test; home and workspace e2e.
- **Done when:** a new user's first prompt runs on Auto.

### H3 — Cost per agent on the usage page (decision 8)

- **Change:** ledger `meta.agents` adds `planner`, `repair`, `critic`, `qa`, `memory`; the usage page's activity breakdown shows them with readable labels.
- **Tests:** run-cost tests; usage e2e.
- **Done when:** a smoke run's debit lists each agent.

### H4 — Visual critic

- **Change:** one vision call with the rubric (design §5.9), up to 5 fixes, one polish pass, create only.
- **Tests:** stubbed critic runs (pass, polish, skipped without vision).
- **Done when:** **eval-gate** for stage H.

---

## Stage I — Memory (Supermemory)

### I1 — Spikes M1–M2, request M3

- **Change:** scratchpad scripts: M1 pin `supermemory`, confirm the v5 signatures, metering of `profile`, soft or hard delete, scoped keys; M2 latency of parallel `profile` + `search` and `instant` extraction time. Email the vendor for the legal pack (M3). Results in `docs/decisions.md`.
- **Done when:** M1 and M2 are recorded; M3 is requested.

### I2 — `MemoryProvider`, fake and namespaces

- **Change:** `src/server/memory/` (interface, Supermemory implementation, in-memory fake, `namespaces.ts`). `User.memoryEnabled` (default `true`, decision 9). Env `SUPERMEMORY_API_KEY`, `AGENT_MEMORY`.
- **Tests:** namespace builder (only from ids, database hash prefix, allowed characters); fake provider contract tests.
- **Done when:** the fake and the live provider pass the same contract test.

### I3 — Read path

- **Change:** memory reads in the context-pack step per design §17.5, 1.5 s timeout, `<memory>` block capped at about 800 tokens after the spec.
- **Tests:** timeout and failure skip; ordering; spec-wins conflict rule.
- **Done when:** a follow-up's context includes the project's earlier correction.

### I4 — Candidates and filters

- **Change:** a `memories` field on the final structured output; the filters of design §17.6 (secret scan, user-words support for preferences, instruction-like text, length, personal data).
- **Tests:** the poisoning cases, secrets, PII, unsupported preferences.
- **Done when:** every poisoning fixture is dropped.

### I5 — Write path

- **Change:** one `add()` per namespace in Finalize with idempotent ids; `instant` for projects, default for users; nothing written for blocked, stopped, failed or out-of-credits runs.
- **Tests:** run-agent tests for each case and retry idempotency.
- **Done when:** a smoke run writes and a retry doesn't duplicate.

### I6 — "Remember" and "forget" in chat

- **Change:** the router detects explicit requests; remember becomes a user candidate from the user's words; forget runs `forgetMatching` with a dry run, shows the matches and deletes after the user confirms.
- **Tests:** router examples; confirm flow e2e with the fake provider.
- **Done when:** both work end to end.

### I7 — Delete with the project

- **Change:** `project.delete` drops the project namespace after commit, best effort with a counts-only alert.
- **Tests:** delete tests.
- **Done when:** deleted projects leave no namespace (fake provider).

### I8 — Memory panel (approved, decision 10)

- **Change:** a **Memory** item in the account menu opening a dialog: what Vibe remembers (from `profile()`), Forget per item, Clear all with confirmation, and a Use memory switch. tRPC procedures with rate limits; skeleton, error with retry, and empty state.
- **Tests:** component tests for all states; e2e with the fake provider; axe; `security.test.ts` covers the new procedures.
- **Done when:** a user can view, forget, clear and turn off memory.

### I9 — Free-plan memory budget (decision 11)

- **Change:** a monthly estimate of Supermemory spend (tokens written, searches) against `MEMORY_MONTHLY_USD` (default 4.50 of the $5 credits). At the limit: writes stop first, then reads; one alert.
- **Tests:** budget logic.
- **Docs:** env.
- **Done when:** a simulated month stops writes, then reads, and alerts once.

### I10 — Legal update and evals

- **Change:** Privacy Policy and Terms: Supermemory as a processor, remembered preferences, the on-by-default setting and how to turn it off, retention (from M3 when it arrives). Add the memory eval cases (design §17.10).
- **Done when:** flagged to the owner; **eval-gate** for stage I.

---

## Stage J — Wrap-up

### J1 — Remove dead code

- **Change:** delete anything left from the old single-loop Builder (unused prompts, `NO_WRITES_NOTE` paths, old compaction), and grep that nothing references removed tools.
- **Done when:** lint, types and tests clean with no unused exports.

### J2 — Diagrams and README

- **Change:** update `docs/diagrams/agent-pipeline`, `seq-generation`, `architecture`, `guardrails` and `er` (Excalidraw sources and SVGs) and the README sections that describe the agent.
- **Done when:** the README matches the built system.

### J3 — Final full eval

- **Change:** run the full suite on the paid tier and record `docs/evals/phase-11.md` against the baseline and the design §2 targets.
- **Done when:** every target is met or the gap is explained and accepted by the owner; Phase 11 ticked in `docs/plan.md`.

---

## 4. Environment variables added along the way

| Variable                  | Added in | Default                     | Notes                                            |
| ------------------------- | -------- | --------------------------- | ------------------------------------------------ |
| `AI_GATEWAY_RPM`          | B7       | empty (no fixed limit)      | paid tier; 429s still trigger the shared backoff |
| `AI_PLANNER_MODEL`        | H1       | best available in Auto list |                                                  |
| `AI_FAST_MODEL`           | C8       | `openai/gpt-5.1-codex-mini` | router, repair, Stagehand                        |
| `AI_CRITIC_MODEL`         | H1       | best vision model available | empty disables the critic                        |
| `BROWSERBASE_API_KEY`     | G3       | —                           | server-only                                      |
| `AGENT_BROWSER_QA`        | G3       | `smoke`                     | `off`, `smoke`, `full`                           |
| `BROWSER_MONTHLY_SECONDS` | G4       | `3300`                      | free plan is about 1 hour a month                |
| `SUPERMEMORY_API_KEY`     | I2       | —                           | server-only                                      |
| `AGENT_MEMORY`            | I2       | `on`                        | `off` skips all memory reads and writes          |
| `MEMORY_MONTHLY_USD`      | I9       | `4.50`                      | free plan has $5 of credits a month              |

Each is added to `src/config/env.ts`, `.env.example`, `vitest.config.mts` and the env list in `docs/plan.md` in the phase that introduces it.

## 5. Schema changes along the way

| Phase | Change                                |
| ----- | ------------------------------------- |
| A1    | `AgentRun`                            |
| B7    | `ModelThrottle`                       |
| C4    | `Version.repoMap`                     |
| C5    | `Version.spec`                        |
| E2    | `Version.verification`                |
| E6    | `AgentLesson`                         |
| G4    | `BrowserUsage`                        |
| I2    | `User.memoryEnabled` (default `true`) |
| I9    | `MemoryUsage` (monthly estimate)      |

Each migration is applied to the development branch only, as in earlier phases.
