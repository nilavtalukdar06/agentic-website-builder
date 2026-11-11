import "server-only";
import type { Realtime } from "inngest";
import { inngest } from "./client";
import { projectChannel } from "./channels";

type Channel = ReturnType<typeof projectChannel>;
type Topics = typeof projectChannel.$infer;
export type TopicName = keyof Topics;

export function createPublisher(projectId: string) {
  const channel: Channel = projectChannel({ projectId });
  return async function publish<T extends TopicName>(
    topic: T,
    data: Topics[T],
  ) {
    try {
      const ref = channel[topic] as Realtime.TopicRef<Topics[T]>;
      await inngest.realtime.publish(ref, data);
    } catch (error) {
      console.warn(`[realtime] publish ${topic} failed`, error);
    }
  };
}

export type Publish = ReturnType<typeof createPublisher>;
