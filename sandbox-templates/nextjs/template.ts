import { Template, waitForURL } from "e2b";
import { ALLOWED_DEV_ORIGIN } from "../../src/server/sandbox/dev-origins";

export const TEMPLATE_NAME = "vibe-nextjs";

const HOME_DIR = "/home/user";
const APP_NAME = "app";
const APP_DIR = `${HOME_DIR}/${APP_NAME}`;
const SKILLS_CLI = "skills@1.8.1";
export const NPQ_VERSION = "3.27.4";

export const TEMPLATE_SKILLS = [
  {
    name: "vercel-react-best-practices",
    source: "https://github.com/vercel-labs/agent-skills",
  },
  {
    name: "next-best-practices",
    source: "https://github.com/vercel-labs/openreview",
  },
  { name: "frontend-design", source: "anthropics/skills" },
  { name: "shadcn", source: "shadcn-ui/ui" },
  { name: "vercel-composition-patterns", source: "vercel-labs/agent-skills" },
];

const installSkills = TEMPLATE_SKILLS.map(
  ({ name, source }) =>
    `npx --yes ${SKILLS_CLI} add ${source} --skill ${name} -y`,
);
const checkSkills = TEMPLATE_SKILLS.map(
  ({ name }) => `test -f .agents/skills/${name}/SKILL.md`,
).join(" && ");

export const template = Template()
  .fromNodeImage("24")
  .runCmd(
    `(id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user) && mkdir -p ${HOME_DIR} && chown -R user:user ${HOME_DIR}`,
    { user: "root" },
  )
  .runCmd(
    `npm install -g --ignore-scripts npq@${NPQ_VERSION} && npq --version | grep -q ${NPQ_VERSION}`,
    { user: "root" },
  )
  .setUser("user")
  .setWorkdir(HOME_DIR)
  .setEnvs({ NEXT_TELEMETRY_DISABLED: "1" })
  .runCmd(
    `npx --yes shadcn@latest create --name ${APP_NAME} --template next --base base --preset nova --no-monorepo --yes`,
  )
  .setWorkdir(APP_DIR)
  .runCmd(
    `sed -i 's/= {}/= {\\n  allowedDevOrigins: ["${ALLOWED_DEV_ORIGIN}"],\\n}/' next.config.ts && grep -q allowedDevOrigins next.config.ts`,
  )
  .runCmd("npx --yes shadcn@latest add --all --yes --overwrite")
  .setEnvs({ NEXT_TELEMETRY_DISABLED: "1", DISABLE_TELEMETRY: "1" })
  .runCmd(installSkills)
  .copy("skills-lock.json", "/tmp/skills-lock.expected.json")
  .copy("check-skills-lock.mjs", "/tmp/check-skills-lock.mjs")
  .runCmd(
    `${checkSkills} && node /tmp/check-skills-lock.mjs /tmp/skills-lock.expected.json skills-lock.json`,
  )
  .copy("agents-rules.md", "/tmp/agents-rules.md")
  .runCmd(
    "cat /tmp/agents-rules.md AGENTS.md > AGENTS.merged && mv AGENTS.merged AGENTS.md && grep -q '## House rules' AGENTS.md && grep -q 'BEGIN:nextjs-agent-rules' AGENTS.md",
  )
  .setStartCmd(
    "npx next dev --turbopack -p 3000",
    waitForURL("http://localhost:3000"),
  );
