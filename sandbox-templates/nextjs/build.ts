import "dotenv/config";
import { defaultBuildLogger, Template } from "e2b";
import { TEMPLATE_NAME, template } from "./template";

const build = await Template.build(template, TEMPLATE_NAME, {
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});

console.log(`\nBuilt ${build.name}`);
console.log(`E2B_TEMPLATE_ID=${build.templateId}`);
