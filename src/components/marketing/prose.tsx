import Link from "next/link";
import { cn } from "@/lib/utils";

const linkClass =
  "text-foreground underline underline-offset-2 hover:text-muted-foreground";

export function A({
  href,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & { href: string }) {
  if (href.startsWith("/")) {
    return <Link href={href} className={linkClass} {...props} />;
  }
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={linkClass}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    />
  );
}

export function P({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

export function UL({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "flex list-disc flex-col gap-1.5 pl-5 text-body text-muted-foreground marker:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function OL({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      className={cn(
        "flex list-decimal flex-col gap-1.5 pl-5 text-body text-muted-foreground marker:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Strong(props: React.ComponentProps<"strong">) {
  return <strong className="font-medium text-foreground" {...props} />;
}

export function Code({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "rounded-sm border bg-muted px-1 py-0.5 font-mono text-xs text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Note({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 text-body text-muted-foreground">
      {title ? (
        <span className="font-medium text-foreground">{title}</span>
      ) : null}
      {children}
    </div>
  );
}

export type ArticleSection = {
  id: string;
  title: string;
  body: React.ReactNode;
};

export function ArticleBody({ sections }: { sections: ArticleSection[] }) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="flex scroll-mt-6 flex-col gap-3"
        >
          <h2 className="text-card-title">{section.title}</h2>
          {section.body}
        </section>
      ))}
    </div>
  );
}

export function SectionNav({
  sections,
  label = "On this page",
}: {
  sections: Pick<ArticleSection, "id" | "title">[];
  label?: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-2 text-caption">
      <span className="font-medium">{label}</span>
      <ul className="flex flex-col gap-1.5 border-l pl-3">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ArticleLayout({
  title,
  description,
  meta,
  sections,
  children,
}: {
  title: string;
  description: string;
  meta?: React.ReactNode;
  sections: Pick<ArticleSection, "id" | "title">[];
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 pt-6 pb-16 lg:flex-row lg:gap-16">
      <div className="flex min-w-0 max-w-2xl flex-1 flex-col gap-8">
        <header className="flex flex-col gap-2">
          {meta}
          <h1 className="text-page-title">{title}</h1>
          <p className="text-body text-muted-foreground">{description}</p>
        </header>
        {children}
      </div>
      <aside className="hidden w-52 shrink-0 lg:block">
        <div className="sticky top-6">
          <SectionNav sections={sections} />
        </div>
      </aside>
    </main>
  );
}
