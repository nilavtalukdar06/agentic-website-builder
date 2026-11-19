export const STACK_RULES = `## Stack
- Next.js 16 App Router, TypeScript, React 19, Tailwind CSS v4, shadcn/ui on Base UI, lucide-react. Source folders are app/, components/, hooks/ and lib/. There is no src/ folder. Import from the project root with the @ alias.
- Every shadcn/ui component is installed in components/ui and imported from "@/components/ui/<name>". Prefer them over hand-rolled markup: Button, Card, Badge, Input, Textarea, Label, Select, Checkbox, Switch, Tabs, Accordion, Dialog, Sheet, DropdownMenu, Tooltip, Avatar, Separator, Table, Skeleton, Sonner.
- The components are built on Base UI, not Radix. Compose with the render prop, never asChild. When render turns a Button into a link or another non-button element, add nativeButton={false}: <Button render={<Link href="/shop" />} nativeButton={false}>Shop</Button>. Read a component's file before using a prop you're not sure about.
- Server Components by default. Add "use client" as the first line of any file that uses hooks, event handlers, browser APIs or context, and keep those files small: a client leaf inside a server page.
- Pages are app/<route>/page.tsx with a default export. Shared layout goes in app/layout.tsx. Use next/link for internal links and next/image only for images whose size you know.
- Dark mode is class-based through ThemeProvider in app/layout.tsx. Style with theme tokens (bg-background, text-foreground, bg-card, bg-muted, text-muted-foreground, border, bg-primary, text-primary-foreground) so both themes work. If the design is one fixed palette, pass forcedTheme="light" or "dark" to ThemeProvider. Never put token text colours on a hard-coded background: a section with a fixed background sets its own text colours.
- Colours and radius come from the CSS variables in app/globals.css. To restyle the site, change those variables (in :root and .dark) instead of hard-coding colours in components.
- No remote images unless the user gives URLs: use gradients, coloured blocks, lucide icons or emoji. No lorem ipsum: write real, specific copy for the business described.
- Keep components under about 200 lines. Put sections in components/ (for example components/landing/hero.tsx) and data in lib/ (lib/data.ts) instead of one huge page.
- lucide-react icons don't accept a title prop. Label an icon-only control with aria-label on the button, or put an sr-only span next to the icon; decorative icons get aria-hidden.
- Every import must resolve: when a file imports "@/components/x" or "@/lib/y", that file must exist or be written in the same batch, with the exact export names you import. Default-export pages, named-export components.
- Client state: useState and useReducer first. For data that should survive a reload in a demo app (todos, carts, notes), persist to localStorage in a small hook. There is no backend or database.`;

export const DESIGN_RULES = `## Design quality
- Pick one clear direction from the request (calm and editorial, bold and playful, dense and technical…) and keep every page consistent with it.
- Typography does most of the work: a large, tight headline (text-4xl to text-6xl, font-semibold, tracking-tight), readable body text (text-base or text-lg, text-muted-foreground for secondary lines, max-w-prose), and a clear size step between levels.
- Spacing rhythm: sections py-16 to py-24, content in a centred container (mx-auto max-w-6xl px-4 sm:px-6), consistent gaps (gap-4, gap-6, gap-8). Generous whitespace beats borders and boxes.
- One accent colour (the primary token) used sparingly for the main action and highlights. Neutral surfaces for everything else.
- Responsive from 320 px: stack on mobile, grids from sm/md/lg up, no horizontal scroll, tap targets at least 40 px.
- Accessible: semantic landmarks (header, main, nav, footer, section with a heading), one h1 per page, labels on every input, alt text, visible focus, contrast that passes AA in both themes.
- Interactive details: hover and focus states, disabled and loading states on buttons, empty states for lists, and a friendly message for a form that was sent.
- Apps (dashboards, tools, todo lists) feel complete: real sample data, working add/edit/delete, filters or tabs where they make sense, and counts that update.`;

export const HOUSE_RULES = `${STACK_RULES}\n\n${DESIGN_RULES}`;
