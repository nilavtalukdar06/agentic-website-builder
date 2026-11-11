import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed in production");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });

const userId = "seed-user";
const slug = "demo-landing";

async function main() {
  await db.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      name: "Demo User",
      email: "demo@vibe.local",
      emailVerified: true,
    },
  });

  const project = await db.project.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: "Demo landing page",
      description: "A seeded project used to verify the data layer.",
      userId,
    },
  });

  const hasMessages = await db.message.count({
    where: { projectId: project.id },
  });
  if (hasMessages === 0) {
    await db.message.create({
      data: {
        projectId: project.id,
        role: "USER",
        content: "Build me a landing page for a coffee shop.",
      },
    });
  }

  await db.version.upsert({
    where: { projectId_number: { projectId: project.id, number: 1 } },
    update: {},
    create: {
      projectId: project.id,
      number: 1,
      title: "Initial version",
      files: {
        "app/page.tsx": "export default function Page() { return null; }",
      },
      creditCost: 0,
    },
  });
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
