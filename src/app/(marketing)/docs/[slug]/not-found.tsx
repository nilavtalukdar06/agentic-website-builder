import { FileQuestionIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default function DocNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>Page not found</EmptyTitle>
          <EmptyDescription>
            This docs page doesn&apos;t exist. It may have moved or been
            renamed.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/docs" className={buttonVariants({ variant: "outline" })}>
            Back to docs
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  );
}
