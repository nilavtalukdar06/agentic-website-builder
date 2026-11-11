# Instructions for AI coding agents

These rules apply to every AI agent that writes or changes code in this project, for every request, including a one-line change.

## Always start here

1. Read this file (`AGENTS.md`) in full before you write or change any code. Read it again at the start of every new request. Do not rely on what you remember from an earlier one.
2. Load the available skills before you write or change any code, even for a small change such as a color, a label or a spacing fix. Skills live in `.agents/skills/<name>/SKILL.md`. List that folder, read the `SKILL.md` of every skill that applies to the change, and follow the files it points to. If the folder is missing or empty, carry on with the rules in this file.
3. When a skill and your memory disagree, follow the skill.
4. Before you use a Next.js API you are not certain about, read the matching guide in `node_modules/next/dist/docs/` (see the Next.js section below).
5. Never edit `.agents/` or `.claude/`. They are read-only reference material.

## About this project

- Next.js App Router, TypeScript, Tailwind CSS v4 and shadcn/ui built on Base UI.
- Source folders are `app/`, `components/`, `hooks/` and `lib/`. There is no `src/` folder.
- Every shadcn/ui component is already installed in `components/ui`. Compose with the `render` prop, not `asChild`.
- Style with the theme tokens (`bg-background`, `text-foreground`, `bg-muted`, `border`) so light and dark themes both work.
- Check your work before you finish: run `npx tsc --noEmit` and fix what it reports.
