import { parseArgs } from "node:util";
import { Sandbox } from "e2b";
import { customAlphabet } from "nanoid";
import { env } from "@/config/env";
import { inngest } from "@/inngest/client";
import { parseAgentParts } from "@/lib/agent/parts";
import { agentRun } from "@/inngest/events";
import {
  projectNameFromPrompt,
  slugFromName,
  withSlugSuffix,
} from "@/lib/project-name";
import { findAgentModel } from "@/server/ai/gateway";
import { getCreditBalance } from "@/server/billing/balance";
import { db } from "@/server/db";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    prompt: {
      type: "string",
      default:
        "A landing page for Ember & Oak, a small-batch coffee roaster. Warm and editorial, serif headlines, a shop section with three roasts and a café visit CTA.",
    },
    project: { type: "string" },
    model: { type: "string" },
    timeout: { type: "string", default: "900" },
    "kill-sandbox-after": { type: "string" },
  },
});

const suffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 4);

async function main() {
  const user = values.email
    ? await db.user.findUnique({ where: { email: values.email } })
    : await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user found. Sign in once, or pass --email.");

  const prompt = values.prompt!;
  let projectId: string;
  let slug: string;
  if (values.project) {
    const project = await db.project.findFirst({
      where: { slug: values.project, userId: user.id },
    });
    if (!project)
      throw new Error(`No project ${values.project} for ${user.email}`);
    projectId = project.id;
    slug = project.slug;
  } else {
    const name = projectNameFromPrompt(prompt);
    const project = await db.project.create({
      data: {
        name,
        slug: withSlugSuffix(slugFromName(name), suffix()),
        description: prompt,
        userId: user.id,
      },
    });
    projectId = project.id;
    slug = project.slug;
  }

  const model = await findAgentModel(values.model);
  if (!model)
    throw new Error(`Model ${values.model} isn't in the curated list.`);
  const message = await db.message.create({
    data: { projectId, role: "USER", content: prompt, model: model.id },
  });
  const { balance } = await getCreditBalance(db, user.id);
  console.log(`user     ${user.email} (balance ${balance} credits)`);
  console.log(`project  ${slug}`);
  console.log(`model    ${model.id}`);

  const { ids } = await inngest.send(
    agentRun.create({ projectId, userId: user.id, messageId: message.id }),
  );
  console.log(`event    ${ids[0]} (watch it at http://localhost:8288/runs)`);

  const deadline = Date.now() + Number(values.timeout) * 1000;
  const killAt = values["kill-sandbox-after"]
    ? Date.now() + Number(values["kill-sandbox-after"]) * 1000
    : null;
  let killed = false;
  while (Date.now() < deadline) {
    if (killAt && !killed && Date.now() > killAt) {
      const current = await db.project.findUnique({ where: { id: projectId } });
      if (current?.sandboxId) {
        await Sandbox.kill(current.sandboxId, { apiKey: env.E2B_API_KEY });
        killed = true;
        console.log(`\nkilled   sandbox ${current.sandboxId}`);
      }
    }
    const reply = await db.message.findFirst({
      where: {
        projectId,
        role: "ASSISTANT",
        createdAt: { gt: message.createdAt },
      },
      orderBy: { createdAt: "desc" },
    });
    if (reply) {
      const succeeded =
        (await db.version.count({ where: { projectId, status: "READY" } })) >
          0 && !(await db.creditLedger.count({ where: { projectId } }));
      for (let wait = 0; succeeded && wait < 15; wait++) {
        if (await db.creditLedger.count({ where: { projectId } })) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const [project, version, debit, after] = await Promise.all([
        db.project.findUnique({ where: { id: projectId } }),
        db.version.findFirst({
          where: { projectId, status: "READY" },
          orderBy: { number: "desc" },
        }),
        db.creditLedger.findFirst({
          where: { projectId, delta: { lt: 0 } },
          orderBy: { createdAt: "desc" },
        }),
        getCreditBalance(db, user.id),
      ]);
      console.log(`\nreply\n${reply.content}\n`);
      const parts = parseAgentParts(reply.parts) ?? [];
      const sources = parts.flatMap((part) =>
        part.type === "sources" ? part.sources : [],
      );
      for (const source of sources) {
        console.log(`source   ${source.title} <${source.url}>`);
      }
      console.log(`sandbox  ${project?.sandboxId ?? "-"}`);
      console.log(`preview  ${project?.previewUrl ?? "-"}`);
      if (version) {
        const files = Object.keys(version.files as Record<string, string>);
        console.log(
          `version  v${version.number} "${version.title}" · ${files.length} files · ${version.creditCost} credits`,
        );
      }
      console.log(
        `debit    ${debit?.delta ?? 0} credits (${debit?.reason ?? "none"})`,
      );
      const breakdown = (debit?.meta as { agents?: unknown } | null)?.agents;
      if (Array.isArray(breakdown)) {
        for (const entry of breakdown as {
          name: string;
          usd: number;
          searches: number;
        }[]) {
          console.log(
            `cost     ${entry.name} $${entry.usd.toFixed(4)} · ${entry.searches} searches`,
          );
        }
      }
      console.log(`balance  ${after.balance} credits`);
      const [guards, ledger] = await Promise.all([
        db.guardEvent.findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" },
        }),
        db.creditLedger.findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      for (const guard of guards) {
        console.log(
          `guard    ${guard.stage} ${guard.verdict} [${guard.categories.join(", ")}]`,
        );
      }
      console.log(
        `ledger   ${ledger.length} rows · ${ledger.map((row) => row.delta).join(", ") || "none"}`,
      );
      return;
    }
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Timed out waiting for the agent's reply.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
