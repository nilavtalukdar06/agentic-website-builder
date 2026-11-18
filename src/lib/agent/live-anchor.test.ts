import { describe, expect, test } from "vitest";
import { liveReplyAnchor } from "./live-anchor";

const prompt = (id: string, pending: boolean) => ({ id, pending });

describe("liveReplyAnchor", () => {
  test("the live reply belongs under the prompt that is running, not under queued ones", () => {
    expect(
      liveReplyAnchor(
        [prompt("a", false), prompt("b", true), prompt("c", true)],
        true,
      ),
    ).toBe("b");
  });

  test("falls back to the last message when nothing is pending yet", () => {
    expect(
      liveReplyAnchor([prompt("a", false), prompt("b", false)], true),
    ).toBe("b");
    expect(liveReplyAnchor([], true)).toBeNull();
  });

  test("there is no live reply when nothing is building", () => {
    expect(liveReplyAnchor([prompt("a", true)], false)).toBeNull();
  });
});
