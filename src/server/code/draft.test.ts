// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  checkEdit,
  draftId,
  EditError,
  MAX_EDIT_CHARS,
  promoteDraft,
  removeDraftFile,
  workingCopy,
  writeDraftFile,
} = await import("./draft");
const { fakeEditDb, readyVersion } = await import("./fake-db");

const base = {
  "app/page.tsx": "export default function Page() { return <main>Hi</main>; }",
  "app/layout.tsx": "export default function Layout() {}",
};

function setup() {
  const fake = fakeEditDb([readyVersion("p1", 1, base)]);
  return { ...fake, tx: fake.db as never };
}

describe("checkEdit", () => {
  test("accepts a normal source file and returns its project path", async () => {
    await expect(checkEdit("./app/page.tsx", "const a = 1;")).resolves.toBe(
      "app/page.tsx",
    );
  });

  test.each([
    ["../outside.ts", "x"],
    ["/etc/passwd", "x"],
    [".env.local", "SECRET=1"],
    ["node_modules/react/index.js", "x"],
    [".git/config", "x"],
    [".claude/skills/x.md", "x"],
  ])("refuses the protected path %s", async (path, content) => {
    await expect(checkEdit(path, content)).rejects.toThrow();
  });

  test("refuses binary files, huge files, broken package.json and secrets", async () => {
    await expect(checkEdit("public/logo.png", "x")).rejects.toBeInstanceOf(
      EditError,
    );
    await expect(
      checkEdit("app/page.tsx", "x".repeat(MAX_EDIT_CHARS + 1)),
    ).rejects.toBeInstanceOf(EditError);
    await expect(checkEdit("package.json", "{ nope")).rejects.toThrow(
      "valid JSON",
    );
    await expect(checkEdit("package.json", '{"name":"site"}')).resolves.toBe(
      "package.json",
    );
    const key = `sk-proj-${"VerySecretValue123".repeat(2)}`;
    await expect(
      checkEdit("lib/config.ts", `export const key = "${key}";`),
    ).rejects.toThrow("secret");
  });
});

describe("working copy", () => {
  test("is the latest saved version until something is edited", async () => {
    const { tx } = setup();
    expect(await workingCopy(tx, "p1")).toMatchObject({
      latest: 1,
      dirty: false,
      files: base,
    });
  });

  test("an edit creates one draft that holds every file", async () => {
    const { tx, versions } = setup();
    await expect(
      writeDraftFile(tx, "p1", "app/page.tsx", "export default 1;"),
    ).resolves.toEqual({ changed: true });
    const draft = versions.get(draftId("p1"));
    expect(draft).toMatchObject({ status: "DRAFT", number: null });
    expect(draft?.files).toEqual({
      ...base,
      "app/page.tsx": "export default 1;",
    });
    expect(await workingCopy(tx, "p1")).toMatchObject({ dirty: true });
  });

  test("saving the same content changes nothing, and undoing an edit removes the draft", async () => {
    const { tx, versions } = setup();
    await expect(
      writeDraftFile(tx, "p1", "app/page.tsx", base["app/page.tsx"]),
    ).resolves.toEqual({ changed: false });
    expect(versions.has(draftId("p1"))).toBe(false);
    await writeDraftFile(tx, "p1", "app/page.tsx", "edited");
    expect(versions.has(draftId("p1"))).toBe(true);
    await writeDraftFile(tx, "p1", "app/page.tsx", base["app/page.tsx"]);
    expect(versions.has(draftId("p1"))).toBe(false);
  });

  test("a new file can be added and a file removed", async () => {
    const { tx, versions } = setup();
    await writeDraftFile(tx, "p1", "components/card.tsx", "export {};");
    expect(Object.keys(versions.get(draftId("p1"))!.files)).toContain(
      "components/card.tsx",
    );
    await removeDraftFile(tx, "p1", "app/layout.tsx");
    expect(Object.keys(versions.get(draftId("p1"))!.files)).not.toContain(
      "app/layout.tsx",
    );
  });

  test("refuses to edit when there is no saved version yet, or an image", async () => {
    const empty = fakeEditDb();
    await expect(
      writeDraftFile(empty.db as never, "p1", "app/page.tsx", "x"),
    ).rejects.toBeInstanceOf(EditError);
    const withImage = fakeEditDb([
      readyVersion("p1", 1, { "public/a.txt": "data:image/png;base64,AAAA" }),
    ]);
    await expect(
      writeDraftFile(withImage.db as never, "p1", "public/a.txt", "x"),
    ).rejects.toBeInstanceOf(EditError);
  });
});

describe("promoteDraft", () => {
  test("turns the draft into the next saved version with a reply, at no cost", async () => {
    const { tx, versions, messages } = setup();
    await writeDraftFile(tx, "p1", "app/page.tsx", "edited");
    const saved = await promoteDraft(tx, "p1");
    expect(saved).toEqual({ number: 2, paths: ["app/page.tsx"] });
    expect(versions.has(draftId("p1"))).toBe(false);
    const version = [...versions.values()].find((row) => row.number === 2);
    expect(version).toMatchObject({
      status: "READY",
      title: "Edited app/page.tsx",
      creditCost: 0,
    });
    expect(version?.files["app/page.tsx"]).toBe("edited");
    expect(messages[0]).toMatchObject({
      role: "ASSISTANT",
      content: "Saved your edit to app/page.tsx as version 2.",
    });
  });

  test("names several files together, and does nothing without a draft", async () => {
    const { tx, versions } = setup();
    expect(await promoteDraft(tx, "p1")).toBeNull();
    await writeDraftFile(tx, "p1", "app/page.tsx", "a");
    await writeDraftFile(tx, "p1", "app/layout.tsx", "b");
    const saved = await promoteDraft(tx, "p1");
    expect(saved?.number).toBe(2);
    expect([...versions.values()].find((row) => row.number === 2)?.title).toBe(
      "Edited 2 files",
    );
  });
});
