import { readFileSync } from "node:fs";

const [expectedPath, actualPath] = process.argv.slice(2);
const expected = JSON.parse(readFileSync(expectedPath, "utf8")).skills;
const actual = JSON.parse(readFileSync(actualPath, "utf8")).skills;

const problems = Object.entries(expected).flatMap(([name, skill]) => {
  const installed = actual[name];
  if (!installed) return [`${name}: not installed`];
  if (installed.computedHash !== skill.computedHash) {
    return [
      `${name}: content changed upstream (${skill.computedHash} → ${installed.computedHash})`,
    ];
  }
  return [];
});

if (problems.length > 0) {
  console.error(
    `Skills differ from sandbox-templates/nextjs/skills-lock.json:\n${problems.join("\n")}\nReview the change, then refresh the committed lockfile on purpose.`,
  );
  process.exit(1);
}
console.log(`Skills match the lockfile (${Object.keys(expected).length}).`);
