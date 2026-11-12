import type { LanguageModelMiddleware } from "ai";
import type { Redactor } from "@/server/secrets/redact";

type WrapStream = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type StreamResult = Awaited<ReturnType<WrapStream>>;
type StreamPart =
  StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

export function createWindow(redactor: Redactor) {
  const hold = Math.max(0, redactor.maxNeedleLength - 1);
  const buffers = new Map<string, string>();
  return {
    push(id: string, delta: string) {
      const redacted = redactor.redact((buffers.get(id) ?? "") + delta);
      const cut = Math.max(0, redacted.length - hold);
      buffers.set(id, redacted.slice(cut));
      return redacted.slice(0, cut);
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
      if (!redactor.active) return result;
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
      if (!redactor.active) return result;
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
