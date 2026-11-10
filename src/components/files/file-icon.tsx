import { cn } from "@/lib/utils";
import { fileIconData } from "./file-icons.generated";
import { getFileKind } from "./get-file-kind";

export type FileIconProps = Omit<React.ComponentProps<"svg">, "children"> & {
  path: string;
};

export function FileIcon({ path, className, ...props }: FileIconProps) {
  const kind = getFileKind(path);
  const icon = fileIconData[kind];

  return (
    <svg
      data-slot="file-icon"
      data-kind={kind}
      viewBox={icon.viewBox}
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: icon.body }}
      {...props}
    />
  );
}
