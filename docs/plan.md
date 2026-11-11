# Vibe — Phased Build Plan

AI website builder: prompt → empty Next.js sandbox → an agent writes the code live (chat on the left, preview/code on the right) → user previews, reads code, downloads it, or exports it to GitHub. Paid with usage credits ($5–$100 top-ups).

Design source of truth: the **Vibe** design canvas (design system, sign-in, home, projects, usage & credits, workspace building / code / preview). Every screen in this plan maps to an artboard there.

---

## 0. Ground rules (read before every phase)

### 0.1 Package-first rule

Before building **any** feature (file explorer, code viewer, chat UI, copy/download, zip, file icons, resizable panes, charts, tables, toasts, utilities…):

1. **Search npm first** (npmjs.com, the shadcn/ui + AI Elements registries, GitHub).
2. **Evaluate** each candidate against this checklist:
   - Maintained: release within the last ~6 months, open issues being answered
   - Works with **React 19** and **Next.js 16 App Router** (RSC-safe or clearly `"use client"`)
   - TypeScript types included
   - License MIT / Apache-2.0 / ISC
   - Reasonable bundle size (check bundlephobia / pkg-size)
   - Fits the design tokens (headless or style-able with Tailwind)
3. **Pick one, record it** in `docs/decisions.md` (one line per decision: feature → package → why → rejected alternatives).
4. **Only if nothing fits**, write our own implementation, and note why in the same file.

Priority order when several fit: **AI Elements / shadcn registry component → well-known headless library → small utility → own code.**

### 0.2 Conventions

- TypeScript strict, ESLint + Prettier, absolute imports `@/…`
- All colors/radii/spacing come from CSS tokens (no hex values in components)
- All URL state (tabs, filters, selected file, search) goes through **nuqs**
- All server data goes through **tRPC + React Query** (no ad-hoc `fetch` in components)
- Every phase ends with: type-check clean, lint clean, the phase's acceptance checklist ticked, and screens matching the design canvas in both light and dark

---

## 1. Tech stack

| Concern              | Choice                                       | Packages (verify latest at install time)                                                                                                |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | Next.js 16 (App Router, Turbopack), React 19 | `next`, `react`, `react-dom`                                                                                                            |
| Styling              | Tailwind CSS v4 + CSS variables              | `tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`                                                                                 |
| UI                   | shadcn/ui (copy-in components)               | `npx shadcn@latest init / add …`, `lucide-react`                                                                                        |
| AI UI                | AI Elements (shadcn-based registry)          | `npx ai-elements@latest add <component>`                                                                                                |
| Data fetching        | tRPC v11 + TanStack React Query v5           | `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`, `@tanstack/react-query`, `zod`, `superjson`, `client-only`, `server-only` |
| URL state            | nuqs v2                                      | `nuqs`                                                                                                                                  |
| Agents               | Inngest v4 + AI SDK (own durable tool loop)  | `inngest` (v4), `ai` (v7) — AgentKit dropped in Phase 5, see `docs/decisions.md`                                                        |
| Agent → UI streaming | Inngest v4 built-in realtime                 | `inngest/realtime` (channels, publish), `inngest/react` (`useRealtime`, Phase 6)                                                        |
| LLM                  | Vercel AI Gateway via the AI SDK             | `ai` (`createGateway`): any provider, user picks per prompt from a curated list; live prices + exact per-call cost from the gateway     |
| Voice input          | Browser Web Speech API                       | no runtime package; `@types/dom-speech-recognition` (types only, dev)                                                                   |
| File storage         | Neon Object Storage (S3-compatible)          | `files-sdk` (`neon` adapter) + `@aws-sdk/client-s3` peers; bucket declared in `neon.ts` (`@neon/config`)                                |
| Sandbox              | E2B (custom Next.js template)                | `e2b` (Template SDK builds the template; no `@e2b/cli` needed)                                                                          |
| Auth                 | Better Auth, **GitHub OAuth only**           | `better-auth`                                                                                                                           |
| Payments             | Stripe Checkout (one-time, custom amount)    | `stripe` (server), `@stripe/stripe-js` (only if needed client-side)                                                                     |
| Database             | PostgreSQL on Neon, Prisma 7                 | `prisma`, `@prisma/client`, `@prisma/adapter-neon`, `@neondatabase/serverless`, `ws`                                                    |
| GitHub export        | GitHub REST API                              | `@octokit/rest` (candidate; see Phase 8)                                                                                                |
| Theming              | light/dark                                   | `next-themes`                                                                                                                           |
| Fonts                | Geist / Geist Mono                           | `geist` (or `next/font/google`)                                                                                                         |
| Env validation       | typed env                                    | `@t3-oss/env-core` + `zod` (`src/config/env.ts`)                                                                                        |

Version notes:

- **Inngest v4**: triggers live in the function options (`triggers: [agentRun]`), events are typed with `eventType(name, { schema })`, realtime is built in (no `@inngest/realtime` middleware), the SDK defaults to **cloud** mode (set `INNGEST_DEV=1` locally), and checkpointing is on by default.
- **AI SDK v7**: `streamText` with `instructions`, tools defined with `tool({ inputSchema })` and **no `execute`**, so every tool call runs as its own Inngest step.

- **Next.js 16**: `middleware.ts` is deprecated; route protection goes in **`proxy.ts`** (exported function `proxy`, runs on the Node.js runtime).
- **Prisma 7**: the connection URL is **not** in `schema.prisma` any more; it lives in `prisma.config.ts`. The client is constructed with a **driver adapter** (`PrismaNeon`) and generated to a custom output path (`generator client { provider = "prisma-client" … }`). It requires Node 20.19+ / 22.12+ / 24+.
- **tRPC v11** App Router setup uses `@trpc/tanstack-react-query`, `createTRPCContext` on the client and `createTRPCOptionsProxy` + `HydrationBoundary` on the server.

---

## 2. Repository layout

```
.
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ prisma.config.ts
├─ neon.ts                      # Neon infrastructure as code (object storage buckets)
├─ sandbox-templates/nextjs/    # E2B template (Dockerfile / template.ts)
├─ docs/decisions.md            # package-first decision log
└─ src/
   ├─ proxy.ts                  # route protection (Next 16; lives next to app/ when using src/)
   ├─ app/
   │  ├─ (marketing)/sign-in/page.tsx
   │  ├─ (app)/layout.tsx       # sidebar shell
   │  ├─ (app)/page.tsx         # Home
   │  ├─ (app)/projects/page.tsx
   │  ├─ (app)/usage/page.tsx
   │  ├─ (workspace)/p/[slug]/page.tsx
   │  ├─ design/page.tsx        # design system (Phase 1)
   │  └─ api/
   │     ├─ auth/[...all]/route.ts
   │     ├─ trpc/[trpc]/route.ts
   │     ├─ inngest/route.ts
   │     ├─ attachments/route.ts   # image upload → Neon Object Storage
   │     ├─ realtime/token/route.ts
   │     └─ webhooks/stripe/route.ts
   ├─ components/
   │  ├─ ui/                    # shadcn
   │  ├─ ai-elements/           # AI Elements
   │  ├─ brand/                 # Logo, Wordmark, AppIcon
   │  └─ …feature components
   ├─ server/
   │  ├─ db.ts                  # Prisma + Neon adapter
   │  ├─ auth.ts                # Better Auth
   │  ├─ trpc/                  # init, routers, context
   │  ├─ billing/               # PaymentProvider + Stripe impl + ledger
   │  ├─ github/                # export service
   │  ├─ ai/                    # AI Gateway client, model catalogue, generation cost
   │  ├─ storage/               # Neon Object Storage (attachments)
   │  └─ sandbox/               # E2B helpers
   ├─ inngest/
   │  ├─ client.ts
   │  ├─ events.ts              # typed `agent/run` event
   │  ├─ channels.ts            # realtime channel `project:<id>` + topics
   │  ├─ publisher.ts           # publish helper (never fails a step)
   │  ├─ functions/run-agent.ts
   │  └─ agent/                 # model turn, tools, tool executor, persistence, prompts
   ├─ trpc/                     # client.tsx, server.tsx, query-client.ts
   ├─ lib/search-params/        # nuqs parsers (shared server/client)
   └─ styles/globals.css        # design tokens
```

---

## Phase 0 — Project bootstrap

**Goal:** an empty, typed, deployable app.

- `create-next-app` (TypeScript, Tailwind, App Router, `src/`), pin Node version (`.nvmrc`)
- ESLint/Prettier, `tsconfig` strict, path aliases
- `shadcn init` (CSS variables mode, neutral base); confirm the `components.json` paths that AI Elements will install into
- Env schema (`@t3-oss/env-nextjs` or zod): server + client vars (list at the end of this doc)
- CI: type-check, lint, build on every PR
- Deploy a "hello" build (Vercel) to catch platform issues early

**Done when:** `pnpm build` passes in CI and the preview deploy loads.

---

## Phase 1 — Design system & logo at `/design`

**Goal:** one page where every token, the logo and every component lives, matching the design canvas. **Nothing else is built until this page is approved.**

### 1.1 Tokens (`src/styles/globals.css`)

shadcn v4 semantic names, OKLCH values, flat style (no shadows), `--radius: 0.5rem`. Port both themes from the canvas:

- Surfaces: `--background`, `--card`, `--popover`, `--sidebar`, `--muted`, `--secondary`, `--accent`, `--tab-active`
- Text: `--foreground`, `--muted-foreground`, `--*-foreground` pairs
- Lines: `--border`, `--input`, `--sidebar-border`
- Signal (used sparingly): `--ring` (Lovable blue, focus only), `--destructive`, `--success`, `--warning`, `--brand`
- Data: `--chart-1 … --chart-5` (greyscale ramp)
- Code: `--code-kw`, `--code-str`, `--code-fn`, `--code-tag`, `--code-attr`, `--code-punc`, `--code-ln` (light = GitHub Light, dark = GitHub Dark)
- `--shadow-*` all set to `none` (depth comes from borders + surface steps)
- Map to Tailwind v4 with `@theme inline { --color-background: var(--background); … }`
- Dark mode via `next-themes` (`attribute="class"`, default **dark**, system allowed)

### 1.2 Brand components (`src/components/brand/`)

- `<LogoMark />`: inline SVG, two rounded strokes forming a V, second stroke at 50% opacity, `currentColor` so it follows the theme
- `<Logo />`: mark + "vibe" wordmark (Geist 600, tight tracking)
- `<AppIcon />`: dark and light rounded-square versions
- `app/icon.svg` + `app/apple-icon.png` (favicon), `opengraph-image.tsx` via `next/og`

### 1.3 `/design` page sections

Use nuqs for `?section=` (scroll target) and `?theme=` (forces a theme preview).

1. **Brand**: lockups (light/dark), app icons, minimum sizes
2. **Color**: every token, light and dark side by side, name + OKLCH value + swatch; contrast ratios for text pairs
3. **Typography**: display 34/500, page title 28/500, card title 15/600, body 14, muted 13, mono 13
4. **Radius & states**: sm/md/lg/xl; rest / hover / focus-ring samples
5. **Components** (shadcn): Button (default/secondary/outline/ghost/destructive/link, sizes), Badge, Input, Textarea, Select, Tabs, ToggleGroup, Slider, Tooltip, DropdownMenu, Dialog, Sheet, Sidebar, Card, Table, Skeleton, Sonner (toast), Resizable, ScrollArea, Breadcrumb, Avatar, Progress
6. **AI Elements**: Conversation, Message, Reasoning, Task, Tool, Shimmer, PromptInput, Suggestion, Checkpoint, WebPreview, FileTree, CodeBlock, Terminal, Snippet, each with static sample data
7. **Patterns** (our compositions): ProjectCard, AppSidebar, WorkspaceHeader (Preview/Code tabs + Export to GitHub), CreditsCard, FileChip with React/TS/CSS icons, GeneratingOverlay

### 1.4 Package decisions to make in this phase

| Need                                 | Candidates to evaluate                                                              | Fallback                      |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------- |
| Theme switching                      | `next-themes`                                                                       | own `ThemeProvider`           |
| Icons                                | `lucide-react`                                                                      | n/a                           |
| Toasts                               | shadcn `sonner`                                                                     | n/a                           |
| File-type icons (React/TS/CSS/JSON…) | `@iconify/react` + `vscode-icons` set, `material-icon-theme` SVGs, `react-icons/si` | small own SVG map (5–8 types) |
| Code highlighting                    | AI Elements `code-block` (Shiki-based)                                              | `shiki` directly              |

**Done when:** `/design` matches the canvas in light and dark, every component renders, axe shows no contrast errors, and the logo works as favicon + OG image.

---

## Phase 2 — Database, tRPC, nuqs foundations

### 2.1 Prisma 7 + Neon

- `prisma.config.ts` points the CLI at the **direct** (unpooled) Neon URL for migrations
- `src/server/db.ts` builds `new PrismaClient({ adapter: new PrismaNeon({ connectionString: DATABASE_URL }) })` with the pooled URL; global singleton in dev
- Neon branches: `main` (prod), `dev`, per-PR preview branches (optional)

**Schema (first pass):**

```prisma
// Better Auth core: User, Session, Account, Verification
// (generate with: npx @better-auth/cli generate)

model Project {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?
  userId      String
  sandboxId   String?          // current E2B sandbox
  previewUrl  String?
  githubRepo  String?          // "owner/name" once exported
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  messages    Message[]
  versions    Version[]
}

model Message {
  id        String   @id @default(cuid())
  projectId String
  role      Role               // USER | ASSISTANT
  content   String
  parts     Json?              // reasoning / task / tool parts for AI Elements
  createdAt DateTime @default(now())
}

model Version {                // a checkpoint ("v3")
  id         String   @id @default(cuid())
  projectId  String
  number     Int
  title      String
  files      Json              // { path: content } snapshot
  creditCost Int
  createdAt  DateTime @default(now())
  @@unique([projectId, number])
}

model CreditLedger {           // append-only; balance = SUM(delta)
  id        String   @id @default(cuid())
  userId    String
  delta     Int                // + top-up, − usage
  reason    LedgerReason       // TOPUP | GENERATION | EDIT | REFUND | ADJUSTMENT
  projectId String?
  paymentId String?  @unique   // idempotency for top-ups
  meta      Json?
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
}

model Payment {
  id          String   @id @default(cuid())
  userId      String
  provider    String           // "stripe"
  providerRef String   @unique // checkout session id
  amountCents Int
  currency    String   @default("usd")
  status      PaymentStatus
  createdAt   DateTime @default(now())
}
```

### 2.2 tRPC v11 + React Query

- `src/server/trpc/init.ts`: `initTRPC` with `superjson`, context = `{ db, session }` (session from Better Auth, Phase 3)
- Procedures: `publicProcedure`, `protectedProcedure` (throws `UNAUTHORIZED`)
- `app/api/trpc/[trpc]/route.ts` with `fetchRequestHandler`
- Client: `trpc/client.tsx` (`createTRPCContext`, `httpBatchLink` or `httpBatchStreamLink`), `trpc/query-client.ts` (dehydrate config), `trpc/server.tsx` (`createTRPCOptionsProxy`, `HydrateClient`, prefetch helpers)
- Routers: `project`, `message`, `version`, `credits`, `billing`, `github`

### 2.3 nuqs

- `<NuqsAdapter>` from `nuqs/adapters/next/app` in the root layout
- Shared parsers in `src/lib/search-params/*.ts`, imported by client hooks **and** server loaders (`createSearchParamsCache` / `createLoader` from `nuqs/server`)

**Done when:** a seeded project can be fetched on the server, hydrated, and re-fetched on the client with full types.

---

## Phase 3 — Authentication (Better Auth, GitHub only)

- `src/server/auth.ts`: `betterAuth({ database: prismaAdapter(db, { provider: "postgresql" }), socialProviders: { github: { clientId, clientSecret } }, plugins: [nextCookies()] })` (`nextCookies` must be the last plugin)
- `app/api/auth/[...all]/route.ts` → `toNextJsHandler(auth)`
- Client: `createAuthClient` from `better-auth/react`; the sign-in button calls `authClient.signIn.social({ provider: "github", callbackURL: "/" })`
- **Scopes:** sign-in asks only for profile and email. Repository access is requested **at first export** as an incremental scope upgrade. Check Better Auth's current API for requesting extra scopes on a linked account before building Phase 8; if it isn't supported, request `public_repo` or `repo` at sign-in and update the copy on the sign-in screen.
- `src/proxy.ts`: redirect signed-out users from `(app)` and `(workspace)` routes to `/sign-in` (cookie check only). Authoritative checks stay in `protectedProcedure` and server components.
- **Sign-in screen** from the canvas: logo, "Continue with GitHub", loading state ("Redirecting to GitHub…"), permissions note, Terms/Privacy links
- On first sign-in, create a welcome-credit ledger entry (amount TBD, or 0)

**Done when:** sign in / out works, protected pages redirect, `ctx.session` is available in tRPC.

---

## Phase 3.1 — Public pages (reconciled after Phase 4)

**Goal:** every link on the sign-in screen goes somewhere real. All pages live in the `(marketing)` route group, are public (not in the `proxy.ts` matcher), share one header (Logo + theme toggle) and the canvas footer (Docs · Status · Contact), and use only existing tokens and shadcn components.

- **`/terms`, `/privacy`**: long-form legal text (effective date at the top, sticky "On this page" list on wide screens). Linked from the sign-in "Terms" / "Privacy Policy".
- **`/docs`, `/docs/[slug]`**: docs index (link cards) and articles (Getting started, How Vibe builds, Projects, Credits & billing, Export to GitHub, FAQ). Content is typed data in `src/app/(marketing)/docs/_content/`, not MDX. Articles describe only what the product does; features that ship later are labelled "coming soon". `[slug]` has `generateStaticParams`, `notFound()`, `not-found.tsx`.
- **`/contact`**: email, Instagram, LinkedIn, GitHub as link cards (mail: `nilavtalukdar9@gmail.com`, Instagram `nilav.talukdar`, LinkedIn `nilav-talukdar`, GitHub `nilavtalukdar06`).
- **`/status`**: hourly uptime of the application.
  - A health probe (`GET /api/cron/health`, `Authorization: Bearer $CRON_SECRET`, run every 5 minutes by Vercel Cron) runs `SELECT 1`, stores `{ checkedAt, ok, latencyMs }` in `HealthCheck` and prunes rows older than 30 days.
  - `status.uptime` (public tRPC procedure, input `range`: `24h | 72h | 7d`) buckets checks per UTC hour. Past hours count missing checks as down (expected 12 per hour); the current hour only counts recorded checks; hours before the first check are "No data".
  - UI: banner (operational / degraded / disruption), three stat cards (uptime, average response, last check), one status bar per hour coloured with `--success` / `--warning` / `--destructive` / `--muted`, tooltip per bar, range tabs via nuqs `?range=`, polling every 60 s.
  - States: skeleton (`loading.tsx`), `error.tsx` with retry, empty state when no check has ever been recorded.
- Brand marks for Instagram and LinkedIn are small own SVGs (lucide 1.x has none), see `docs/decisions.md`.

**Done when:** all links resolve, every page is usable in light and dark, the status bars match the tokens in both themes, and the new routes pass the loading / error / empty / not-found rules in `CLAUDE.md`.

---

## Phase 4 — App shell, Home, Projects

- **Sidebar layout** (shadcn `Sidebar`): workspace switcher, New project (⌘K), Platform nav, Recent projects, credits card (balance + Top up), user menu
- **Home**: heading, **PromptInput** (AI Elements) with attach and model chips (_the canvas also shows visibility and framework chips; both were removed at the owner's request in Phase 5_); Suggestion chips; "Recent projects" (6 cards) + "See all projects"
  - Submit → `project.create` (name + slug generated from the prompt, see below) → `inngest.send("agent/run")` → navigate to `/p/[slug]`
- **Projects page**: search, filter tabs (All / On GitHub / Not exported), sort, grid of **ProjectCard** (name, slug, description, edited time, "On GitHub" badge), empty state
  - nuqs: `?q=`, `?filter=all|github|local`, `?sort=edited|name|created`
- **Slug generation**: evaluate `slugify` / `@sindresorhus/slugify`, add a uniqueness suffix in the DB
- **Relative time**: evaluate `date-fns` `formatDistanceToNow` vs `Intl.RelativeTimeFormat` (no dependency)
- **⌘K**: shadcn `Command` (cmdk)

**Scope notes (reconciled at Phase 4 start):**

- `project.create` stores the prompt as the project's first `USER` `Message`. The `inngest.send("agent/run")` call is added in Phase 5, when Inngest is installed; it reads that message.
- `/p/[slug]` ships in Phase 4 as a minimal page (name, slug, prompt, "waiting for the agent" state) with loading / error / not-found, so opening a project works. Phase 6 replaces its body with the workspace.
- **Templates** is on the canvas but has no phase: the nav item is shown disabled ("Soon").
- PromptInput **attach** and **mic** were shown disabled with a "Coming soon" tooltip (_both are live as of Phase 5, §5.5 and §5.6_). The **visibility** and **framework** chips from the canvas were dropped (_removed at the owner's request in Phase 5: visibility has no column until Phase 8 export, and Next.js is the only template, so a chip had nothing to choose_). (_Phase 5 enabled **attach** for image references and added a **model** chip, see §5.4–5.5; the mic dictates, see §5.6._)
- Sidebar credits card: balance = `SUM(delta)`; the bar is balance ÷ total credits ever granted (positive deltas).

**Done when:** creating, listing, filtering and opening projects works and matches the canvas.

---

## Phase 5 — Sandbox + coding agent (backend)

### 5.1 E2B template

- `sandbox-templates/nextjs/template.ts` (E2B Template SDK): Node 24 image, the app scaffolded with **`shadcn create --name app --template next --base base --preset nova`** (Next.js 16 App Router, TypeScript, Tailwind v4, no `src/`, Base UI `base-nova` style, Geist fonts, lucide, a `ThemeProvider` for class-based dark mode) then `next.config.ts` gets `allowedDevOrigins: ["*.e2b.app"]` (a `sed` step with a `grep` check, so a template change fails the build instead of silently losing it), then `shadcn add --all`, app in `/home/user/app`, start command `next dev --turbopack -p 3000` with a ready check on `http://localhost:3000`, so sandboxes boot with the dev server already running
- Build with `bun run sandbox:build` (needs `E2B_API_KEY`); it prints the id to store in `E2B_TEMPLATE_ID`
- Helpers in `src/server/sandbox/`: `getOrCreateSandbox(id, loadRestore)` (connect, or create and restore the latest Version's files, then `npm install` if `package.json` was restored), `previewUrlFor(sandbox)` = `"https://" + sandbox.getHost(3000)`, `snapshotSandbox()` (source tree without `node_modules`, `.next`, `.git`, lock files, `.env*`, binaries; capped at 400 files / 4 MB), 30-minute sandbox timeout

### 5.2 Inngest + AI SDK agent

- `inngest/client.ts`, `app/api/inngest/route.ts` (`serve`, `maxDuration = 300`, checkpointing `maxRuntime: "240s"`)
- `project.create` sends `agent/run` (`{ projectId, userId, messageId }`); if sending fails the project is still created and the error is logged (retry UI is Phase 6/9)
- Function `run-agent` (event `agent/run`):
  1. `step.run("load-project")`: ownership check, history up to the triggering message, latest Version file list, credit balance. Balance ≤ 0 → assistant error message ("out of credits"), no model call, no charge
  2. `step.run("sandbox")`: connect or create (restoring the latest Version), make sure `next.config.ts` still has `allowedDevOrigins` (`ensureDevOrigins`, also re-run in `persist` before the snapshot), save `sandboxId` + `previewUrl`
  3. Loop, max **30 turns**: `step.run("model-N")` streams one model turn (`streamText` through AI Gateway with the user's chosen model, §5.4); each tool call then runs in its own `step.run("tool-N-M")`. Tools:
     - `terminal`: `sandbox.commands.run(cmd)` in `/home/user/app`, stdout/stderr streamed, 3-minute timeout, output truncated for the model
     - `createOrUpdateFiles`: `sandbox.files.write(...)`, records created/edited paths and line counts
     - `readFiles`: `sandbox.files.read(path)`
  4. Router: stop when a turn has no tool calls (the reply holds `<task_summary>`). Hitting the turn cap without a summary is a failure. If the running cost reaches the balance, stop early and keep what was built
  5. `step.run("title")`: a short version title from the summary prompt
  6. `step.run("persist")`: warm the preview (`curl localhost:3000`), snapshot files, then one transaction: Version (next number, title, files, `creditCost`), assistant Message with `parts`, `previewUrl`
  7. `step.run("meter")`: one `CreditLedger` debit (`GENERATION` for the first version, `EDIT` after), then `credits` / `preview` / `status: done` events
  - `onFailure` (after retries, or a `NonRetriableError`): assistant error message, `status: error`, **no charge**
  - Model errors are classified: **429** waits for the gateway's `Retry after` (`RetryAfterError`, capped at 5 minutes); **401/403/404** stop the run with "the selected model isn't available, pick another" (e.g. AI Gateway free-tier restrictions); other **400s** stop with the generic failure; anything else is retried. A failed title call falls back to a default title instead of failing a finished build
  - All writes use ids derived from the Inngest run id (`run_<runId>_reply|version|debit`), so retried steps never duplicate a message, version or debit
- Prompts in `inngest/agent/prompts/`: system prompt (Next.js 16 App Router, Base UI shadcn with `render` not `asChild`, Tailwind, the template's placeholder page, missing metadata and `ThemeProvider` (theme tokens, or `forcedTheme` for a fixed palette), the dev server is already running, no secrets, files only via tools) and a title prompt
- Guardrails: 30 turns, 32 k output tokens per turn (a turn that hits it is discarded and the agent is told to take smaller steps), history compaction (only the last 3 turns keep full tool output and file contents), `readFiles` capped at 20 k characters per file and 60 k per call, 80 changed files per run (20 per call, 60 k characters per file), path guard (inside `/home/user/app`, no `node_modules` / `.next` / `.git` / `.env*`), command denylist (`sudo`, starting/stopping/building the dev server, `kill`, recursive deletes of `/`, `~`, `.` or `*`, `curl | sh`, `.env`), concurrency 2 runs per user and 1 per project
- **Metering** (decided at Phase 5 start): credits = `ceil(model cost in USD × CREDITS_PER_USD × CREDIT_MARKUP)`, with the cost reported by AI Gateway (§5.4). Failed runs are free

### 5.3 Realtime events (what the UI shows live)

One channel per project, `project:<projectId>`, typed with zod in `src/inngest/channels.ts`. Publishing happens only inside steps (never in the function body, which replays). Topic names are single words; the plan's event names map like this:

| Topic       | Plan event                               | Payload                                                                   | UI effect                              |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `status`    | `status`                                 | `{ state: thinking \| building \| compiling \| done \| error, message? }` | header badge, Shimmer                  |
| `reasoning` | `reasoning.delta`                        | `{ turn, delta }`                                                         | Reasoning ("Thought for N seconds")    |
| `text`      | (added) assistant text delta             | `{ turn, delta }`                                                         | streaming assistant text               |
| `task`      | `task.item`                              | sandbox / install / file item                                             | Task list rows                         |
| `file`      | `file.started` / `file.written`          | `{ phase, path, verb, lines? }`                                           | file chips + generating overlay stream |
| `tool`      | `tool.call` / `tool.output` (+ `result`) | `{ phase, callId, name, command?, chunk?, exitCode? }`                    | Tool card + Terminal                   |
| `credits`   | `credits.used`                           | `{ used }`                                                                | "N credits used" in the composer       |
| `preview`   | `preview.ready`                          | `{ url }`                                                                 | swap overlay for WebPreview iframe     |

- Token endpoint: `POST /api/realtime/token` `{ projectId }` → session + ownership check → `getClientSubscriptionToken(inngest, { channel, topics })` (Phase 6 passes it to `useRealtime`)
- Persisted message `parts` (`src/lib/agent/parts.ts`, zod): `reasoning`, `task`, `tool`, `text`, `error`, for Phase 6 to render on reload
- Until Phase 6, `/p/[slug]` shows the agent state from the latest message: building (with Refresh), done (reply + Open preview) or stopped (error reply)

### 5.4 Model choice and pricing (added at the owner's request during Phase 5)

- Every model call goes through **Vercel AI Gateway** (`createGateway({ apiKey: AI_GATEWAY_API_KEY })` from `ai`), so the agent is not tied to one provider
- **Curated list** of agentic-coding models in `src/lib/ai/models.ts` (Anthropic, OpenAI, Google, Moonshot AI, Z.ai, DeepSeek, Alibaba, Mistral), each with a `vision` flag. At runtime it is intersected with `gateway.getAvailableModels()` (cached 1 hour), which supplies the display names and **live prices**; retired models drop out on their own
- `model.list` (tRPC, prefetched on Home) feeds the **model chip** in the composer: AI Elements `ModelSelector` (searchable command dialog, grouped by provider, each row with the provider's **logo**, price per 1M tokens, image icon for vision; the chip shows the selected model's logo). Default from `AI_DEFAULT_MODEL`
- The chosen model is stored on the user `Message.model`; `run-agent` uses it for every turn and for the title (falls back to the default if it was retired)
- **Cost**: during the run, a live estimate (usage × gateway prices, including cache reads/writes) drives `credits.used` and the out-of-credits stop; at the end, `step.run("cost")` asks the gateway for the **exact cost** of every call (`getGenerationInfo`, by the `generationId` in provider metadata; BYOK uses `upstreamInferenceCost`) and falls back to the estimate for any call it can't resolve. Credits = `ceil(USD × CREDITS_PER_USD × CREDIT_MARKUP)`; the ledger meta keeps model, USD cost, exact/estimated call counts and generation ids

### 5.5 Image attachments (added at the owner's request during Phase 5)

- Up to **4 images** per prompt (PNG, JPEG, WebP, GIF, **4 MB** each, under Vercel's 4.5 MB request limit), attached with the paperclip, by paste or by the file dialog; chips with a hover preview (`PromptInputAttachment(s)`, ported from the AI Elements registry to Base UI)
- On submit the composer uploads each image to `POST /api/attachments` (multipart, session-checked, validated), which stores it in the private **`attachments` bucket on Neon Object Storage** under `users/<userId>/<id>.<ext>` and writes an `Attachment` row (key, name, type, size; `messageId` empty). `project.create` then links the ids to the new `USER` message after checking they belong to the user and are unused, and rejects images for a model without vision
- The agent sees images as file parts. History keeps only the bucket key (`vibe-attachment:<key>` placeholders), and each model step swaps them for **1-hour presigned URLs**, so no image bytes or URLs land in Inngest step state. A model without vision gets a text note instead. The system prompt treats images as visual references
- Bucket declared in `neon.ts`; `neon deploy` provisions it and writes `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`
- Phase 9: delete orphaned uploads (no `messageId` after a day) and bucket objects of deleted projects

### 5.6 Model logos and voice input (added at the owner's request during Phase 5)

- **Model logos**: per-model marks from `@lobehub/icons-static-svg` (dev dependency, MIT), baked into `src/components/models/model-logos.generated.ts` (~13 KB) by `bun run logos:generate`. Colored (Claude, Gemini, Kimi, DeepSeek, Alibaba, Mistral) except OpenAI and Z.ai, which only come as single-color marks and follow the theme. **Codex models show the Codex logo**, not OpenAI's (chosen by model id). Gradient ids are made unique per instance. A unit test fails if a curated model has no logo. No runtime request to a third party
- **Voice input**: the mic in the composer is `PromptInputSpeechButton` (AI Elements pattern, adapted to our `PromptInputProvider`). It uses the browser's built-in **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`, language from the browser): free, no server, no credits. Words appear live (interim, then final) after any text already typed. Clicking again stops and keeps the words; typing, submitting or leaving the page stops it and discards pending speech so it can't overwrite the edit. Errors (blocked microphone, no microphone, offline) show as a toast
- **Support**: Chrome, Edge and Safari. Firefox has no speech recognition, so the button is disabled with an explanatory tooltip. In Chrome and Edge the browser sends the audio to its vendor's speech service; Vibe never receives audio, only the text the user sends (stated in the privacy policy)
- Not done: server-side transcription (works in every browser but costs money per minute, needs recording, upload, limits and credit metering). Revisit if Firefox users matter

**Done when:** `bun run agent:smoke` (or a prompt from Home) produces a running sandbox with written files, a reachable preview URL, persisted messages/version, and a ledger debit, with events visible in the Inngest dev server.

---

## Phase 6 — Workspace UI (`/p/[slug]`)

Layout: header (logo, project switcher, version badge, **Preview | Code** tabs, theme, **Export to GitHub**, avatar) + chat column + main panel. Resizable split via shadcn `Resizable` (react-resizable-panels).

nuqs state: `?view=preview|code`, `?file=app/page.tsx`, `?device=desktop|tablet|mobile`.

### 6.1 Chat (left)

AI Elements, installed and themed in Phase 1:

- `Conversation` (auto-scroll), `Message` (user bubble / assistant plain), `Reasoning`, `Task` + file chips, `Tool` (+ `Terminal` for output), `Shimmer` for the active step, `Checkpoint` (Restore → set active Version, rewrite the sandbox files), `Suggestion`, `PromptInput` (Stop while running, Send when idle, image attachments, the model chip and the mic as on Home, §5.4–5.6)
- Message actions: copy, retry, thumbs up/down (store feedback)

### 6.2 Preview mode

- AI Elements `WebPreview`: back / forward / reload, URL field (read-only), device toggle, open in new tab, collapsible **Console** (stream dev-server logs)
- **Generating overlay** while building: faded page outline + rolling list of files ("Edited lib/utils.ts" → "**Editing** tailwind.config.ts" with Shimmer → "Up next…"), file-type icons, elapsed time

### 6.3 Code mode (read-only)

Scope is **view, copy, download**, nothing editable.

| Need                    | Candidates (evaluate first)                                                       | Fallback                        |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| File explorer           | AI Elements `file-tree`                                                           | `react-arborist`                |
| Code viewer             | AI Elements `code-block` (Shiki, line numbers, copy)                              | `shiki` + own wrapper           |
| Copy to clipboard       | `usehooks-ts` `useCopyToClipboard`, or the copy built into `code-block`/`snippet` | `navigator.clipboard.writeText` |
| Download single file    | own 10-line `Blob` + `URL.createObjectURL` helper, or `file-saver`                | —                               |
| Download project as ZIP | `client-zip` (small, streaming) vs `jszip` vs `fflate`                            | —                               |
| File tabs               | shadcn `Tabs`                                                                     | —                               |
| A / M markers           | derive from the Version diff                                                      | —                               |

- Files come from the latest `Version.files` (fast, no sandbox round-trip). Optionally refresh from the sandbox via `files.list`/`read` when it's alive.
- Large files: virtualize lines if they're long (evaluate `@tanstack/react-virtual`)

**Done when:** a full generation shows live in chat + overlay, the preview loads, Code mode browses/copies/downloads files and ZIP, and all three states match the canvas in light/dark.

---

## Phase 7 — Credits & billing

### 7.1 Model

- **Ledger-based** balance (`SUM(delta)`); never store a mutable balance without the ledger
- Top-up: any whole-dollar amount **$5–$100**
- Rate: `CREDITS_PER_USD` env var (design assumed 100; product decision)
- Usage: debit per agent run from token usage. Show cost in the chat ("N credits used") and on the version ("v3 · 42 credits").
- Block new runs when balance ≤ 0, with a top-up prompt

### 7.2 Payments

- `PaymentProvider` interface (`createCheckout(amountCents, userId)`, `verifyWebhook(req)`) with a **Stripe** implementation:
  - Stripe Checkout Session, `mode: "payment"`, `price_data` with the chosen amount; validate $5–$100 on the server
  - `app/api/webhooks/stripe/route.ts`: verify signature, handle `checkout.session.completed`, **idempotent** ledger insert (`paymentId` unique)
- ⚠️ **Risk:** Stripe accounts are **invite-only for Indian businesses**. Request an invite early. Keep the interface so another provider can be added without touching the UI or ledger. Build and test everything in Stripe **test mode** meanwhile.

### 7.3 Usage & credits page

- Stat cards (balance, used this month, last top-up)
- Daily usage bar chart: shadcn `Chart` (Recharts) with `--chart-*` tokens
- Activity table: shadcn `Table` (evaluate `@tanstack/react-table` only if sorting/pagination is needed)
- Top-up card: ToggleGroup presets ($5/10/25/50/100) + Slider + summary + Pay button → Checkout redirect
- nuqs: `?range=14d|30d`, `?page=`

**Done when:** a test-mode top-up adds credits exactly once (webhook retries are safe), runs debit credits, and the page matches the canvas.

---

## Phase 8 — Export to GitHub

- Button in the workspace header. Disabled while building; shows "On GitHub" badge + repo link after export.
- Flow: ensure repo scope (Phase 3 note) → dialog (repo name prefilled with slug, public/private) → create repo → push the current Version as one commit
- Implementation candidates (evaluate first):
  - `@octokit/rest` with the Git Data API (create blobs → tree → commit → update ref), all server-side with the user's GitHub access token from Better Auth's `Account` table
  - Alternative: run `git` inside the E2B sandbox and push with a short-lived token (no file round-trip, but a token enters the sandbox; prefer the Octokit route)
- Re-export pushes a new commit to the same repo; store `githubRepo` on the project
- Exclude `node_modules`, `.next`, `.env*`; add a README and `.gitignore`. Consider dropping `allowedDevOrigins` from the exported `next.config.ts` (a harmless dev-only option that only exists for the E2B preview)

**Done when:** a project exports to a new repo that `git clone && npm i && npm run dev` runs locally.

---

## Phase 9 — Hardening & launch

- **Sandbox lifecycle:** idle timeout, reconnect on open (`connect` by id), recreate from the latest Version if expired
- **Rate limits:** per user on `project.create` and `agent/run` (evaluate `@upstash/ratelimit` or Inngest throttling/concurrency)
- **Errors:** agent failure → assistant error message + "Retry" (no charge for failed runs, or a refund ledger entry); sandbox boot failure; webhook failures alerting
- **Observability:** Inngest dashboard for runs; app logs; optional Sentry
- **Security:** never expose E2B / OpenAI / Stripe keys to the client; validate all tRPC inputs with zod; check project ownership in every procedure; sandbox preview URLs aren't secret, so don't put user secrets in sandboxes
- **Testing:** Vitest for ledger math, slug, routers; Playwright for sign-in (mocked), create → generate → preview, top-up (Stripe test mode)
- **Accessibility:** keyboard paths for tabs, file tree, prompt; focus ring visible (`--ring`); contrast checked on `/design`
- **Deploy:** Vercel (app), Neon (DB, branches per preview), Inngest Cloud (functions), E2B (template), Stripe live keys after the invite

---

## Environment variables

Source of truth is `src/config/env.ts`; every change to it also updates `.env.example` and this list.

```
# App
NEXT_PUBLIC_APP_URL=

# Database (Neon)
DATABASE_URL=            # pooled, used by Prisma Client via adapter
DIRECT_URL=              # unpooled, used by prisma.config.ts for migrations

# Auth (Better Auth + GitHub OAuth app)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
WELCOME_CREDITS=0       # granted once on first sign-in; 0 disables

# Status page
CRON_SECRET=             # bearer token Vercel Cron sends to /api/cron/health; unset = probe disabled

# AI (Vercel AI Gateway)
AI_GATEWAY_API_KEY=
AI_DEFAULT_MODEL=anthropic/claude-sonnet-5.5   # must be in src/lib/ai/models.ts

# Credits (Phase 5 metering)
CREDITS_PER_USD=100
CREDIT_MARKUP=1          # 1 = model cost only

# Sandbox
E2B_API_KEY=
E2B_TEMPLATE_ID=         # printed by `bun run sandbox:build`

# Image attachments (Neon Object Storage; written by `neon deploy`)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_ENDPOINT_URL_S3=
AWS_REGION=

# Inngest
INNGEST_DEV=             # 1 locally (Dev Server); unset in production
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## Open decisions

1. **Credit pricing:** _resolved in Phase 5_: credits = `ceil(cost USD × CREDITS_PER_USD × CREDIT_MARKUP)` with the exact cost from AI Gateway; failed runs are free. `CREDIT_MARKUP` (margin) is still a product call
2. **Welcome credits** on sign-up: _resolved in Phase 3_: `WELCOME_CREDITS` env var, default 0 (no ledger row when 0)
3. **GitHub scopes:** _resolved in Phase 3_: sign-in asks for `read:user user:email` only; repo scope is added at first export via Better Auth `linkSocial({ provider: "github", scopes })`
4. **Payments in India:** Stripe invite status. If it's delayed, which second provider to add behind `PaymentProvider`
5. **Sandbox retention:** _partly resolved in Phase 5_: 30-minute sandbox timeout; an expired sandbox is recreated from the latest Version on the next run. Pausing instead of killing is a Phase 9 option
6. **Private repos** on export: allowed from day one, or public only at first
7. **Model list:** which models stay in the curated list (`src/lib/ai/models.ts`) as providers ship new ones, and whether expensive models (e.g. Claude Fable) need a warning

---

## Phase checklist

- [ ] Phase 0: bootstrap, CI, preview deploy
- [ ] Phase 1: `/design` (tokens, logo, components, AI Elements, patterns) **approved**
- [ ] Phase 2: Prisma 7 + Neon, tRPC v11, nuqs
- [ ] Phase 3: Better Auth (GitHub), sign-in, `proxy.ts`
- [ ] Phase 4: sidebar shell, Home, Projects
- [x] Phase 5: E2B template, Inngest + AI SDK agent (AI Gateway models), realtime events, metering, image attachments
- [ ] Phase 6: workspace (chat, preview + overlay, read-only code)
- [ ] Phase 7: credits ledger, Stripe top-ups, usage page
- [ ] Phase 8: Export to GitHub
- [ ] Phase 9: hardening, tests, launch
