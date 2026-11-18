import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

export type PricingPlan = {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

export type PricingProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  plans: PricingPlan[];
  className?: string;
};

export function Pricing({
  id,
  eyebrow,
  title,
  description,
  plans,
  className,
}: PricingProps) {
  return (
    <section
      id={id}
      className={cn("mx-auto max-w-6xl px-4 py-20 sm:px-6", className)}
    >
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              "relative flex flex-col gap-6 rounded-2xl border bg-card p-8",
              plan.featured && "border-primary shadow-lg ring-1 ring-primary",
            )}
          >
            {plan.featured ? (
              <Badge className="absolute -top-3 left-8">Most popular</Badge>
            ) : null}
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground">
                {plan.description}
              </p>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight">
                {plan.price}
              </span>
              {plan.period ? (
                <span className="text-sm text-muted-foreground">
                  {plan.period}
                </span>
              ) : null}
            </p>
            <ul className="flex flex-1 flex-col gap-3 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <CheckIcon
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              variant={plan.featured ? "default" : "outline"}
              render={<Link href={plan.cta.href} />}
              nativeButton={false}
            >
              {plan.cta.label}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
