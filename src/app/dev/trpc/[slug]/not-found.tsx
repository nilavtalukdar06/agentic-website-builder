import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Project not found</EmptyTitle>
        <EmptyDescription>No project exists with that slug.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href="/dev/trpc"
          className={buttonVariants({ variant: "outline" })}
        >
          Back to projects
        </Link>
      </EmptyContent>
    </Empty>
  );
}
