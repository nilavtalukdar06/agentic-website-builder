export type Block = {
  name: string;
  path: string;
  description: string;
  exports: string[];
  uses: string[];
  props: string;
  source: string;
};

export const BLOCKS: Block[] = [
  {
    "name": "app-shell",
    "path": "components/blocks/app-shell.tsx",
    "description": "Dashboard layout: sidebar nav with active state, top bar with title and actions, mobile nav (client).",
    "exports": [
      "AppShell"
    ],
    "uses": [],
    "props": "export type AppShellProps = {\n  brand: string;\n  nav: { label: string; href: string; icon: LucideIcon }[];\n  title: string;\n  actions?: ReactNode;\n  children: ReactNode;\n};",
    "source": "\"use client\";\n\nimport Link from \"next/link\";\nimport { usePathname } from \"next/navigation\";\nimport { useState, type ReactNode } from \"react\";\nimport { MenuIcon, type LucideIcon } from \"lucide-react\";\nimport { Button } from \"@/components/ui/button\";\nimport { cn } from \"@/lib/utils\";\n\nexport type AppShellProps = {\n  brand: string;\n  nav: { label: string; href: string; icon: LucideIcon }[];\n  title: string;\n  actions?: ReactNode;\n  children: ReactNode;\n};\n\nexport function AppShell({\n  brand,\n  nav,\n  title,\n  actions,\n  children,\n}: AppShellProps) {\n  const pathname = usePathname();\n  const [open, setOpen] = useState(false);\n  const links = (\n    <nav aria-label=\"App\" className=\"flex flex-col gap-1\">\n      {nav.map((item) => {\n        const active =\n          pathname === item.href ||\n          (item.href !== \"/\" && pathname.startsWith(`${item.href}/`));\n        return (\n          <Link\n            key={item.href}\n            href={item.href}\n            onClick={() => setOpen(false)}\n            aria-current={active ? \"page\" : undefined}\n            className={cn(\n              \"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground\",\n              active && \"bg-muted text-foreground\",\n            )}\n          >\n            <item.icon className=\"size-4\" aria-hidden />\n            {item.label}\n          </Link>\n        );\n      })}\n    </nav>\n  );\n\n  return (\n    <div className=\"flex min-h-svh bg-muted/30\">\n      <aside className=\"hidden w-60 shrink-0 flex-col gap-6 border-r bg-background p-4 md:flex\">\n        <Link href=\"/\" className=\"px-3 text-lg font-semibold tracking-tight\">\n          {brand}\n        </Link>\n        {links}\n      </aside>\n      <div className=\"flex min-w-0 flex-1 flex-col\">\n        <header className=\"sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6\">\n          <Button\n            variant=\"ghost\"\n            size=\"icon\"\n            className=\"md:hidden\"\n            aria-label=\"Open navigation\"\n            aria-expanded={open}\n            onClick={() => setOpen((value) => !value)}\n          >\n            <MenuIcon />\n          </Button>\n          <h1 className=\"truncate text-lg font-semibold\">{title}</h1>\n          <div className=\"ml-auto flex items-center gap-2\">{actions}</div>\n        </header>\n        {open ? (\n          <div className=\"border-b bg-background p-4 md:hidden\">{links}</div>\n        ) : null}\n        <main className=\"flex-1 p-4 sm:p-6\">{children}</main>\n      </div>\n    </div>\n  );\n}\n"
  },
  {
    "name": "contact-form",
    "path": "components/blocks/contact-form.tsx",
    "description": "Contact form with name, email, message, sending state and success message (client).",
    "exports": [
      "ContactForm"
    ],
    "uses": [],
    "props": "export type ContactFormProps = {\n  id?: string;\n  title: string;\n  description?: string;\n  submitLabel?: string;\n  successMessage?: string;\n  className?: string;\n};",
    "source": "\"use client\";\n\nimport { useState } from \"react\";\nimport { CheckCircle2Icon } from \"lucide-react\";\nimport { Button } from \"@/components/ui/button\";\nimport { Input } from \"@/components/ui/input\";\nimport { Label } from \"@/components/ui/label\";\nimport { Textarea } from \"@/components/ui/textarea\";\nimport { cn } from \"@/lib/utils\";\n\nexport type ContactFormProps = {\n  id?: string;\n  title: string;\n  description?: string;\n  submitLabel?: string;\n  successMessage?: string;\n  className?: string;\n};\n\nexport function ContactForm({\n  id,\n  title,\n  description,\n  submitLabel = \"Send message\",\n  successMessage = \"Thanks! We'll get back to you within one business day.\",\n  className,\n}: ContactFormProps) {\n  const [sent, setSent] = useState(false);\n  const [sending, setSending] = useState(false);\n\n  return (\n    <section\n      id={id}\n      className={cn(\"mx-auto max-w-xl px-4 py-20 sm:px-6\", className)}\n    >\n      <div className=\"flex flex-col gap-2 text-center\">\n        <h2 className=\"text-3xl font-semibold tracking-tight\">{title}</h2>\n        {description ? (\n          <p className=\"text-muted-foreground\">{description}</p>\n        ) : null}\n      </div>\n      {sent ? (\n        <div\n          role=\"status\"\n          className=\"mt-10 flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center\"\n        >\n          <CheckCircle2Icon className=\"size-8 text-primary\" aria-hidden />\n          <p className=\"font-medium\">{successMessage}</p>\n        </div>\n      ) : (\n        <form\n          className=\"mt-10 flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8\"\n          onSubmit={(event) => {\n            event.preventDefault();\n            setSending(true);\n            setTimeout(() => {\n              setSending(false);\n              setSent(true);\n            }, 600);\n          }}\n        >\n          <div className=\"grid gap-5 sm:grid-cols-2\">\n            <div className=\"flex flex-col gap-2\">\n              <Label htmlFor=\"contact-name\">Name</Label>\n              <Input\n                id=\"contact-name\"\n                name=\"name\"\n                required\n                autoComplete=\"name\"\n              />\n            </div>\n            <div className=\"flex flex-col gap-2\">\n              <Label htmlFor=\"contact-email\">Email</Label>\n              <Input\n                id=\"contact-email\"\n                name=\"email\"\n                type=\"email\"\n                required\n                autoComplete=\"email\"\n              />\n            </div>\n          </div>\n          <div className=\"flex flex-col gap-2\">\n            <Label htmlFor=\"contact-message\">Message</Label>\n            <Textarea id=\"contact-message\" name=\"message\" rows={5} required />\n          </div>\n          <Button type=\"submit\" disabled={sending}>\n            {sending ? \"Sending…\" : submitLabel}\n          </Button>\n        </form>\n      )}\n    </section>\n  );\n}\n"
  },
  {
    "name": "cta-banner",
    "path": "components/blocks/cta-banner.tsx",
    "description": "Full-width primary-coloured call-to-action band.",
    "exports": [
      "CtaBanner"
    ],
    "uses": [],
    "props": "export type CtaBannerProps = {\n  title: string;\n  description?: string;\n  primary: { label: string; href: string };\n  secondary?: { label: string; href: string };\n  className?: string;\n};",
    "source": "import Link from \"next/link\";\nimport { Button } from \"@/components/ui/button\";\nimport { cn } from \"@/lib/utils\";\n\nexport type CtaBannerProps = {\n  title: string;\n  description?: string;\n  primary: { label: string; href: string };\n  secondary?: { label: string; href: string };\n  className?: string;\n};\n\nexport function CtaBanner({\n  title,\n  description,\n  primary,\n  secondary,\n  className,\n}: CtaBannerProps) {\n  return (\n    <section className={cn(\"mx-auto max-w-6xl px-4 py-20 sm:px-6\", className)}>\n      <div className=\"flex flex-col items-center gap-6 rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground\">\n        <h2 className=\"max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl\">\n          {title}\n        </h2>\n        {description ? (\n          <p className=\"max-w-xl text-lg text-pretty opacity-90\">\n            {description}\n          </p>\n        ) : null}\n        <div className=\"flex flex-col gap-3 sm:flex-row\">\n          <Button\n            size=\"lg\"\n            variant=\"secondary\"\n            render={<Link href={primary.href} />}\n            nativeButton={false}\n          >\n            {primary.label}\n          </Button>\n          {secondary ? (\n            <Button\n              size=\"lg\"\n              variant=\"ghost\"\n              className=\"text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground\"\n              render={<Link href={secondary.href} />}\n              nativeButton={false}\n            >\n              {secondary.label}\n            </Button>\n          ) : null}\n        </div>\n      </div>\n    </section>\n  );\n}\n"
  },
  {
    "name": "data-table",
    "path": "components/blocks/data-table.tsx",
    "description": "Generic table with typed columns, optional search box and empty row (client).",
    "exports": [
      "DataTable"
    ],
    "uses": [],
    "props": "export type DataTableColumn<Row> = {\n  key: string;\n  header: string;\n  cell: (row: Row) => ReactNode;\n  className?: string;\n};\nexport type DataTableProps<Row> = {\n  rows: Row[];\n  columns: DataTableColumn<Row>[];\n  rowKey: (row: Row) => string;\n  searchText?: (row: Row) => string;\n  searchPlaceholder?: string;\n  emptyMessage?: string;\n  className?: string;\n};",
    "source": "\"use client\";\n\nimport { useMemo, useState, type ReactNode } from \"react\";\nimport { SearchIcon } from \"lucide-react\";\nimport { Input } from \"@/components/ui/input\";\nimport {\n  Table,\n  TableBody,\n  TableCell,\n  TableHead,\n  TableHeader,\n  TableRow,\n} from \"@/components/ui/table\";\nimport { cn } from \"@/lib/utils\";\n\nexport type DataTableColumn<Row> = {\n  key: string;\n  header: string;\n  cell: (row: Row) => ReactNode;\n  className?: string;\n};\n\nexport type DataTableProps<Row> = {\n  rows: Row[];\n  columns: DataTableColumn<Row>[];\n  rowKey: (row: Row) => string;\n  searchText?: (row: Row) => string;\n  searchPlaceholder?: string;\n  emptyMessage?: string;\n  className?: string;\n};\n\nexport function DataTable<Row>({\n  rows,\n  columns,\n  rowKey,\n  searchText,\n  searchPlaceholder = \"Search…\",\n  emptyMessage = \"No results.\",\n  className,\n}: DataTableProps<Row>) {\n  const [query, setQuery] = useState(\"\");\n  const visible = useMemo(() => {\n    const needle = query.trim().toLowerCase();\n    if (!needle || !searchText) return rows;\n    return rows.filter((row) => searchText(row).toLowerCase().includes(needle));\n  }, [query, rows, searchText]);\n\n  return (\n    <div className={cn(\"flex flex-col gap-4\", className)}>\n      {searchText ? (\n        <div className=\"relative max-w-sm\">\n          <SearchIcon\n            className=\"pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground\"\n            aria-hidden\n          />\n          <Input\n            type=\"search\"\n            aria-label={searchPlaceholder}\n            placeholder={searchPlaceholder}\n            value={query}\n            onChange={(event) => setQuery(event.target.value)}\n            className=\"pl-9\"\n          />\n        </div>\n      ) : null}\n      <div className=\"overflow-hidden rounded-xl border bg-card\">\n        <Table>\n          <TableHeader>\n            <TableRow>\n              {columns.map((column) => (\n                <TableHead key={column.key} className={column.className}>\n                  {column.header}\n                </TableHead>\n              ))}\n            </TableRow>\n          </TableHeader>\n          <TableBody>\n            {visible.length === 0 ? (\n              <TableRow>\n                <TableCell\n                  colSpan={columns.length}\n                  className=\"h-24 text-center text-muted-foreground\"\n                >\n                  {emptyMessage}\n                </TableCell>\n              </TableRow>\n            ) : (\n              visible.map((row) => (\n                <TableRow key={rowKey(row)}>\n                  {columns.map((column) => (\n                    <TableCell key={column.key} className={column.className}>\n                      {column.cell(row)}\n                    </TableCell>\n                  ))}\n                </TableRow>\n              ))\n            )}\n          </TableBody>\n        </Table>\n      </div>\n    </div>\n  );\n}\n"
  },
  {
    "name": "empty-state",
    "path": "components/blocks/empty-state.tsx",
    "description": "Dashed empty state with icon, text and an action slot.",
    "exports": [
      "EmptyState"
    ],
    "uses": [],
    "props": "export type EmptyStateProps = {\n  icon: LucideIcon;\n  title: string;\n  description?: string;\n  action?: ReactNode;\n  className?: string;\n};",
    "source": "import type { LucideIcon } from \"lucide-react\";\nimport type { ReactNode } from \"react\";\nimport { cn } from \"@/lib/utils\";\n\nexport type EmptyStateProps = {\n  icon: LucideIcon;\n  title: string;\n  description?: string;\n  action?: ReactNode;\n  className?: string;\n};\n\nexport function EmptyState({\n  icon: Icon,\n  title,\n  description,\n  action,\n  className,\n}: EmptyStateProps) {\n  return (\n    <div\n      className={cn(\n        \"flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center\",\n        className,\n      )}\n    >\n      <span className=\"flex size-12 items-center justify-center rounded-full bg-muted\">\n        <Icon className=\"size-5 text-muted-foreground\" aria-hidden />\n      </span>\n      <p className=\"font-medium\">{title}</p>\n      {description ? (\n        <p className=\"max-w-sm text-sm text-muted-foreground\">{description}</p>\n      ) : null}\n      {action}\n    </div>\n  );\n}\n"
  },
  {
    "name": "faq",
    "path": "components/blocks/faq.tsx",
    "description": "Accessible FAQ accordion built on details/summary.",
    "exports": [
      "Faq"
    ],
    "uses": [
      "section-heading"
    ],
    "props": "export type FaqProps = {\n  id?: string;\n  title: string;\n  description?: string;\n  items: { question: string; answer: string }[];\n  className?: string;\n};",
    "source": "import { ChevronDownIcon } from \"lucide-react\";\nimport { cn } from \"@/lib/utils\";\nimport { SectionHeading } from \"./section-heading\";\n\nexport type FaqProps = {\n  id?: string;\n  title: string;\n  description?: string;\n  items: { question: string; answer: string }[];\n  className?: string;\n};\n\nexport function Faq({ id, title, description, items, className }: FaqProps) {\n  return (\n    <section\n      id={id}\n      className={cn(\"mx-auto max-w-3xl px-4 py-20 sm:px-6\", className)}\n    >\n      <SectionHeading title={title} description={description} />\n      <div className=\"mt-10 divide-y rounded-2xl border bg-card\">\n        {items.map((item) => (\n          <details key={item.question} className=\"group px-6 py-4\">\n            <summary className=\"flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden\">\n              {item.question}\n              <ChevronDownIcon\n                className=\"size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180\"\n                aria-hidden\n              />\n            </summary>\n            <p className=\"pt-3 text-sm text-muted-foreground\">{item.answer}</p>\n          </details>\n        ))}\n      </div>\n    </section>\n  );\n}\n"
  },
  {
    "name": "feature-grid",
    "path": "components/blocks/feature-grid.tsx",
    "description": "Grid of feature cards with a lucide icon, title and description.",
    "exports": [
      "FeatureGrid"
    ],
    "uses": [
      "section-heading"
    ],
    "props": "export type Feature = { icon: LucideIcon; title: string; description: string };\n\nexport type FeatureGridProps = {\n  id?: string;\n  eyebrow?: string;\n  title: string;\n  description?: string;\n  features: Feature[];\n  columns?: 2 | 3 | 4;\n  className?: string;\n};",
    "source": "import type { LucideIcon } from \"lucide-react\";\nimport { cn } from \"@/lib/utils\";\nimport { SectionHeading } from \"./section-heading\";\n\nexport type Feature = { icon: LucideIcon; title: string; description: string };\n\nexport type FeatureGridProps = {\n  id?: string;\n  eyebrow?: string;\n  title: string;\n  description?: string;\n  features: Feature[];\n  columns?: 2 | 3 | 4;\n  className?: string;\n};\n\nconst columnClass = {\n  2: \"sm:grid-cols-2\",\n  3: \"sm:grid-cols-2 lg:grid-cols-3\",\n  4: \"sm:grid-cols-2 lg:grid-cols-4\",\n} as const;\n\nexport function FeatureGrid({\n  id,\n  eyebrow,\n  title,\n  description,\n  features,\n  columns = 3,\n  className,\n}: FeatureGridProps) {\n  return (\n    <section\n      id={id}\n      className={cn(\"mx-auto max-w-6xl px-4 py-20 sm:px-6\", className)}\n    >\n      <SectionHeading\n        eyebrow={eyebrow}\n        title={title}\n        description={description}\n      />\n      <ul className={cn(\"mt-12 grid gap-6\", columnClass[columns])}>\n        {features.map((feature) => (\n          <li\n            key={feature.title}\n            className=\"flex flex-col gap-3 rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/40\"\n          >\n            <span className=\"flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary\">\n              <feature.icon className=\"size-5\" aria-hidden />\n            </span>\n            <h3 className=\"font-semibold\">{feature.title}</h3>\n            <p className=\"text-sm text-muted-foreground\">\n              {feature.description}\n            </p>\n          </li>\n        ))}\n      </ul>\n    </section>\n  );\n}\n"
  },
  {
    "name": "hero-centered",
    "path": "components/blocks/hero-centered.tsx",
    "description": "Centered landing hero with eyebrow badge, headline, text, two CTAs and a soft glow.",
    "exports": [
      "HeroCentered"
    ],
    "uses": [],
    "props": "export type HeroCenteredProps = {\n  eyebrow?: string;\n  title: string;\n  description: string;\n  primary: { label: string; href: string };\n  secondary?: { label: string; href: string };\n  note?: string;\n  className?: string;\n};",
    "source": "import Link from \"next/link\";\nimport { Badge } from \"@/components/ui/badge\";\nimport { Button } from \"@/components/ui/button\";\nimport { cn } from \"@/lib/utils\";\n\nexport type HeroCenteredProps = {\n  eyebrow?: string;\n  title: string;\n  description: string;\n  primary: { label: string; href: string };\n  secondary?: { label: string; href: string };\n  note?: string;\n  className?: string;\n};\n\nexport function HeroCentered({\n  eyebrow,\n  title,\n  description,\n  primary,\n  secondary,\n  note,\n  className,\n}: HeroCenteredProps) {\n  return (\n    <section className={cn(\"relative overflow-hidden\", className)}>\n      <div\n        aria-hidden\n        className=\"pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--color-primary)_18%,transparent),transparent_65%)]\"\n      />\n      <div className=\"mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6 md:py-32\">\n        {eyebrow ? (\n          <Badge variant=\"outline\" className=\"rounded-full px-3 py-1\">\n            {eyebrow}\n          </Badge>\n        ) : null}\n        <h1 className=\"text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl\">\n          {title}\n        </h1>\n        <p className=\"max-w-2xl text-lg text-pretty text-muted-foreground\">\n          {description}\n        </p>\n        <div className=\"flex flex-col gap-3 sm:flex-row\">\n          <Button\n            size=\"lg\"\n            render={<Link href={primary.href} />}\n            nativeButton={false}\n          >\n            {primary.label}\n          </Button>\n          {secondary ? (\n            <Button\n              size=\"lg\"\n              variant=\"outline\"\n              render={<Link href={secondary.href} />}\n              nativeButton={false}\n            >\n              {secondary.label}\n            </Button>\n          ) : null}\n        </div>\n        {note ? <p className=\"text-sm text-muted-foreground\">{note}</p> : null}\n      </div>\n    </section>\n  );\n}\n"
  },
  {
    "name": "hero-split",
    "path": "components/blocks/hero-split.tsx",
    "description": "Two-column hero: copy, CTAs and highlights on the left, a visual slot (ReactNode) on the right.",
    "exports": [
      "HeroSplit"
    ],
    "uses": [],
    "props": "export type HeroSplitProps = {\n  eyebrow?: string;\n  title: string;\n  description: string;\n  primary: { label: string; href: string };\n  secondary?: { label: string; href: string };\n  highlights?: string[];\n  visual?: ReactNode;\n  className?: string;\n};",
    "source": "import Link from \"next/link\";\nimport type { ReactNode } from \"react\";\nimport { Button } from \"@/components/ui/button\";\nimport { cn } from \"@/lib/utils\";\n\nexport type HeroSplitProps = {\n  eyebrow?: string;\n  title: string;\n  description: string;\n  primary: { label: string; href: string };\n  secondary?: { label: string; href: string };\n  highlights?: string[];\n  visual?: ReactNode;\n  className?: string;\n};\n\nexport function HeroSplit({\n  eyebrow,\n  title,\n  description,\n  primary,\n  secondary,\n  highlights = [],\n  visual,\n  className,\n}: HeroSplitProps) {\n  return (\n    <section\n      className={cn(\"mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28\", className)}\n    >\n      <div className=\"grid items-center gap-12 lg:grid-cols-2\">\n        <div className=\"flex flex-col gap-6\">\n          {eyebrow ? (\n            <p className=\"text-sm font-medium text-primary\">{eyebrow}</p>\n          ) : null}\n          <h1 className=\"text-4xl font-semibold tracking-tight text-balance sm:text-5xl\">\n            {title}\n          </h1>\n          <p className=\"max-w-xl text-lg text-pretty text-muted-foreground\">\n            {description}\n          </p>\n          <div className=\"flex flex-col gap-3 sm:flex-row\">\n            <Button\n              size=\"lg\"\n              render={<Link href={primary.href} />}\n              nativeButton={false}\n            >\n              {primary.label}\n            </Button>\n            {secondary ? (\n              <Button\n                size=\"lg\"\n                variant=\"outline\"\n                render={<Link href={secondary.href} />}\n                nativeButton={false}\n              >\n                {secondary.label}\n              </Button>\n            ) : null}\n          </div>\n          {highlights.length > 0 ? (\n            <ul className=\"flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground\">\n              {highlights.map((item) => (\n                <li key={item} className=\"flex items-center gap-2\">\n                  <span\n                    aria-hidden\n                    className=\"size-1.5 rounded-full bg-primary\"\n                  />\n                  {item}\n                </li>\n              ))}\n            </ul>\n          ) : null}\n        </div>\n        <div className=\"relative aspect-[4/3] overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-muted to-background\">\n          {visual}\n        </div>\n      </div>\n    </section>\n  );\n}\n"
  },
  {
    "name": "logo-cloud",
    "path": "components/blocks/logo-cloud.tsx",
    "description": "Row of customer or partner names as wordmarks.",
    "exports": [
      "LogoCloud"
    ],
    "uses": [],
    "props": "export type LogoCloudProps = {\n  title?: string;\n  names: string[];\n  className?: string;\n};",
    "source": "import { cn } from \"@/lib/utils\";\n\nexport type LogoCloudProps = {\n  title?: string;\n  names: string[];\n  className?: string;\n};\n\nexport function LogoCloud({ title, names, className }: LogoCloudProps) {\n  return (\n    <section className={cn(\"mx-auto max-w-6xl px-4 py-12 sm:px-6\", className)}>\n      {title ? (\n        <p className=\"mb-6 text-center text-sm text-muted-foreground\">\n          {title}\n        </p>\n      ) : null}\n      <ul className=\"flex flex-wrap items-center justify-center gap-x-10 gap-y-4\">\n        {names.map((name) => (\n          <li\n            key={name}\n            className=\"text-lg font-semibold tracking-tight text-muted-foreground/70\"\n          >\n            {name}\n          </li>\n        ))}\n      </ul>\n    </section>\n  );\n}\n"
  },
  {
    "name": "pricing",
    "path": "components/blocks/pricing.tsx",
    "description": "2–3 pricing plans with features and a featured plan.",
    "exports": [
      "Pricing"
    ],
    "uses": [
      "section-heading"
    ],
    "props": "export type PricingPlan = {\n  name: string;\n  price: string;\n  period?: string;\n  description: string;\n  features: string[];\n  cta: { label: string; href: string };\n  featured?: boolean;\n};\nexport type PricingProps = {\n  id?: string;\n  eyebrow?: string;\n  title: string;\n  description?: string;\n  plans: PricingPlan[];\n  className?: string;\n};",
    "source": "import Link from \"next/link\";\nimport { CheckIcon } from \"lucide-react\";\nimport { Badge } from \"@/components/ui/badge\";\nimport { Button } from \"@/components/ui/button\";\nimport { cn } from \"@/lib/utils\";\nimport { SectionHeading } from \"./section-heading\";\n\nexport type PricingPlan = {\n  name: string;\n  price: string;\n  period?: string;\n  description: string;\n  features: string[];\n  cta: { label: string; href: string };\n  featured?: boolean;\n};\n\nexport type PricingProps = {\n  id?: string;\n  eyebrow?: string;\n  title: string;\n  description?: string;\n  plans: PricingPlan[];\n  className?: string;\n};\n\nexport function Pricing({\n  id,\n  eyebrow,\n  title,\n  description,\n  plans,\n  className,\n}: PricingProps) {\n  return (\n    <section\n      id={id}\n      className={cn(\"mx-auto max-w-6xl px-4 py-20 sm:px-6\", className)}\n    >\n      <SectionHeading\n        eyebrow={eyebrow}\n        title={title}\n        description={description}\n      />\n      <div className=\"mt-12 grid gap-6 lg:grid-cols-3\">\n        {plans.map((plan) => (\n          <div\n            key={plan.name}\n            className={cn(\n              \"relative flex flex-col gap-6 rounded-2xl border bg-card p-8\",\n              plan.featured && \"border-primary shadow-lg ring-1 ring-primary\",\n            )}\n          >\n            {plan.featured ? (\n              <Badge className=\"absolute -top-3 left-8\">Most popular</Badge>\n            ) : null}\n            <div className=\"flex flex-col gap-2\">\n              <h3 className=\"text-lg font-semibold\">{plan.name}</h3>\n              <p className=\"text-sm text-muted-foreground\">\n                {plan.description}\n              </p>\n            </div>\n            <p className=\"flex items-baseline gap-1\">\n              <span className=\"text-4xl font-semibold tracking-tight\">\n                {plan.price}\n              </span>\n              {plan.period ? (\n                <span className=\"text-sm text-muted-foreground\">\n                  {plan.period}\n                </span>\n              ) : null}\n            </p>\n            <ul className=\"flex flex-1 flex-col gap-3 text-sm\">\n              {plan.features.map((feature) => (\n                <li key={feature} className=\"flex gap-2\">\n                  <CheckIcon\n                    className=\"mt-0.5 size-4 shrink-0 text-primary\"\n                    aria-hidden\n                  />\n                  {feature}\n                </li>\n              ))}\n            </ul>\n            <Button\n              variant={plan.featured ? \"default\" : \"outline\"}\n              render={<Link href={plan.cta.href} />}\n              nativeButton={false}\n            >\n              {plan.cta.label}\n            </Button>\n          </div>\n        ))}\n      </div>\n    </section>\n  );\n}\n"
  },
  {
    "name": "section-heading",
    "path": "components/blocks/section-heading.tsx",
    "description": "Eyebrow, h2 and description for any section.",
    "exports": [
      "SectionHeading"
    ],
    "uses": [],
    "props": "export type SectionHeadingProps = {\n  eyebrow?: string;\n  title: string;\n  description?: string;\n  align?: \"left\" | \"center\";\n  className?: string;\n};",
    "source": "import { cn } from \"@/lib/utils\";\n\nexport type SectionHeadingProps = {\n  eyebrow?: string;\n  title: string;\n  description?: string;\n  align?: \"left\" | \"center\";\n  className?: string;\n};\n\nexport function SectionHeading({\n  eyebrow,\n  title,\n  description,\n  align = \"center\",\n  className,\n}: SectionHeadingProps) {\n  return (\n    <div\n      className={cn(\n        \"flex max-w-2xl flex-col gap-3\",\n        align === \"center\" && \"mx-auto items-center text-center\",\n        className,\n      )}\n    >\n      {eyebrow ? (\n        <p className=\"text-sm font-medium text-primary\">{eyebrow}</p>\n      ) : null}\n      <h2 className=\"text-3xl font-semibold tracking-tight text-balance sm:text-4xl\">\n        {title}\n      </h2>\n      {description ? (\n        <p className=\"text-lg text-pretty text-muted-foreground\">\n          {description}\n        </p>\n      ) : null}\n    </div>\n  );\n}\n"
  },
  {
    "name": "site-footer",
    "path": "components/blocks/site-footer.tsx",
    "description": "Footer with brand, tagline, link columns and legal line.",
    "exports": [
      "SiteFooter"
    ],
    "uses": [],
    "props": "export type SiteFooterProps = {\n  brand: string;\n  tagline?: string;\n  columns?: { title: string; links: { label: string; href: string }[] }[];\n  legal?: string;\n  className?: string;\n};",
    "source": "import Link from \"next/link\";\nimport { cn } from \"@/lib/utils\";\n\nexport type SiteFooterProps = {\n  brand: string;\n  tagline?: string;\n  columns?: { title: string; links: { label: string; href: string }[] }[];\n  legal?: string;\n  className?: string;\n};\n\nexport function SiteFooter({\n  brand,\n  tagline,\n  columns = [],\n  legal,\n  className,\n}: SiteFooterProps) {\n  return (\n    <footer className={cn(\"border-t bg-muted/30\", className)}>\n      <div className=\"mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)]\">\n        <div className=\"flex flex-col gap-2\">\n          <p className=\"text-lg font-semibold tracking-tight\">{brand}</p>\n          {tagline ? (\n            <p className=\"max-w-xs text-sm text-muted-foreground\">{tagline}</p>\n          ) : null}\n        </div>\n        {columns.map((column) => (\n          <div key={column.title} className=\"flex flex-col gap-3\">\n            <p className=\"text-sm font-medium\">{column.title}</p>\n            <ul className=\"flex flex-col gap-2\">\n              {column.links.map((link) => (\n                <li key={link.label}>\n                  <Link\n                    href={link.href}\n                    className=\"text-sm text-muted-foreground transition-colors hover:text-foreground\"\n                  >\n                    {link.label}\n                  </Link>\n                </li>\n              ))}\n            </ul>\n          </div>\n        ))}\n      </div>\n      <div className=\"border-t\">\n        <p className=\"mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6\">\n          {legal ??\n            `© ${new Date().getFullYear()} ${brand}. All rights reserved.`}\n        </p>\n      </div>\n    </footer>\n  );\n}\n"
  },
  {
    "name": "site-header",
    "path": "components/blocks/site-header.tsx",
    "description": "Sticky top navigation with brand, links, CTA and a mobile menu (client).",
    "exports": [
      "SiteHeader"
    ],
    "uses": [],
    "props": "export type SiteHeaderProps = {\n  brand: string;\n  links: { label: string; href: string }[];\n  cta?: { label: string; href: string };\n  className?: string;\n};",
    "source": "\"use client\";\n\nimport Link from \"next/link\";\nimport { useState } from \"react\";\nimport { MenuIcon, XIcon } from \"lucide-react\";\nimport { Button } from \"@/components/ui/button\";\nimport { cn } from \"@/lib/utils\";\n\nexport type SiteHeaderProps = {\n  brand: string;\n  links: { label: string; href: string }[];\n  cta?: { label: string; href: string };\n  className?: string;\n};\n\nexport function SiteHeader({ brand, links, cta, className }: SiteHeaderProps) {\n  const [open, setOpen] = useState(false);\n  return (\n    <header\n      className={cn(\n        \"sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md\",\n        className,\n      )}\n    >\n      <div className=\"mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6\">\n        <Link href=\"/\" className=\"text-lg font-semibold tracking-tight\">\n          {brand}\n        </Link>\n        <nav aria-label=\"Main\" className=\"hidden items-center gap-1 md:flex\">\n          {links.map((link) => (\n            <Button\n              key={link.href}\n              variant=\"ghost\"\n              size=\"sm\"\n              render={<Link href={link.href} />}\n              nativeButton={false}\n            >\n              {link.label}\n            </Button>\n          ))}\n        </nav>\n        <div className=\"flex items-center gap-2\">\n          {cta ? (\n            <Button\n              size=\"sm\"\n              className=\"hidden sm:inline-flex\"\n              render={<Link href={cta.href} />}\n              nativeButton={false}\n            >\n              {cta.label}\n            </Button>\n          ) : null}\n          <Button\n            variant=\"ghost\"\n            size=\"icon\"\n            className=\"md:hidden\"\n            aria-label={open ? \"Close menu\" : \"Open menu\"}\n            aria-expanded={open}\n            onClick={() => setOpen((value) => !value)}\n          >\n            {open ? <XIcon /> : <MenuIcon />}\n          </Button>\n        </div>\n      </div>\n      {open ? (\n        <nav\n          aria-label=\"Mobile\"\n          className=\"flex flex-col gap-1 border-t px-4 py-3 md:hidden\"\n        >\n          {links.map((link) => (\n            <Link\n              key={link.href}\n              href={link.href}\n              onClick={() => setOpen(false)}\n              className=\"rounded-md px-3 py-2 text-sm font-medium hover:bg-muted\"\n            >\n              {link.label}\n            </Link>\n          ))}\n          {cta ? (\n            <Button\n              className=\"mt-2\"\n              render={<Link href={cta.href} />}\n              nativeButton={false}\n            >\n              {cta.label}\n            </Button>\n          ) : null}\n        </nav>\n      ) : null}\n    </header>\n  );\n}\n"
  },
  {
    "name": "stat-cards",
    "path": "components/blocks/stat-cards.tsx",
    "description": "KPI cards with value, change and trend for dashboards.",
    "exports": [
      "StatCards"
    ],
    "uses": [],
    "props": "export type StatCard = {\n  label: string;\n  value: string;\n  change?: string;\n  trend?: \"up\" | \"down\";\n  icon?: LucideIcon;\n};\nexport type StatCardsProps = { items: StatCard[]; className?: string };",
    "source": "import type { LucideIcon } from \"lucide-react\";\nimport { Card, CardContent } from \"@/components/ui/card\";\nimport { cn } from \"@/lib/utils\";\n\nexport type StatCard = {\n  label: string;\n  value: string;\n  change?: string;\n  trend?: \"up\" | \"down\";\n  icon?: LucideIcon;\n};\n\nexport type StatCardsProps = { items: StatCard[]; className?: string };\n\nexport function StatCards({ items, className }: StatCardsProps) {\n  return (\n    <div className={cn(\"grid gap-4 sm:grid-cols-2 xl:grid-cols-4\", className)}>\n      {items.map((item) => (\n        <Card key={item.label}>\n          <CardContent className=\"flex flex-col gap-2\">\n            <div className=\"flex items-center justify-between text-sm text-muted-foreground\">\n              {item.label}\n              {item.icon ? <item.icon className=\"size-4\" aria-hidden /> : null}\n            </div>\n            <p className=\"text-2xl font-semibold tracking-tight tabular-nums\">\n              {item.value}\n            </p>\n            {item.change ? (\n              <p\n                className={cn(\n                  \"text-xs font-medium\",\n                  item.trend === \"down\" ? \"text-destructive\" : \"text-primary\",\n                )}\n              >\n                {item.change}\n              </p>\n            ) : null}\n          </CardContent>\n        </Card>\n      ))}\n    </div>\n  );\n}\n"
  },
  {
    "name": "stats",
    "path": "components/blocks/stats.tsx",
    "description": "Band of 2–4 big numbers with labels.",
    "exports": [
      "Stats"
    ],
    "uses": [],
    "props": "export type StatsProps = {\n  items: { value: string; label: string }[];\n  className?: string;\n};",
    "source": "import { cn } from \"@/lib/utils\";\n\nexport type StatsProps = {\n  items: { value: string; label: string }[];\n  className?: string;\n};\n\nexport function Stats({ items, className }: StatsProps) {\n  return (\n    <section className={cn(\"mx-auto max-w-6xl px-4 py-16 sm:px-6\", className)}>\n      <dl className=\"grid grid-cols-2 gap-8 rounded-2xl border bg-card p-8 md:grid-cols-4\">\n        {items.map((item) => (\n          <div key={item.label} className=\"flex flex-col gap-1 text-center\">\n            <dt className=\"order-2 text-sm text-muted-foreground\">\n              {item.label}\n            </dt>\n            <dd className=\"order-1 text-3xl font-semibold tracking-tight sm:text-4xl\">\n              {item.value}\n            </dd>\n          </div>\n        ))}\n      </dl>\n    </section>\n  );\n}\n"
  },
  {
    "name": "testimonials",
    "path": "components/blocks/testimonials.tsx",
    "description": "Quote cards with initials avatars, name and role.",
    "exports": [
      "Testimonials"
    ],
    "uses": [
      "section-heading"
    ],
    "props": "export type Testimonial = { quote: string; name: string; role: string };\n\nexport type TestimonialsProps = {\n  id?: string;\n  eyebrow?: string;\n  title: string;\n  items: Testimonial[];\n  className?: string;\n};",
    "source": "import { Avatar, AvatarFallback } from \"@/components/ui/avatar\";\nimport { cn } from \"@/lib/utils\";\nimport { SectionHeading } from \"./section-heading\";\n\nexport type Testimonial = { quote: string; name: string; role: string };\n\nexport type TestimonialsProps = {\n  id?: string;\n  eyebrow?: string;\n  title: string;\n  items: Testimonial[];\n  className?: string;\n};\n\nfunction initials(name: string) {\n  return name\n    .split(\" \")\n    .map((part) => part[0])\n    .join(\"\")\n    .slice(0, 2)\n    .toUpperCase();\n}\n\nexport function Testimonials({\n  id,\n  eyebrow,\n  title,\n  items,\n  className,\n}: TestimonialsProps) {\n  return (\n    <section\n      id={id}\n      className={cn(\"mx-auto max-w-6xl px-4 py-20 sm:px-6\", className)}\n    >\n      <SectionHeading eyebrow={eyebrow} title={title} />\n      <ul className=\"mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3\">\n        {items.map((item) => (\n          <li key={item.name}>\n            <figure className=\"flex h-full flex-col justify-between gap-6 rounded-2xl border bg-card p-6\">\n              <blockquote className=\"text-pretty\">“{item.quote}”</blockquote>\n              <figcaption className=\"flex items-center gap-3\">\n                <Avatar>\n                  <AvatarFallback>{initials(item.name)}</AvatarFallback>\n                </Avatar>\n                <span className=\"flex flex-col\">\n                  <span className=\"text-sm font-medium\">{item.name}</span>\n                  <span className=\"text-xs text-muted-foreground\">\n                    {item.role}\n                  </span>\n                </span>\n              </figcaption>\n            </figure>\n          </li>\n        ))}\n      </ul>\n    </section>\n  );\n}\n"
  }
];
