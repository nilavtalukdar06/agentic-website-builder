"use client";

import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror, {
  EditorView,
  type Extension,
  Prec,
} from "@uiw/react-codemirror";
import { useMemo } from "react";
import { useTheme } from "@/components/theme/theme-provider";

export function languageExtensions(path: string): Extension[] {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const extension = name.includes(".") ? name.split(".").pop() : "";
  switch (extension) {
    case "ts":
    case "mts":
    case "cts":
      return [javascript({ typescript: true })];
    case "tsx":
      return [javascript({ typescript: true, jsx: true })];
    case "jsx":
      return [javascript({ jsx: true })];
    case "js":
    case "mjs":
    case "cjs":
      return [javascript()];
    case "css":
      return [css()];
    case "json":
      return [json()];
    case "md":
    case "mdx":
      return [markdown()];
    case "html":
      return [html()];
    default:
      return [];
  }
}

const appearance = Prec.highest(
  EditorView.theme({
    "&": { height: "100%", backgroundColor: "transparent" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
      fontSize: "13px",
      lineHeight: "1.6",
    },
    "&.cm-focused": { outline: "none" },
  }),
);

const activeLine = (dark: boolean) =>
  Prec.highest(
    EditorView.theme(
      {
        ".cm-activeLine": {
          backgroundColor: dark
            ? "rgba(255, 255, 255, 0.05)"
            : "rgba(0, 0, 0, 0.04)",
        },
        ".cm-activeLineGutter": { backgroundColor: "transparent" },
      },
      { dark },
    ),
  );

export type CodeEditorProps = {
  path: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  label: string;
};

export default function CodeEditorImpl({
  path,
  value,
  onChange,
  readOnly = false,
  label,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const extensions = useMemo(
    () => [
      ...languageExtensions(path),
      appearance,
      activeLine(dark),
      EditorView.contentAttributes.of({ "aria-label": label }),
    ],
    [path, label, dark],
  );
  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={dark ? oneDark : "light"}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      onChange={onChange}
      basicSetup={{ foldGutter: false, highlightActiveLine: !readOnly }}
      className="h-full"
    />
  );
}
