import { describe, expect, test } from "vitest";
import { classifyModelError } from "./model-errors";

const withStatus = (statusCode: number, extra: object = {}) =>
  Object.assign(new Error("api"), { statusCode }, extra);

describe("classifyModelError", () => {
  test.each([401, 403, 404])("%i means the model is unavailable", (status) => {
    expect(classifyModelError(withStatus(status))).toEqual({
      kind: "unavailable",
    });
  });

  test.each([400, 413, 422])("%i is an invalid request", (status) => {
    expect(classifyModelError(withStatus(status))).toEqual({ kind: "invalid" });
  });

  test("finds the status on a wrapped cause", () => {
    const restricted = new Error("Free tier users do not have access", {
      cause: withStatus(403),
    });
    expect(classifyModelError(restricted)).toEqual({ kind: "unavailable" });
  });

  test("reads retry-after from headers", () => {
    expect(
      classifyModelError(
        withStatus(429, { responseHeaders: { "retry-after": "17" } }),
      ),
    ).toEqual({ kind: "rate-limit", retryAfterSeconds: 17 });
  });

  test("reads the gateway message inside an AI SDK retry error", () => {
    const limited = withStatus(429, {
      message: "Rate limit exceeded ... Retry after 60s.",
    });
    const retryError = Object.assign(new Error("Failed after 3 attempts"), {
      lastError: limited,
    });
    expect(classifyModelError(retryError)).toEqual({
      kind: "rate-limit",
      retryAfterSeconds: 60,
    });
  });

  test("defaults to a minute and caps long waits", () => {
    expect(classifyModelError(withStatus(429))).toEqual({
      kind: "rate-limit",
      retryAfterSeconds: 60,
    });
    expect(
      classifyModelError(
        withStatus(429, { responseHeaders: { "retry-after": "9999" } }),
      ),
    ).toEqual({ kind: "rate-limit", retryAfterSeconds: 300 });
  });

  test.each([
    withStatus(500),
    withStatus(503),
    new Error("socket hang up"),
    "x",
    null,
  ])("treats %s as transient", (error) => {
    expect(classifyModelError(error)).toEqual({ kind: "transient" });
  });
});
