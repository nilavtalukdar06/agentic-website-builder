import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

export type FaqProps = {
  id?: string;
  title: string;
  description?: string;
  items: { question: string; answer: string }[];
  className?: string;
};

export function Faq({ id, title, description, items, className }: FaqProps) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-3xl px-4 py-20 sm:px-6", className)}
    >
      <SectionHeading title={title} description={description} />
      <div className="mt-10 divide-y rounded-2xl border bg-card">
        {items.map((item) => (
          <details key={item.question} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:hidden">
              {item.question}
              <ChevronDownIcon
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="pt-3 text-sm text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
