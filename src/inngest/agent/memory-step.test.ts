// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { readMemory, runMemoryCommand, writeUserWords, memoryCommandReply } =
  await import("./memory-step");
const { fakeMemoryProvider } = await import("@/server/memory/fake");
const { memoryCommand } = await import("./router");

const userNs = "vibe:0123456789abcdef:u:u1";
const projectNs = (id: string) => `vibe:0123456789abcdef:p:${id}`;

function access(
  provider: ReturnType<typeof fakeMemoryProvider>["provider"],
  extra: Partial<{ canRead: boolean; canWrite: boolean }> = {},
) {
  return {
    enabled: true as const,
    provider,
    canRead: true,
    canWrite: true,
    userNs,
    projectNs,
    ...extra,
  };
}

describe("memoryCommand", () => {
  test.each([
    ["Remember that I prefer dark designs", "remember"],
    ["please keep in mind: no gradients", "remember"],
    ["Note that our brand colour is teal", "remember"],
    ["Forget that I like teal", "forget"],
    ["Don't forget the footer", null],
    ["Always use teal buttons on the hero", null],
    ["Make the header blue", null],
  ])("%j → %s", (message, expected) => {
    expect(memoryCommand(message)).toBe(expected);
  });
});

describe("readMemory", () => {
  test("a new project reads the user's profile and preferences, not a project", async () => {
    const fake = fakeMemoryProvider({
      [userNs]: { static: ["Prefers dark minimal designs with a teal accent"] },
    });
    const result = await readMemory({
      access: access(fake.provider),
      intent: "create",
      prompt: "A landing page for a coffee shop with dark minimal designs",
      projectId: "p1",
    });
    expect(result.status).toBe("used");
    expect(result.block).toContain(
      "Prefers dark minimal designs with a teal accent",
    );
    expect(
      fake.calls.map((call) => `${call.method}:${call.namespace}`),
    ).toEqual([`profile:${userNs}`, `search:${userNs}`]);
    expect(result.use).toEqual({ profiles: 1, searches: 1 });
  });

  test("a follow-up also searches the project's own memory", async () => {
    const fake = fakeMemoryProvider({
      [projectNs("p1")]: { static: ["Keep the header exactly as it is"] },
    });
    const result = await readMemory({
      access: access(fake.provider),
      intent: "edit",
      prompt: "Change the header colour",
      projectId: "p1",
    });
    expect(result.block).toContain("This project");
    expect(result.block).toContain("Keep the header exactly as it is");
  });

  test("is off, skipped on budget or timeout, and never throws", async () => {
    expect(
      (
        await readMemory({
          access: { enabled: false, reason: "memory is turned off" },
          intent: "edit",
          prompt: "x",
          projectId: "p1",
        })
      ).status,
    ).toBe("off");
    const fake = fakeMemoryProvider();
    expect(
      (
        await readMemory({
          access: access(fake.provider, { canRead: false }),
          intent: "edit",
          prompt: "x",
          projectId: "p1",
        })
      ).reason,
    ).toBe("the monthly memory budget is used up");
    const slow = {
      ...fake.provider,
      profile: () => new Promise<never>(() => undefined),
    };
    const timedOut = await readMemory({
      access: access(slow),
      intent: "edit",
      prompt: "x",
      projectId: "p1",
      timeoutMs: 20,
    });
    expect(timedOut).toMatchObject({ status: "skipped", block: "" });
  });
});

describe("writeUserWords", () => {
  test("saves only the user's own words, instantly to the project and to the user's profile", async () => {
    const fake = fakeMemoryProvider();
    const result = await writeUserWords({
      access: access(fake.provider),
      projectId: "p1",
      runId: "r1",
      prompt: "Use a teal accent and no gradients, email me at jo@acme.dev",
    });
    expect(result.status).toBe("saved");
    const project = fake.documents.get(projectNs("p1"))?.get("run_r1_p");
    const user = fake.documents.get(userNs)?.get("run_r1_u");
    expect(project).toMatchObject({
      instant: true,
      content:
        "Use a teal accent and no gradients, email me at [email removed]",
    });
    expect(user).toMatchObject({ instant: false });
    expect(project?.metadata).toEqual({
      kind: "message",
      projectId: "p1",
      runId: "r1",
    });
  });

  test("a retry overwrites the same documents instead of duplicating them", async () => {
    const fake = fakeMemoryProvider();
    const input = {
      access: access(fake.provider),
      projectId: "p1",
      runId: "r1",
      prompt: "Prefer rounded cards",
    };
    await writeUserWords(input);
    await writeUserWords(input);
    expect(fake.documents.get(userNs)?.size).toBe(1);
  });

  test("skips secrets, near-empty prompts, a used-up budget and memory being off", async () => {
    const fake = fakeMemoryProvider();
    const secret = `Use key sk-proj-${"VerySecretValue123".repeat(2)} for the API`;
    expect(
      (
        await writeUserWords({
          access: access(fake.provider),
          projectId: "p1",
          runId: "r1",
          prompt: secret,
        })
      ).status,
    ).toBe("skipped");
    expect(
      (
        await writeUserWords({
          access: access(fake.provider),
          projectId: "p1",
          runId: "r1",
          prompt: "ok",
        })
      ).status,
    ).toBe("skipped");
    expect(
      (
        await writeUserWords({
          access: access(fake.provider, { canWrite: false }),
          projectId: "p1",
          runId: "r1",
          prompt: "Prefer teal",
        })
      ).status,
    ).toBe("skipped");
    expect(
      (
        await writeUserWords({
          access: { enabled: false, reason: "off" },
          projectId: "p1",
          runId: "r1",
          prompt: "Prefer teal",
        })
      ).status,
    ).toBe("off");
    expect(fake.documents.size).toBe(0);
  });

  test("a failing provider never throws", async () => {
    const fake = fakeMemoryProvider();
    const broken = {
      ...fake.provider,
      remember: () => Promise.reject(new Error("down")),
    };
    expect(
      (
        await writeUserWords({
          access: access(broken),
          projectId: "p1",
          runId: "r1",
          prompt: "Prefer teal",
        })
      ).status,
    ).toBe("failed");
  });
});

describe("memory commands", () => {
  test("remember saves the user's sentence to their profile right away", async () => {
    const fake = fakeMemoryProvider();
    const result = await runMemoryCommand({
      access: access(fake.provider),
      action: "remember",
      prompt: "Remember that I prefer dark minimal designs",
      projectId: "p1",
      runId: "r1",
    });
    expect(result).toMatchObject({
      status: "saved",
      text: "I prefer dark minimal designs",
    });
    expect(fake.documents.get(userNs)?.get("run_r1_remember")).toMatchObject({
      instant: true,
    });
    expect(memoryCommandReply(result)).toContain("I'll remember this");
  });

  test("forget only previews matches; nothing is deleted without confirmation", async () => {
    const fake = fakeMemoryProvider({
      [userNs]: { static: ["Likes teal accents"] },
      [projectNs("p1")]: { static: ["Teal header on the pricing page"] },
    });
    const result = await runMemoryCommand({
      access: access(fake.provider),
      action: "forget",
      prompt: "Forget that I like teal",
      projectId: "p1",
      runId: "r1",
    });
    expect(result.status).toBe("preview");
    expect(result.matches.map((match) => match.scope)).toEqual([
      "user",
      "project",
    ]);
    expect(fake.calls.some((call) => call.method === "forget")).toBe(false);
    expect(memoryCommandReply(result)).toContain("Confirm below");
  });

  test("an unavailable memory says why", async () => {
    const result = await runMemoryCommand({
      access: { enabled: false, reason: "memory is turned off" },
      action: "remember",
      prompt: "Remember that I like teal",
      projectId: "p1",
      runId: "r1",
    });
    expect(memoryCommandReply(result)).toBe(
      "I couldn't do that: memory is turned off.",
    );
  });
});
