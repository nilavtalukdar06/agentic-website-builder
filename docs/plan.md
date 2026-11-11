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
| Agents               | Inngest + AgentKit                           | `inngest`, `@inngest/agent-kit`                                                                                                         |
| Agent → UI streaming | AgentKit realtime                            | `@inngest/use-agent`, `@inngest/realtime`                                                                                               |
| LLM                  | OpenAI models via AgentKit `openai()`        | (bundled adapter; model id from env)                                                                                                    |
| Sandbox              | E2B (custom Next.js template)                | `e2b` (SDK ≥ 2.3 for templates), `@e2b/cli` (dev)                                                                                       |
| Auth                 | Better Auth, **GitHub OAuth only**           | `better-auth`                                                                                                                           |
| Payments             | Stripe Checkout (one-time, custom amount)    | `stripe` (server), `@stripe/stripe-js` (only if needed client-side)                                                                     |
| Database             | PostgreSQL on Neon, Prisma 7                 | `prisma`, `@prisma/client`, `@prisma/adapter-neon`, `@neondatabase/serverless`, `ws`                                                    |
| GitHub export        | GitHub REST API                              | `@octokit/rest` (candidate; see Phase 8)                                                                                                |
| Theming              | light/dark                                   | `next-themes`                                                                                                                           |
| Fonts                | Geist / Geist Mono                           | `geist` (or `next/font/google`)                                                                                                         |
| Env validation       | typed env                                    | `@t3-oss/env-core` + `zod` (`src/config/env.ts`)                                                                                        |

Version notes:

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
├─ proxy.ts                     # route protection (Next 16)
├─ sandbox-templates/nextjs/    # E2B template (Dockerfile / template.ts)
├─ docs/decisions.md            # package-first decision log
└─ src/
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
   │  └─ sandbox/               # E2B helpers
   ├─ inngest/
   │  ├─ client.ts
   │  ├─ functions/run-agent.ts
   │  └─ agent/                 # network, agents, tools, prompts
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
- `proxy.ts`: redirect signed-out users from `(app)` and `(workspace)` routes to `/sign-in` (cookie check only). Authoritative checks stay in `protectedProcedure` and server components.
- **Sign-in screen** from the canvas: logo, "Continue with GitHub", loading state ("Redirecting to GitHub…"), permissions note, Terms/Privacy links
- On first sign-in, create a welcome-credit ledger entry (amount TBD, or 0)

**Done when:** sign in / out works, protected pages redirect, `ctx.session` is available in tRPC.

---

## Phase 4 — App shell, Home, Projects

- **Sidebar layout** (shadcn `Sidebar`): workspace switcher, New project (⌘K), Platform nav, Recent projects, credits card (balance + Top up), user menu
- **Home**: heading, **PromptInput** (AI Elements) with attach / visibility / framework chips; Suggestion chips; "Recent projects" (6 cards) + "See all projects"
  - Submit → `project.create` (name + slug generated from the prompt, see below) → `inngest.send("agent/run")` → navigate to `/p/[slug]`
- **Projects page**: search, filter tabs (All / On GitHub / Not exported), sort, grid of **ProjectCard** (name, slug, description, edited time, "On GitHub" badge), empty state
  - nuqs: `?q=`, `?filter=all|github|local`, `?sort=edited|name|created`
- **Slug generation**: evaluate `slugify` / `@sindresorhus/slugify`, add a uniqueness suffix in the DB
- **Relative time**: evaluate `date-fns` `formatDistanceToNow` vs `Intl.RelativeTimeFormat` (no dependency)
- **⌘K**: shadcn `Command` (cmdk)

**Done when:** creating, listing, filtering and opening projects works and matches the canvas.

---

## Phase 5 — Sandbox + coding agent (backend)

### 5.1 E2B template

- `sandbox-templates/nextjs/`: Next.js + Tailwind + shadcn pre-installed, dev server started in the template so sandboxes boot hot
- Build with the E2B CLI and store the template id in `E2B_TEMPLATE_ID`
- Helpers: `getSandbox(id)` (connect or create), `previewUrl = "https://" + sandbox.getHost(3000)`, timeout/keep-alive policy

### 5.2 Inngest + AgentKit

- `inngest/client.ts`, `app/api/inngest/route.ts` (`serve`)
- Function `run-agent` (event `agent/run`):
  1. `step.run("sandbox")`: create or connect the sandbox, save `sandboxId`
  2. Build the **network**: one coding agent (`createAgent`, model `openai({ model: env.OPENAI_MODEL })`) with tools:
     - `terminal`: `sandbox.commands.run(cmd)` with streamed stdout/stderr
     - `createOrUpdateFiles`: `sandbox.files.write(...)`, records the path in network state
     - `readFiles`: `sandbox.files.read(path)`
  3. Router: stop when the agent emits a final summary or the iteration cap is hit
  4. `step.run("persist")`: save the assistant message (with parts), the Version snapshot, `previewUrl`
  5. `step.run("meter")`: write a `CreditLedger` debit from token usage (formula TBD); stop early if the balance hits 0
- Prompt files in `inngest/agent/prompts/`: system prompt (Next.js App Router, shadcn, Tailwind, no secrets, write files only via tools) and a summary prompt
- Guardrails: max iterations, max files, command allowlist or denylist, per-user concurrency limit (Inngest `concurrency` key = userId)

### 5.3 Realtime events (what the UI shows live)

Publish typed events on a per-project channel. Use AgentKit's `useAgent` streaming if its event set covers ours; otherwise publish custom topics with `@inngest/realtime`:

| Event                                                     | UI effect                              |
| --------------------------------------------------------- | -------------------------------------- |
| `status` (thinking / building / compiling / done / error) | header badge, Shimmer                  |
| `reasoning.delta`                                         | Reasoning ("Thought for N seconds")    |
| `task.item` (sandbox ready, installed deps…)              | Task list rows                         |
| `file.started` / `file.written` (path, verb, +lines)      | file chips + generating overlay stream |
| `tool.call` / `tool.output` (command, stdout chunks)      | Tool card + Terminal                   |
| `credits.used`                                            | "N credits used" in the composer       |
| `preview.ready` (url)                                     | swap overlay for WebPreview iframe     |

- Token endpoint: `app/api/realtime/token/route.ts` (subscription token scoped to the user's project channel)

**Done when:** sending a prompt from a test script produces a running sandbox with written files, a reachable preview URL, persisted messages/version, and a ledger debit, with events visible in the Inngest dev server.

---

## Phase 6 — Workspace UI (`/p/[slug]`)

Layout: header (logo, project switcher, version badge, **Preview | Code** tabs, theme, **Export to GitHub**, avatar) + chat column + main panel. Resizable split via shadcn `Resizable` (react-resizable-panels).

nuqs state: `?view=preview|code`, `?file=app/page.tsx`, `?device=desktop|tablet|mobile`.

### 6.1 Chat (left)

AI Elements, installed and themed in Phase 1:

- `Conversation` (auto-scroll), `Message` (user bubble / assistant plain), `Reasoning`, `Task` + file chips, `Tool` (+ `Terminal` for output), `Shimmer` for the active step, `Checkpoint` (Restore → set active Version, rewrite the sandbox files), `Suggestion`, `PromptInput` (Stop while running, Send when idle, attachments later)
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
- Exclude `node_modules`, `.next`, `.env*`; add a README and `.gitignore`

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
DEV_ROUTES_ENABLED=false # serve /dev/* in a production build (Playwright); always on in development

# Database (Neon)
DATABASE_URL=            # pooled, used by Prisma Client via adapter
DIRECT_URL=              # unpooled, used by prisma.config.ts for migrations

# Auth (Better Auth + GitHub OAuth app)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# AI
OPENAI_API_KEY=
OPENAI_MODEL=            # current OpenAI coding model, set per environment

# Sandbox
E2B_API_KEY=
E2B_TEMPLATE_ID=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CREDITS_PER_USD=100
```

---

## Open decisions

1. **Credit pricing:** credits per dollar, and how token usage converts to credits (and whether failed runs are free)
2. **Welcome credits** on sign-up (amount, or none)
3. **GitHub scopes:** incremental `repo` at export vs up-front at sign-in (depends on Better Auth support; update sign-in copy)
4. **Payments in India:** Stripe invite status. If it's delayed, which second provider to add behind `PaymentProvider`
5. **Sandbox retention:** how long an idle sandbox lives before it's recreated from the latest Version
6. **Private repos** on export: allowed from day one, or public only at first

---

## Phase checklist

- [ ] Phase 0: bootstrap, CI, preview deploy
- [ ] Phase 1: `/design` (tokens, logo, components, AI Elements, patterns) **approved**
- [ ] Phase 2: Prisma 7 + Neon, tRPC v11, nuqs
- [ ] Phase 3: Better Auth (GitHub), sign-in, `proxy.ts`
- [ ] Phase 4: sidebar shell, Home, Projects
- [ ] Phase 5: E2B template, Inngest + AgentKit, realtime events, metering
- [ ] Phase 6: workspace (chat, preview + overlay, read-only code)
- [ ] Phase 7: credits ledger, Stripe top-ups, usage page
- [ ] Phase 8: Export to GitHub
- [ ] Phase 9: hardening, tests, launch
