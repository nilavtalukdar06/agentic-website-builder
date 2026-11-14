# Vibe

An AI website builder. Describe a website, an agent writes the Next.js code live in a sandbox, and you preview it, read the code, download it or export it to GitHub. Usage is paid with credits.

`docs/plan.md` is the source of truth for scope and phases, and `docs/decisions.md` records every package and approach choice. `CLAUDE.md` (also linked as `AGENTS.md`) holds the working rules for anyone changing the code.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS 4 with shadcn/ui and AI Elements, tRPC + React Query, nuqs, Prisma 7 on Neon Postgres, Better Auth (GitHub), Inngest, AI SDK through Vercel AI Gateway, E2B sandboxes.

## Getting started

1. Use Node 24 (`nvm use`, from `.nvmrc`) and install dependencies with `bun install`.
2. Copy `.env.example` to `.env` and fill it in. Each variable is described there.
3. Apply the database migrations with `bun run db:deploy` (or `bun run db:migrate` while developing).
4. Start the app with `bun run dev` and open <http://localhost:3000>. In a second terminal run `bun run inngest:dev` so the agent runs.

The sandbox template is built once with `bun run sandbox:build`; paste the printed id into `.env`.

## Scripts

| Command                                      | What it does                                     |
| -------------------------------------------- | ------------------------------------------------ |
| `bun run dev` / `build` / `start`            | Run, build and serve the app                     |
| `bun run lint`                               | ESLint                                           |
| `bun run format`                             | Prettier on the whole repo                       |
| `bun run test:run`                           | Vitest unit and component tests                  |
| `bun run test:e2e`                           | Playwright (set `E2E_PORT` if port 3000 is used) |
| `bun run db:generate` / `migrate` / `deploy` | Prisma client and migrations                     |
| `bun run db:seed` / `db:studio`              | Seed data and Prisma Studio                      |
| `bun run icons:generate` / `logos:generate`  | Regenerate the file-type icons and model logos   |
| `bun run agent:smoke`                        | End-to-end smoke test of the agent               |
| `bun run clean`                              | Remove build and test artifacts                  |

## Pages

- `/` home with the prompt box and recent projects, `/projects`, `/usage`, `/p/[slug]` the workspace (signed in)
- `/sign-in`, `/terms`, `/privacy`, `/design` (public; `/design` is the design system)
