import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { GithubIcon } from "@/components/icons/github-icon";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ProjectCardProps = {
  href: string;
  name: string;
  slug: string;
  description?: string | null;
  editedLabel: string;
  onGithub?: boolean;
  className?: string;
};

export function ProjectCard({
  href,
  name,
  slug,
  description,
  editedLabel,
  onGithub = false,
  className,
}: ProjectCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group/project rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Card className="h-full gap-3 transition-colors group-hover/project:border-input group-hover/project:bg-accent/40">
        <CardHeader>
          <CardTitle className="truncate">{name}</CardTitle>
          <CardDescription className="truncate font-mono text-xs">
            {slug}
          </CardDescription>
          {onGithub ? (
            <CardAction>
              <Badge variant="outline">
                <GithubIcon data-icon="inline-start" />
                On GitHub
              </Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="flex-1">
          <p className="line-clamp-2 text-caption text-muted-foreground">
            {description || "No description yet."}
          </p>
        </CardContent>
        <CardFooter className="justify-between pt-2 text-xs text-muted-foreground">
          <span>{editedLabel}</span>
          <ArrowRightIcon className="size-3.5 transition-transform group-hover/project:translate-x-0.5" />
        </CardFooter>
      </Card>
    </Link>
  );
}
