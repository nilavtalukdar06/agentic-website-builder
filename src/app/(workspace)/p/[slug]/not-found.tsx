import Link from "next/link";
import { FolderXIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { WorkspaceShell } from "./_components/workspace-shell";

export default function NotFound() {
  return (
    <WorkspaceShell title="Not found">
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderXIcon />
            </EmptyMedia>
            <EmptyTitle>Project not found</EmptyTitle>
            <EmptyDescription>
              It doesn&apos;t exist, or it belongs to another account.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/projects"
              className={buttonVariants({ variant: "outline" })}
            >
              Back to projects
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    </WorkspaceShell>
  );
}
