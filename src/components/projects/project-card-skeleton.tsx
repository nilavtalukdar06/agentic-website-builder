import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectCardSkeleton() {
  return (
    <Card
      data-testid="project-card-skeleton"
      aria-hidden
      className="h-full gap-3"
    >
      <CardHeader>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-3.5 w-1/3" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </CardContent>
      <CardFooter className="justify-between pt-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="size-3.5" />
      </CardFooter>
    </Card>
  );
}
