import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  PromptInput,
  PromptInputBody,
  PromptInputProvider,
  PromptInputSpeechButton,
  PromptInputTextarea,
} from "./prompt-input";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static failToStart = false;
  static autoStart = true;
  static deferEnd = false;
  continuous = false;
  interimResults = false;
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  start = vi.fn(() => {
    if (FakeRecognition.failToStart) throw new Error("already started");
    if (FakeRecognition.autoStart) this.onstart?.();
  });
  stop = vi.fn(() => {
    if (!FakeRecognition.deferEnd) this.onend?.();
  });
  abort = vi.fn(() => {
    if (!FakeRecognition.deferEnd) this.onend?.();
  });

  constructor() {
    FakeRecognition.instances.push(this);
  }

  say(...phrases: string[]) {
    this.onresult?.({
      results: phrases.map((transcript) => [{ transcript }]),
    });
  }
}

const recognizer = () => FakeRecognition.instances.at(-1)!;

function Composer({
  disabled,
  onSpeechError,
}: {
  disabled?: boolean;
  onSpeechError?: (message: string) => void;
}) {
  return (
    <PromptInputProvider>
      <PromptInput onSubmit={() => {}}>
        <PromptInputBody>
          <PromptInputTextarea aria-label="Prompt" />
        </PromptInputBody>
        <PromptInputSpeechButton
          disabled={disabled}
          onSpeechError={onSpeechError}
        />
      </PromptInput>
    </PromptInputProvider>
  );
}

const textbox = () => screen.getByRole("textbox", { name: "Prompt" });
const button = () => screen.getByRole("button", { name: "Dictate" });

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.failToStart = false;
  FakeRecognition.autoStart = true;
  FakeRecognition.deferEnd = false;
});

afterEach(() => {
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("PromptInputSpeechButton", () => {
  test("is inert but still focusable where the browser has no speech recognition", () => {
    render(<Composer />);
    expect(button()).toHaveAttribute("aria-disabled", "true");
    expect(button()).not.toHaveAttribute("disabled");
    button().focus();
    expect(button()).toHaveFocus();
    fireEvent.click(button());
    expect(FakeRecognition.instances).toHaveLength(0);
    expect(button()).toHaveAttribute("aria-pressed", "false");
  });

  describe("with speech recognition", () => {
    beforeEach(() => {
      (window as { SpeechRecognition?: unknown }).SpeechRecognition =
        FakeRecognition;
    });

    test("also works through the webkit-prefixed constructor", () => {
      delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
      (
        window as { webkitSpeechRecognition?: unknown }
      ).webkitSpeechRecognition = FakeRecognition;
      render(<Composer />);
      expect(button()).not.toHaveAttribute("aria-disabled");
    });

    test("starts listening and shows interim then final words", () => {
      render(<Composer />);
      expect(button()).toBeEnabled();
      expect(button()).not.toHaveAttribute("aria-disabled");
      expect(button()).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(button());
      expect(recognizer().start).toHaveBeenCalledOnce();
      expect(recognizer().continuous).toBe(true);
      expect(recognizer().interimResults).toBe(true);
      expect(recognizer().lang).toBe(navigator.language || "en-US");
      expect(button()).toHaveAttribute("aria-pressed", "true");

      act(() => recognizer().say("a landing"));
      expect(textbox()).toHaveValue("a landing");
      act(() => recognizer().say("a landing page", " for a roaster"));
      expect(textbox()).toHaveValue("a landing page for a roaster");
    });

    test("appends to what is already typed", () => {
      render(<Composer />);
      fireEvent.change(textbox(), { target: { value: "Warm and editorial." } });
      fireEvent.click(button());
      act(() => recognizer().say("With a shop section"));
      expect(textbox()).toHaveValue("Warm and editorial. With a shop section");
    });

    test("stopping with the button keeps the last words", () => {
      render(<Composer />);
      fireEvent.click(button());
      act(() => recognizer().say("hello"));
      fireEvent.click(button());
      expect(recognizer().stop).toHaveBeenCalledOnce();
      expect(recognizer().abort).not.toHaveBeenCalled();
      expect(textbox()).toHaveValue("hello");
      expect(button()).toHaveAttribute("aria-pressed", "false");
    });

    test("typing while listening stops it without overwriting the edit", () => {
      render(<Composer />);
      fireEvent.click(button());
      act(() => recognizer().say("hello"));
      fireEvent.change(textbox(), { target: { value: "hello there" } });
      expect(recognizer().abort).toHaveBeenCalledOnce();
      expect(textbox()).toHaveValue("hello there");
      expect(button()).toHaveAttribute("aria-pressed", "false");
    });

    test("typing before the first words arrive keeps the typed text", () => {
      render(<Composer />);
      fireEvent.click(button());
      fireEvent.change(textbox(), { target: { value: "typed first" } });
      expect(recognizer().abort).toHaveBeenCalledOnce();
      expect(textbox()).toHaveValue("typed first");
    });

    test("stops listening when it becomes disabled (a prompt is being sent)", () => {
      const { rerender } = render(<Composer />);
      fireEvent.click(button());
      rerender(<Composer disabled />);
      expect(recognizer().abort).toHaveBeenCalledOnce();
      expect(button()).toBeDisabled();
    });

    test("stops listening when the composer unmounts", () => {
      const { unmount } = render(<Composer />);
      fireEvent.click(button());
      unmount();
      expect(recognizer().abort).toHaveBeenCalledOnce();
    });

    test("reports a blocked microphone", () => {
      const onSpeechError = vi.fn();
      render(<Composer onSpeechError={onSpeechError} />);
      fireEvent.click(button());
      act(() => recognizer().onerror?.({ error: "not-allowed" }));
      expect(onSpeechError).toHaveBeenCalledWith(
        expect.stringMatching(/Microphone access is blocked/),
      );
    });

    test("stays quiet when dictation is aborted", () => {
      const onSpeechError = vi.fn();
      render(<Composer onSpeechError={onSpeechError} />);
      fireEvent.click(button());
      act(() => recognizer().onerror?.({ error: "aborted" }));
      expect(onSpeechError).not.toHaveBeenCalled();
    });

    test("a second click while the first is still starting replaces it cleanly", () => {
      FakeRecognition.autoStart = false;
      render(<Composer />);
      fireEvent.click(button());
      const first = recognizer();
      fireEvent.click(button());
      const second = recognizer();
      expect(FakeRecognition.instances).toHaveLength(2);
      expect(first.abort).toHaveBeenCalledOnce();

      act(() => {
        first.onstart?.();
        first.onend?.();
      });
      expect(button()).toHaveAttribute("aria-pressed", "false");

      act(() => second.onstart?.());
      expect(button()).toHaveAttribute("aria-pressed", "true");

      act(() => first.say("stale words"));
      expect(textbox()).toHaveValue("");
      act(() => second.say("fresh words"));
      expect(textbox()).toHaveValue("fresh words");
    });

    test("an old session's late error is not reported", () => {
      FakeRecognition.autoStart = false;
      const onSpeechError = vi.fn();
      render(<Composer onSpeechError={onSpeechError} />);
      fireEvent.click(button());
      const first = recognizer();
      fireEvent.click(button());
      act(() => first.onerror?.({ error: "network" }));
      expect(onSpeechError).not.toHaveBeenCalled();
    });

    test("reports errors to the latest callback", () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = render(<Composer onSpeechError={first} />);
      fireEvent.click(button());
      rerender(<Composer onSpeechError={second} />);
      act(() => recognizer().onerror?.({ error: "network" }));
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith(
        expect.stringMatching(/internet connection/),
      );
    });

    test("ignores events that arrive after unmounting", () => {
      FakeRecognition.deferEnd = true;
      const { unmount } = render(<Composer />);
      fireEvent.click(button());
      const session = recognizer();
      unmount();
      expect(session.abort).toHaveBeenCalledOnce();
      expect(() => {
        act(() => {
          session.say("too late");
          session.onend?.();
        });
      }).not.toThrow();
    });

    test("reports a start failure instead of throwing", () => {
      const onSpeechError = vi.fn();
      render(<Composer onSpeechError={onSpeechError} />);
      FakeRecognition.failToStart = true;
      fireEvent.click(button());
      expect(onSpeechError).toHaveBeenCalledWith(
        expect.stringMatching(/stopped unexpectedly/),
      );
      expect(button()).toHaveAttribute("aria-pressed", "false");
    });
  });
});
