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

## GitHub export

From a completed workspace, choose **Export to GitHub**. Connect GitHub to grant public repository access, or public and private access for private repositories. Review the repository name and visibility, then start the export. Private is selected initially. Re-export pushes the latest saved complete version to the same repository.

Exports run as durable Inngest jobs: they resume or recover the sandbox, prepare and scan files, create the repository, and push without putting GitHub credentials in the sandbox. Progress survives reloads; failed jobs can be retried. A repository link appears after the result is persisted. Both desktop and mobile use the same flow.

Apply `bun run db:deploy` to your development branch before running this version. Local development currently targets the Neon `development` branch; production has not been migrated. Keep local database URL overrides aligned in `.env` and `.env.local`, since Prisma and Next.js load their environments differently. No additional GitHub environment variables are needed.

If the local Inngest server uses a port other than 8288, set `INNGEST_DEV` to its full address (for example `http://localhost:8290`). The local configuration currently points to the existing server on port 8290.
