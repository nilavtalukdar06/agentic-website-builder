import { describe, expect, test } from "vitest";
import {
  dedupeDiagnostics,
  diagnosticPaths,
  eslintCommand,
  formatDiagnostics,
  MAX_DIAGNOSTICS,
  missingPackages,
  parseEslintJson,
  parseRouteOutput,
  parseTscOutput,
  routeCommand,
  routeDiagnostic,
} from "./diagnostics";

describe("parseTscOutput", () => {
  test("reads errors with their path, line and continuation lines", () => {
    const output = `components/hero.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.
  The expected type comes from property 'count'.
/home/user/app/app/page.tsx(3,22): error TS2307: Cannot find module 'framer-motion' or its corresponding type declarations.
node_modules/x/index.d.ts(1,1): error TS1005: ';' expected.
Found 3 errors.`;
    expect(parseTscOutput(output)).toEqual([
      {
        source: "tsc",
        path: "components/hero.tsx",
        line: 12,
        message:
          "TS2322: Type 'string' is not assignable to type 'number'. The expected type comes from property 'count'.",
      },
      {
        source: "tsc",
        path: "app/page.tsx",
        line: 3,
        message:
          "TS2307: Cannot find module 'framer-motion' or its corresponding type declarations.",
      },
    ]);
  });

  test("returns nothing for a clean run", () => {
    expect(parseTscOutput("")).toEqual([]);
  });
});

describe("parseEslintJson", () => {
  test("keeps parse errors and serious rules, drops style rules and warnings", () => {
    const report = JSON.stringify([
      {
        filePath: "/home/user/app/components/list.tsx",
        messages: [
          {
            ruleId: "react/jsx-key",
            severity: 2,
            message: "Missing key prop",
            line: 8,
          },
          {
            ruleId: "react/no-unescaped-entities",
            severity: 2,
            message: "`'` can be escaped",
            line: 9,
          },
          {
            ruleId: null,
            severity: 2,
            message: "Parsing error: ';' expected",
            line: 2,
          },
          {
            ruleId: "react-hooks/exhaustive-deps",
            severity: 1,
            message: "deps",
            line: 4,
          },
        ],
      },
    ]);
    expect(parseEslintJson(`npm warn something\n${report}`)).toEqual([
      {
        source: "eslint",
        path: "components/list.tsx",
        line: 8,
        message: "Missing key prop (react/jsx-key)",
      },
      {
        source: "eslint",
        path: "components/list.tsx",
        line: 2,
        message: "Parsing error: ';' expected",
      },
    ]);
  });

  test("ignores output that isn't JSON", () => {
    expect(parseEslintJson("Oops! Something went wrong!")).toEqual([]);
  });
});

describe("routes", () => {
  test("an OK page has no diagnostic", () => {
    expect(routeDiagnostic("/", 200, "<html></html>")).toBeNull();
  });

  test("a failing page names the error from the overlay", () => {
    const body =
      "<html><body><script>self.__next_f=[]</script><h1>Build Error</h1><p>Module not found: Can't resolve '@/components/hero'</p></body></html>";
    expect(routeDiagnostic("/about", 500, body)?.message).toBe(
      "GET /about returned 500: Build Error",
    );
  });

  test("a timeout is reported plainly", () => {
    expect(routeDiagnostic("/", 0, "")?.message).toBe(
      "GET / didn't answer within the time limit.",
    );
  });

  test("parses the status line and the body", () => {
    expect(parseRouteOutput("500\n<html>x</html>")).toEqual({
      status: 500,
      body: "<html>x</html>",
    });
    expect(parseRouteOutput("")).toEqual({ status: 0, body: "" });
  });

  test("the route command can't be used to inject shell", () => {
    expect(routeCommand("/a'; rm -rf / #", 3000)).toContain(
      "'http://localhost:3000/arm-rf/'",
    );
  });
});

describe("helpers", () => {
  const diagnostics = [
    { source: "tsc" as const, path: "a.tsx", line: 1, message: "x" },
    { source: "tsc" as const, path: "a.tsx", line: 1, message: "x" },
    {
      source: "route" as const,
      path: null,
      line: null,
      message: "GET / returned 500",
    },
  ];

  test("dedupes and caps", () => {
    expect(dedupeDiagnostics(diagnostics)).toHaveLength(2);
    const many = Array.from({ length: 50 }, (_, index) => ({
      ...diagnostics[0],
      line: index,
    }));
    expect(dedupeDiagnostics(many)).toHaveLength(MAX_DIAGNOSTICS);
  });

  test("formats for people and models", () => {
    expect(formatDiagnostics(dedupeDiagnostics(diagnostics))).toBe(
      "- [tsc] a.tsx:1: x\n- [route] page: GET / returned 500",
    );
    expect(diagnosticPaths(diagnostics)).toEqual(["a.tsx"]);
  });

  test("finds missing npm packages, not local modules", () => {
    expect(
      missingPackages([
        {
          source: "tsc",
          path: "a.tsx",
          line: 1,
          message:
            "TS2307: Cannot find module 'framer-motion/client' or its corresponding type declarations.",
        },
        {
          source: "tsc",
          path: "a.tsx",
          line: 2,
          message:
            "TS2307: Cannot find module '@tanstack/react-table' or its corresponding type declarations.",
        },
        {
          source: "tsc",
          path: "a.tsx",
          line: 3,
          message:
            "TS2307: Cannot find module '@/components/hero' or its corresponding type declarations.",
        },
      ]),
    ).toEqual(["framer-motion", "@tanstack/react-table"]);
  });

  test("quotes lint paths", () => {
    expect(eslintCommand(["app/page.tsx", "it's.tsx"])).toBe(
      "./node_modules/.bin/eslint --format json 'app/page.tsx' 'it'\\''s.tsx'",
    );
  });
});
