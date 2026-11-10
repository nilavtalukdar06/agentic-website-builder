<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Code output rules

After writing or editing any code in this repo:

1. Format it with Prettier (`bunx prettier --write <files>`, or `bun run format` for the whole repo).
2. Remove comments — do not leave explanatory comments in the diff unless they capture a genuinely non-obvious invariant.
3. Fix any Tailwind CSS warnings (unknown/conflicting classes, etc.) surfaced by the editor or `bun run lint` before considering the change done.
