import type { LanguageModelMiddleware } from "ai";
import type { Redactor } from "./redact";
import { detectKnownSecrets } from "./secret-patterns";

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type StreamResult = Awaited<ReturnType<WrapStream>>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

export function createWindow(redactor: Redactor) {
  const hold = Math.max(0, redactor.holdBack);
  const buffers = new Map<string, string>();
  return {
    push(id: string, delta: string) {
      const raw = (buffers.get(id) ?? "") + delta;
      let cut = Math.max(0, raw.length - hold);
      for (const match of detectKnownSecrets(raw)) {
        if (match.start < cut && match.end >= cut) cut = match.start;
      }
      buffers.set(id, raw.slice(cut));
      return redactor.redact(raw.slice(0, cut));
    },
    flush(id: string) {
      const rest = redactor.redact(buffers.get(id) ?? "");
      buffers.delete(id);
      return rest;
    },
  };
}

export function secretRedactionMiddleware(
  redactor: Redactor,
): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return {
        ...result,
        content: result.content.map((part) =>
          part.type === "text" || part.type === "reasoning"
            ? { ...part, text: redactor.redact(part.text) }
            : part,
        ),
      };
    },
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      const window = createWindow(redactor);
      const stream = result.stream.pipeThrough(
        new TransformStream<StreamPart, StreamPart>({
          transform(chunk, controller) {
            if (
              chunk.type === "text-delta" ||
              chunk.type === "reasoning-delta"
            ) {
              const delta = window.push(chunk.id, chunk.delta);
              if (delta) controller.enqueue({ ...chunk, delta });
              return;
            }
            if (chunk.type === "text-end" || chunk.type === "reasoning-end") {
              const rest = window.flush(chunk.id);
              if (rest) {
                controller.enqueue({
                  type:
                    chunk.type === "text-end"
                      ? "text-delta"
                      : "reasoning-delta",
                  id: chunk.id,
                  delta: rest,
                } as StreamPart);
              }
            }
            controller.enqueue(chunk);
          },
        }),
      );
      return { ...result, stream };
    },
  };
}
