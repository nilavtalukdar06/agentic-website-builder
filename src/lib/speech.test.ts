import { describe, expect, test } from "vitest";
import { joinTranscript, speechErrorMessage } from "./speech";

describe("joinTranscript", () => {
  test("starts the prompt when the box is empty", () => {
    expect(joinTranscript("", "  a coffee site ")).toBe("a coffee site");
  });

  test("appends after existing text with one space", () => {
    expect(joinTranscript("A landing page", "for a roaster")).toBe(
      "A landing page for a roaster",
    );
  });

  test("does not add a space after whitespace or a newline", () => {
    expect(joinTranscript("First line\n", "second line")).toBe(
      "First line\nsecond line",
    );
    expect(joinTranscript("Hello ", "world")).toBe("Hello world");
  });

  test("keeps the text unchanged for empty speech", () => {
    expect(joinTranscript("Keep me", "   ")).toBe("Keep me");
  });
});

describe("speechErrorMessage", () => {
  test.each([
    ["not-allowed", /Microphone access is blocked/],
    ["service-not-allowed", /doesn't allow voice input/],
    ["audio-capture", /No microphone/],
    ["network", /internet connection/],
    ["language-not-supported", /your language/],
    ["no-speech", /didn't hear anything/],
    ["something-new", /stopped unexpectedly/],
  ])("explains %s", (code, message) => {
    expect(speechErrorMessage(code)).toMatch(message);
  });

  test.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "treats the object property %s as an unknown error, not a message",
    (code) => {
      expect(speechErrorMessage(code)).toBe(
        "Voice input stopped unexpectedly. Try again.",
      );
    },
  );

  test("stays quiet when the user stops it", () => {
    expect(speechErrorMessage("aborted")).toBeNull();
  });
});
