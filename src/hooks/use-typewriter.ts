"use client";

import { useEffect, useMemo, useState } from "react";

export type TypewriterOptions = {
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
  pauseMs?: number;
};

type TypewriterState = {
  index: number;
  length: number;
  deleting: boolean;
  reduced: boolean;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function useTypewriter(
  input: readonly string[],
  {
    typeMs = 45,
    deleteMs = 22,
    holdMs = 2200,
    pauseMs = 400,
  }: TypewriterOptions = {},
) {
  const key = input.join("\u0000");
  const phrases = useMemo(() => key.split("\u0000"), [key]);
  const [state, setState] = useState<TypewriterState>({
    index: 0,
    length: 0,
    deleting: false,
    reduced: false,
  });

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION);
    const apply = () =>
      setState((current) => {
        const reduced = media.matches;
        const length = reduced
          ? (phrases[current.index]?.length ?? 0)
          : current.length;
        if (reduced === current.reduced && length === current.length) {
          return current;
        }
        return { ...current, reduced, length, deleting: false };
      });
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [phrases]);

  useEffect(() => {
    const phrase = phrases[state.index];
    if (phrase === undefined) return;
    const nextIndex = (state.index + 1) % phrases.length;
    let delay: number;
    let next: TypewriterState;

    if (state.reduced) {
      if (phrases.length === 1) return;
      delay = holdMs + phrase.length * typeMs;
      next = {
        ...state,
        index: nextIndex,
        length: phrases[nextIndex]?.length ?? 0,
      };
    } else if (!state.deleting && state.length < phrase.length) {
      delay = typeMs;
      next = { ...state, length: state.length + 1 };
    } else if (!state.deleting) {
      if (phrases.length === 1) return;
      delay = holdMs;
      next = { ...state, deleting: true };
    } else if (state.length > 0) {
      delay = deleteMs;
      next = { ...state, length: state.length - 1 };
    } else {
      delay = pauseMs;
      next = { ...state, index: nextIndex, deleting: false };
    }

    const id = window.setTimeout(() => setState(next), delay);
    return () => window.clearTimeout(id);
  }, [state, phrases, typeMs, deleteMs, holdMs, pauseMs]);

  const phrase = phrases[state.index] ?? "";
  return {
    text: phrase.slice(0, state.length),
    typing: !state.reduced && (state.deleting || state.length < phrase.length),
  };
}
