import { inngest } from "./client";
import { notifyUser } from "./events";

type NotifyData = Parameters<typeof notifyUser.create>[0];
type StepRunner = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

export function queueNotification(step: StepRunner, data: NotifyData) {
  return step.run(`notify-${data.kind}`, async () => {
    try {
      await inngest.send(notifyUser.create(data));
      return true;
    } catch (error) {
      console.warn("[email] couldn't queue a notification", error);
      return false;
    }
  });
}
