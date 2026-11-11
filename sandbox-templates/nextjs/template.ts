import { Template, waitForURL } from "e2b";
import { ALLOWED_DEV_ORIGIN } from "../../src/server/sandbox/dev-origins";

export const TEMPLATE_NAME = "vibe-nextjs";

const HOME_DIR = "/home/user";
const APP_NAME = "app";
const APP_DIR = `${HOME_DIR}/${APP_NAME}`;

export const template = Template()
  .fromNodeImage("24")
  .runCmd(
    `(id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user) && mkdir -p ${HOME_DIR} && chown -R user:user ${HOME_DIR}`,
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
  .setStartCmd(
    "npx next dev --turbopack -p 3000",
    waitForURL("http://localhost:3000"),
  );
