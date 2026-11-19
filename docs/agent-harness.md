# Agent harness v4: one agent that verifies its own work (Phase 11)

**Status: built 19 November 2026, verified with unit tests and stubbed models only.** v4 replaces the v3 planner, parallel writers and repair agent. The v3 notes below still describe the parts v4 keeps (router, context pack, editFile, read tools, blocks, presets, browser checks, memory, stop).

**Why (owner's report, 19 November 2026):** first builds often finished broken: a missing module (`@/components/tasks/TaskApp`), a lucide `title` prop type error, and `GET /` returning 500. The preview didn't load, the browser check rarely ran, repair fixed nothing, and builds took 4–12 minutes. The owner asked for accuracy over speed, working the way Claude Code and Codex do.

## v4.1 Root causes found in v3

| Symptom                               | Cause in v3                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Imports pointed at files nobody wrote | Parallel workers wrote files blind to each other's output; `generated.missing` was computed but never used.             |
| Repair fixed nothing                  | A fresh-context repair agent, told to "fix with editFile" (even for missing files), with 6 turns and no plan contracts. |
| Real fixes were undone                | Rollback compared problem counts; creating a missing module reveals more type errors, so the fix was rolled back.       |
| The browser check never ran           | It was gated on zero diagnostics.                                                                                       |
| Lucide `title` errors                 | A model knowledge gap that no rule or fix covered.                                                                      |

## v4.2 Pipeline

```
agent/run → guard-input · claim · load-project
          → in parallel: guard-classify | sandbox | route
          → mode by intent:
              create / large-change / edit / fix → one agent loop (builder-model-N / builder-tools-N)
                  turn budget: create 40, large-change 30, edit 16, fix 16, resumed 40
              question → answer · remember / forget → memory command
          → name-project (new sites, from the plan's projectName)
          → done gate, up to 3 cycles:
              gate-check-N   checkProject: auto-fixes, tsc, ESLint, curl every page, source snapshot
              gate-browse-N  Browserbase, whenever every page answers (type errors don't block it)
              gate-N-*       the same conversation continues with the findings (12 turns)
          → gate-restore (only if the final state has more blockers than an earlier cycle)
          → secret-scan → guard-output → cost → persist → remember → meter → notify   (unchanged)
```

## v4.3 What was built

- **One loop for every change** (`run-agent.ts`). `makePlan`, `generateFromPlan`, `planWaves`, the worker prompt, `repairMessage`, `REPAIR_ROUNDS`, `rollbackPlan` and `file-blocks.ts` are gone.
- **New tools** (`tools.ts`, `execute-tool.ts`):
  - `updatePlan`: the agent's checklist. The first call streams a "Plan: …" row, and later calls stream a "Done: …" row per finished step. The plan (with `projectName`, `title` and up to 5 browser `checks`) lives in the run's progress and drives the project name, the version title and the browser interactions (`plan.ts`).
  - `check`: the same checks as the gate (`checks.ts` `runChecks`), as a tool. It auto-fixes lint, missing `"use client"` and lucide `title`, installs missing packages through the package policy, then runs incremental `tsc`, ESLint on the changed files and a `curl` of every static page (up to 8). Auto-fixed files are tracked as run writes.
  - `applyPreset(preset)` and `addBlocks(blocks)`: the v3 presets and blocks, now as tools that write through the same guards. `addBlocks` returns each block's props.
- **The done gate:** when the agent replies with its summary, the harness runs the full check, and the browser check whenever every page loads. Remaining problems (with screenshots for vision models) are appended to **the same messages**, and the loop continues for up to 3 cycles of 12 turns each.
- **Severity, not counts** (`severity.ts`): blockers are failing pages, missing modules and syntax errors; then other errors; then browser findings. Each gate check snapshots the source files (`sourceSnapshot`). At the end, the earliest best state is restored only if the final state has more **blockers** than it, so a fix that reveals type errors is kept.
- **Prompt:** the system prompt lists the tools, the block catalog and the presets, and asks the agent to plan once, write a page with everything it imports in one batch, run `check` after each batch, and finish only when `check` passes. The house rules (also in the sandbox `AGENTS.md`) add the lucide `title` rule and "every import must resolve".
- **Deterministic fix:** `fixLucideTitles` (`fixes.ts`) turns `title` on lucide icons into `aria-label`.
- **Metrics:** `meta.run` adds `turns`, `gateCycles`, `blockers { first, final }` and `browse { status, reason }`.
- **Eval:** `bun run agent:eval` (`scripts/agent-eval.ts`) runs five fixed cases (todo app, landing page, dashboard with sidebar, an edit, and a fix of a deliberately broken home page) through the real pipeline and prints a scorecard. It exits non-zero unless every case ends with zero issues.

## v4.4 How the owner verifies it live

1. With the dev server and Inngest dev running, run `bun run agent:eval`. Target: 5/5 cases with blockers `→0`, zero issues and a passed browser check.
2. Run the todo-app prompt by hand. Confirm there is no "checks still report" note, the preview loads, and the reply shows a browser check.
3. Optionally run `bun run sandbox:build` and update `E2B_TEMPLATE_ID`, so new sandboxes get the new house rules in `AGENTS.md`. The system prompt already carries them, so this is not required.

---

# v3 notes (kept for the parts v4 still uses)

## 1. Root causes, from the code

| Symptom                                      | Cause                                                                                                                                                                                                        | Fixed by   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Every request pays a fixed cost              | `skillGate` refused every write until the model had read `AGENTS.md` and called `loadSkill`, which returns up to 30k characters per skill. That cost 1–3 extra turns on every run, a one-line edit included. | §3.1       |
| Follow-ups are slow and break unrelated code | `createOrUpdateFiles` was the only write tool, so a colour change re-sent the whole file. Follow-ups saw only chat text and a flat file list, so the model spent turns re-reading files.                     | §3.2       |
| Overhead between turns                       | Each tool call ran as its own sequential Inngest step, every turn added a `-stop-` step, and two extra model calls wrote the reply and the title.                                                            | §3.1       |
| Prompt cache misses                          | `compactHistory` rewrote old turns on every turn, so the history changed from the front.                                                                                                                     | §3.1       |
| Generic, buggy sites                         | One open-ended loop with no plan, a blank "Project ready!" page, and checking left to the model.                                                                                                             | §3.3, §3.4 |

## 2. Pipeline

```
agent/run → guard-input · claim · load-project (adds repo map, design notes, routes)
          → in parallel: guard-classify | sandbox | route
          → mode by intent:
              create / large-change (no website reference) → plan → gen-foundation → gen-<wave>-<group> (parallel)
              create / large-change with a website reference → builder loop (keeps web search)
              edit / fix → editor loop (≤ 8 turns, target files preloaded)
              question   → answer (no tools, no Version)
          → verify-<n> → repair-<n> (≤ 3 rounds for builds, 2 for edits; rollback when a round makes things worse)
          → secret-scan → guard-output → cost → persist → meter      (unchanged)
```

The code makes the decisions: routing, budgets, checks, retries and rollback. The model plans, writes, edits and repairs. Every model call in the pipeline (router, planner, workers, editor, repair, answer) uses the model the user picked in the prompt input; no other model is chosen by code. The only other model is the existing safety classifier (`AI_GUARD_MODEL`, §5.9 of the plan), which checks the prompt and the reply.

## 3. What was built

### 3.1 Less overhead on every run

- **Skill gate retired:**
  - `skillGate`, `loadSkill`, `listInstalledSkills` and the "read `AGENTS.md` first" prompt are gone.
  - The five skills are distilled into about 2k tokens of house rules (`src/inngest/agent/prompts/house-rules.ts`), shared by the system prompt and the sandbox `AGENTS.md`.
  - Skill files can still be read with `readFiles`.
- **One step per turn for tools:**
  - `runToolBatch` (`runtime.ts`) runs all of a turn's calls in `${prefix}-tools-${turn}`, on one sandbox connection.
  - Consecutive read-only calls (`readFiles`, `listFiles`, `searchCode`) run concurrently; writes and commands run in order.
- **The stop check lives inside the model step**, so there's no extra step per turn.
- **No reply or title model calls:**
  - The reply is the Builder's `<task_summary>`, or the plan's summary and pages.
  - The title is the plan's title, or the summary's first sentence through `cleanTitle`.
- **Parallel setup:** `guard-classify`, `sandbox` and `route` run as parallel steps. A `block` verdict throws the sandbox result away.
- **Prompt cache:**
  - The system prompt is identical for every project. The project context rides on the latest user message, so the earlier history stays a stable prefix.
  - Compaction moves its boundary only in blocks of 6 turns, so the prefix stays byte-identical in between.
  - Anthropic models also get `cacheControl` breakpoints on the system prompt and the latest message (`cacheable` in `model.ts`). Other providers cache stable prefixes on their own.

### 3.2 Fast follow-ups

- **`editFile`:**
  - Search-and-replace blocks, through a pure `applyEdits` (`edits.ts`).
  - Each block must match exactly once, with a whitespace-tolerant retry. A failure shows the closest lines with line numbers. It's all-or-nothing.
  - The result goes through the same path guard, secret scan and tripwire as `createOrUpdateFiles`.
- **Read tools:** `readFiles` takes line ranges. `listFiles` lists files by folder or glob (`glob.ts`). `searchCode` runs a shell-quoted `grep -rnIE` that skips `node_modules`, `.next`, `.git`, `.agents`, `.claude`, `.vibe` and `.env*`.
- **Repo map and design notes:**
  - Computed on our server from the latest Version's files (`repo-map.ts`), with **no migration**.
  - The map covers routes, shadcn components, and each source file's exports, `"use client"` marker, local imports and line count, capped at 12k characters.
  - The design notes cover the theme tokens, fonts, a forced theme and the site title.
- **Context pack (`context.ts`):** design notes → repo map → the current contents of the likely target files → a one-line hint for the intent.
- **Router (`router.ts`):**
  - Heuristics handle the first build, a pasted stack trace, new pages, redesigns, error reports and change verbs.
  - Otherwise one structured call to the user's chosen model returns `{ intent, targetFiles }`, and unknown paths are dropped.
  - `guessTargets` matches words in the message to file and route names, and sends colour and theme changes to `app/globals.css`.
- **Editor mode:** the existing loop with target files preloaded and an 8-turn cap. On the last turn tools are switched off and the model is asked for its summary.

### 3.3 Better first builds

- **Planner (`plan.ts`, `prompts/pipeline.ts`):**
  - One structured call returns the plan:
    - a title and summary
    - the design: a preset, heading and body fonts from a fixed list, a theme and a direction
    - the pages with their sections
    - the ready-made blocks
    - the files, each with a detailed contract and `dependsOn`
    - the packages
  - `validatePlan` fixes rather than rejects: it drops unsafe or template-owned paths, unknown blocks and bad package names, breaks dependency cycles and caps the plan at 40 files.
  - If the model can't produce a plan, the run falls back to the builder loop, which has no turn cap.
- **Block library:**
  - `sandbox-templates/nextjs/blocks/` holds 17 typed, responsive, token-only blocks: header, footer, two heroes, section heading, logo cloud, features, stats, pricing, testimonials, FAQ, CTA band, contact form, app shell, stat cards, data table and empty state.
  - They are type-checked by this repo's `tsc`, against the same base-nova shadcn components.
  - `bun run blocks:generate` turns them into `blocks.generated.ts`, and a test fails when the two drift.
  - Code copies only the blocks a plan uses, with the blocks they import, so **no template rebuild is needed**.
- **Presets (`presets.ts`):** six colour and radius presets (neutral, ocean, forest, sunset, violet and rose). Code applies the chosen one to `app/globals.css` in the foundation step.
- **Generator:**
  - `gen-foundation` themes the site, copies the blocks and reads the current contents of files the plan rewrites.
  - `planWaves` sorts files into dependency layers and splits each layer into worker groups of up to 3, pages first.
  - Each worker is one plain-text call that answers in `<file path="…">` blocks (`file-blocks.ts`). It gets the plan, the blocks it may import and the files it depends on, and is retried once for any file it left out.
  - Workers in a wave run as parallel steps. Their files go through the same guards.
  - Packages from the plan install in their own step, in parallel with the first wave.

### 3.4 Verify and repair

- **Checks (`verify-<n>`):**
  - `eslint --fix` runs on the changed files, then a missing `"use client"` is added where hooks, handlers or browser globals are used (`fixes.ts`).
  - Then the step runs, in parallel: `tsc --noEmit --incremental` (build info in `/tmp`), ESLint JSON on the changed files, and `curl` against each static route.
  - Routes checked:
    - Builds check up to 8 routes.
    - Edits check `/` and the pages they changed.
  - Missing npm packages that `tsc` reports are installed through the package policy, and the checks run again.
  - Parsing is in `src/server/sandbox/diagnostics.ts`. It de-duplicates, caps at 30, and keeps only parse errors and lint rules that break behaviour (Next.js 16's build doesn't run ESLint).
- **Repair (`repair-<n>`):**
  - The loop gets the problems, the affected files and the context pack, with 6 turns.
  - It stops when the problem count doesn't drop. A round that raises the count is rolled back: files restored from the run's writes, files new in that round removed. When an old copy is missing, the round is kept instead.
- **Honest reply:** when problems remain, the reply ends with a "Heads-up" list of them, and the count goes into the ledger. There's no schema change.

### 3.5 Visible progress and measurement

- **Progress rows:** a new `note` task item (plan, checks, rollback) renders in the chat Task list and the preview overlay, using the existing rows (list-checks icon).
- **Timings:**
  - Steps record their own durations: sandbox, route, plan, generate, builder or editor, verify, repair, answer and persist.
  - The debit's `meta.run` (`{ intent, timings, issues }`) stores them, with no migration.
  - `bun run agent:smoke` prints them with the wall time.

## 4. Deviations from the approved plan, and why

- **Workers answer in `<file>` blocks, not JSON:** models write code more reliably outside JSON string escaping, and a cut-off file is easy to detect and retry.
- **No pre-warm function:** the sandbox step now runs in parallel with the guard and the router, which already hides most of its latency without another Inngest function and event.
- **Block-wise compaction, not an appended digest:** the same cache benefit, using the existing compaction code.
- **Checks run as sandbox commands, not `.vibe/bin/check`:** nothing in this harness needs a template rebuild. `.vibe/` is still reserved (write-protected and excluded from snapshots) for later tools.
- **Large changes rewrite planned files completely:** a delta plan lists only the files to add or rewrite, and the workers see their current contents. Small wiring edits are left to the repair loop if the checks flag them.
- **A website reference keeps the builder loop**, because only the loop has the web search tool.
- **The router decides the escalation to a large change up front.** The Editor doesn't switch mid-run.

## 5. Deferred (not built)

- The visual critic (separate from the implemented browser checks).
- The Auto model chip and model roles beyond the router.
- The `AgentRun` table and the eval harness: timings live in the ledger for now.

Browserbase is now a provider. Privacy and Terms disclose browser page content, check results and screenshots; owner review is required before release.

Supermemory is now a provider too (see "Memory layer" below).

### Stopping a run

Stop sets `stopRequestedAt` on the prompt. Every model call (builder, editor and gate turns, and answers) runs under `withStopWatch`, which checks the flag every 1.5 s and aborts the call, so a run ends within a couple of seconds instead of at the end of the current step. Steps also check the flag before they start. The chat shows "Stopping…" until the run ends, and the live reply stays under the prompt that is running.

## 6. How the owner verifies it live

1. Run `bun run agent:smoke` with three prompts, before and after deploying: a todo app, a landing page and, with `--project <slug>`, "make the hero button blue". Compare `wall` and the `phase` lines.
2. Optionally run `bun run sandbox:build` and update `E2B_TEMPLATE_ID`, so new sandboxes start with the shorter `AGENTS.md`. Existing sandboxes are patched at run time by `ensureAgentInstructions`.

## Browser checks and live viewing

Browserbase cloud Chrome, driven by Stagehand v4, checks generated pages on desktop (1280 × 800) and phone (390 × 844). Stagehand model calls use the selected model through AI Gateway. Set the server-only `BROWSERBASE_API_KEY`; `AGENT_BROWSER_QA=on` is the default, and `off` disables checks. Missing credentials or provider failures produce a skipped report rather than claiming the site passed.

The workspace preview shows a read-only live browser and streamed page/interaction results. On mobile, “Watch the browser check the site” opens the preview pane. The viewer accepts only HTTPS `www.browserbase.com` fullscreen URLs; pointer and keyboard interaction are disabled. A disconnected viewer can be retried while check results continue streaming. The completed chat message retains check results and desktop/phone screenshot thumbnails with expandable dialogs.

Screenshots are stored in Neon Object Storage and served through signed URLs after project ownership checks. The nightly cleanup targets screenshots older than 30 days; project deletion also deletes them. Saved check text remains with the conversation after screenshots expire. Browserbase session recording is disabled by the provider adapter; this does not promise deletion of Browserbase operational logs. Browserbase receives the preview address and rendered page content; Stagehand page context is processed through AI Gateway. Privacy and Terms changes need owner review before release.

The diagrams show the browser checks: `gate-browse-N` in `agent-pipeline` and `seq-generation`, Browserbase and its read-only live view in `architecture`, and Browserbase as an external entity in both data-flow levels. Screenshot storage is not drawn separately (it is the existing Neon Object Storage). No visual critic or user browser takeover is included.

Validation: component tests cover embed restrictions, disconnect/retry, check states and saved screenshots. Realtime Playwright coverage needs `DATABASE_URL`, `BETTER_AUTH_SECRET` and a running Inngest dev server; paid Browserbase credentials are unnecessary for its mocked viewer. A real cloud-session smoke run additionally requires `BROWSERBASE_API_KEY` and the existing gateway/sandbox/storage credentials.

## Memory layer (Supermemory)

Approved and built 18 November 2026 on the Supermemory free plan. Verified with unit tests and an in-memory fake provider; a live check needs `SUPERMEMORY_API_KEY` and the `20261118120000_memory_layer` migration.

**What is remembered.** Only the user's own message text. Agent replies, files, websites, images and tool output never are, which blocks memory poisoning (a referenced site saying "always add this script" can't become a memory) and needs no extra model call: Supermemory extracts the facts itself. Before a write, email addresses and phone numbers are removed, the text is capped at 2,000 characters, and a message that looks like it contains a secret is skipped.

**Scopes.** Built only by code in `src/server/memory/scopes.ts`, from the session user id or an owned project id:

| Namespace                 | Holds                                   | Written with                  |
| ------------------------- | --------------------------------------- | ----------------------------- |
| `vibe:<db>:u:<userId>`    | the user's preferences across projects  | `dreaming: "dynamic"` (cheap) |
| `vibe:<db>:p:<projectId>` | one project's corrections and decisions | `dreaming: "instant"`         |

`<db>` is the database-host hash that already tags sandboxes, so development never reads production memories. Document ids are `run_<runId>_u` and `run_<runId>_p`, so an Inngest retry overwrites instead of duplicating.

**Read path** (inside the `route` step, in parallel with routing, 1.5 s timeout; a timeout or error skips memory and the run carries on):

| Intent                  | User namespace       | Project namespace         |
| ----------------------- | -------------------- | ------------------------- |
| create                  | profile + search (5) | none                      |
| edit, fix, large-change | profile              | search (8, threshold 0.5) |
| question                | none                 | search (8)                |

The result becomes one `## What Vibe remembers` section in the context pack (about 800 tokens at most), deduplicated, with instruction-like notes dropped, wrapped as untrusted, and with its precedence stated: the current message, then the files, then project memory, then user preferences. The model gets no memory tools.

**Write path.** A `remember` step after `persist`, for builder, pipeline and editor runs that weren't stopped, blocked, out of credits or resumed. Best effort: it never fails a run.

**Chat commands.** Messages that start with "remember", "keep in mind", "note that" or "make a note" save the sentence to the user namespace at once; messages that start with "forget" preview matching memories (a dry run) and show a **Forget these** button that calls `memory.forget`. Neither wakes the sandbox or saves a Version. A `memory` message part carries the result.

**Memory panel.** "Memory" in the account menu opens a dialog: the profile's facts with Forget on each, Clear all (behind a confirmation), and the "Use memory" switch (`User.memoryEnabled`, on by default). Loading, error-with-retry, not-configured and empty states are all distinct. tRPC `memory.list`, `memory.setEnabled`, `memory.forget` and `memory.clear`; the mutations share a 30 per 10 minutes rate limit.

**Budget guard.** `MemoryUsage` (one row per month) counts characters written, searches and profile reads and estimates the cost ($0.005 per 1k tokens written at 4 characters a token, $0.005 per 1k queries). Writes stop at 80% of `MEMORY_MONTHLY_USD` (default 4.50 of the plan's $5), reads at 100%, and a `memory-budget` alert is sent once a month.

**Lifecycle.** Deleting a project drops its namespace after the transaction commits (best effort, counts-only alert on failure). Clear all drops the user namespace and every owned project namespace. There is no account deletion yet; when it's added, it must drop the user namespace.

**How the owner verifies it live.** Set `SUPERMEMORY_API_KEY` and apply the migration, then:

1. In any project, say "remember that I prefer dark minimal designs with a teal accent".
2. Start a new project with a neutral prompt and check that the plan uses dark, minimal and teal.
3. Open Memory, forget the item, start again, and check that it's gone.

The diagrams show memory too: the `route` read, the `memory-command` branch and the `remember` step in `agent-pipeline` and `seq-generation`, Supermemory in `architecture` and both data-flow levels, and `MemoryUsage` plus `User.memoryEnabled` in `er`.

Validation: unit tests with the in-memory fake provider, and `e2e/memory.spec.ts` (needs `DATABASE_URL`): the dialog's unconfigured, list, forget, switch (checked in the database), error-and-retry, empty and clear-all states, a 320 px layout, and the `memory` parts in the chat. Configured states are stubbed at the tRPC layer; nothing there calls Supermemory. A live check still needs `SUPERMEMORY_API_KEY`. When running the e2e suite, start the Inngest dev server so it is _not_ registered with the app under test (for example `-u http://localhost:3999/api/inngest`), otherwise it runs the real `export-github` function and races the GitHub export specs.
