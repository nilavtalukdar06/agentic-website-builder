import { cn } from "@/lib/utils";

export type LogoCloudProps = {
  title?: string;
  names: string[];
  className?: string;
};

export function LogoCloud({ title, names, className }: LogoCloudProps) {
  return (
    <section className={cn("mx-auto max-w-6xl px-4 py-12 sm:px-6", className)}>
      {title ? (
        <p className="mb-6 text-center text-sm text-muted-foreground">
          {title}
        </p>
      ) : null}
      <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {names.map((name) => (
          <li
            key={name}
            className="text-lg font-semibold tracking-tight text-muted-foreground/70"
          >
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}
