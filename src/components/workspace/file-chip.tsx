import { FileIcon } from "@/components/files/file-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FileChipProps = React.ComponentProps<typeof Badge> & {
  path: string;
  addedLines?: number;
};

export function FileChip({
  path,
  addedLines,
  className,
  ...props
}: FileChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge
        variant="secondary"
        className={cn("border-border font-mono font-normal", className)}
        {...props}
      >
        <FileIcon path={path} />
        {path}
      </Badge>
      {addedLines ? (
        <span className="font-mono text-xs text-success">+{addedLines}</span>
      ) : null}
    </span>
  );
}
