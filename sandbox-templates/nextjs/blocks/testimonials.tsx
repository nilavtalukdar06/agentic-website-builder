import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

export type Testimonial = { quote: string; name: string; role: string };

export type TestimonialsProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  items: Testimonial[];
  className?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Testimonials({
  id,
  eyebrow,
  title,
  items,
  className,
}: TestimonialsProps) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6", className)}
    >
      <SectionHeading eyebrow={eyebrow} title={title} />
      <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.name}>
            <figure className="flex h-full flex-col justify-between gap-6 rounded-2xl border bg-card p-6">
              <blockquote className="text-pretty">“{item.quote}”</blockquote>
              <figcaption className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{initials(item.name)}</AvatarFallback>
                </Avatar>
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.role}
                  </span>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
