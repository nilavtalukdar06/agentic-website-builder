import { parseArgs } from "node:util";
import { Sandbox } from "e2b";
import { customAlphabet } from "nanoid";
import { env } from "@/config/env";
import { inngest } from "@/inngest/client";
import { agentRun } from "@/inngest/events";
import {
  projectNameFromPrompt,
  slugFromName,
  withSlugSuffix,
} from "@/lib/project-name";
import { db } from "@/server/db";
import { resolvePrompt } from "@/server/trpc/routers/prompt";

type Case = {
  name: string;
  prompt: string;
  on?: string;
  breakHome?: boolean;
};

const CASES: Case[] = [
  {
    name: "todo",
    prompt:
      "A todo app: add, complete, edit and delete tasks, filter by all, active and done, show counts, and keep tasks after a reload.",
  },
  {
    name: "landing",
    prompt:
      "A landing page for Ember & Oak, a small-batch coffee roaster. Warm and editorial, serif headlines, a shop section with three roasts and a café visit CTA.",
  },
  {
    name: "dashboard",
    prompt:
      "An analytics dashboard with a sidebar: overview cards, a revenue chart, a recent orders table with search, and a settings page.",
  },
  {
    name: "edit",
    on: "landing",
    prompt:
      "Make the hero headline shorter and change the main button text to 'Book a tasting'.",
  },
  {
    name: "fix",
    on: "landing",
    breakHome: true,
    prompt: "The home page shows an error instead of the site. Fix it.",
  },
];

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    only: { type: "string" },
    model: { type: "string" },
    timeout: { type: "string", default: "1200" },
  },
});

const suffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 4);

type RunMeta = {
  intent?: string;
  issues?: number;
  gateCycles?: number;
  turns?: number;
  blockers?: { first: number; final: number };
  browse?: { status: string; reason: string | null };
};

type Row = {
  name: string;
  intent: string;
  blockers: string;
  issues: number | string;
  browse: string;
  gate: number | string;
  turns: number | string;
  wall: string;
  credits: number | string;
  pass: boolean;
};

async function createProject(userId: string, prompt: string) {
  const name = projectNameFromPrompt(prompt);
  return db.project.create({
    data: {
      name,
      slug: withSlugSuffix(slugFromName(name), suffix()),
      description: prompt,
      userId,
    },
  });
}

async function breakHomePage(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project?.sandboxId) throw new Error("The fix case needs a sandbox.");
  const sandbox = await Sandbox.connect(project.sandboxId, {
    apiKey: env.E2B_API_KEY,
  });
  const path = "/home/user/app/app/page.tsx";
  const page = await sandbox.files.read(path);
  await sandbox.files.write(
    path,
    `import { Missing } from "@/components/eval/missing";\n${page.replace(/return \(/, "return (\n    <>\n      <Missing />")}`,
  );
}

async function runCase(userId: string, projectId: string, prompt: string) {
  const { model } = await resolvePrompt(db, userId, {
    prompt,
    model: values.model,
    attachmentIds: [],
  });
  const message = await db.message.create({
    data: { projectId, role: "USER", content: prompt, model: model.id },
  });
  const started = Date.now();
  await inngest.send(
    agentRun.create({ projectId, userId, messageId: message.id }),
  );
  const deadline = started + Number(values.timeout) * 1000;
  while (Date.now() < deadline) {
    const reply = await db.message.findFirst({
      where: {
        projectId,
        role: "ASSISTANT",
        createdAt: { gt: message.createdAt },
      },
    });
    if (reply) {
      const wall = Date.now() - started;
      let debit = null;
      for (let wait = 0; wait < 15 && !debit; wait++) {
        debit = await db.creditLedger.findFirst({
          where: {
            projectId,
            delta: { lt: 0 },
            createdAt: { gt: message.createdAt },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!debit) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const run = (debit?.meta as { run?: RunMeta } | null)?.run ?? null;
      return { wall, run, credits: debit ? -debit.delta : null };
    }
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Timed out waiting for the reply to "${prompt}".`);
}

async function main() {
  const user = values.email
    ? await db.user.findUnique({ where: { email: values.email } })
    : await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user found. Sign in once, or pass --email.");
  const only = values.only?.split(",").map((name) => name.trim());
  const cases = CASES.filter(
    (entry) =>
      !only ||
      only.includes(entry.name) ||
      CASES.some(
        (other) => only.includes(other.name) && other.on === entry.name,
      ),
  );
  const projects = new Map<string, string>();
  const rows: Row[] = [];
  for (const entry of cases) {
    process.stdout.write(`\n${entry.name.padEnd(10)}`);
    const base = entry.on ? projects.get(entry.on) : undefined;
    const projectId = base ?? (await createProject(user.id, entry.prompt)).id;
    projects.set(entry.name, projectId);
    try {
      if (entry.breakHome) await breakHomePage(projectId);
      const result = await runCase(user.id, projectId, entry.prompt);
      const run = result.run;
      const finalBlockers = run?.blockers?.final ?? null;
      rows.push({
        name: entry.name,
        intent: run?.intent ?? "-",
        blockers: run?.blockers
          ? `${run.blockers.first}→${run.blockers.final}`
          : "-",
        issues: run?.issues ?? "-",
        browse: run?.browse?.status ?? "-",
        gate: run?.gateCycles ?? "-",
        turns: run?.turns ?? "-",
        wall: `${(result.wall / 1000).toFixed(0)}s`,
        credits: result.credits ?? "-",
        pass:
          finalBlockers === 0 &&
          run?.issues === 0 &&
          run?.browse?.status !== "failed",
      });
    } catch (error) {
      rows.push({
        name: entry.name,
        intent: "error",
        blockers: "-",
        issues: "-",
        browse: "-",
        gate: "-",
        turns: "-",
        wall: "-",
        credits: "-",
        pass: false,
      });
      console.error(`\n${entry.name}: ${(error as Error).message}`);
    }
  }
  console.log("\n");
  console.table(rows);
  const passed = rows.filter((row) => row.pass).length;
  console.log(`${passed}/${rows.length} cases passed with zero issues.`);
  if (passed < rows.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
