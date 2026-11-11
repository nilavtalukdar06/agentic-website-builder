import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const PREFIX = "e2e-health-";

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) return;
  const sql = neon(process.env.DATABASE_URL);
  await sql`DELETE FROM "HealthCheck" WHERE id LIKE ${`${PREFIX}%`}`;
  await sql`
    INSERT INTO "HealthCheck" (id, "checkedAt", ok, "latencyMs")
    SELECT ${PREFIX} || n, now() - (n * interval '5 minutes'), true, 80 + (n % 40)
    FROM generate_series(0, 359) AS n
    WHERE n NOT BETWEEN 108 AND 143`;

  return async () => {
    await sql`DELETE FROM "HealthCheck" WHERE id LIKE ${`${PREFIX}%`}`;
  };
}
